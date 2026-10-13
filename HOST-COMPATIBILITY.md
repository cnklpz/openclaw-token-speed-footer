# 宿主兼容性与 display-only 交付契约

本文描述 `openclaw-token-speed-footer` **0.1.0** 的两种注册路径、匹配宿主扩展及其安全边界。使用说明见 [README](./README.md)，补丁复现见 [integration/README.md](./integration/README.md)。

## 1. 精确版本边界

| 项目 | 基线 / 要求 |
| --- | --- |
| 验证过的 OpenClaw 基线 | **2026.10.1**，tag `v2026.10.1` |
| 匹配补丁的 upstream base | `e178c39e9aae3fa440735217f9aef9574f286677` |
| 宿主源码补丁 | [`integration/host.patch`](./integration/host.patch) |
| 官方未修改的该版本 | 不提供 `finalUsageFooter.v1` |
| 插件独立测试 | Node.js ≥22 |
| OpenClaw 该版本宿主 | `engines.node`: `>=24.16.0 <25 || >=26.1.0` |

**插件测试要求不等于宿主运行要求；匹配补丁也不是官方已发布能力。** 其他版本应重新核对 SDK、注册生命周期、usage 生产点与 Telegram 交付逻辑，不能仅因版本号较新就视为兼容。

## 2. 为什么 stock 宿主不能同时保留 legacy Hook 与原生预览？

OpenClaw 2026.10.1 的 Telegram 路径会在存在任一 `reply_payload_sending` 或 `message_sending` Hook 时抑制 provider preview。判定依据是 **Hook 已注册**，不是某次 handler 是否返回改动。

因此，本插件默认 `legacy-final` 即使只过滤 `kind: "final"`、只处理 Telegram，也仍会影响原生预览。`partial` 模式在未显式关闭 block 时还可能转为提前发送完整 block：精确回合 usage 尚未就绪，已经交付的正文可能在最终阶段去重，最终-only footer 便无法附上。

legacy 的支持路径是合并 `channels.telegram.streaming.block.enabled: false`，或使用 `streaming.mode: "off"`。这保留最终 Hook 交付路径，**不会解除预览抑制**。不可通过把 block 当 final、改用最后一次调用、猜测 Token 或补编辑已发消息来规避。

原生 SDK 的其他入口也不能补上这条 handoff：

| 入口 | 不能解决的原因 |
| --- | --- |
| `reply_dispatch` | 是正常 run 之前的接管入口，不是含最终 aggregate usage 的 after-run 格式器 |
| 普通 dispatch receipt | 是聚合的交付计数 / 可见性信息，不是 Telegram message ID 或 preview lease |
| `runEmbeddedAgent` | 可返回自建执行的 usage，但会另建 / 接管执行路径；不提供既有原生 turn 的 draft 托管权 |
| ingress / channel transport | 不授予既有 turn 的预览编辑权；通道 admission 也不能被 footer 插件借用 |

本插件不采用这些替代路线，也不额外运行模型。

## 3. 注册行为

| 配置 | 注册与回退行为 |
| --- | --- |
| 未设置模式 / `legacy-final` | 注册 `reply_payload_sending`，优先级 100；仅有官方 usage 的 Telegram final 文本被追加 footer |
| `preview-safe` + 有效宿主能力 | 注册同步、只返回显示文本的生命周期格式器；不注册回复修改或 run 接管 Hook |
| `preview-safe` + 能力缺失 / 版本不符 / 生命周期 API 不足 | warn，保持 inactive；原生预览和 footer 不因本插件而改变 |
| `preview-safe` + 注册抛错 / 无有效 dispose handle | 中止本实例格式器，warn；**不回退 legacy** |
| `config.enabled: false` | 不查询能力、不注册 Hook 或格式器 |
| 运行时收到未知模式 | warn，不注册；配置 schema 本身仅允许两种已知模式 |

