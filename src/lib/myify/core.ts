export type ExpiryBand = "expired" | "urgent" | "soon" | "safe";

export function participationUnitsForMb(mb: number): number {
  if (!Number.isFinite(mb) || mb <= 0) return 0;
  return Math.round((mb / 1024) * 1_000_000) / 1_000_000;
}

export function availableMb(remainingMb: number, reservedMb: number): number {
  return Math.max(0, Math.floor(remainingMb) - Math.max(0, Math.floor(reservedMb)));
}

export function expiryBand(expiresAt: string | Date, now = new Date()): ExpiryBand {
  const expires = new Date(expiresAt).getTime();
  const hours = (expires - now.getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return "expired";
  if (hours <= 24) return "urgent";
  if (hours <= 72) return "soon";
  return "safe";
}

export function recommendReserveMb(input: {
  remainingMb: number;
  reservedMb: number;
  expiresAt: string | Date;
  transferable: boolean;
  rolloverEligible: boolean;
  now?: Date;
}): number {
  const available = availableMb(input.remainingMb, input.reservedMb);
  if (available === 0 || !input.transferable) return 0;

  const band = expiryBand(input.expiresAt, input.now);
  if (band === "expired") return 0;
  if (band === "urgent") return available;
  if (band === "soon") return Math.max(1, Math.floor(available * 0.75));
  if (!input.rolloverEligible) return Math.max(1, Math.floor(available * 0.25));
  return 0;
}
