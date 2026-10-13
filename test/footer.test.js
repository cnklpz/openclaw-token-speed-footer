import test from "node:test";
import assert from "node:assert/strict";
import { appendUsageFooter, formatUsageFooter, isTelegramFinalEvent } from "../footer.js";

test("uses only official normalized usage and turn duration", () => {
  const footer = formatUsageFooter({
    usage: { input: 1200, output: 300, cacheRead: 40, cacheWrite: 5, total: 1500 },
    durationMs: 2500,
    resolvedRef: "openai/example",
  }, { showModel: true });
  assert.equal(footer, "🧮 用量：输入 1,200 · 输出 300 · 缓存读取 40 · 缓存写入 5 · 总计 1,500 · 输出速度 120 token/秒（回合耗时） · 回合耗时 2.50秒 · openai/example");
});

test("does not invent speed or tokens when host data is absent", () => {
  assert.equal(formatUsageFooter({ usage: {}, durationMs: 1000 }), undefined);
  assert.equal(formatUsageFooter({ usage: { input: 10 } }), "🧮 用量：输入 10");
  assert.equal(formatUsageFooter(undefined), undefined);
  assert.equal(formatUsageFooter({ lastUsage: { output: 50 }, durationMs: 1000 }), undefined);
});

test("2026.10.1 lastUsage does not replace official whole-turn aggregate", () => {
  assert.equal(formatUsageFooter({
    usage: { input: 100, output: 30, total: 130 },
    lastUsage: { input: 20, output: 10, total: 30 },
    contextUsedTokens: 20,
  }), "🧮 用量：输入 100 · 输出 30 · 总计 130");
});

test("early streamed blocks must not be treated as completed turns", () => {
  assert.equal(isTelegramFinalEvent({ kind: "block", channel: "telegram" }, {}), false);
  assert.equal(formatUsageFooter({ usage: { output: NaN, input: -1 }, durationMs: 0 }), undefined);
});

test("appends once and preserves payload fields", () => {
  const payload = { text: "answer", replyToId: "7", mediaUrls: ["file://local"] };
  const once = appendUsageFooter(payload, "🧮 用量：输入 1");
  const twice = appendUsageFooter(once, "🧮 用量：输入 1");
  assert.equal(once.text, "answer\n\n🧮 用量：输入 1");
  assert.deepEqual(twice, once);
  assert.equal(once.replyToId, "7");
});

test("only transforms Telegram final replies", () => {
  assert.equal(isTelegramFinalEvent({ kind: "final", channel: "telegram" }, {}), true);
  assert.equal(isTelegramFinalEvent({ kind: "tool", channel: "telegram" }, {}), false);
  assert.equal(isTelegramFinalEvent({ kind: "final", channel: "discord" }, { channel: "telegram" }), true);
  assert.equal(isTelegramFinalEvent({ kind: "final", channel: "discord" }, { channel: "discord" }), false);
});
