# DSH Auto-Continue 插件设计文档

- 日期：2026-01-27
- 状态：已批准（用户逐节确认）
- 插件名：`dsh-plugin-autocontinue`
- 工作目录：`/Users/swizard/code/dsh-plugin-autocontinue`

## 1. 目标

当 DeepSeek Harness（DSH）的 agent 一轮运行失败（UI 显示"本轮运行失败"，即会话事件 `turn/end` 且 `reason.kind === "error"`）时，插件自动向该 agent 发送一条"请继续"消息，使其进入新的一轮继续工作，减少需要人工干预的失败。

## 2. 背景与机制（探索结论）

- **失败信号**：UI 中"本轮运行失败"来自 `dsh-client-ui-conversation` 的 `message.turnError` 翻译，对应 `turn-error` 会话节点。服务端在 agent 循环捕获异常后 append `turn/end`，`data.reason.kind === "error"`。客户端通过 `match(event)` 判定。
- **事件监听**：Host 插件可用 `ctx.on("session/event", (session, event) => ...)` 观察所有会话事件（`dsh-session` 的 `session/event` firehose；`dsh-agent-instructions`、`dsh-compaction` 等均如此使用）。
- **agent 实例获取**：`ctx.on("agent/created", ({ agent }) => ...)`（`dsh-agent` 的 `AgentRegistry.announce` 发出）；registry 提供 `ctx.agents.get(id)`、`ctx.agents.list()`、`ctx.agents.roots()`。
- **触发继续**：`agent.followup(message)` = `send(message, "next-turn", true)` → inbox splice + `wakeDriver()`；`dsh-tool-jobs` 已用 `owner.followup(message)` 唤醒 idle agent。消息用 `createUserMessage({ content: [{ type: "text", text }] })`（`@deepseek-ai/dsh-llm`）。
- **时序关键**：`turn/end` error 事件 append 时 agent 仍处于 running phase（`kick()` 尚未退出）；此时 `followup()` 的 `wakeDriver()` 因 phase 非 idle 不会唤醒。因此必须延迟到 agent 回到 idle（`agent.status === "idle"`）后再发送。
- **与 llm-retry 的关系**：`dsh-llm-retry` 处理 LLM 请求层错误（`agent/request-error` waterfall 返回 `{kind:"retry"}`）；本插件处理 turn 层失败（`turn/end` error），两者互补。
- **客户端设置面板**：client 半区通过 `ctx.slots.register({ name: "settings.plugin.item", key: NS, ... })` 注册卡片，Host 端 `dsh-client-ui-settings-plugins` 的 "Plugin configuration" 标签渲染它；用 `ctx.settingsScope.bind({ namespace: NS })` 绑定命名空间读写。Host 端注册命名空间用 `ctx.settings.register(settingsNamespace(ns), schema)`（`@deepseek-ai/dsh-settings`），返回 `{ get, watch, update, replace }`。

## 3. 架构

双半区 npm 包（DSH dual-face 插件规范）：

```
dsh-plugin-autocontinue/
├── package.json          # exports "." (host) + "./client" (browser)；dsh.client 声明
├── lib/
│   ├── index.js          # Host 半区：核心自动继续逻辑（Node 进程）
│   └── client.js         # Client 半区：设置面板卡片（浏览器）
├── src/                  # 源码（TypeScript）
├── README.md
└── docs/superpowers/specs/2026-01-27-autocontinue-plugin-design.md
```

### Host 半区（lib/index.js）

- Cordis 函数插件，导出 `name`、`inject`、`Config`、`apply(ctx, config)`。
- `name = "autocontinue"`；`inject = ["agents", "settings"]`。
- `apply`：
  1. 注册 settings 命名空间 `autocontinue`（schema 见第 4 节），读取并 `watch` 运行时配置。
  2. `ctx.on("agent/created", ...)`：为每个 agent 建立会话事件监听 + 连续失败计数（WeakMap）。
  3. 对已存在的 agent（插件晚加载场景）：遍历 `ctx.agents.list()` 补挂。
  4. 会话事件处理：`turn/end` 且 `reason.kind === "error"` → 记 pending + 计数 + 延迟调度；`turn/end` 非 error → 清零计数；`user/message`（用户主动发消息）→ 重置计数与 pending。
  5. 延迟回调：agent 在线且 `status === "idle"` 且 pending 标记仍在 → `agent.followup(createUserMessage(...))`，清除 pending。
  6. 返回统一 dispose：解绑所有监听、`clearTimeout` 全部延迟令牌、清空 WeakMap。

