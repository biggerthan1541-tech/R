import { describe, expect, it } from "vitest";
import { buildExportCsv, buildExportRows, exportFilename, shortRef, summarize } from "@/lib/export";
import { parseCsv } from "@/lib/csv";
import { makeEvent, makeException, NOW } from "./fixtures";

const expired = makeException({
  id: "11111111-2222-4333-8444-555555555555",
  title: "Legacy SFTP open to vendor",
  expiryDate: "2026-07-15",
  riskLevel: "high",
});
expired.events = [
  makeEvent(expired.id, "created", "Logged with expiry 2026-05-15.", "2025-10-09T09:00:00Z"),
  makeEvent(expired.id, "extended", "New expiry 2026-07-15.", "2026-05-16T11:30:00Z"),
  makeEvent(expired.id, "nag_sent", "[OVERDUE] reminder", "2026-08-25T08:00:00Z"),
];

const closed = makeException({
  id: "99999999-2222-4333-8444-555555555555",
  expiryDate: "2026-06-01",
  closedAt: new Date("2026-05-28T00:00:00Z"),
  riskLevel: "low",
  type: "mfa_waiver",
});

const expiring = makeException({ expiryDate: "2026-08-28", riskLevel: "critical" });
const open = makeException({ expiryDate: "2027-01-01" });

const rows = [expired, expiring, open, closed];

describe("summarize", () => {
  it("counts the states the dashboard and the report both lead with", () => {
    const s = summarize(rows, NOW);
    expect(s).toMatchObject({ total: 4, active: 3, expiringSoon: 1, overdue: 1, closed: 1 });
  });

  it("breaks down by type and risk, most common first", () => {
    const s = summarize(rows, NOW);
    expect(s.byType[0]).toEqual({ label: "Firewall exception", count: 3 });
    expect(s.byRisk.map((r) => r.label).sort()).toEqual(["Critical", "High", "Low", "Medium"]);
  });

  it("handles an empty register", () => {
    expect(summarize([], NOW)).toMatchObject({ total: 0, overdue: 0, byType: [], byRisk: [] });
  });
});

describe("shortRef", () => {
  it("is stable, uppercase and derived from the id", () => {
    expect(shortRef("11111111-2222-4333-8444-555555555555")).toBe("EX-11111111");
    expect(shortRef(expired.id)).toBe(shortRef(expired.id));
  });
});

describe("buildExportRows", () => {
  const out = buildExportRows(rows, NOW);
  const header = out[0] as string[];
  const first = out[1];
  const col = (name: string) => first[header.indexOf(name)];

  it("leads with a header row containing every auditor-facing field", () => {
    for (const name of [
      "Ref",
      "Title",
      "Status",
      "Risk level",
      "Expiry date",
      "Risk owner",
      "Approver",
      "Why (business justification)",
      "Compensating control",
      "Event history",
    ]) {
      expect(header).toContain(name);
    }
  });

  it("writes one row per exception", () => {
    expect(out).toHaveLength(rows.length + 1);
  });

  it("reports the derived status and signed day count", () => {
    expect(col("Status")).toBe("Expired");
    expect(col("Days to expiry")).toBe(-41);
  });

  it("flattens the full event history into a single cell", () => {
    const history = String(col("Event history"));
    expect(history.split("\n")).toHaveLength(3);
    expect(history).toContain("[2025-10-09 09:00] created by dana@example.com");
    expect(history).toContain("extended");
    expect(history).toContain("nag_sent");
  });

  it("orders history oldest first regardless of input order", () => {
    const shuffled = { ...expired, events: [...expired.events].reverse() };
    const history = String(buildExportRows([shuffled], NOW)[1][header.indexOf("Event history")]);
    expect(history.indexOf("created")).toBeLessThan(history.indexOf("extended"));
  });

  it("records the close date only for closed exceptions", () => {
    const closedRow = out[4];
    expect(closedRow[header.indexOf("Closed")]).toBe("2026-05-28");
    expect(col("Closed")).toBe("");
  });
});

describe("buildExportCsv", () => {
  it("survives a parse round trip with the multi-line history intact", () => {
    const parsed = parseCsv(buildExportCsv(rows, NOW));
    expect(parsed).toHaveLength(rows.length + 1);
    const history = parsed[1][parsed[0].indexOf("Event history")];
    expect(history.split("\n")).toHaveLength(3);
  });
});

describe("exportFilename", () => {
  it("names the file after the workspace and the date", () => {
    expect(exportFilename({ slug: "northwind" }, "pdf", NOW)).toBe(
      "lapse-exception-register-northwind-2026-08-25.pdf",
    );
  });
});
