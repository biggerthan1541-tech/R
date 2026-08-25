import { describe, expect, it } from "vitest";
import {
  coerceDate,
  coerceRiskLevel,
  coerceTags,
  coerceType,
  guessMapping,
  parseRow,
  IMPORT_TEMPLATE_HEADERS,
  IMPORT_TEMPLATE_ROWS,
} from "@/lib/import";
import { parseCsv } from "@/lib/csv";

describe("guessMapping", () => {
  it("maps our own template headers exactly", () => {
    const mapping = guessMapping(IMPORT_TEMPLATE_HEADERS);
    expect(mapping.title).toBe(0);
    expect(mapping.type).toBe(1);
    expect(mapping.riskOwnerEmail).toBe(6);
    expect(mapping.expiryDate).toBe(9);
    expect(mapping.frameworkTags).toBe(11);
  });

  it("recognises the headers real spreadsheets use", () => {
    const mapping = guessMapping([
      "Exception",
      "Business Justification",
      "Mitigating Control",
      "Severity",
      "Accountable",
      "Owner Email",
      "Signed off by",
      "Expires",
      "Ticket URL",
      "Compliance",
    ]);
    expect(mapping.title).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.compensatingControl).toBe(2);
    expect(mapping.riskLevel).toBe(3);
    expect(mapping.riskOwnerName).toBe(4);
    expect(mapping.riskOwnerEmail).toBe(5);
    expect(mapping.approverName).toBe(6);
    expect(mapping.expiryDate).toBe(7);
    expect(mapping.evidenceUrl).toBe(8);
    expect(mapping.frameworkTags).toBe(9);
  });

  it("never assigns one column to two fields", () => {
    const mapping = guessMapping(["Owner", "Owner Email", "Approver", "Expiry"]);
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
  });

  it("leaves unmatched fields undefined rather than guessing", () => {
    const mapping = guessMapping(["Thing", "Blah"]);
    expect(mapping.expiryDate).toBeUndefined();
    expect(mapping.riskOwnerEmail).toBeUndefined();
  });
});

describe("coerceType", () => {
  it("passes through canonical values", () => {
    expect(coerceType("firewall_exception")).toBe("firewall_exception");
    expect(coerceType("MFA Waiver")).toBe("mfa_waiver");
  });

  it("reads the language people actually write", () => {
    expect(coerceType("Firewall rule")).toBe("firewall_exception");
    expect(coerceType("Break-glass access")).toBe("temp_access_grant");
    expect(coerceType("Accepted pentest finding")).toBe("accepted_finding");
    expect(coerceType("2FA exemption")).toBe("mfa_waiver");
    expect(coerceType("Policy deviation")).toBe("policy_waiver");
  });

  it("falls back to other rather than dropping the row", () => {
    expect(coerceType("")).toBe("other");
    expect(coerceType("¯\\_(ツ)_/¯")).toBe("other");
  });
});

describe("coerceRiskLevel", () => {
  it("understands severity and priority scales", () => {
    expect(coerceRiskLevel("Critical")).toBe("critical");
    expect(coerceRiskLevel("P1")).toBe("critical");
    expect(coerceRiskLevel("Sev 2")).toBe("high");
    expect(coerceRiskLevel("Major")).toBe("high");
    expect(coerceRiskLevel("Moderate")).toBe("medium");
    expect(coerceRiskLevel("Informational")).toBe("low");
  });

  it("defaults to medium when unreadable", () => {
    expect(coerceRiskLevel("")).toBe("medium");
    expect(coerceRiskLevel("spicy")).toBe("medium");
  });
});

describe("coerceDate", () => {
  it("accepts ISO dates unchanged", () => {
    expect(coerceDate("2026-09-30")).toBe("2026-09-30");
  });

  it("reads slash dates as US month-first", () => {
    expect(coerceDate("9/30/2026")).toBe("2026-09-30");
    expect(coerceDate("03/04/2026")).toBe("2026-03-04");
  });

  it("switches to day-first when the first part cannot be a month", () => {
    expect(coerceDate("30/09/2026")).toBe("2026-09-30");
  });

  it("expands two-digit years and accepts dotted separators", () => {
    expect(coerceDate("1.2.26")).toBe("2026-01-02");
  });

  it("reads written months in either order", () => {
    expect(coerceDate("15 Mar 2026")).toBe("2026-03-15");
    expect(coerceDate("September 4, 2026")).toBe("2026-09-04");
  });

  it("returns null rather than inventing a date", () => {
    expect(coerceDate("")).toBeNull();
    expect(coerceDate("TBD")).toBeNull();
    expect(coerceDate("2026-02-30")).toBeNull();
    expect(coerceDate("13/13/2026")).toBeNull();
  });
});

