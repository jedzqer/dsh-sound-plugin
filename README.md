[English](README.en.md) | 中文

# dsh-sound-plugin

> 还在为必须一直盯着 AI 干活而发愁吗？装上这个插件，你只管在后台刷视频、忙别的，AI 整轮响应结束时会自动响起提示音通知你。

这是为 **DeepSeek Harness（DSH）Web UI** 打造的插件：纯客户端，提示音由 Web Audio 实时合成，无需任何音频文件，也不产生额外网络请求或模型调用。

## 功能特性

- 🔔 **整轮响应结束提醒** —— 以当前会话 `running` 状态 true→false 边沿为信号，完成 / 错误 / max-tokens / 停止 均会触发。
- 🤖 **子代理感知** —— 后台子代理仍在运行时不会误响；只有整个任务（含所有子代理）真正完成才播放。
- 🎛️ **按浏览器控制** —— 无需改代码，通过 `localStorage` 即可静音、调音量，或只在标签页隐藏时响。
- 🔊 **零资源依赖** —— 双音提示音由 Web Audio 合成，无音频文件、无网络请求。
- 🖱️ **自动处理自动播放策略** —— 首次用户手势时预热 `AudioContext`，无需手动点按解锁声音。
- 🧹 **自动清理** —— 插件卸载 / HMR 时自动释放全部订阅与事件监听。

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

- 只监听**当前会话**（侧边栏选中的会话）的响应结束；切换会话自动跟随。
- 错误 / max-tokens / 停止结束同样会响。
- 子代理（含后台子代理）的中间等待不响；打开历史会话不响。
- 修改 `client.js` 后**无需重启** `dsh web`，刷新页面（建议 Ctrl+F5）即可生效；只有增删插件才需要重启。

## 工作原理

- 插件由 Node 半身（`index.js`，空 `apply`，仅用于让插件出现在 Host 的 Loader 中）与浏览器半身（`client.js`，经 `dsh.client` 声明被发现）组成。
- 浏览器半身订阅会话列表快照，以**当前会话 `running` 位 true→false 边沿**作为"响应结束"信号 —— 该信号与客户端运行时侧边栏的"完成"提醒同源，任何结束方式都恰好触发一次。
- **子代理门控**：当 `running` 翻 false 时，若会话仍有运行中的子代理后代（`origin: 'subagent'` + `parentId` 链），则静默等待，直到整个任务真正完成。

## 许可证

[MIT](LICENSE)
