import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewFooterFormatter } from "../preview-footer.js";
import { formatUsageFooter } from "../footer.js";

const usageState = {
  usage: { input: 1200, output: 300, cacheRead: 40, cacheWrite: 5, total: 1500 }, durationMs: 2500,
  lastUsage: { output: 1 },
};
function turn(overrides = {}) {
  return { lease: Object.freeze({}), scope: {
    channel: "telegram", accountId: "a", sessionKey: "session", sessionId: "incarnation", runId: "run",
    conversationId: "chat", threadId: null, ...overrides,
  }, signal: new AbortController().signal, replay: false };
}
function start(on, t) { on({ ...t, phase: "begin" }); }
function finish(on, t, overrides = {}) {
  return on({ ...t, phase: "finalize", status: "completed", usageScope: "turn-aggregate",
    target: "final-text", pagination: "before-chunking", usageState, ...overrides });
}

test("preview-safe formatter exactly reuses old aggregate/cache/total/wall-speed format", () => {
  const on = createPreviewFooterFormatter(); const t = turn(); start(on, t);
  assert.equal(finish(on, t), formatUsageFooter(usageState));
});

test("concurrent same-chat runs, same-run accounts, sessions and topics remain isolated", () => {
  const on = createPreviewFooterFormatter();
  const turns = [turn(), turn({ accountId: "b" }), turn({ runId: "next" }),
    turn({ sessionKey: "other" }), turn({ threadId: "topic" })];
  for (const t of turns) start(on, t);
  for (const t of turns.toReversed()) {
    assert.equal(finish(on, t), formatUsageFooter(usageState));
    assert.equal(finish(on, t), undefined);
  }
});

test("wrong route or foreign lease never edits/consumes another run", () => {
  for (const [field, wrong] of [["channel", "discord"], ["accountId", "b"], ["runId", "b"],
    ["sessionKey", "b"], ["sessionId", "other-incarnation"], ["conversationId", "b"], ["threadId", "b"]]) {
    const on = createPreviewFooterFormatter(); const t = turn(); start(on, t);
    assert.equal(finish(on, { ...t, scope: { ...t.scope, [field]: wrong } }), undefined);
    assert.equal(finish(on, { ...t, lease: {} }), undefined);
    assert.equal(finish(on, t), formatUsageFooter(usageState));
  }
});

test("cancel/failure/settlement fence late finals and duplicate begins", () => {
  for (const phase of ["cancel", "failed", "settled"]) {
    for (const beforeBegin of [false, true]) {
      const on = createPreviewFooterFormatter(); const t = turn();
      if (!beforeBegin) start(on, t);
      on({ ...t, phase }); start(on, t);
      assert.equal(finish(on, t), undefined);
    }
  }
});

test("abort before begin and between begin/finalize blocks footer", () => {
  for (const beforeBegin of [true, false]) {
    const on = createPreviewFooterFormatter(); const controller = new AbortController();
    const t = { ...turn(), signal: controller.signal };
    if (beforeBegin) controller.abort(); start(on, t);
    if (!beforeBegin) controller.abort();
    assert.equal(finish(on, t), undefined);
  }
});

test("duplicate/late finalize is at most once; replay never manufactures usage", () => {
  const on = createPreviewFooterFormatter(); const t = turn(); start(on, t); start(on, t);
  assert.equal(finish(on, t), formatUsageFooter(usageState));
  start(on, t); assert.equal(finish(on, t), undefined);
  const replay = { ...turn(), replay: true }; start(on, replay);
  assert.equal(finish(on, replay), undefined);
  start(on, { ...replay, replay: false }); assert.equal(finish(on, { ...replay, replay: false }), undefined);
  const orphan = turn(); assert.equal(finish(on, orphan), undefined);
  start(on, orphan); assert.equal(finish(on, orphan), undefined);
});

test("only completed host whole-turn final before chunking is eligible", () => {
  for (const override of [{ status: "error" }, { status: "cancelled" }, { replay: true },
    { usageScope: "attempt" }, { usageScope: undefined }, { target: "progress" },
    { pagination: "already-chunked" }, { usageState: undefined },
    { usageState: { lastUsage: { output: 3 } } }, { usageState: { usage: {} } }]) {
    const on = createPreviewFooterFormatter(); const t = turn(); start(on, t);
    assert.equal(finish(on, t, override), undefined);
    assert.equal(finish(on, t), undefined, "bad/missing data final remains terminal");
  }
});

