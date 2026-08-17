# AGENT.md

> 面向 AI 编码助手的项目指南。动手改代码前先读这里。

## 项目是什么

`dsh-sound-plugin` 是 DeepSeek Harness（DSH）Web UI 的纯客户端插件，用 Web Audio 实时合成两种提示音：

1. **提问音（`question`）** —— AI 用 `ask_user_question` 提问（含计划审批）停下来等你回答时播放：双音"叮"（E6→A6）。
2. **完成音（`done`）** —— 当前会话整轮响应结束（完成 / 错误 / max-tokens / 停止）时播放：上行琶音"ta-da"（C5 E5 G5 C6）。

三条不可违背的设计约束：

1. **零资源** —— 不使用任何音频文件，不发起网络请求，不产生模型调用。
2. **纯客户端** —— 没有 Host 侧行为，Node 半身是空壳。
3. **安静时机** —— 只在真正需要用户注意时响：后台子代理仍在运行时绝不响完成音，打开历史会话不响，切换会话不响。

## 架构一览

| 文件 | 角色 |
| --- | --- |
| `index.js` | Node 半身：空 `apply`，仅为了让插件出现在 Host 的 Loader / cordis.yml 中 |
| `client.js` | 浏览器半身：全部逻辑所在（经 `package.json` 的 `dsh.client` 声明被发现） |
| `cordis.patch.yml` | bundle 的 patch 层：把插件行插入组合后的 loader 配置 |
| `package.json` | `dsh.bundle.patch` → `cordis.patch.yml`；`dsh.client.inject` → `@deepseek-ai/dsh-client-runtime`（platform: web）；`exports["./client"]` → `client.js` |

`client.js` 必须保持 `window.__ModuleLoader__.load({ id, factory })` 的包裹结构 —— 这是浏览器模块加载器的契约，不要改造成普通 ESM 模块。

## 核心逻辑（改 `client.js` 前必读）

两个信号，都从**当前会话**的行（`state.byId[state.current]`）读取：

**完成信号** = `running` 位 true→false 边沿（且会话 id 未变）。
**提问信号** = `pendingInteraction` 上升为 `"question"` / `"plan-review"`（来自 `question/requested` 帧）。

- **快照形状：没有 `items` 数组。** 行数据在 `state.byId`（`Record<SessionId, Summary>`），顺序在 `state.ids`，选中会话在 `state.current`；每条 Summary 有 `id`、`running`、`pendingInteraction`（`"approval"` / `"question"` / `"plan-review"`，无等待时缺省），子代理行还有 `origin: 'subagent'` 和 `parentId`。
- **提问等待期间 `running` 保持 true**：`ask_user_question` 的工具执行会 `await ctx.userQuestions.ask(...)`，agent 循环暂停但 phase 仍是 `running`（`dsh-agent-loop` 里 status 只有 phase 为 idle/maintenance 才为 idle）。所以提问只有 `pendingInteraction` 上升沿这一个信号，不要指望 `running` 边沿。
- **子代理门控只作用于完成音**：`running` 翻 false 时，若该会话仍存在运行中的子代理后代（`origin: 'subagent'` + `parentId` 链），保持安静，直到后代全部结束才响完成音。提问音不受门控（问题直接面向用户）。若回合结束时仍有未决提问（如被停止），不响完成音（提问音已通知过，完成音会误导）。
- **首次观察只记录状态、不响铃**（与运行时侧边栏"完成"提醒同一纪律）；切换会话也只记录（切到已在等待提问的会话不响）。
- **`"approval"` 不响**：那是侧边栏的插件审批，不是对话中向用户提问，刻意排除。
- **不要**改用 `turnEnds` 增长作为信号：它会在打开历史会话窗口回填、以及后台子代理报告唤醒父会话时误响 —— 这是之前踩过并明确弃用的方案。
- **不要**假设 `state.items` / `sessionId` / `parentSessionId` 存在：那是旧草案形状，用了之后 `running` 永远为 false，插件会静默失效且无报错。

配置：`client.js` 顶部 `DEFAULTS`（`enabled` / `volume` / `hiddenOnly`）。客户端模块没有行配置，浏览器侧通过 `localStorage` 覆盖（键名 `dsh-sound.enabled` / `dsh-sound.volume` / `dsh-sound.hiddenOnly`）。音量对两种提示音统一生效。

音频：首次用户手势时预热 `AudioContext`（浏览器自动播放策略）；`playChime(kind)` 按 `"question"` / `"done"` 播放不同音色；带 150ms 粗防抖；`ctx.effect` 的清理函数必须释放订阅与事件监听（卸载 / HMR 时调用）。

## 开发与验证

```sh
# 本地安装插件（在源码目录下）
dsh plugin --profile web add ./dsh-sound-plugin

# 重启 web UI（仅增删插件时需要）
dsh web
```

- 只改了 `client.js`：**无需重启**，刷新页面（建议 Ctrl+F5）即可生效；客户端模块元数据按名缓存，增删插件才需要重启。
- 改完自检：响应结束恰好响一次完成音？AI 提问时响起提问音且**不**响完成音？两种音色可区分？后台子代理运行中是否安静？打开历史会话是否安静？错误 / max-tokens / 停止是否也响？
- 本仓库没有测试脚本和构建步骤，不要运行不存在的 `npm test` / `npm run build`。

## 约定

- `client.js` 代码风格：`var` / `function`，不用箭头函数和 class（保持工厂包裹内的 ES5 风格）；关键逻辑配详细英文注释。
- 文档双语同步：`README.md`（中文）与 `README.en.md`（英文）要一起改。
- 随包发布的内容要登记进 `package.json` 的 `files` 字段。
- 许可证 MIT（`LICENSE`）。