### Client 半区（lib/client.js）

- 浏览器插件 `apply(ctx)`：
  1. `ctx.slots.register({ name: "settings.plugin.item", key: "autocontinue", ... }, Card)` 注册设置卡片。
  2. `ctx.settingsScope.bind({ namespace: "autocontinue" })` 绑定命名空间，表单保存走 settings 传输层写回 Host。
  3. 提供中英 locale（复用 `dsh-client-ui-settings-plugins` 的卡片渲染模式）。

### 配置流

UI 编辑 → client `settingsScope` → Host `settings.update(ns)` → 插件 `scope.watch()` → 运行时生效（无需重启）。

## 4. 配置项（settings 命名空间 `autocontinue`）

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 总开关 |
| `maxRetries` | number | `3` | 单 agent 连续失败最多自动继续次数；达到后停止，直到用户主动发消息重置 |
| `delayMs` | number | `5000` | 失败后延迟多久发送"请继续"（留出回 idle 时间） |
| `message` | string | `"请继续"` | 发送给 agent 的消息文本 |
| `scope` | enum `"all"`/`"roots"` | `"all"` | `all` 覆盖所有 agent；`roots` 仅根会话 |

Cordis `Config` schema 与 settings schema 一致（`z.object`），patch.yml 可注入默认值，UI 可覆盖。

## 5. 防循环与错误处理

- **连续失败计数**：`WeakMap<agent, number>`；成功（非 error `turn/end`）清零。
- **上限停手**：≥ `maxRetries` 停止并清空计数；用户主动发消息（`agent/inbox/inserted`，source 为 user）时重置，重新武装。
- **每轮只发一次**：pending 标记防重入；延迟回调发送后清除。
- **agent 离线**：`ctx.on("agent/disposed")` 清理；发送前检查在线。
- **followup 抛错**：`try/catch` + `ctx.logger.warn`，不影响会话。
- **卸载清理**：apply 返回的 dispose 统一清理监听、定时器、WeakMap。
- **事件风暴**：延迟令牌（`setTimeout` 句柄）统一管理，dispose 时 `clearTimeout`。

## 6. 部署与安装

1. `cd ~/.dsh/profiles/desktop && pnpm add dsh-plugin-autocontinue`
2. `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 追加 `"dsh-plugin-autocontinue"`
3. （可选）`~/.dsh/profiles/desktop/cordis.patch.yml` 注入默认 config
4. 重启桌面 app 生效

Client 半区注入依赖 `dsh-client-modules` 扫描 `dsh.client` 声明；若要求重建 Web 产物，README 说明是否需要 `pnpm run dev:web` 重编译（实现阶段验证）。

## 7. 测试计划

1. **单测（Host）**：计数逻辑、上限停手、成功清零、用户消息重置、pending 防重入（纯函数部分可测）。
2. **集成验证（本机桌面 profile）**：
   - 安装到 `~/.dsh/profiles/desktop`，重启 app。
   - 制造一次 turn 失败（如临时让工具抛错），观察自动继续：会话日志出现新的 `turn/start` 与发送的"请继续"用户消息。
   - 验证 `maxRetries` 达到后停手；用户发消息后重新武装。
   - 验证设置面板出现卡片，修改配置即时生效（不需重启）。
3. **Client 半区**：卡片渲染、保存写回 Host、`scope.watch` 生效。

## 8. 范围外（YAGNI）

- 不携带失败原因到继续消息（用户选择简单"请继续"；将来可加开关）。
- 不做按错误码过滤（如对特定 code 不重试）——`maxRetries` 已提供安全上限。
- 不做图形化高级配置（设置面板为方案 B 标准卡片，不自定义复杂 UI）。
