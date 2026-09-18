import { useCallback, useEffect, useRef, useState } from "react";
import { recordSecurityEvent } from "@/lib/security-audit-log";

/** How long an emailed code is expected to stay valid. */
const CODE_TTL_MS = 10 * 60 * 1000;

/** Number of digits in the emailed one-time code. */
const CODE_LENGTH = 6;

/** Lock out verification attempts after this many consecutive failures. */
const VERIFY_FAILURES_BEFORE_LOCKOUT = 3;
/** Base verification lockout duration; doubles with each further failure up to the cap. */
const VERIFY_LOCKOUT_BASE_MS = 30 * 1000;
const VERIFY_LOCKOUT_CAP_MS = 5 * 60 * 1000;

import { Mail, KeyRound, Loader2, ArrowLeft, RefreshCw, ShieldAlert, HelpCircle, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  MAX_SENDS_PER_WINDOW,
  clearOtpSends,
  clearOtpVerifyLockout,
  formatCooldown,
  getOtpLimitState,
  getOtpVerifyLockout,
  recordOtpSend,
  saveOtpVerifyLockout,
  type OtpLimitState,
} from "@/lib/otp-rate-limit";
import { getLocalFallbackEmail, saveVerifiedFallbackEmail } from "@/lib/fallback-email";


type Props = {
  /** Pre-filled address (e.g. the signed-in account on /account). */
  defaultEmail?: string;
  /** Lock the address when it belongs to the current account. */
  lockEmail?: boolean;
  /** Persist the address as the verified fallback email (default: true). */
  rememberFallback?: boolean;
  /** Called after a code is verified and a session exists. */
  onVerified?: () => void;
  className?: string;
};

const EMPTY: OtpLimitState = {
  cooldownSeconds: 0,
  used: 0,
  remaining: MAX_SENDS_PER_WINDOW,
  blocked: false,
};

/**
 * Passwordless email sign-in fallback. Used when Google re-authentication
 * fails, or when an account has no Google identity at all.
 */
