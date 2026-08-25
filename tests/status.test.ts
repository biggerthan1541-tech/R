import { describe, expect, it } from "vitest";
import { daysUntilExpiry, deriveStatus, isOverdue, EXPIRING_WINDOW_DAYS } from "@/lib/status";
import type { StatusInput } from "@/lib/status";

const NOW = "2026-08-25";
const at = (expiryDate: string, over: Partial<StatusInput> = {}): StatusInput => ({
  expiryDate,
  closedAt: null,
  status: "open",
  ...over,
});

describe("deriveStatus", () => {
  it("is closed whenever closedAt is set, regardless of dates", () => {
    expect(deriveStatus(at("2020-01-01", { closedAt: new Date() }), NOW)).toBe("closed");
    expect(deriveStatus(at("2030-01-01", { closedAt: new Date() }), NOW)).toBe("closed");
  });

  it("is expired the day after the expiry date", () => {
    expect(deriveStatus(at("2026-08-24"), NOW)).toBe("expired");
  });

  it("is expiring, not expired, on the expiry date itself", () => {
    expect(deriveStatus(at(NOW), NOW)).toBe("expiring");
  });

  it("uses an inclusive 14-day expiring window", () => {
    expect(deriveStatus(at("2026-09-08"), NOW)).toBe("expiring"); // exactly 14 days
    expect(deriveStatus(at("2026-09-09"), NOW)).toBe("open"); // 15 days
    expect(EXPIRING_WINDOW_DAYS).toBe(14);
  });

  it("keeps the renewed badge only while otherwise open", () => {
    expect(deriveStatus(at("2026-12-01", { status: "renewed" }), NOW)).toBe("renewed");
    // Urgency wins: a renewed exception close to expiry still reads as expiring.
    expect(deriveStatus(at("2026-09-01", { status: "renewed" }), NOW)).toBe("expiring");
    expect(deriveStatus(at("2026-01-01", { status: "renewed" }), NOW)).toBe("expired");
  });

  it("ignores a stale stored status", () => {
    expect(deriveStatus(at("2026-12-01", { status: "expired" }), NOW)).toBe("open");
  });
});

describe("daysUntilExpiry / isOverdue", () => {
  it("reports the signed day count", () => {
    expect(daysUntilExpiry(at("2026-09-01"), NOW)).toBe(7);
    expect(daysUntilExpiry(at("2026-08-11"), NOW)).toBe(-14);
  });

  it("flags only exceptions past expiry that nobody closed", () => {
    expect(isOverdue(at("2026-08-24"), NOW)).toBe(true);
    expect(isOverdue(at("2026-08-24", { closedAt: new Date() }), NOW)).toBe(false);
    expect(isOverdue(at("2026-08-26"), NOW)).toBe(false);
  });
});
