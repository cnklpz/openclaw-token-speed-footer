/**
 * Pure formatting logic for the OpenClaw reply_payload_sending hook.
 *
 * The usage object is deliberately treated as opaque normalized host data:
 * this module never estimates tokens from text and never calls a provider.
 */

const DEFAULTS = Object.freeze({
  enabled: true,
  showInput: true,
  showOutput: true,
  showCache: true,
  showTotal: true,
  showSpeed: true,
  showDuration: true,
  showModel: false,
  footerPrefix: "🧮",
});

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function integer(value) {
  const n = finiteNonNegative(value);
  return n === undefined ? undefined : Math.round(n);
}

function numberWithThousands(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function seconds(valueMs) {
  return (valueMs / 1000).toFixed(valueMs >= 10_000 ? 1 : 2);
}

function normalizeOptions(options = {}) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof options[key] === typeof DEFAULTS[key]) out[key] = options[key];
  }
  if (out.footerPrefix.trim() === "") out.footerPrefix = DEFAULTS.footerPrefix;
  return out;
}

/**
 * Format only values supplied by OpenClaw's official usageState.
 * Returns undefined when no trustworthy usage value is available.
 */
export function formatUsageFooter(usageState, options = {}) {
  const opts = normalizeOptions(options);
  if (!opts.enabled || !usageState || typeof usageState !== "object") return undefined;

  const usage = usageState.usage && typeof usageState.usage === "object" ? usageState.usage : undefined;
  if (!usage) return undefined;

  const input = integer(usage.input);
  const output = integer(usage.output);
  const cacheRead = integer(usage.cacheRead);
  const cacheWrite = integer(usage.cacheWrite);
  const total = integer(usage.total);
  const durationMs = finiteNonNegative(usageState.durationMs);

  // Do not emit a decorative footer for a delivery that has no exact host usage.
  if ([input, output, cacheRead, cacheWrite, total].every((v) => v === undefined)) return undefined;

  const parts = [];
  if (opts.showInput && input !== undefined) parts.push(`输入 ${numberWithThousands(input)}`);
  if (opts.showOutput && output !== undefined) parts.push(`输出 ${numberWithThousands(output)}`);
  if (opts.showCache && cacheRead !== undefined) parts.push(`缓存读取 ${numberWithThousands(cacheRead)}`);
  if (opts.showCache && cacheWrite !== undefined) parts.push(`缓存写入 ${numberWithThousands(cacheWrite)}`);
  if (opts.showTotal && total !== undefined) parts.push(`总计 ${numberWithThousands(total)}`);

  // This is provably output tokens divided by OpenClaw's turn wall duration.
  // It is intentionally labelled "turn wall" rather than provider generation speed.
  if (opts.showSpeed && output !== undefined && durationMs !== undefined && durationMs > 0) {
    const rate = output / (durationMs / 1000);
    parts.push(`输出速度 ${rate.toFixed(rate >= 100 ? 0 : 1)} token/秒（回合耗时）`);
  }
  if (opts.showDuration && durationMs !== undefined) parts.push(`回合耗时 ${seconds(durationMs)}秒`);
  if (opts.showModel && typeof usageState.resolvedRef === "string" && usageState.resolvedRef.length > 0) {
    parts.push(usageState.resolvedRef);
  }

  if (parts.length === 0) return undefined;
  return `${opts.footerPrefix} 用量：${parts.join(" · ")}`;
}

/**
 * Append once to a text-bearing payload while retaining every other field.
 */
export function appendUsageFooter(payload, footer) {
  if (!footer || !payload || typeof payload !== "object") return payload;
  const marker = footer.slice(0, Math.min(16, footer.length));
  if (typeof payload.text === "string") {
    if (payload.text.includes(marker)) return payload;
    return { ...payload, text: `${payload.text}\n\n${footer}` };
  }
  if (payload.fallbackText && typeof payload.fallbackText.text === "string") {
    if (payload.fallbackText.text.includes(marker)) return payload;
    return {
      ...payload,
      fallbackText: { ...payload.fallbackText, text: `${payload.fallbackText.text}\n\n${footer}` },
    };
  }
  return payload;
}

export function isTelegramFinalEvent(event, context) {
  if (!event || event.kind !== "final") return false;
  return event.channel === "telegram" || context?.channel === "telegram" || context?.messageProvider === "telegram";
}

export const DEFAULT_OPTIONS = DEFAULTS;