export default function EmailOtpFallback({
  defaultEmail = "",
  lockEmail = false,
  rememberFallback = true,
  onVerified,
  className,
}: Props) {
  const { sendEmailOtp, verifyEmailOtp } = useAuth();
  const [email, setEmail] = useState(
    () => defaultEmail || getLocalFallbackEmail()?.email || "",
  );
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const code = digits.join("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [limit, setLimit] = useState<OtpLimitState>(EMPTY);
  const [expired, setExpired] = useState(false);
  // Failure count and lockout window are restored from storage so a refresh
  // can't shortcut an active wait — the exact remaining time is preserved.
  const [failures, setFailures] = useState(
    () => getOtpVerifyLockout(defaultEmail || getLocalFallbackEmail()?.email || "")?.failures ?? 0,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [verifyLockoutUntil, setVerifyLockoutUntil] = useState<number | null>(() => {
    const stored = getOtpVerifyLockout(defaultEmail || getLocalFallbackEmail()?.email || "");
    return stored && stored.until > Date.now() ? stored.until : null;
  });
  // Throttled screen-reader announcement for the lockout countdown so it
  // doesn't chatter every second.
  const [lockoutAnnouncement, setLockoutAnnouncement] = useState("");
  // Status announcements for verification success and redirect changes.
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  /** Only meaningful resend-cooldown transitions (start / ready), not per-second ticks. */
  const [resendAnnouncement, setResendAnnouncement] = useState("");
  /** Announces resend request failures to screen readers while the inline error stays visible. */
  const [sendErrorAnnouncement, setSendErrorAnnouncement] = useState("");
  const prevCooldownRef = useRef(0);

  const sentAtRef = useRef<number | null>(null);
  const timeoutLoggedRef = useRef(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(CODE_LENGTH).fill(null));

  const focusDigit = useCallback((index: number) => {
    // Defer so React finishes re-rendering / enabling the field.
    setTimeout(() => {
      const input = inputRefs.current[index];
      if (!input) return;
      input.focus();
      // Place the caret at the end of the current value.
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }, 0);
  }, []);

  const focusFirstEmptyDigit = useCallback(() => {
    const index = digits.findIndex((d) => !d);
    focusDigit(index === -1 ? CODE_LENGTH - 1 : index);
  }, [digits, focusDigit]);

  const resetDigits = useCallback(() => {
    setDigits(Array(CODE_LENGTH).fill(""));
  }, []);


  // Re-sync the persisted lockout whenever the target address changes.
  useEffect(() => {
    const stored = getOtpVerifyLockout(email);
    setFailures(stored?.failures ?? 0);
    setVerifyLockoutUntil(stored && stored.until > Date.now() ? stored.until : null);
  }, [email]);



  const refreshLimit = useCallback(() => {
    const trimmed = email.trim();
    setLimit(trimmed ? getOtpLimitState(trimmed) : EMPTY);
  }, [email]);

  // Recompute every second so the cooldown ticks down and survives reloads.
  useEffect(() => {
    refreshLimit();
    const id = setInterval(refreshLimit, 1000);
    return () => clearInterval(id);
  }, [refreshLimit]);

  // Track code validity: show a live countdown, then flip into an expired state
  // (and log the expiry once) when the code outlives its validity window.
  useEffect(() => {
    if (stage !== "code") {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      if (!sentAtRef.current) return;
      const remaining = Math.max(0, CODE_TTL_MS - (Date.now() - sentAtRef.current));
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining === 0 && !timeoutLoggedRef.current) {
        timeoutLoggedRef.current = true;
        setExpired(true);
        setProblem("This code has expired. Request a new one to continue.");
        void recordSecurityEvent({
          type: "otp_timeout",
          email: email.trim().toLowerCase(),
          provider: "email_otp",
          detail: "Code expired before it was used",
        });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stage, email]);

  // Tick down the verification lockout and clear it once the wait time elapses.
  useEffect(() => {
    if (!verifyLockoutUntil) return;
    const tick = () => {
      if (Date.now() >= verifyLockoutUntil) {
        setVerifyLockoutUntil(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [verifyLockoutUntil]);

  // Announce lockout status to screen readers at a throttled rate.
  useEffect(() => {
    if (!verifyLockoutUntil) {
      setLockoutAnnouncement("");
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((verifyLockoutUntil - Date.now()) / 1000));
      if (remaining === 0) {
        setLockoutAnnouncement("Verification lockout ended. You can try again.");
      } else {
        setLockoutAnnouncement(
          `Too many failed attempts. Try again in ${formatCooldown(remaining)}.`,
        );
      }
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [verifyLockoutUntil, formatCooldown]);


  const cooldown = limit.cooldownSeconds;
  const sendDisabled = busy || !email.trim() || cooldown > 0 || limit.blocked;
  // Resend buttons stay disabled while a resend request is in flight and only
  // re-enable once the cooldown state has updated after the request finishes.
  const resendActionDisabled = resending || busy || cooldown > 0 || limit.blocked;

  // Announce only meaningful resend-cooldown transitions: when a cooldown
  // begins, and when resending becomes available again. The per-second ticks
  // stay silent so screen readers aren't spammed.
  useEffect(() => {
    const prev = prevCooldownRef.current;
    prevCooldownRef.current = cooldown;
    if (stage !== "code") return;
    if (prev === 0 && cooldown > 0) {
      setResendAnnouncement(
        limit.blocked
          ? `Hourly code limit reached. You can request another code in ${formatCooldown(cooldown)}.`
          : `Resend unavailable for ${formatCooldown(cooldown)}.`,
      );
    } else if (prev > 0 && cooldown === 0) {
      setResendAnnouncement("You can request a new code now.");
    }
  }, [cooldown, limit.blocked, stage]);

  const verifyLockoutRemainingSeconds = verifyLockoutUntil
    ? Math.max(0, Math.ceil((verifyLockoutUntil - Date.now()) / 1000))
    : 0;
  const isVerifyLockedOut = verifyLockoutRemainingSeconds > 0;
  /** Attempts remaining before the next lockout kicks in. */
  const attemptsLeft = Math.max(0, VERIFY_FAILURES_BEFORE_LOCKOUT - failures);
  const unlockAtLabel = verifyLockoutUntil
    ? new Date(verifyLockoutUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;


  const handleSend = async (isResend = false) => {
    if (limit.blocked) {
      toast.error(`Too many codes requested. Try again in ${formatCooldown(cooldown)}.`);
      return;
    }
    if (cooldown > 0) {
      toast.error(`Please wait ${formatCooldown(cooldown)} before requesting another code.`);
      return;
    }
    setProblem(null);
    setBusy(true);
    if (isResend) setResending(true);
    const address = email.trim().toLowerCase();
    try {
      const { error } = await sendEmailOtp(email);
      if (error) {
        const msg = error.message || "Could not send the sign-in code.";
        const isRateLimited = /rate|too many/i.test(msg);
        const friendly = isRateLimited
          ? "The server is rate-limiting codes. Try again shortly."
          : "Could not resend the code. Please wait a moment and try again.";
        toast.error(friendly);
        // Surface the failure inline in the code stage without disabling the inputs.
        if (stage === "code") {
          setProblem(friendly);
        }
        // Announce the failure to screen readers even though the inline error is visible.
        setSendErrorAnnouncement(friendly);
        // Still count server-rejected attempts to slow down retry storms.
        setLimit(recordOtpSend(email));
        void recordSecurityEvent({
          type: "otp_send",
          email: address,
          provider: "email_otp",
          detail: `Code request failed: ${msg}`,
        });
        return;
      }
      const next = recordOtpSend(email);
      setLimit(next);
      sentAtRef.current = Date.now();
      setSecondsLeft(Math.ceil(CODE_TTL_MS / 1000));
      timeoutLoggedRef.current = false;
      setExpired(false);
      setFailures(0);
      setVerifyLockoutUntil(null);
      clearOtpVerifyLockout(address);
      setProblem(null);
      setSendErrorAnnouncement("");
      void recordSecurityEvent({
        type: "otp_send",
        email: address,
        provider: "email_otp",
        detail: `${isResend ? "Code resent" : "Code sent"} · ${next.used} of ${MAX_SENDS_PER_WINDOW} this hour`,
      });
      toast.success(
        `${isResend ? "New code sent" : "Sign-in code sent"} to ${address}` +
          (next.remaining > 0 ? ` · ${next.remaining} left this hour` : ""),
      );
      setStage("code");
      // Reset the code inputs and place focus on the first digit box as soon
      // as a new code is sent, clearing any leftover verification state.
      resetDigits();
      focusDigit(0);

    } finally {
      setBusy(false);
      setResending(false);
    }
  };

  const handleResendKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (resendActionDisabled) return;
      e.preventDefault();
      void handleSend(true);
    },
    [resendActionDisabled, handleSend],
  );

  const handleVerify = async (explicitCode?: string) => {
    const digits = explicitCode ?? code;
    if (digits.length < 6) {
      setProblem("Please enter the full 6-digit code.");
      return;
    }
    if (verifyLockoutUntil && Date.now() < verifyLockoutUntil) {
      const waitSeconds = Math.ceil((verifyLockoutUntil - Date.now()) / 1000);
      setProblem(`Too many failed attempts. Please wait ${formatCooldown(waitSeconds)} before trying again.`);
      return;
    }
    setBusy(true);
    const address = email.trim().toLowerCase();
    try {
      const { error } = await verifyEmailOtp(email, digits);
      if (error) {
        const raw = error.message || "";
        const isExpired =
          /expire|timed? ?out/i.test(raw) ||
          (sentAtRef.current !== null && Date.now() - sentAtRef.current >= CODE_TTL_MS);
        const isWrong = /invalid|incorrect|not ?found|token/i.test(raw) && !isExpired;
        const isRateLimited = /rate|too many/i.test(raw);

        const friendly = isExpired
          ? "This code has expired. Request a new one to continue."
          : isRateLimited
            ? "Too many attempts right now. Wait a moment, then request a new code."
            : isWrong
              ? "That code is incorrect. Check the latest email — codes are single-use."
              : raw || "That code didn't work. Request a new one.";

        setProblem(friendly);
        setExpired(isExpired);
        const nextFailures = failures + 1;
        setFailures(nextFailures);
        if (!isExpired && nextFailures >= VERIFY_FAILURES_BEFORE_LOCKOUT) {
          const duration = Math.min(
            VERIFY_LOCKOUT_CAP_MS,
            VERIFY_LOCKOUT_BASE_MS * Math.pow(2, nextFailures - VERIFY_FAILURES_BEFORE_LOCKOUT),
          );
          const until = Date.now() + duration;
          setVerifyLockoutUntil(until);
          saveOtpVerifyLockout(address, { until, failures: nextFailures });
        } else {
          saveOtpVerifyLockout(address, { until: 0, failures: nextFailures });
        }

        if (isExpired) {
          setSecondsLeft(0);
          resetDigits();
        }
        void recordSecurityEvent({
          type: isExpired ? "otp_timeout" : "otp_verify_failure",
          email: address,
          provider: "email_otp",
          detail: isExpired ? `Code expired: ${raw}` : `Verification failed: ${raw}`,
        });
        if (isExpired) timeoutLoggedRef.current = true;
        toast.error(friendly);
        return;
      }
      setProblem(null);
      setSendErrorAnnouncement("");
      setExpired(false);
      setFailures(0);
      setVerifyLockoutUntil(null);
      clearOtpVerifyLockout(address);

      clearOtpSends(email);
      setLimit(EMPTY);
      sentAtRef.current = null;
      timeoutLoggedRef.current = true;
      void recordSecurityEvent({
        type: "otp_verify_success",
        email: address,
        provider: "email_otp",
        detail: "Signed in with an emailed code",
      });
      if (rememberFallback) {
        void saveVerifiedFallbackEmail(address);
      }
      const successMessage = rememberFallback
        ? `Verified. ${address} saved as your fallback address.`
        : "Signed in with your email code.";
      toast.success(successMessage);
      setStatusAnnouncement(successMessage);

      resetDigits();
      if (onVerified) {
        setStatusAnnouncement((prev) =>
          `${prev} Redirecting you now.`,
        );
        onVerified();
      }

    } finally {

      setBusy(false);
      focusFirstEmptyDigit();
    }
  };

  const applyPastedCode = useCallback((text: string) => {
    const sanitized = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!sanitized) {
      toast.error("Clipboard is empty or doesn't contain a code.");
      return;
    }
    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < sanitized.length; i++) {
      next[i] = sanitized[i];
    }
    setDigits(next);
    if (problem && !expired) {
      setProblem(null);
      setSendErrorAnnouncement("");
    }

    const focusIndex = Math.min(sanitized.length, CODE_LENGTH - 1);
    focusDigit(focusIndex);

    const canAutoVerify = sanitized.length >= CODE_LENGTH && !expired && !busy && !isVerifyLockedOut;
    if (canAutoVerify) {
      void handleVerify(sanitized);
    } else {
      toast.success("Code pasted from clipboard");
    }
  }, [problem, expired, busy, isVerifyLockedOut, focusDigit]);

  const handlePasteCode = async (pastedText?: string) => {
    try {
      const text = pastedText ?? (await navigator.clipboard.readText());
      applyPastedCode(text);
    } catch {
      toast.error("Could not read clipboard. Please paste manually or allow clipboard access.");
    }
  };

  const updateDigit = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < CODE_LENGTH - 1) {
      focusDigit(index + 1);
    }
  }, [focusDigit]);

  const handleDigitKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusDigit(index - 1);
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      e.preventDefault();
      focusDigit(index + 1);
    } else if (e.key === "Backspace") {
      if (digits[index]) {
        // Clear the current digit and stay in the same box.
        setDigits((prev) => {
          const next = [...prev];
          next[index] = "";
          return next;
        });
      } else if (index > 0) {
        // Move back and clear the previous digit.
        e.preventDefault();
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
        focusDigit(index - 1);
      }
    } else if (e.key === "Enter" && code.length === CODE_LENGTH) {
      e.preventDefault();
      void handleVerify();
    }
  }, [digits, code, focusDigit]);

  const handleDigitsPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    applyPastedCode(text);
  }, [applyPastedCode]);

  return (
    <div className={className}>
      {stage === "email" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Email a sign-in code</Label>
            <Input
              type="email"
              value={email}
              readOnly={lockEmail}
              onChange={(e) => {
                setEmail(e.target.value);
                if (problem) {
                  setProblem(null);
                  setSendErrorAnnouncement("");
                }
              }}
              placeholder="you@example.com"
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void handleSend()}
            disabled={sendDisabled}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {cooldown > 0 && !limit.blocked ? `Send again in ${formatCooldown(cooldown)}` : "Send me a code"}
          </Button>
          {limit.blocked ? (
            <p className="flex items-start gap-1.5 text-[11px] text-destructive">
              <ShieldAlert className="mt-[1px] h-3 w-3 shrink-0" />
              Hourly limit reached ({MAX_SENDS_PER_WINDOW} codes). Try again in {formatCooldown(cooldown)}.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No password needed — we email a 6-digit code that signs you in on this device.
              {limit.used > 0 && ` ${limit.remaining} of ${MAX_SENDS_PER_WINDOW} codes left this hour.`}
            </p>
          )}
        </div>

      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-foreground">Enter the 6-digit code</Label>
              {secondsLeft !== null && (
                <span
                  className={`text-[10px] ${expired || secondsLeft === 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {expired || secondsLeft === 0
                    ? "Code expired"
                    : `Expires in ${formatCooldown(secondsLeft)}`}
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <div className="flex justify-center gap-1.5 sm:gap-2">
                {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                  <Input
                    key={i}
                    ref={(el) => (inputRefs.current[i] = el)}
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={digits[i]}
                    disabled={expired || busy}
                    onChange={(e) => {
                      updateDigit(i, e.target.value);
                      if (problem && !expired) {
                        setProblem(null);
                        setSendErrorAnnouncement("");
                      }
                    }}
                    onPaste={handleDigitsPaste}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                    placeholder={expired ? "—" : "0"}
                    className="h-11 w-11 bg-secondary border-border text-center text-lg text-foreground placeholder:text-muted-foreground sm:h-12 sm:w-12 sm:text-xl"
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handlePasteCode()}
                disabled={expired || busy || code.length >= 6}
                title="Paste code from clipboard"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ClipboardPaste className="h-4 w-4" />
              </button>
            </div>
          </div>

          {problem && (
            <p
              data-testid="otp-send-error"
              className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive"
            >
              <ShieldAlert className="mt-[1px] h-3 w-3 shrink-0" />
              <span>
                {problem}
                {failures >= 2 && !expired
                  ? " Make sure you're using the most recent email — older codes stop working."
                  : ""}
              </span>
            </p>
          )}

          {/* Screen-reader-only status for the lockout countdown. */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {lockoutAnnouncement}
          </div>

          {/* Screen-reader-only status for verification success and redirects. */}
          <div aria-live="assertive" aria-atomic="true" className="sr-only">
            {statusAnnouncement}
          </div>

          {/* Screen-reader-only status for resend request failures. */}
          <div aria-live="assertive" aria-atomic="true" className="sr-only" data-testid="otp-send-error-live">
            {sendErrorAnnouncement}
          </div>


          {isVerifyLockedOut ? (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-500">
              <ShieldAlert className="mt-[1px] h-3 w-3 shrink-0" />
              <span>
                Too many failed attempts. Try again in {formatCooldown(verifyLockoutRemainingSeconds)}
                {unlockAtLabel ? ` — unlocks at ${unlockAtLabel}` : ""}.
                {!lockEmail && (
                  <>
                    {" "}Wrong address?{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:no-underline"
                      onClick={() => {
                        resetDigits();
                        setProblem(null);
                        setSendErrorAnnouncement("");
                        setStage("email");
                      }}
                    >
                      Change email and send a new code
                    </button>
                    .
                  </>
                )}
              </span>
            </div>

          ) : (
            !expired && (
              <p
                className="text-[11px] text-muted-foreground"
                aria-live="polite"
                aria-atomic="true"
              >
                {attemptsLeft === 1
                  ? "1 attempt left before a temporary lockout."
                  : `${attemptsLeft} attempts left before a temporary lockout.`}
              </p>
            )
          )}


          {expired ? (
            <Button
              type="button"
              className="w-full"
              onClick={() => void handleSend(true)}
              onKeyDown={handleResendKeyDown}
              disabled={resendActionDisabled}
              aria-keyshortcuts="r"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {limit.blocked
                ? `Limit reached · try in ${formatCooldown(cooldown)}`
                : cooldown > 0
                  ? `New code in ${formatCooldown(cooldown)}`
                  : "Send me a new code"}
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full"
              onClick={() => void handleVerify()}
              disabled={busy || code.length < 6 || isVerifyLockedOut}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isVerifyLockedOut ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {isVerifyLockedOut
                ? `Locked · ${formatCooldown(verifyLockoutRemainingSeconds)}`
                : "Verify and sign in"}
            </Button>
          )}

          {/* Screen-reader status: only fires on meaningful cooldown transitions. */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            data-testid="resend-announcement"
          >
            {resendAnnouncement}
          </div>

          {/* Visible resend cooldown timer (silent for assistive tech — see above). */}
          {cooldown > 0 && (
            <div
              className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-500"
              aria-hidden="true"
            >
              <span className="font-medium">
                {limit.blocked ? "Hourly limit reached" : "Resend cooldown"}
              </span>
              <span className="font-mono tabular-nums">
                {formatCooldown(cooldown)} remaining
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setProblem(null);
                setSendErrorAnnouncement("");
                resetDigits();
                setStage("email");
              }}
              disabled={busy}
            >
              <ArrowLeft className="h-3 w-3" /> Use another email
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => void handleSend(true)}
              onKeyDown={handleResendKeyDown}
              disabled={resendActionDisabled}
              aria-keyshortcuts="r"
              title={
                limit.blocked
                  ? `Hourly limit reached — try again in ${formatCooldown(cooldown)}`
                  : cooldown > 0
                    ? `Available in ${formatCooldown(cooldown)}`
                    : "Email me a new code (press R)"
              }
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {limit.blocked
                ? `Limit reached · ${formatCooldown(cooldown)}`
                : cooldown > 0
                  ? `Resend in ${formatCooldown(cooldown)}`
                  : "Resend code"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {limit.blocked
              ? `You've used all ${MAX_SENDS_PER_WINDOW} codes for this hour.`
              : `${limit.remaining} of ${MAX_SENDS_PER_WINDOW} codes left this hour. Codes expire after a few minutes.`}
          </p>

          <button
            type="button"
            onClick={() => setShowHelp((s) => !s)}
            className="flex w-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <HelpCircle className="h-3 w-3" />
            {showHelp ? "Hide help" : "Need help with your code?"}
          </button>

          {showHelp && (
            <div className="space-y-2.5 rounded-lg border border-border bg-secondary/50 p-3 text-[11px] text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Code expired?</p>
                <p>Codes are valid for 10 minutes. Click “Send me a new code” to get a fresh one.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Email taking too long?</p>
                <p>Check your spam or promotions folder. Delivery can take 1–2 minutes.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Code not working?</p>
                <p>Use the most recent email — older codes stop working once a new one is sent. Double-check the address you entered.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
