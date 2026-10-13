<div align="center">

# 🧮 OpenClaw Token & Speed Footer

**让 Telegram 最终回复带上官方 Token 用量，以及口径清楚的回合平均输出速度。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Version: 0.1.0](https://img.shields.io/badge/version-0.1.0-8b5cf6.svg)](./package.json)
[![Node.js tests: >=22](https://img.shields.io/badge/Node.js_tests-%3E%3D22-5FA04E?logo=nodedotjs&logoColor=white)](#requirements)
[![OpenClaw baseline: 2026.10.1](https://img.shields.io/badge/OpenClaw_baseline-2026.10.1-0078D4.svg)](#compatibility)

官方数据 · 不估算 Token · 不额外调用模型 · 无第三方遥测

</div>

> [!IMPORTANT]
> **默认模式 `legacy-final` 会注册回复修改 Hook，因此会关闭 OpenClaw 2026.10.1 的原生 Telegram 预览。**
> 若要保留原生预览，请选择 `preview-safe`，并使用提供 `finalUsageFooter.v1` 的匹配宿主。
> 官方未修改的 2026.10.1 **不包含**该能力：插件会告警并保持 inactive，**不会默默降级到 legacy 模式**。

## 目录

- [效果演示](#demo)
- [统计口径](#accounting)
- [兼容性与运行要求](#compatibility)
- [安装](#install)
- [配置](#configuration)
- [启用、重载与验证](#verification)
- [测试与验证边界](#tests)
- [模块与仓库结构](#structure)
- [隐私、安全与局限](#security)
- [关联项目与许可证](#related)

<a id="demo"></a>

## 效果演示

最终回复正文之后，追加一段中文用量信息：

```text
这里是助手的最终回答。

🧮 用量：输入 1,200 · 输出 300 · 缓存读取 40 · 缓存写入 5 · 总计 1,500 · 输出速度 120 token/秒（回合耗时） · 回合耗时 2.50秒
```

**以上为演示数据，不是真实 Telegram 消息回执或实测截图。** 模型名默认隐藏；宿主未提供的字段不会被补成猜测值。

### 这个插件做什么？

- **展示官方回合统计**：输入、输出、缓存读取、缓存写入及总 Token。
- **明确标注速度口径**：使用宿主回合耗时计算平均输出吞吐量，而非冒充生成阶段速度。
- **只处理 Telegram 最终文本**：不把中途 block、工具输出或进度卡当成已完成回合。
- **将显示与传输分开**：插件负责格式化；宿主负责发送、编辑、富文本、分页和回执。
- **提供两条兼容路径**：无需宿主补丁的 legacy Hook，以及需匹配宿主扩展的 preview-safe 格式器。

<a id="accounting"></a>

## 统计口径

数据来自 OpenClaw 官方的 `usageState.usage` 与 `usageState.durationMs`，不是从回复长度、聊天记录或单次模型调用推算。

| 显示项 | 数据来源 / 含义 |
| --- | --- |
| 输入、输出 | 官方整个回合的 `usage.input` / `usage.output` |
| 缓存读取、缓存写入 | 官方 `usage.cacheRead` / `usage.cacheWrite`；具体含义取决于提供方 |
| 总计 | **直接使用**官方 `usage.total`，不自行加总 |
| 回合耗时 | 宿主提供的 `durationMs`，换算为秒 |
| 输出速度 | `usage.output ÷ (durationMs / 1000)`，即 **回合 wall-time 平均输出速度** |
| 模型名（可选） | 宿主的 `resolvedRef` |

> **回合平均速度 ≠ 生成阶段 token/s。** 宿主的计时包含该回合内部的模型调用、工具执行及编排等耗时，不是从首 Token 到末 Token 的专用生成计时，也不是 Telegram 网络送达耗时。

准确性规则：

- 只显示宿主提供的有限、非负数值；Token 数按整数展示。
- **不将 cache 字段额外叠加到 total**：提供方可能使用不同的缓存统计口径。
- 不用 `lastUsage` / 最后一次调用、上下文占用量或尝试级事件替代整个回合 aggregate。
- 输出 Token 缺失、耗时缺失或耗时为零时，不显示速度；没有可用的官方用量时，不生成自定义 footer。
- 这不是费用估算、上下文进度条，也不是跨会话或子代理账单汇总。

<a id="compatibility"></a>

## 兼容性与运行要求

### 宿主兼容性矩阵

本版本仅以 **OpenClaw 2026.10.1** 为验证基线，不承诺其他版本兼容。

| 宿主 | `legacy-final`（默认） | `preview-safe` | 原生 Telegram 预览 |
| --- | --- | --- | --- |
| 官方未修改的 2026.10.1 | 注册最终回复 Hook；需保留最终交付路径 | 告警并 inactive，无自定义 footer | legacy 会抑制；preview-safe 不干扰原生行为 |
| 2026.10.1 + 本仓匹配宿主补丁 | 仍走 legacy Hook | 通过 `finalUsageFooter.v1` 注册格式器 | preview-safe 不因本插件而抑制预览；仍受宿主配置及其他 Hook 限制 |
| 其他版本或其他来源的宿主补丁 | 未验证 | 未验证；缺少有效能力时 inactive | 不作保证 |

匹配宿主源码补丁位于 [`integration/host.patch`](./integration/host.patch)，固定上游基线为：

```text
OpenClaw tag: v2026.10.1
Upstream commit: e178c39e9aae3fa440735217f9aef9574f286677
```

它是**本仓提供的宿主扩展，不是官方 2026.10.1 已发布的 SDK 能力**。复现、构建和部署边界见 [`integration/README.md`](./integration/README.md)；接口与安全契约见 [`HOST-COMPATIBILITY.md`](./HOST-COMPATIBILITY.md)。仅安装或重载插件不会把这个能力加入宿主。

<a id="requirements"></a>

### Node.js 要求必须分开看

| 场景 | 要求 |
| --- | --- |
| 运行本插件的独立格式化 / 注册单元测试 | Node.js **22 或更高版本** |
| 运行 OpenClaw 2026.10.1 宿主及其中的插件 | 遵循宿主 `engines.node`：**`>=24.16.0 <25 || >=26.1.0`** |

Node.js 22 的插件测试基线，**不代表 OpenClaw 宿主可以运行在 Node.js 22 上**。还需已有可正常工作的 Telegram 通道及提供官方 usage 的模型 / 提供方。

<a id="install"></a>

## 安装

以下命令供 **Gateway 主机上的 operator** 执行，采用已核对的 2026.10.1 本地目录 link 安装流程。安装原生插件相当于在 Gateway 进程内运行代码，请先审查源码。

```bash
git clone https://github.com/cnklpz/openclaw-token-speed-footer.git
cd openclaw-token-speed-footer

# 独立测试不需要启动 Gateway，也不调用模型或 Telegram。
npm test
npm run check

# 先记录安装，再选择模式和配置，避免新安装立即启用默认 legacy Hook。
openclaw plugins install --link "$PWD" --no-enable
```

- 生产使用建议在安装前 checkout 已审查的固定提交；`--link` 会继续引用该目录，勿删除或随意移动它。
- 新的本地来源可能要求交互式信任确认。非交互场景只在审查并信任来源后使用官方 `--force` 选项；它不是绕过安全策略或能力同意的开关。
- `--no-enable` 保留既有启用策略，**不会禁用已经启用的安装**。已有安装应先检查状态，不要把此命令当作停用操作。
- 本文不假定 npm / ClawHub 已发布该包，也不依赖未经验证的 GitHub 直装写法。

命令依据：[v2026.10.1 插件 CLI](https://github.com/openclaw/openclaw/blob/v2026.10.1/docs/cli/plugins.md)、[安装说明](https://github.com/openclaw/openclaw/blob/v2026.10.1/docs/cli/plugins/install.md)、[重载说明](https://github.com/openclaw/openclaw/blob/v2026.10.1/docs/cli/plugins/uninstall-and-update.md)。

<a id="configuration"></a>

## 配置

> [!WARNING]
> 下列是**需合并的配置片段，不是完整配置文件**。请选择一种模式，将相应字段合并到已有配置中，保留通道凭据、账号、绑定、其他插件、allow/deny 列表及其他 streaming 设置。不要整份覆盖 `openclaw.json`。

### 方案 A：官方宿主上的 `legacy-final`

接受失去原生预览，确保答案走能拿到最终 usage 的交付路径：

```json5
{
  messages: {
    responseUsage: "off", // 避免原生 usage footer 与自定义 footer 重复
  },
  channels: {
    telegram: {
      streaming: {
        mode: "partial",
        block: { enabled: false }, // 保留最终 Hook 路径；不会恢复原生预览
      },
    },
  },
  plugins: {
    entries: {
      "token-speed-footer": {
        config: {
          enabled: true,
          deliveryMode: "legacy-final",
          showInput: true,
          showOutput: true,
          showCache: true,
          showTotal: true,
          showSpeed: true,
          showDuration: true,
          showModel: false,
          footerPrefix: "🧮",
        },
      },
    },
  },
}
```

也可选择 `channels.telegram.streaming.mode: "off"`。在 2026.10.1 中，修改 Hook + `partial` + 未显式关闭 block 可能转为提前发送完整 block：此时精确回合用量尚未记录，已经送出的正文还可能被最终交付去重，导致 footer 缺失。**将 block 当 final 或估算 usage 都不是正确修复。**

这里关闭的是原生 footer 默认值，不是官方用量采集。如果当前会话已有 `/usage tokens` 或 `/usage full` 偏好，应在该会话使用 `/usage off` 避免双 footer。

### 方案 B：匹配扩展宿主上的 `preview-safe`

仅在宿主已提供 `finalUsageFooter.v1` 时使用；其余显示选项沿用上表默认值：

```json5
{
  messages: {
    responseUsage: "full", // 自定义格式器不可用时，保留原生 footer 作为回退
  },
  channels: {
    telegram: {
      streaming: {
        mode: "partial",
        block: { enabled: false },
      },
    },
  },
  plugins: {
    entries: {
      "token-speed-footer": {
        config: {
          enabled: true,
          deliveryMode: "preview-safe",
        },
      },
    },
  },
}
```

匹配宿主用自定义文本**替换宿主生成的 usage 后缀**，而非追加第二份原生 footer。能力不存在、契约不正确或注册失败时，插件告警并保持 inactive，不注册 `reply_payload_sending` / `message_sending` 或接管 run 的 Hook。原生 footer 是否显示仍由宿主 `/usage` 设置决定。

全局 `messages.responseUsage` 是默认值，不会必然覆盖既有会话偏好；需要原生回退时也应检查当前会话的 `/usage` 模式。`/usage off` 只控制原生 footer，**不会关闭本插件自定义 footer**；停用自定义显示请用插件配置或官方 disable 命令。

多账号部署应检查对应账号的 streaming 覆盖值。即使本插件使用 preview-safe，其他回复修改 Hook、宿主路由或选中引用回复等规则仍可能关闭原生预览。

### 插件选项

配置位置：`plugins.entries["token-speed-footer"].config`。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | `false` 时不注册 Hook 或格式器，不因本插件注册而抑制预览 |
| `deliveryMode` | `"legacy-final"` | `legacy-final` / `preview-safe`；模式决定宿主交付路径 |
| `showInput` | `true` | 显示官方输入 Token |
| `showOutput` | `true` | 显示官方输出 Token |
| `showCache` | `true` | 显示可用的缓存读取 / 写入字段 |
| `showTotal` | `true` | 显示官方 total，不重算 |
| `showSpeed` | `true` | 数据充分时显示回合平均输出速度 |
| `showDuration` | `true` | 显示宿主回合 wall-time 秒数 |
| `showModel` | `false` | 显示宿主模型引用 `resolvedRef` |
| `footerPrefix` | `"🧮"` | 最长 64 字符；空白前缀退回默认值 |

`config.enabled` 是本插件的显示开关，外层 `plugins.entries.<id>.enabled` 是宿主的加载策略。后者及全局 `plugins.enabled`、allow/deny 策略仍需允许本插件加载；不要为了安装本插件覆盖已有 allowlist。

<a id="verification"></a>

## 启用、重载与验证

配置经 Control UI 或官方配置管理路径合并后，由 operator 执行：

```bash
openclaw plugins enable token-speed-footer
openclaw plugins reload token-speed-footer --wait --json
openclaw plugins list --json
openclaw plugins inspect token-speed-footer --runtime --json
```

- 管理命令使用可用的本地 Gateway；源码 / manifest 改动后使用官方 reload，查看 applied generation 及返回的告警。
- **reload 保留启用状态**，不会把禁用的插件自动启用，也不会添加宿主补丁。运行中的回合可能保留旧设置，验证应使用新完成的回合。
- `list` / 普通 `inspect` 是配置与清单检查；`inspect --runtime` 在**执行 CLI 的进程**中加载插件以检查注册，不等于证明运行中的 Gateway 已加载同一份代码。
- 最终证明需要 Gateway 的应用回执 / 日志，以及一个真实 Telegram 回合：官方计数、速度口径和最终可见 footer 都正确。preview-safe 还需确认原生预览正常、仅一份 footer。
- 不要直接编辑运行中的 pnpm 存储、hashed bundle 或自动重启当前 Gateway。若官方管理结果报告必须重启，应由 operator 通过其受支持的部署路径处理。

要停用插件：

```bash
openclaw plugins disable token-speed-footer
```

这不会自动恢复你此前修改的 streaming / 原生 `/usage` 偏好；按原配置合并恢复即可。

<a id="tests"></a>

## 测试与验证边界

```bash
npm test
npm run check
```

测试涵盖官方 aggregate 字段、缺失数据、legacy 最终 Hook、重复追加防护、preview-safe 注册失败、并发账号 / 会话 / run / topic 隔离、取消、迟到 / 重复 final、replay、实例释放及分页契约模拟。

可选的 **stock 宿主契约测试**：

```bash
OPENCLAW_RUNTIME_ROOT=/path/to/stock-openclaw-2026.10.1 npm test
```

路径应指向官方未修改的 OpenClaw 包根目录，含 `dist/`。这些测试只读宿主代码与声明，对 draft-state 的选择逻辑做受控执行；不会改宿主、启动 Gateway 或发消息。未设置环境变量时，**两个宿主契约测试默认 skip**。它们核对的是 stock 行为，不是匹配宿主补丁的验收测试。

| 验证层级 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| 本插件单元测试 / 语法检查 | 格式化、注册与插件侧生命周期行为 | 真实提供方返回 usage 或 Telegram 已收到消息 |
| 插件内的微型宿主模拟 | 生命周期顺序、重复防护、页面预算示例 | Telegram 真正的 HTML / Markdown 分页与网络行为 |
| 匹配宿主补丁集成测试 | 真宿主 registry、官方 accounting 和原生 Telegram 管线，使用假提供方事实与内存 transport | live Telegram 验收；这些测试需在宿主源码项目中运行 |
| 候选宿主启动与格式器注册 | 候选构建能启动、格式器能注册 | 最终消息回执、截图及全部实际交付场景 |

**已确认候选宿主启动和 footer 注册成功；真实 Telegram 最终消息回执 / 截图尚未完整核实，因此不宣称全面 live 认证。** 单元测试或 CI 通过也不等于 live Telegram 验收。推广部署前仍需验证长消息、多账号 / 话题、取消 / 替代回合、重载和失败恢复等场景。

<a id="structure"></a>

## 模块与仓库结构

```text
.
├── index.js                    # OpenClaw 插件入口
├── registration.js             # 两种模式的注册与释放
├── footer.js                   # 无宿主依赖的纯格式化 / 追加逻辑
├── preview-footer.js           # display-only 生命周期适配器
├── preview-footer.d.ts          # v1 接口契约
├── openclaw.plugin.json         # 插件 ID、激活与配置 schema
├── package.json                # 版本、导出和测试命令
├── test/                       # 单元测试及可选 stock 宿主契约测试
├── integration/host.patch      # 固定上游基线的宿主源码补丁
├── integration/LICENSE.openclaw # 补丁所涉及上游代码的 MIT 声明
├── HOST-COMPATIBILITY.md        # 交付能力与安全边界
└── LICENSE
```

纯模块可以在本地直接复用，无需加载 Gateway：

```js
import { formatUsageFooter, appendUsageFooter } from "./footer.js";
import { createPreviewFooterFormatter } from "./preview-footer.js";

const footer = formatUsageFooter({
  usage: { input: 1200, output: 300, total: 1500 },
  durationMs: 2500,
});
const payload = appendUsageFooter({ text: "示例回答" }, footer);
```

包同时声明 `./formatter` 与 `./preview-footer` 导出；在包可被解析的项目中可使用 `openclaw-token-speed-footer/formatter` 等路径。这不是 npm 已发布的声明。

<a id="security"></a>

## 隐私、安全与局限

- **没有额外模型调用或第三方遥测**：本插件不估算 Token，不请求模型、账单或 Telegram API。
- **不自建 Telegram 客户端**：不获取 bot 凭据、猜测 chat / message ID，也不自行编辑、删除、重发或接管回复。
- **不读取 transcript 或持久化统计账本**：preview-safe 用宿主提供的不透明 lease 和完整回合身份做关联，状态保存在内存 `WeakMap` 中。
- **宿主保有交付权限**：原生插件本身不是沙箱；“display-only”描述的是本实现及该能力的权限边界，不是对任意第三方插件代码的安全保证。
- **提供方可能缺少 usage**：插件选择省略，而非造数。总量和缓存字段的含义仍取决于提供方及 OpenClaw 的官方归一化。
- **不是实时速度表**：中途原生 preview 可以被宿主编辑，但本插件只使用最终回合快照。
- **legacy 有已知边界**：追加防重依赖 footer 文本前缀匹配；正文已有相同标记时可能跳过追加。它不会自动删除原生 usage 行；同一逻辑回复含多个最终文本 payload 时也不承诺统一成单个后缀。
- **preview-safe 不覆盖所有交付路径**：匹配补丁对无可见最终文本、错误 / 取消 / yielded / replay 等路径不生成新的自定义 footer；配置的多代理 group-thread 路径不在此扩展覆盖范围。

提交 Issue 或验收材料时，请去掉密钥、聊天 / 消息 ID、用户文本和私有模型标识；只提供必要的版本、已脱敏配置及最小复现。

<a id="related"></a>

## 关联项目与许可证

- [**OpenClaw Compact Telegram Progress**](https://github.com/cnklpz/openclaw-compact-telegram-progress)：配套的普通工具进度精简插件；它需要宿主 `ordinaryToolProgress.v1`，本仓匹配补丁一并提供这两个 display-only 能力。两个插件可独立选择，不会互相安装或启用。
- [OpenClaw](https://github.com/openclaw/openclaw)：官方宿主项目。
- [HOST-COMPATIBILITY.md](./HOST-COMPATIBILITY.md)：技术接口、原生预览限制和验收清单。
- [宿主集成说明](./integration/README.md)：精确基线、补丁复现和 operator 部署边界。

本插件采用 [MIT License](./LICENSE)。宿主补丁涉及的 OpenClaw 代码保留其[上游 MIT 许可证](./integration/LICENSE.openclaw)。