preview-safe 需要 `api.runtime.channel.runtimeContexts`、`version: 1` 的能力及可用的 `api.lifecycle.signal` / `onDispose`。源码入口为 [`registration.js`](./registration.js)。

## 4. 匹配宿主扩展如何工作

### 能力发现与注册归属

插件通过如下 key 发现能力，而不是自行创建 Telegram 客户端：

```js
api.runtime.channel.runtimeContexts.get({
  channelId: "telegram",
  capability: "finalUsageFooter.v1",
});
```

接口声明见 [`preview-footer.d.ts`](./preview-footer.d.ts)，插件侧适配器见 [`preview-footer.js`](./preview-footer.js)。匹配补丁实现的关键边界：

- 能力由宿主绑定到真实 loader / plugin instance；`register` 中的 `pluginId` 仅用于一致性检查，**不是身份认证**。
- 审查过的 footer owner 为 `token-speed-footer`。共享 registry 不允许任意插件覆盖这类宿主保留 key。
- 宿主独立观察实例生命周期及注册 abort signal，隔离 callback 异常，在 dispose / abort / reload 时撤销注册。
- 新 turn 只取得**唯一已发布的活跃 owner generation**。替换实例可以暂存注册，但不能“最后注册者获胜”或收养旧 turn。
- 配套 `ordinaryToolProgress.v1` owner 为 `compact-telegram-progress`；它是独立能力，不是 footer 的传输权限。

### 精确 turn lease 与生命周期

宿主在已获准的原生执行开始时创建不透明 object lease，绑定：

```text
channel + accountId + sessionKey + sessionId + runId + conversationId + threadId
```

其中 `sessionId` 是会话 incarnation，不能用可复用的 session key 替代；无 topic 时 `threadId` 必须明确为 `null`。这些身份由宿主控制流提供，不从文本、最新聊天记录或用户传来的 run ID 推测。

生命周期为 `begin → finalize`，或 `begin → cancel / failed / settled`。插件以 `WeakMap` 关联 lease 与完整 scope；终态、重复、迟到、错 scope、replay、实例释放以及 abort 均不得产生新的 footer。

有效 finalize 必须同时满足：

```text
status: completed
usageScope: turn-aggregate
target: final-text
pagination: before-chunking
replay: false
```

格式器同步返回 `string | undefined`，没有 send / edit / delete 方法。`undefined` 表示保留宿主原生 footer 策略。

### 官方统计 → 最终文本 → 原生 Telegram 管线

匹配补丁将官方 `accountAgentTurn` 的 `replyUsageState` 交给同一 turn 的 `completeReplyAgentRun`，在后缀组装、渲染、分页和正常交付之前调用格式器：

```text
已获准的 Telegram turn / 不透明 lease
  → 官方整个回合 usage + Date.now() - runStartedAt
  → finalUsageFooter.v1 同步格式器
  → 替换宿主生成的 usage 后缀
  → 原生富文本渲染 / 分页 / preview 最终化 / 交付回执
```

- 输入、输出、缓存和 total 均使用官方 aggregate，不加总 attempt，不用 `lastUsage` 替代；速度仅为输出 Token / 宿主回合 wall 秒数。
- 自定义 footer 作用于最后一个符合条件的最终文本，而非按标记搜索、删除正文中的“用量”文字。
- 宿主将结果视为字面显示文本，先验证非空、**不超过 1024 个 UTF-16 code units**、不含禁止的控制 / 双向控制字符，再交给原生渲染路径处理。
- 错误、取消、yielded、fallback-exhausted、heartbeat 及无实质最终文本等路径不生成新的自定义 footer；配置的多代理 `GroupThread` 路径不创建该 display lease。
- durable replay 不应重新查询用量或重复调用格式器；prepared payload 与重试仍由宿主拥有。

该补丁**没有放宽任意回复修改 Hook 的预览抑制规则**。preview-safe 的意义是本插件不再注册这种 Hook；其他插件、宿主路由、引用回复及 block 策略仍可能阻止原生预览。

