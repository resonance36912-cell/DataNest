import { supabase } from "@/integrations/supabase/client";
import { loadSenderConfig, runSenderChecks, overallState } from "@/lib/email-sender-status";
import { loadRecipients, selectedRecipients } from "@/lib/report-recipients";
import {
  appendDeliveryLog,
  updateDeliveryLog,
  type DeliveryLogEntry,
} from "@/lib/report-email-log";
import { BUILD_INFO } from "@/lib/build-info";
import {
  activeBody,
  loadEmailTemplate,
  validateTemplate,
  validationMessage,
  renderBody,
  renderTemplate,
  templateValues,
  type ReportEmailTemplate,
} from "@/lib/report-email-template";

/**
 * "Email report after checks" preference + delivery for the SEO deploy report.
 *
 * Note: the email pipeline cannot attach files, so the report email carries a
 * summary of the run; the full PDF stays in the on-device deploy-notes archive.
 */

const TOGGLE_KEY = "syncvision.report.email.auto.v1";

export function loadAutoEmail(): boolean {
  try {
    return localStorage.getItem(TOGGLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAutoEmail(enabled: boolean): boolean {
  try {
    localStorage.setItem(TOGGLE_KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  return enabled;
}

export interface ReportSummary {
  ranAt: string;
  passing: number;
  total: number;
  failed: string[];
  filename: string;
  commit: string;
  branch: string;
  origin: string;
}

export interface SendOutcome {
  ok: boolean;
  sent?: number;
  reason?: string;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown delivery error";
}

/**
 * Server-side placeholder validation. The edge function is the authority for
 * which placeholders exist; returns a human-readable reason when the template
 * must not be sent, or null when it is safe.
 */
export async function templateBlockReason(
  template?: ReportEmailTemplate,
): Promise<string | null> {
  const tpl = template ?? loadEmailTemplate();
  try {
    const { data, error } = await supabase.functions.invoke(
      "validate-report-template",
      {
        body: {
          subject: tpl.subject,
          body: activeBody(tpl),
          format: tpl.format === "html" ? "html" : "text",
        },
      },
    );
    const payload = data as { valid?: boolean; error?: string } | null;
    if (payload && payload.valid === true) return null;
    if (payload?.error) return payload.error;
    if (error) {
      // Validator unreachable — fall back to the local rules so a broken
      // template still cannot go out.
      const local = validateTemplate(tpl);
      return local.ok
        ? null
        : (validationMessage(local) ?? "Template placeholders are invalid.");
    }
    return "Template placeholders could not be validated.";
  } catch {
    const local = validateTemplate(tpl);
    return local.ok
      ? null
      : (validationMessage(local) ?? "Template placeholders are invalid.");
  }
}

/** Verify the sender is ready to deliver. Returns null when ready. */
export async function senderBlockReason(): Promise<string | null> {
  const senderState = overallState(await runSenderChecks(loadSenderConfig()));
  return senderState === "ready"
    ? null
    : "Sender is not verified yet — finish email sender setup first.";
}

/** Send the report summary to a single address. Throws on failure. */
export async function sendReportTo(
  email: string,
  summary: ReportSummary,
  options?: { template?: ReportEmailTemplate; test?: boolean },
): Promise<void> {
  const tpl = options?.template ?? loadEmailTemplate();
  const values = templateValues(summary, BUILD_INFO.builtAt || "unknown");
  const rendered = renderTemplate(tpl.subject, values);
  const subject = options?.test ? `[TEST] ${rendered}` : rendered;
  const message = renderBody(tpl, values);
  const format = tpl.format === "html" ? "html" : "text";

  const { error } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "seo-deploy-report",
      recipientEmail: email,
      idempotencyKey: options?.test
        ? `seo-report-test-${Date.now()}-${email}`
        : `seo-report-${summary.ranAt}-${email}`,
      templateData: {
        subject,
        message,
        format,
        isHtml: format === "html",
        isTest: !!options?.test,
        ranAt: summary.ranAt,
        passing: summary.passing,
        total: summary.total,
        failed: summary.failed,
        filename: summary.filename,
        commit: summary.commit,
        branch: summary.branch,
        builtAt: BUILD_INFO.builtAt || "unknown",
        origin: summary.origin,
      },
    },
  });
  if (error) throw error;
}

const TEST_EMAIL_KEY = "syncvision.report.email.test-address.v1";

export function loadTestAddress(): string {
  try {
    return localStorage.getItem(TEST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveTestAddress(email: string): string {
  try {
    localStorage.setItem(TEST_EMAIL_KEY, email);
  } catch {
    /* storage unavailable */
  }
  return email;
}

/**
 * Send a one-off test of the current subject/message to a single address.
 * The PDF itself is archived locally (the pipeline cannot attach files), so the
 * test email carries the rendered subject + body and the report filename.
 */
export async function sendTestReport(
  email: string,
  summary: ReportSummary,
  template: ReportEmailTemplate,
): Promise<SendOutcome> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "Enter a valid email address." };
  }
  const invalid = await templateBlockReason(template);
  if (invalid) {
    appendDeliveryLog({ email, status: "failed", reason: invalid, summary });
    return { ok: false, reason: invalid };
  }
  const blocked = await senderBlockReason();
  if (blocked) {
    appendDeliveryLog({ email, status: "failed", reason: blocked, summary });
    return { ok: false, reason: blocked };
  }
  try {
    await sendReportTo(email, summary, { template, test: true });
    appendDeliveryLog({ email, status: "sent", summary });
    return { ok: true, sent: 1 };
  } catch (err) {
    const reason = errorText(err);
    appendDeliveryLog({ email, status: "failed", reason, summary });
    return { ok: false, reason };
  }
}



/** Retry a previously failed delivery, updating its log entry. */
export async function retryDelivery(
  entry: DeliveryLogEntry,
): Promise<SendOutcome> {
  const blocked = (await templateBlockReason()) ?? (await senderBlockReason());
  if (blocked) {
    updateDeliveryLog(entry.id, {
      status: "failed",
      reason: blocked,
      attempts: entry.attempts + 1,
      at: new Date().toISOString(),
    });
    return { ok: false, reason: blocked };
  }
  try {
    await sendReportTo(entry.email, entry.summary);
    updateDeliveryLog(entry.id, {
      status: "sent",
      reason: undefined,
      attempts: entry.attempts + 1,
      at: new Date().toISOString(),
    });
    return { ok: true, sent: 1 };
  } catch (err) {
    const reason = errorText(err);
    updateDeliveryLog(entry.id, {
      status: "failed",
      reason,
      attempts: entry.attempts + 1,
      at: new Date().toISOString(),
    });
    return { ok: false, reason };
  }
}

export async function sendChecklistReport(summary: ReportSummary): Promise<SendOutcome> {
  const recipients = selectedRecipients(loadRecipients());
  if (recipients.length === 0) {
    return { ok: false, reason: "No recipients selected." };
  }

  const blocked = (await templateBlockReason()) ?? (await senderBlockReason());
  if (blocked) {
    for (const recipient of recipients) {
      appendDeliveryLog({
        email: recipient.email,
        status: "failed",
        reason: blocked,
        summary,
      });
    }
    return { ok: false, reason: blocked };
  }

  let sent = 0;
  const failures: string[] = [];

  for (const recipient of recipients) {
    try {
      await sendReportTo(recipient.email, summary);
      sent += 1;
      appendDeliveryLog({ email: recipient.email, status: "sent", summary });
    } catch (err) {
      failures.push(recipient.email);
      console.error("Report email failed for", recipient.email, err);
      appendDeliveryLog({
        email: recipient.email,
        status: "failed",
        reason: errorText(err),
        summary,
      });
    }
  }


  if (sent === 0) {
    return { ok: false, reason: `Delivery failed for ${failures.join(", ")}.` };
  }
  return { ok: true, sent };
}
