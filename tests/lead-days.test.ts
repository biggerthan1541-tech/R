import { describe, expect, it } from "vitest";
import { parseLeadDays } from "@/lib/lead-days";

describe("parseLeadDays", () => {
  it("reads a comma or space separated list, descending and de-duplicated", () => {
    expect(parseLeadDays("14, 7, 1")).toEqual([14, 7, 1]);
    expect(parseLeadDays("1 7 14")).toEqual([14, 7, 1]);
    expect(parseLeadDays("7,7,30")).toEqual([30, 7]);
  });

  it("treats an empty field as 'expiry day only'", () => {
    expect(parseLeadDays("")).toEqual([]);
    expect(parseLeadDays("   ")).toEqual([]);
  });

  it("drops zero, which the sweep always covers anyway", () => {
    expect(parseLeadDays("0, 7")).toEqual([7]);
  });

  it("rejects anything that is not a sane number of days", () => {
    expect(parseLeadDays("14, seven")).toBeNull();
    expect(parseLeadDays("-3")).toBeNull();
    expect(parseLeadDays("2.5")).toBeNull();
    expect(parseLeadDays("400")).toBeNull();
  });
});
