export const OWNER_BETA_ACCESS = { code: "SOVEREIGNLOCAL", email: "local@resonance.invalid", enrollmentEndsAt: "2099-12-31T23:59:59.000Z", durationDays: 36500 } as const;
export function isOwnerBetaEligible(email: string | null | undefined): boolean { return email?.trim().toLowerCase() === OWNER_BETA_ACCESS.email; }
export function isOwnerBetaCode(code: string | null | undefined): boolean { return code?.trim().toUpperCase() === OWNER_BETA_ACCESS.code; }
