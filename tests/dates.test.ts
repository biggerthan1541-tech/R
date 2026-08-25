import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidDate, relativeDays, toDateString, today } from "@/lib/dates";

describe("isValidDate", () => {
  it("accepts real calendar dates", () => {
    expect(isValidDate("2026-08-25")).toBe(true);
    expect(isValidDate("2024-02-29")).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    expect(isValidDate("2026-2-5")).toBe(false);
    expect(isValidDate("25/08/2026")).toBe(false);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2025-02-29")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-08-25", "2026-09-01")).toBe(7);
    expect(daysBetween("2026-08-25", "2026-08-25")).toBe(0);
    expect(daysBetween("2026-08-25", "2026-08-18")).toBe(-7);
  });

  it("is unaffected by daylight saving transitions", () => {
    // Europe/London springs forward on 2026-03-29.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("spans months and leap years", () => {
    expect(daysBetween("2026-12-25", "2027-01-05")).toBe(11);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  });
});

describe("addDays", () => {
  it("rolls over month and year boundaries", () => {
    expect(addDays("2026-08-25", 7)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("round-trips with daysBetween", () => {
    const start = "2026-05-14";
    for (const n of [-400, -30, 0, 1, 90, 366]) {
      expect(daysBetween(start, addDays(start, n))).toBe(n);
    }
  });
});

describe("relativeDays", () => {
  it("reads naturally in nag copy", () => {
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(1)).toBe("tomorrow");
    expect(relativeDays(-1)).toBe("yesterday");
    expect(relativeDays(14)).toBe("in 14 days");
    expect(relativeDays(-31)).toBe("31 days ago");
  });
});

describe("today", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(today(new Date("2026-08-25T23:59:59Z"))).toBe("2026-08-25");
    expect(toDateString(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});
