[English](README.en.md) | 中文

# dsh-sound-plugin

还在为必须一直盯着 AI 干活而发愁吗？装上这个插件，你只管在后台刷视频、忙别的——AI 结束工作后、或是停下来向你提问需要回答时，会自动响起提示音通知你。

> 这是为 **DeepSeek Harness（DSH）Web UI** 打造的插件：纯客户端，提示音由 Web Audio 实时合成，无需任何音频文件，也不产生额外网络请求或模型调用。

## 功能特性

- 🔔 **整轮响应结束提醒** —— 以当前会话 `running` 状态 true→false 边沿为信号，完成 / 错误 / max-tokens / 停止 均会触发，播放上行琶音"ta-da"。
- 💬 **提问等待提醒** —— AI 用 `ask_user_question` 提问（含计划审批）停下来等你回答时，播放与完成音不同的双音"叮"，一听就知道该去回答了。
- 🤖 **子代理感知** —— 后台子代理仍在运行时不会误响；只有整个任务（含所有子代理）真正完成才播放。
- 🎛️ **按浏览器控制** —— 无需改代码，通过 `localStorage` 即可静音、调音量，或只在标签页隐藏时响。
- 🔊 **零资源依赖** —— 提示音全部由 Web Audio 合成，无音频文件、无网络请求。
- 🖱️ **自动处理自动播放策略** —— 首次用户手势时预热 `AudioContext`，无需手动点按解锁声音。
- 🧹 **自动清理** —— 插件卸载 / HMR 时自动释放全部订阅与事件监听。

## 搭配推荐

推荐搭配 [**dsh-retry-plugin**](https://github.com/jedzqer/dsh-retry-plugin) 使用 —— 一款用于 DeepSeek Harness（DSH）的插件，AI 访问报错（网络抖动、限流、服务器 5xx……）时会自动发送「continue」重新发起请求，让对话不中断。配合声音提醒，即使偶发失败被自动重试接住，你也能在任务真正完成时听到提示音。

```sh
# 同样安装进 web profile
dsh plugin --profile web add dsh-retry-plugin
```

## 安装

### 前置要求

- 已安装 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（`dsh` 命令可用）
- [pnpm](https://pnpm.io)（`dsh plugin` 依赖它管理插件）

### 步骤

```sh
# 1. 把插件安装进 web profile
dsh plugin --profile web add dsh-sound-plugin

# 2. 重启 web UI 使插件集合生效（客户端模块元数据按名缓存，重启后生效）
dsh web
```

本地开发时，也可以在插件源码目录下安装本地副本：

```sh
dsh plugin --profile web add ./dsh-sound-plugin
```

卸载：

```sh
dsh plugin --profile web remove dsh-sound-plugin
```

## 使用 / 配置

插件默认开启，无需任何配置。客户端模块不携带行配置，因此提供两档控制：

- **改代码**：修改 `client.js` 顶部的 `DEFAULTS` 常量（`enabled` / `volume` / `hiddenOnly`）。
- **按浏览器覆盖**：在浏览器的 DevTools Console 中执行：

```js
localStorage.setItem("dsh-sound.enabled",    "false");  // 静音
localStorage.setItem("dsh-sound.volume",     "0.25");   // 音量 0..1
localStorage.setItem("dsh-sound.hiddenOnly", "true");   // 仅在标签页隐藏时响
```

### 行为说明

- 只监听**当前会话**（侧边栏选中的会话）的响应结束；切换会话自动跟随。正在运行时切到已完成的历史对话**不会**误响——只有保持选中的会话结束才响。
- **两种提示音**：AI 提问等你回答时响双音"叮"（`question`），整轮真正完成时响上行琶音"ta-da"（`done`）。
- 错误 / max-tokens / 停止结束同样会响完成音。
- 子代理（含后台子代理）的中间等待不响；打开历史会话不响；切到已经在等待提问的会话也不响。
- 修改 `client.js` 后**无需重启** `dsh web`，刷新页面（建议 Ctrl+F5）即可生效；只有增删插件才需要重启。

## 工作原理

- 插件由 Node 半身（`index.js`，空 `apply`，仅用于让插件出现在 Host 的 Loader 中）与浏览器半身（`client.js`，经 `dsh.client` 声明被发现）组成。
- 浏览器半身订阅会话列表快照，监听当前会话行上的两个信号：
  - **完成信号**：`running` 位 true→false 边沿 —— 与客户端运行时侧边栏的"完成"提醒同源，任何结束方式都恰好触发一次，播放"done"提示音。
  - **提问信号**：`pendingInteraction` 变为 `"question"` / `"plan-review"`（来自 `question/requested` 帧）—— 提问等待期间 agent 循环暂停工具调用、`running` 保持 true，所以只有这个上升沿能告诉你"该去回答了"，播放"question"提示音。插件审批（`"approval"`）不响。
- **子代理门控**：当 `running` 翻 false 时，若会话仍有运行中的子代理后代（`origin: 'subagent'` + `parentId` 链），则静默等待，直到整个任务真正完成。

## 许可证

[MIT](LICENSE)
