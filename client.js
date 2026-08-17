window.__ModuleLoader__.load({
	id: "dsh-sound-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		//#region dsh-sound-plugin — browser half
		/**
		 * Plays notification chimes (Web Audio, no asset needed) in the DSH
		 * Web UI for the current session. Two distinct chimes, one per event:
		 *
		 * 1. "question" — the agent paused the turn to ask the user something
		 *    (`ask_user_question`, incl. plan reviews) and is waiting for an
		 *    answer. Signal: the session summary's `pendingInteraction`
		 *    becoming "question" / "plan-review" (rising edge). The turn is
		 *    NOT finished while a question is pending — the agent loop pauses
		 *    the tool call and the `running` bit stays true — so this is the
		 *    only "please answer" moment. A soft two-tone "ding" (E6 → A6).
		 *
		 * 2. "done" — the whole response really finished. Signal: the current
		 *    session's `running` bit transitions true → false. A rising
		 *    "ta-da" arpeggio (C5 E5 G5 C6), clearly different from the
		 *    question ding.
		 *
		 * Completion signal detail: the `running` bit comes from the host's
		 * `agent/status` frame (`host/session-status`), which the agent loop
		 * emits exactly once per turn end — success, error, max-tokens, and
		 * stop all settle the phase back to idle, so every real response end
		 * produces one edge. This is the same signal the client runtime's own
		 * sidebar "done" reminder uses (`syncCompletedNotifications`), read
		 * here from the session-list snapshot, which the runtime refreshes
		 * synchronously on every status frame.
		 *
		 * The edge only counts while the SAME session stays selected: the
		 * running bit is read from whatever conversation `state.current`
		 * points at, so the true→false edge must be paired with an unchanged
		 * session id. Clicking another conversation changes `state.current`,
		 * and the new row's idle bit is recorded, never treated as the
		 * running session's end — opening a finished history conversation
		 * mid-run must not chime. Same discipline for a pending question:
		 * selecting a session that already waits on a question only records
		 * it (no chime); only the question appearing on the selected session
		 * chimes.
		 *
		 * Why not `turnEnds` growth (the previous approach): `turnEnds` also
		 * grows when a history conversation's window is backfilled after open
		 * (chime when opening history), and when a background subagent's
		 * report wakes the parent into a new turn (chime on every subagent
		 * wait). Neither is a real "answer finished" moment.
		 *
		 * Subagent gate (done chime only): when the current session's running
		 * goes false, we only chime if the session has NO running subagent
		 * descendants (live list rows, `origin: 'subagent'` + `parentId`
		 * chain). While a background subagent runs, the parent's turn ends
		 * (running → false) but a child is still running, so no chime; only
		 * the final turn end with zero running descendants chimes — the whole
		 * task, subagents included, is really done. The question chime is not
		 * gated: the wait belongs to the executing turn and is addressed to
		 * the user directly. If a turn ends while a question is still pending
		 * (e.g. stopped mid-question), no "done" chime — the question chime
		 * already notified, and "done" would be misleading.
		 *
		 * Tune the defaults below, or override them per browser via
		 * localStorage (no config plumbing exists for client modules):
		 *   localStorage.setItem("dsh-sound.enabled",    "false")   // mute
		 *   localStorage.setItem("dsh-sound.volume",     "0.25")    // 0..1
		 *   localStorage.setItem("dsh-sound.hiddenOnly", "true")    // only when tab hidden
		 */

		var DEFAULTS = {
			enabled: true,
			volume: 0.4,
			hiddenOnly: false
		};

		function readSettings() {
			var out = {
				enabled: DEFAULTS.enabled,
				volume: DEFAULTS.volume,
				hiddenOnly: DEFAULTS.hiddenOnly
			};
			try {
				if (typeof localStorage === "undefined") return out;
				var enabled = localStorage.getItem("dsh-sound.enabled");
				var volume = localStorage.getItem("dsh-sound.volume");
				var hiddenOnly = localStorage.getItem("dsh-sound.hiddenOnly");
				if (enabled !== null) out.enabled = enabled !== "false";
				if (volume !== null) {
					var parsed = parseFloat(volume);
					if (!Number.isNaN(parsed)) out.volume = Math.max(0, Math.min(1, parsed));
				}
				if (hiddenOnly !== null) out.hiddenOnly = hiddenOnly === "true";
			} catch (e) {
				// localStorage unavailable (private mode etc.) — use defaults.
			}
			return out;
		}

		// --- Web Audio chime -------------------------------------------------
		var audioContext = null;

		function ensureAudioContext() {
			if (audioContext === null) {
				var Ctor = window.AudioContext || window.webkitAudioContext;
				if (!Ctor) return null;
				try {
					audioContext = new Ctor();
				} catch (e) {
					return null;
				}
			}
			if (audioContext.state === "suspended") {
				audioContext.resume().catch(function () {});
			}
			return audioContext;
		}

		/** Unlock audio inside the first user gestures (browser autoplay policy). */
		function prewarm() {
			var ac = ensureAudioContext();
			if (!ac) return;
			try {
				var buffer = ac.createBuffer(1, 1, 22050);
				var source = ac.createBufferSource();
				source.buffer = buffer;
				source.connect(ac.destination);
				source.start(0);
			} catch (e) {
				// ignore
			}
		}

		function beep(ac, frequency, delay, duration, volume) {
			var oscillator = ac.createOscillator();
			var gain = ac.createGain();
			oscillator.type = "sine";
			oscillator.frequency.value = frequency;
			var start = ac.currentTime + delay;
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
			oscillator.connect(gain);
			gain.connect(ac.destination);
			oscillator.start(start);
			oscillator.stop(start + duration + 0.05);
		}

		var lastChimeAt = 0;

		/**
		 * Play one of the two chimes. `kind` is "question" (the agent is
		 * waiting for the user to answer) or "done" (the whole task finished).
		 * The question ding is the original two-tone E6 → A6; the done chime
		 * is a rising C5 E5 G5 C6 "ta-da" so the two are easy to tell apart.
		 */
		function playChime(kind) {
			var now = Date.now();
			if (now - lastChimeAt < 150) return; // coarse debounce
			var settings = readSettings();
			if (!settings.enabled) return;
			if (settings.hiddenOnly && typeof document !== "undefined" && !document.hidden) return;
			var ac = ensureAudioContext();
			if (!ac) return;
			try {
				if (kind === "question") {
					// "Someone's asking you": soft two-tone ding, E6 then A6.
					beep(ac, 1318.5, 0.00, 0.35, settings.volume);
					beep(ac, 1760.0, 0.09, 0.45, settings.volume * 0.85);
				} else {
					// "All done": rising ta-da, C5 E5 G5 C6.
					beep(ac, 523.25, 0.00, 0.28, settings.volume);
					beep(ac, 659.25, 0.10, 0.28, settings.volume * 0.9);
					beep(ac, 783.99, 0.20, 0.28, settings.volume * 0.9);
					beep(ac, 1046.5, 0.30, 0.55, settings.volume);
				}
				lastChimeAt = now;
			} catch (e) {
				// ignore
			}
		}

		// --- "response finished" / "question asked" detection ------------------
		// Required services: the client runtime's sessions face (`ctx.sessions`).
		//
		// Two signals, read from the CURRENT session's row in the session-list
		// snapshot (`state.byId[state.current]`):
		//
		// 1. Question wait ("please answer"): the summary's `pendingInteraction`
		//    rising to "question" / "plan-review". The runtime tracks this from
		//    `question/requested` wire frames (`trackPending`); the agent loop
		//    PAUSES the turn inside `ask_user_question` / plan review, so the
		//    `running` bit stays true during the wait and only this edge tells
		//    us the user owes an answer. "approval" (`approval/requested`,
		//    side-panel plugin approvals) is deliberately NOT chimed.
		//
		// 2. Response finished ("all done"): the CURRENT session's `running`
		//    bit flips true → false. The runtime applies `host/session-status`
		//    frames to the list summaries synchronously (`recordMutation`), so
		//    every list flush we observe is internally consistent: the current
		//    session's bit and every subagent child's bit come from the same
		//    snapshot. Unlike `turnEnds` growth, the running edge never fires
		//    from history backfill (opening an old conversation keeps running
		//    false) and stays true across the whole response — foreground
		//    subagent waits and question waits included — so intermediate
		//    "done" moments inside one response don't chime. It also never
		//    fires from switching the selected conversation: a change of
		//    `state.current` only re-records the new session's bit, so
		//    clicking into a finished history conversation while another
		//    session is still running stays silent.
		//
		// Snapshot shape (SessionListState): there is NO `items` array. Rows
		// live in `state.byId` (Record<SessionId, Summary>), listed by
		// `state.ids`, selection in `state.current`. Each Summary carries
		// `id`, `running`, `pendingInteraction` ("approval" | "question" |
		// "plan-review" when a wait is open), and — for subagent rows —
		// `origin: 'subagent'` and `parentId`. (Older drafts read
		// `state.items` with `sessionId` / `parentSessionId` fields; the
		// entry then never resolved, `running` stayed false, and the chime
		// never fired.)
		//
		// Subagent gate (done chime only): a background/continuable subagent
		// makes the parent's turn end (running → false) while the child is
		// still running. We suppress the done chime while the session still
		// owns any running subagent descendant; only the turn end with zero
		// running descendants is the real "the whole task finished" moment.
		// The question chime is not gated — the wait is addressed to the user
		// directly. If a turn ends while a question is still pending (e.g.
		// stopped mid-question), no done chime either: the question chime
		// already notified.
		var inject = ["sessions"];

		function apply(ctx) {
			var sessions = ctx.sessions;
			if (!sessions) return;

			// Last-observed (current session id, running bit, input-wait flag)
			// triple. null until the first observation — the first observation
			// only records (never chimes), the same discipline the runtime's
			// own sidebar "done" reminder uses. The session id is tracked
			// alongside the bits: `state.current` changes when the user clicks
			// another conversation, and the new session's idle bit must never
			// be read as the running session's end — only a true→false edge on
			// a session that stayed selected is a real "answer finished", and
			// only a pendingInteraction rising on the selected session is a
			// real "question asked" (selecting a session that already waits on
			// a question just records it).
			var wasCurrent = null;
			var wasRunning = null;
			var wasInputPending = null;

			/**
			 * Any subagent descendant of `sessionId` currently running in the
			 * snapshot? Rows come from `state.byId` (keyed by session id); a
			 * row is a subagent child when `origin === 'subagent'` and its
			 * `parentId` points at its parent. Walk the parentId chain.
			 */
			function hasRunningSubagentDescendant(sessionId, state) {
				var byId = state && state.byId;
				var ids = state && state.ids;
				if (!byId || !ids || ids.length === 0) return false;
				var children = new Map();
				for (var i = 0; i < ids.length; i++) {
					var row = byId[ids[i]];
					if (!row || row.origin !== "subagent" || !row.parentId) continue;
					var bucket = children.get(row.parentId);
					if (!bucket) {
						bucket = [];
						children.set(row.parentId, bucket);
					}
					bucket.push(row.id);
				}
				var stack = children.get(sessionId);
				if (!stack) return false;
				var seen = new Set();
				while (stack.length > 0) {
					var childId = stack.pop();
					if (seen.has(childId)) continue;
					seen.add(childId);
					var row = byId[childId];
					if (!row) continue;
					if (row.running) return true;
					var kids = children.get(childId);
					if (kids) {
						for (var j = 0; j < kids.length; j++) stack.push(kids[j]);
					}
				}
				return false;
			}

			function onListChange() {
				var state = sessions.list.getSnapshot();
				var current = state && state.current;
				// The store has no `items` array: rows live in `state.byId`
				// (Record<SessionId, Summary>), the selection in `state.current`.
				var entry = current && state && state.byId ? state.byId[current] || null : null;
				var running = entry ? !!entry.running : false;
				var pending = entry && entry.pendingInteraction;
				// "approval" waits are side-panel plugin approvals, not the
				// conversation addressing the user — only questions and plan
				// reviews get a chime.
				var inputPending = pending === "question" || pending === "plan-review";
				if (wasCurrent === null || wasCurrent !== current) {
					// First observation, or the selected conversation changed:
					// record only — a session already idle (e.g. a history
					// conversation just opened) stays silent, a session that
					// already waits on a question just records it, and
					// switching between conversations never fires an edge.
					wasCurrent = current;
					wasRunning = running;
					wasInputPending = inputPending;
					return;
				}
				// Question-wait rising edge: the agent paused mid-turn asking
				// the user something. `running` stays true during the wait, so
				// this is the only "please answer" moment.
				var prevPending = wasInputPending;
				wasInputPending = inputPending;
				if (inputPending && !prevPending) {
					playChime("question");
					return;
				}
				var prev = wasRunning;
				wasRunning = running;
				if (!prev || running) return; // only the true → false edge matters
				// The response ended. If a question/plan review is still open
				// (e.g. the turn was stopped mid-question), stay silent — the
				// question chime already notified, "done" would mislead.
				if (inputPending) return;
				// Ignore it while subagents are still working.
				if (hasRunningSubagentDescendant(current, state)) return;
				playChime("done");
			}

			// Browser autoplay policy: unlock audio inside the first gestures.
			var gestureEvents = ["pointerdown", "mousedown", "keydown", "touchstart"];
			var onGesture = function () {
				prewarm();
			};

			ctx.effect(function () {
				var unsubscribeList = sessions.list.subscribe(onListChange);
				onListChange();
				for (var i = 0; i < gestureEvents.length; i++) {
					window.addEventListener(gestureEvents[i], onGesture, { once: true, capture: true });
				}
				return function () {
					unsubscribeList();
					for (var i = 0; i < gestureEvents.length; i++) {
						window.removeEventListener(gestureEvents[i], onGesture, true);
					}
				};
			});
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