describe("coerceTags", () => {
  it("splits on common separators and canonicalises known frameworks", () => {
    expect(coerceTags("soc 2; iso 27001,pci")).toEqual(["SOC2", "ISO27001", "PCI"]);
  });

  it("preserves unknown tags verbatim", () => {
    expect(coerceTags("SOC2, InternalPolicy")).toEqual(["SOC2", "InternalPolicy"]);
  });

  it("returns nothing for an empty cell", () => {
    expect(coerceTags("")).toEqual([]);
  });
});

describe("parseRow", () => {
  const mapping = guessMapping(IMPORT_TEMPLATE_HEADERS);

  it("parses the template rows we ship", () => {
    for (const [i, cells] of IMPORT_TEMPLATE_ROWS.entries()) {
      const result = parseRow(cells, mapping, i + 2);
      expect(result.ok, JSON.stringify(result)).toBe(true);
    }
  });

  it("collects every problem on a row instead of failing on the first", () => {
    const result = parseRow(["", "", "", "", "", "", "not-an-email", "", "", "nope"], mapping, 4);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.row).toBe(4);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.join(" ")).toMatch(/Title is required/);
    expect(result.errors.join(" ")).toMatch(/Could not read expiry date/);
    expect(result.errors.join(" ")).toMatch(/not an email address/);
  });

  it("requires an expiry date", () => {
    const cells = [...IMPORT_TEMPLATE_ROWS[0]];
    cells[9] = "";
    const result = parseRow(cells, mapping, 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("Expiry date is required");
  });

  it("derives a missing owner name from the email address", () => {
    const cells = [...IMPORT_TEMPLATE_ROWS[0]];
    cells[5] = "";
    cells[6] = "dana.whitfield@example.com";
    const result = parseRow(cells, mapping, 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.riskOwnerName).toBe("Dana Whitfield");
  });

  it("falls back to the risk owner when no approver is recorded", () => {
    const cells = [...IMPORT_TEMPLATE_ROWS[0]];
    cells[7] = "";
    cells[8] = "";
    const result = parseRow(cells, mapping, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.approverEmail).toBe(result.value.riskOwnerEmail);
      expect(result.value.approverName).toBe(result.value.riskOwnerName);
    }
  });

  it("lowercases email addresses", () => {
    const cells = [...IMPORT_TEMPLATE_ROWS[0]];
    cells[6] = "Dana.Whitfield@Example.COM";
    const result = parseRow(cells, mapping, 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.riskOwnerEmail).toBe("dana.whitfield@example.com");
  });
});

describe("end-to-end import of a messy spreadsheet", () => {
  const csv = [
    "Exception,Owner,Owner email,Expires,Severity,Compliance",
    'Legacy TLS 1.0 on partner endpoint,R. Baird,R.Baird@example.com,12/31/2026,Sev 2,"soc 2; pci"',
    "Missing expiry row,T. Maki,t.maki@example.com,,Low,SOC2",
    "Vendor VPN without posture check,S. Ndlovu,s.ndlovu@example.com,15 Mar 2027,P1,ISO 27001",
  ].join("\n");

  it("maps, coerces and separates good rows from bad", () => {
    const rows = parseCsv(csv);
    const mapping = guessMapping(rows[0]);
    const parsed = rows.slice(1).map((cells, i) => parseRow(cells, mapping, i + 2));

    const good = parsed.filter((r) => r.ok);
    const bad = parsed.filter((r) => !r.ok);
    expect(good).toHaveLength(2);
    expect(bad).toHaveLength(1);
    expect(bad[0].row).toBe(3);

    const first = good[0];
    if (!first.ok) throw new Error("expected a parsed row");
    expect(first.value).toMatchObject({
      title: "Legacy TLS 1.0 on partner endpoint",
      riskOwnerName: "R. Baird",
      riskOwnerEmail: "r.baird@example.com",
      expiryDate: "2026-12-31",
      riskLevel: "high",
      frameworkTags: ["SOC2", "PCI"],
    });

    const third = good[1];
    if (!third.ok) throw new Error("expected a parsed row");
    expect(third.value.expiryDate).toBe("2027-03-15");
    expect(third.value.riskLevel).toBe("critical");
    expect(third.value.frameworkTags).toEqual(["ISO27001"]);
  });
});
