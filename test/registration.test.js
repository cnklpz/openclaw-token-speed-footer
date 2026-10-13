import test from "node:test";
import assert from "node:assert/strict";
import { registerFooterPlugin } from "../registration.js";
import { PREVIEW_FOOTER_CAPABILITY } from "../preview-footer.js";
function fixture(pluginConfig, capability) {
  const hooks = [], registrations = [], warnings = [], queries = [], disposers = [];
  const controller = new AbortController();
  const api = { pluginConfig,
    lifecycle: { signal: controller.signal, onDispose: (dispose) => disposers.push(dispose) },
    on: (...args) => hooks.push(args), logger: { info() {}, warn: (message) => warnings.push(message) },
    runtime: { channel: { runtimeContexts: { get: (query) => { queries.push(query); return capability; } } } },
  };
  return { api, hooks, registrations, warnings, queries, disposers, controller };
}

test("legacy-final preserves exact final-hook output", async () => {
  const f = fixture({}); registerFooterPlugin(f.api);
  assert.equal(f.hooks.length, 1); assert.equal(f.hooks[0][0], "reply_payload_sending");
  const result = await f.hooks[0][1]({ kind: "final", channel: "telegram", payload: { text: "answer" },
    usageState: { usage: { output: 20 }, durationMs: 2000 } }, {});
  assert.equal(result.payload.text, "answer\n\n🧮 用量：输出 20 · 输出速度 10.0 token/秒（回合耗时） · 回合耗时 2.00秒");
});

test("enabled=false registers no preview-suppressing hook in either mode", () => {
  for (const deliveryMode of [undefined, "preview-safe", "legacy-final"]) {
    const f = fixture({ enabled: false, deliveryMode }); registerFooterPlugin(f.api);
    assert.equal(f.hooks.length, 0); assert.equal(f.queries.length, 0);
  }
});

test("current host absence or wrong contract fails closed without takeover/modifying hooks", () => {
  for (const capability of [undefined, {}, { version: 2, register() {} }, { version: 1 }]) {
    const f = fixture({ deliveryMode: "preview-safe" }, capability); registerFooterPlugin(f.api);
    assert.equal(f.hooks.length, 0); assert.equal(f.warnings.length, 1);
    assert.deepEqual(f.queries, [{ channelId: "telegram", capability: PREVIEW_FOOTER_CAPABILITY }]);
  }
  const f = fixture({ deliveryMode: "preview-safe" }); delete f.api.runtime;
  assert.doesNotThrow(() => registerFooterPlugin(f.api)); assert.equal(f.hooks.length, 0);
});

test("proposed host capability receives only a lifecycle formatter, no send/edit authority", () => {
  const calls = [];
  let disposed = false;
  const f = fixture({ deliveryMode: "preview-safe" }, { version: 1, register: (params) => {
    calls.push(params); return { dispose: () => { disposed = true; } };
  } });
  registerFooterPlugin(f.api);
  assert.equal(f.hooks.length, 0); assert.equal(calls.length, 1);
  assert.equal(calls[0].pluginId, "token-speed-footer");
  assert.equal(typeof calls[0].onLifecycle, "function");
  assert.deepEqual(Object.keys(calls[0]).sort(), ["onLifecycle", "pluginId", "signal"]);
  assert.equal(f.disposers.length, 1); f.disposers[0]();
  assert.equal(disposed, true); assert.equal(calls[0].signal.aborted, true);
});

test("invalid mode never silently falls back to preview-suppressing legacy hook", () => {
  const f = fixture({ deliveryMode: "typo" }); registerFooterPlugin(f.api);
  assert.equal(f.hooks.length, 0); assert.equal(f.warnings.length, 1);
});

test("malformed registration handle or thrown host callback is fenced without fallback", () => {
  for (const throws of [true, false]) {
    let captured;
    const f = fixture({ deliveryMode: "preview-safe" }, { version: 1, register: (params) => {
      captured = params;
      if (throws) throw new Error("simulated host failure");
      return {};
    } });
    assert.doesNotThrow(() => registerFooterPlugin(f.api));
    assert.equal(f.hooks.length, 0); assert.equal(f.warnings.length, 1);
    assert.equal(captured.signal.aborted, true);
  }
});

test("missing instance disposal authority never registers even a valid future capability", () => {
  let registered = false;
  const f = fixture({ deliveryMode: "preview-safe" }, { version: 1, register: () => { registered = true; } });
  delete f.api.lifecycle;
  registerFooterPlugin(f.api);
  assert.equal(registered, false); assert.equal(f.hooks.length, 0);
});
