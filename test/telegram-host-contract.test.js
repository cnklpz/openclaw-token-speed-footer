import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Optional executable regression against installed host code. No host files,
// config, channels, or provider APIs are changed. Set OPENCLAW_RUNTIME_ROOT to
// an OpenClaw package root when validating the Telegram adapter after upgrades.
const root = process.env.OPENCLAW_RUNTIME_ROOT;

test("installed Telegram host: a modifying hook disables previews; explicit block=false retains final delivery", {
  skip: !root && "set OPENCLAW_RUNTIME_ROOT to validate the installed adapter",
}, () => {
  const dist = join(root, "dist");
  const filename = readdirSync(dist).find((name) => /^bot-message-.*\.mjs$/.test(name));
  assert.ok(filename, "bundled Telegram dispatcher must exist");
  const source = readFileSync(join(dist, filename), "utf8");
  assert.match(source, /const allowProviderPreview = !dispatchContext\.ctxPayload\.GroupThread && !\(\(hookRunner\?\.hasHooks\("reply_payload_sending"\)/);
  const start = source.indexOf("function createDraftState(params) {");
  const end = source.indexOf("function resetLaneState(", start);
  assert.ok(start >= 0 && end > start, "expected host draft-state contract");
  // Execute the actual installed draft-state function. Only unrelated transport
  // dependencies are stubbed; the preview/block selection logic is host code.
  const createDraftState = new Function("resolveChannelStreamingBlockEnabled", "TELEGRAM_TEXT_CHUNK_LIMIT", "TELEGRAM_RICH_TEXT_LIMIT", `${source.slice(start, end)}; return createDraftState;`)(
    (cfg) => cfg.streaming?.block?.enabled, 4096, 4096,
  );
  const params = {
    allowProviderPreview: false, // registered reply_payload_sending hook
    streamMode: "partial",
    resolvedReasoningLevel: "off",
    replyToMode: "off",
    telegramCfg: { streaming: { mode: "partial" } },
    cfg: {},
    textLimit: 4096,
    context: { ctxPayload: {}, route: { accountId: "default" } },
  };
  const implicit = createDraftState(params);
  assert.equal(implicit.answerLane.stream, undefined);
  assert.equal(implicit.disableBlockStreaming, false, "hooks + partial forces completed-block delivery when block policy is unset");
  const explicit = createDraftState({ ...params, telegramCfg: { streaming: { mode: "partial", block: { enabled: false } } } });
  assert.equal(explicit.answerLane.stream, undefined);
  assert.equal(explicit.disableBlockStreaming, true, "explicit channel block=false preserves final hooked delivery");
  assert.equal(createDraftState({ ...params, streamMode: "off" }).disableBlockStreaming, true);
});

test("installed SDK has takeover and aggregate run meta, but no preview-safe footer bridge", {
  skip: !root && "set OPENCLAW_RUNTIME_ROOT to validate public SDK boundary",
}, () => {
  const dist = join(root, "dist");
  function declaration(prefix, anchor) {
    for (const name of readdirSync(dist).filter((name) => name.startsWith(prefix) && name.endsWith(".d.ts"))) {
      const source = readFileSync(join(dist, name), "utf8");
      if (source.includes(anchor)) return source;
    }
    assert.fail(`missing public declaration ${anchor}`);
  }
  function typeBody(source, name) {
    const start = source.indexOf(`type ${name} = {`);
    assert.ok(start >= 0, `${name} exists`);
    const end = source.indexOf("\n};", start);
    assert.ok(end > start);
    return source.slice(start, end);
  }
  const hooks = declaration("hook-runner-global-", "type PluginHookReplyDispatchEvent");
  const event = typeBody(hooks, "PluginHookReplyDispatchEvent");
  assert.match(event, /runId\?: string/); assert.match(event, /sessionKey\?: string/);
  assert.doesNotMatch(event, /usageState|runResult|receipt|preview/i);
  const runtime = declaration("agent-harness-runtime-", "type PluginRuntimeChannel$1");
  const dispatch = typeBody(runtime, "DispatchFromConfigResult");
  assert.match(dispatch, /settledReceipt\?: ReplyDispatchReceipt/);
  assert.doesNotMatch(dispatch, /usageState|runResult|durationMs|messageId/);
  const receipt = typeBody(hooks, "ReplyDispatchReceipt");
  assert.match(receipt, /counts:/); assert.doesNotMatch(receipt, /messageId|chatId|preview/i);
  const channel = typeBody(runtime, "PluginRuntimeChannel$1");
  assert.match(channel, /inbound:/); assert.match(channel, /runtimeContexts:/);
  assert.doesNotMatch(channel, /editMessage|finalUsageFooter/);
  assert.match(typeBody(runtime, "EmbeddedAgentRunResult"), /meta: EmbeddedAgentRunMeta/);
  // This tests the stated boundary, not a fabricated future implementation.
  assert.doesNotMatch(readFileSync(join(root, "dist/plugin-sdk/channel-runtime-context.d.ts"), "utf8"), /finalUsageFooter/);
});
