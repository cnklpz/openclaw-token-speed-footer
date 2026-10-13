import { appendUsageFooter, formatUsageFooter, isTelegramFinalEvent } from "./footer.js";
import { createPreviewFooterFormatter, PREVIEW_FOOTER_CAPABILITY } from "./preview-footer.js";

/** Exported separately so registration can be tested without loading a Gateway. */
export function registerFooterPlugin(api) {
  const options = api.pluginConfig ?? {};
  // A registered modifier suppresses native previews even if it returns nothing.
  if (options.enabled === false) return;
  if (options.deliveryMode === "preview-safe") {
    const registry = api.runtime?.channel?.runtimeContexts;
    const capability = registry?.get({ channelId: "telegram", capability: PREVIEW_FOOTER_CAPABILITY });
    if (capability?.version !== 1 || typeof capability.register !== "function"
      || typeof api.lifecycle?.onDispose !== "function" || !api.lifecycle.signal) {
      api.logger.warn("preview-safe footer inactive: host finalUsageFooter.v1 capability unavailable; native preview/footer unchanged (no modifying hooks registered)");
      return;
    }
    // No run takeover, arbitrary send/edit access, or Telegram credentials.
    const controller = new AbortController();
    const signal = AbortSignal.any([api.lifecycle.signal, controller.signal]);
    let handle;
    try {
      handle = capability.register({
        pluginId: "token-speed-footer", signal,
        onLifecycle: createPreviewFooterFormatter(options, { signal }),
      });
      if (typeof handle?.dispose !== "function") throw new Error("missing disposal handle");
      api.lifecycle.onDispose(() => { controller.abort(); return handle.dispose(); });
    } catch {
      controller.abort(); // fence even a partially registered malformed host
      api.logger.warn("host finalUsageFooter.v1 registration failed; preview-safe formatter fenced, no legacy fallback");
      return;
    }
    api.logger.info("registered preview-safe usage formatter through host finalUsageFooter.v1 capability");
    return;
  }
  // Preserve the old plugin mode; unknown mode is fail-closed, not legacy.
  if (options.deliveryMode !== undefined && options.deliveryMode !== "legacy-final") {
    api.logger.warn("unknown footer deliveryMode; no hooks registered");
    return;
  }
  api.on("reply_payload_sending", async (event, context) => {
    if (!isTelegramFinalEvent(event, context)) return;
    const footer = formatUsageFooter(event.usageState, options);
    if (!footer) return;
    const payload = appendUsageFooter(event.payload, footer);
    if (payload === event.payload) return;
    return { payload };
  }, { priority: 100 });
  api.logger.info("registered legacy Telegram final-reply usage hook (disables native preview on 2026.10.1)");
}
