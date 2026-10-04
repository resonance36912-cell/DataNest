// Client mirror of supabase/functions/_shared/scrapeResponse.ts.
// Keep both files in lockstep — `controlledExitReason` is REQUIRED on every
// scrape response branch end-to-end so missing it is a compile-time error.

import type { SourceBrief } from "./sourceBrief";

export type ScrapeStatus =
  | "success"
  | "partial"
  | "needs_image_upload"
  | "failed_fast";

export type ControlledExitReason =
  | "server_status_success"
  | "server_status_partial"
  | "server_status_needs_image_upload"
  | "server_status_failed_fast"
  | "legacy_scrape_error"
  | "client_abort"
  | "client_watchdog"
  | "direct_image_url"
  | "user_upload";

export interface ScrapeResponsePayload {
  success: true;
  cached: boolean;
  status: ScrapeStatus;
  /** REQUIRED on every scrape response. */
  controlledExitReason: ControlledExitReason;
  partial: boolean;
  userMessage?: string;
  brief: SourceBrief;
  stale?: boolean;
  reason?: string;
  timings?: Record<string, unknown>;
  diagnostics?: Record<string, unknown> & {
    controlledExitReason: ControlledExitReason;
  };
}

export function reasonFromStatus(status: ScrapeStatus): ControlledExitReason {
  switch (status) {
    case "success": return "server_status_success";
    case "partial": return "server_status_partial";
    case "needs_image_upload": return "server_status_needs_image_upload";
    case "failed_fast": return "server_status_failed_fast";
  }
}