test("missing host identity fails closed; progress does not consume completed turn", () => {
  for (const field of ["accountId", "sessionKey", "sessionId", "runId", "conversationId", "threadId"]) {
    const on = createPreviewFooterFormatter(); const t = turn({ [field]: undefined }); start(on, t);
    assert.equal(finish(on, t), undefined);
  }
  const on = createPreviewFooterFormatter(); const t = turn(); start(on, t);
  assert.equal(on({ ...t, phase: "progress", usageState }), undefined);
  assert.equal(finish(on, t), formatUsageFooter(usageState));
});

// A deliberately tiny host simulator. It validates ordering/idempotency, NOT
// Telegram HTML escaping, exact text limits, rich text splitting or network I/O.
function simulateHost(on, t, text, { limit = 4096, fail = false, abortAfterFormat = false } = {}) {
  start(on, t);
  const footer = finish(on, t);
  if (abortAfterFormat) {
    on({ ...t, phase: "cancel" });
    return { sends: [], footer };
  }
  const points = Array.from(text); const pages = [];
  for (let i = 0; i < points.length; i += limit) pages.push(points.slice(i, i + limit).join(""));
  // Host keeps the suffix paragraph intact; never truncates answer to make room.
  const suffix = footer ? `\n\n${footer}` : "";
  if (suffix && Array.from(suffix).length <= limit) {
    if (pages.length && Array.from(pages.at(-1) + suffix).length <= limit) pages[pages.length - 1] += suffix;
    else pages.push(suffix);
  }
  on({ ...t, phase: fail ? "failed" : "settled" });
  // Any retry/ambiguous receipt belongs to host; formatter owns no edit method.
  return { sends: fail ? [] : pages, pages, footer };
}

test("host appends once before pagination, including exact limit and extra footer page", () => {
  const footer = formatUsageFooter(usageState); const limit = Array.from(footer).length + 2;
  for (const n of [0, limit - 1, limit, limit + 1, limit * 3]) {
    const on = createPreviewFooterFormatter(); const t = turn(); const text = "😀".repeat(n);
    const result = simulateHost(on, t, text, { limit });
    assert.equal(result.pages.join(""), `${text}\n\n${footer}`);
    assert.ok(result.pages.every((page) => Array.from(page).length <= limit));
    assert.equal(result.pages.at(-1).endsWith(footer), true);
    assert.equal(result.pages.join("").split(footer).length, 2);
    assert.equal(finish(on, t), undefined);
  }
});

test("transport failure/ambiguous completion does not trigger a corrective edit or guessed retry", () => {
  const on = createPreviewFooterFormatter(); const t = turn();
  const result = simulateHost(on, t, "answer", { fail: true });
  assert.deepEqual(result.sends, []); assert.equal(finish(on, t), undefined);
  assert.equal(typeof on.edit, "undefined"); assert.equal(typeof on.send, "undefined");
});

test("host rechecks cancellation after callback, before first platform action", () => {
  const on = createPreviewFooterFormatter(); const t = turn();
  assert.deepEqual(simulateHost(on, t, "answer", { abortAfterFormat: true }).sends, []);
  assert.equal(finish(on, t), undefined);
});

test("plugin generation disposal fences already-started and new turns", () => {
  const controller = new AbortController();
  const on = createPreviewFooterFormatter({}, { signal: controller.signal });
  const t = turn(); start(on, t); controller.abort();
  assert.equal(finish(on, t), undefined);
  const next = turn({ runId: "next" }); start(on, next); assert.equal(finish(on, next), undefined);
});

test("oversize footer is host-skipped without truncating answer or splitting suffix", () => {
  const on = createPreviewFooterFormatter(); const t = turn();
  const result = simulateHost(on, t, "answer text", { limit: 8 });
  assert.equal(result.pages.join(""), "answer text");
  assert.equal(finish(on, t), undefined);
});
