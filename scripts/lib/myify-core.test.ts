import { expect, test } from "bun:test";
import {
  availableMb,
  expiryBand,
  participationUnitsForMb,
  recommendReserveMb,
} from "../../src/lib/myify/core";

test("DataNest units settle at one unit per GiB", () => {
  expect(participationUnitsForMb(1024)).toBe(1);
  expect(participationUnitsForMb(512)).toBe(0.5);
});

test("reserved balance is excluded from allocatable data", () => {
  expect(availableMb(1500, 400)).toBe(1100);
});

test("urgent transferable data reserves all available balance", () => {
  const now = new Date("2026-09-18T10:00:00+02:00");
  expect(
    recommendReserveMb({
      remainingMb: 2048,
      reservedMb: 512,
      expiresAt: "2026-09-19T08:00:00+02:00",
      transferable: true,
      rolloverEligible: false,
      now,
    }),
  ).toBe(1536);
});

test("non-transferable packages are never auto-reserved", () => {
  expect(
    recommendReserveMb({
      remainingMb: 1024,
      reservedMb: 0,
      expiresAt: "2026-09-18T20:00:00+02:00",
      transferable: false,
      rolloverEligible: false,
      now: new Date("2026-09-18T10:00:00+02:00"),
    }),
  ).toBe(0);
});

test("expiry band distinguishes urgent and expired data", () => {
  const now = new Date("2026-09-18T10:00:00+02:00");
  expect(expiryBand("2026-09-18T09:00:00+02:00", now)).toBe("expired");
  expect(expiryBand("2026-09-18T20:00:00+02:00", now)).toBe("urgent");
});