## 5. 安全边界与回退

宿主继续拥有 admission、source custody、路由有效性、send policy、取消、draft ID、分页、格式化、平台 I/O、重试及回执。格式器不应获得或使用：

- bot token、通道客户端或任意 Telegram edit / delete 权限；
- transcript、最新 run 猜测、原始模型流、聊天 / message ID 拼接逻辑；
- 额外模型执行、替换通道、hashed bundle 私有导入或 ingress 提权。

返回缺失、抛错、不合法、超长、身份失配或 owner 失效时，保留原生交付行为；原生 footer 是否显示仍服从 `/usage` 设置。preview-safe 建议保留 `messages.responseUsage: "full"` 作为默认回退，并检查当前会话偏好。

legacy 只是追加 payload：防重依赖 footer 前缀匹配，不会替换原生 usage 行，所以需关闭原生 footer 避免重复。纯格式器无网络 / 持久化；但 OpenClaw 原生插件仍在 Gateway 进程内运行，**这不是任意插件代码的沙箱保证**。

## 6. 证据层级，而非“全面 live 认证”

| 验证 | 范围 |
| --- | --- |
| 插件单元测试 | 真实格式化与注册代码、scope / lease、取消 / 重复 / replay / disposal；不启动 Gateway |
| 微型宿主模拟 | 顺序、终态与页面预算示例；不是 Telegram 富文本分页或平台 I/O |
| 可选 stock 宿主契约测试 | 只读官方包 `dist/`，核对预览抑制及公开 SDK 边界；未设置 `OPENCLAW_RUNTIME_ROOT` 时默认 skip |
| 匹配补丁中的宿主集成测试 | 真实 registry、实例生命周期、usage accounting、Telegram dispatcher / draft / compositor / page planner；提供方事实和 Bot API 为 fake transport |
| 候选宿主启动与 footer 注册 | 已确认候选能启动、格式器能注册；不证明最终平台送达 |

**真实 Telegram 最终消息回执 / 截图尚未完整核实，不能宣称全面 live 认证。** 本插件单元测试与 CI 不做 live Telegram 验收；匹配宿主测试也必须在已打补丁的宿主源码项目中单独运行。

## 7. Operator 验收清单

1. 审查补丁，在精确 upstream base 的独立 checkout 中核对并构建；保留可回退的宿主构建。详见 [integration/README.md](./integration/README.md)。不要修改正在运行的 pnpm 存储或 bundle。
2. 在 operator 授权的候选环境合并配置：`deliveryMode: "preview-safe"`、Telegram `mode: "partial"`、`block.enabled: false`，检查 allow/deny 与账号覆盖。保持原生 usage 回退，避免覆盖其他配置。
3. 用官方插件安装 / enable / reload 路径应用，核对 applied receipt、generation 与格式器注册日志。`inspect --runtime` 是 CLI 进程检查，不是 Gateway 实际使用的充分证据。
4. 用**新回合**确认原生 preview 编辑及最终单份 footer，并对照实际提供方的官方整个回合统计；保存已脱敏回执 / 截图。
5. 验证长回复、富文本 / emoji 边界、native `/usage off|tokens|full`、多次模型调用、fallback、缺失 usage、零耗时，以及多账号 / topic / 同聊天并发的隔离。
6. 验证取消 / superseded、mid-turn reload、工具交付 final、媒体 / 无文本、错误 / replay、未确认 / 部分 / 失败交付；宿主必须在平台 I/O 前保持现有权限与取消检查，不能靠格式器成功推断送达。
7. 失败时使用官方 plugin disable，并由 operator 选择已保留的宿主回退构建；恢复原先的 streaming / `/usage` 偏好时只合并相关字段。不要猜消息 ID、删最终回答或为补 footer 发第二次模型请求。

只有这些目标场景有实际证据后，才可针对相应版本和部署声称 live 验收通过。
