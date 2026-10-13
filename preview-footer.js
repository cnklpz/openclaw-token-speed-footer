import { formatUsageFooter } from "./footer.js";

// PROPOSED host capability, NOT supplied by OpenClaw 2026.10.1. Transport stays
// in core: this callback returns display text and cannot send/edit any message.
export const PREVIEW_FOOTER_CAPABILITY = "finalUsageFooter.v1";

const scopeFields = ["channel", "accountId", "sessionKey", "sessionId", "runId", "conversationId", "threadId"];
function validScope(scope) {
  return scope?.channel === "telegram"
    && scopeFields.slice(1, -1).every((field) => typeof scope[field] === "string" && scope[field].length > 0)
    && (scope.threadId === null || (typeof scope.threadId === "string" && scope.threadId.length > 0));
}
function sameScope(a, b) {
  return validScope(b) && scopeFields.every((field) => a[field] === b[field]);
}
function object(value) {
  return value !== null && typeof value === "object";
}
function copyScope(scope) {
  return Object.freeze(Object.fromEntries(scopeFields.map((field) => [field, scope[field]])));
}

/**
 * A host-minted lease is the identity, not a latest-run/chat heuristic.
 * WeakMap keeps terminal tombstones for the lifetime of that lease without
 * retaining transcripts, message text, credentials, or unbounded run IDs.
 *
 * begin -> finalize (at most once), or begin -> cancel/failed/settled.
 * finalize is synchronous and pure; the HOST checks cancellation/revision again
 * and owns footer replacement, chunking, draft finalization, retry, and receipts.
 */
export function createPreviewFooterFormatter(options = {}, { signal: pluginSignal } = {}) {
  const leases = new WeakMap();
  return function onLifecycle(event) {
    if (pluginSignal?.aborted || !event || !object(event.lease)) return undefined;
    const state = leases.get(event.lease);
    if (event.phase === "begin") {
      if (state || !validScope(event.scope)) return undefined;
      leases.set(event.lease, {
        scope: copyScope(event.scope),
        signal: event.signal,
        terminal: event.replay !== false || Boolean(event.signal?.aborted),
      });
      return undefined;
    }
    if (!state && validScope(event.scope) && ["finalize", "cancel", "failed", "settled"].includes(event.phase)) {
      // Out-of-order terminal notification fences a subsequent late begin.
      leases.set(event.lease, { scope: copyScope(event.scope), terminal: true });
      return undefined;
    }
    if (!state || state.terminal || !sameScope(state.scope, event.scope)) return undefined;
    if (["cancel", "failed", "settled"].includes(event.phase)) {
      state.terminal = true;
      return undefined;
    }
    if (event.phase !== "finalize") return undefined;
    // Consume before formatting, including no-data/error finals: retries replay
    // the host's durable prepared payload, not this callback a second time.
    state.terminal = true;
    if (state.signal?.aborted || event.signal?.aborted || event.replay !== false
      || event.status !== "completed" || event.usageScope !== "turn-aggregate"
      || event.target !== "final-text" || event.pagination !== "before-chunking") return undefined;
    return formatUsageFooter(event.usageState, options);
  };
}
