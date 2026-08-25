import { describe, expect, it } from "vitest";
import { exceptionFormSchema, fieldErrors, moveExpirySchema, parseTags, reasonSchema } from "@/lib/validation";

const valid = {
  title: "Legacy SFTP port 22 open to vendor CIDR",
  type: "firewall_exception",
  description: "Vendor batch feed has no API.",
  compensatingControl: "IP allowlist, session logging.",
  riskLevel: "high",
  riskOwnerName: "Dana Whitfield",
  riskOwnerEmail: "Dana@Example.com",
  approverName: "Priya Raman",
  approverEmail: "priya@example.com",
  expiryDate: "2026-09-30",
  evidenceUrl: "https://jira.example.com/SEC-1",
  frameworkTags: "SOC2, ISO27001",
};

describe("exceptionFormSchema", () => {
  it("accepts a complete form and lowercases emails", () => {
    const parsed = exceptionFormSchema.parse(valid);
    expect(parsed.riskOwnerEmail).toBe("dana@example.com");
  });

  it("requires an expiry date in ISO form", () => {
    expect(exceptionFormSchema.safeParse({ ...valid, expiryDate: "" }).success).toBe(false);
    expect(exceptionFormSchema.safeParse({ ...valid, expiryDate: "30/09/2026" }).success).toBe(false);
    expect(exceptionFormSchema.safeParse({ ...valid, expiryDate: "2026-02-30" }).success).toBe(false);
  });

  it("rejects a title too short to mean anything", () => {
    expect(exceptionFormSchema.safeParse({ ...valid, title: "hm" }).success).toBe(false);
  });

  it("rejects bad emails and bad evidence URLs", () => {
    expect(exceptionFormSchema.safeParse({ ...valid, approverEmail: "priya" }).success).toBe(false);
    expect(exceptionFormSchema.safeParse({ ...valid, evidenceUrl: "jira/SEC-1" }).success).toBe(false);
  });

  it("allows an empty evidence URL", () => {
    expect(exceptionFormSchema.safeParse({ ...valid, evidenceUrl: "" }).success).toBe(true);
  });

  it("surfaces one message per field for rendering next to the input", () => {
    const result = exceptionFormSchema.safeParse({ ...valid, title: "x", approverEmail: "nope" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrors(result.error);
    expect(Object.keys(errors).sort()).toEqual(["approverEmail", "title"]);
  });
});

describe("reasonSchema", () => {
  it("insists on a reason worth recording", () => {
    expect(reasonSchema.safeParse("").success).toBe(false);
    expect(reasonSchema.safeParse("ok").success).toBe(false);
    expect(reasonSchema.safeParse("Vendor migration slipped to Q4.").success).toBe(true);
  });
});

describe("moveExpirySchema", () => {
  it("requires both a new date and a reason", () => {
    expect(moveExpirySchema.safeParse({ expiryDate: "2026-12-01", reason: "" }).success).toBe(false);
    expect(moveExpirySchema.safeParse({ expiryDate: "", reason: "Because of X." }).success).toBe(false);
    expect(
      moveExpirySchema.safeParse({ expiryDate: "2026-12-01", reason: "Reviewed with owner." }).success,
    ).toBe(true);
  });
});

describe("parseTags", () => {
  it("splits, trims and de-duplicates", () => {
    expect(parseTags(" SOC2 , ISO27001;SOC2 ,, ")).toEqual(["SOC2", "ISO27001"]);
    expect(parseTags("")).toEqual([]);
  });
});
