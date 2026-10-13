/** Proposed host contract. This is NOT part of OpenClaw 2026.10.1. */
export interface TurnScope {
  readonly channel: "telegram";
  readonly accountId: string;
  readonly sessionKey: string;
  /** Host-pinned session incarnation, distinct from a reusable session key. */
  readonly sessionId: string;
  readonly runId: string;
  readonly conversationId: string;
  /** Host-normalized topic/thread ID, explicitly null for no thread. */
  readonly threadId: string | null;
}
export interface ExactUsageState {
  usage?: {
    input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number;
  };
  durationMs?: number;
  resolvedRef?: string;
}
interface LifecycleBase {
  /** Host-minted opaque object, stable for one exact live turn, never serialized. */
  readonly lease: object;
  readonly scope: TurnScope;
  readonly signal?: AbortSignal;
  readonly replay: boolean;
}
export type FooterLifecycleEvent = LifecycleBase & (
  | { readonly phase: "begin" }
  | { readonly phase: "cancel" | "failed" | "settled" }
  | {
    readonly phase: "finalize";
    readonly status: "completed" | "cancelled" | "error";
    readonly usageScope: "turn-aggregate";
    readonly usageState?: ExactUsageState;
    readonly target: "final-text";
    readonly pagination: "before-chunking";
  }
);
/** Synchronous display-only callback; undefined means retain native footer. */
export type FooterLifecycleFormatter = (event: FooterLifecycleEvent) => string | undefined;
export interface ProposedFinalUsageFooterCapabilityV1 {
  readonly version: 1;
  register(params: {
    readonly pluginId: string;
    /** Instance-owned abort signal; host must revoke registration on abort. */
    readonly signal: AbortSignal;
    readonly onLifecycle: FooterLifecycleFormatter;
  }): { dispose(): void };
}
export interface FooterOptions {
  enabled?: boolean; showInput?: boolean; showOutput?: boolean; showCache?: boolean;
  showTotal?: boolean; showSpeed?: boolean; showDuration?: boolean; showModel?: boolean;
  footerPrefix?: string;
}
export const PREVIEW_FOOTER_CAPABILITY: "finalUsageFooter.v1";
export function createPreviewFooterFormatter(options?: FooterOptions, context?: { signal?: AbortSignal }): FooterLifecycleFormatter;
