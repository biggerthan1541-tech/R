import { describe, expect, it } from "vitest";
import { applyQuery, facets, parseQuery } from "@/lib/filter";
import { makeException, NOW } from "./fixtures";

const rows = [
  makeException({
    id: "a",
    title: "Legacy SFTP open to vendor",
    type: "firewall_exception",
    riskLevel: "high",
    riskOwnerName: "Marcus Ellery",
    riskOwnerEmail: "marcus@example.com",
    expiryDate: "2026-07-15", // expired
    frameworkTags: ["SOC2", "ISO27001"],
  }),
  makeException({
    id: "b",
    title: "Contractor admin access",
    type: "temp_access_grant",
    riskLevel: "critical",
    riskOwnerName: "Sofia Bergqvist",
    riskOwnerEmail: "sofia@example.com",
    expiryDate: "2026-08-28", // expiring
    frameworkTags: ["SOC2", "PCI"],
  }),
  makeException({
    id: "c",
    title: "Break-glass root credentials",
    type: "temp_access_grant",
    riskLevel: "low",
    riskOwnerName: "Priya Raman",
    riskOwnerEmail: "priya@example.com",
    expiryDate: "2026-12-24", // open
    frameworkTags: ["ISO27001"],
    compensatingControl: "Sealed in Vault with break-glass alerting.",
  }),
  makeException({
    id: "d",
    title: "Retired S3 public read",
    type: "firewall_exception",
    riskLevel: "medium",
    riskOwnerName: "Sofia Bergqvist",
    riskOwnerEmail: "sofia@example.com",
    expiryDate: "2026-06-01",
    closedAt: new Date("2026-05-28T00:00:00Z"), // closed
    frameworkTags: [],
  }),
];

const ids = (list: ReturnType<typeof applyQuery>) => list.map((r) => r.id);

describe("parseQuery", () => {
  it("defaults to status order, most urgent first", () => {
    expect(parseQuery({})).toMatchObject({ sort: "status", dir: "asc" });
  });

  it("treats 'all' and empty values as no filter", () => {
    expect(parseQuery({ status: "all", type: "" }).status).toBeUndefined();
    expect(parseQuery({ status: "all", type: "" }).type).toBeUndefined();
  });

  it("rejects an unknown sort key rather than throwing", () => {
    expect(parseQuery({ sort: "; DROP TABLE" }).sort).toBe("status");
  });

  it("reads repeated query parameters as the first value", () => {
    expect(parseQuery({ status: ["expired", "open"] }).status).toBe("expired");
  });
});

describe("applyQuery", () => {
  it("puts what is on fire first by default", () => {
    expect(ids(applyQuery(rows, parseQuery({}), NOW))).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by derived status, not the stored column", () => {
    expect(ids(applyQuery(rows, parseQuery({ status: "expired" }), NOW))).toEqual(["a"]);
    expect(ids(applyQuery(rows, parseQuery({ status: "expiring" }), NOW))).toEqual(["b"]);
    expect(ids(applyQuery(rows, parseQuery({ status: "closed" }), NOW))).toEqual(["d"]);
  });

  it("filters by type, owner and framework", () => {
    expect(ids(applyQuery(rows, parseQuery({ type: "temp_access_grant" }), NOW))).toEqual(["b", "c"]);
    expect(ids(applyQuery(rows, parseQuery({ owner: "sofia@example.com" }), NOW))).toEqual(["b", "d"]);
    expect(ids(applyQuery(rows, parseQuery({ framework: "ISO27001" }), NOW))).toEqual(["a", "c"]);
  });

  it("combines filters", () => {
    const q = parseQuery({ owner: "sofia@example.com", status: "closed" });
    expect(ids(applyQuery(rows, q, NOW))).toEqual(["d"]);
  });

  it("searches titles, people and compensating controls case-insensitively", () => {
    expect(ids(applyQuery(rows, parseQuery({ q: "SFTP" }), NOW))).toEqual(["a"]);
    expect(ids(applyQuery(rows, parseQuery({ q: "bergqvist" }), NOW))).toEqual(["b", "d"]);
    expect(ids(applyQuery(rows, parseQuery({ q: "vault" }), NOW))).toEqual(["c"]);
    expect(ids(applyQuery(rows, parseQuery({ q: "nothing here" }), NOW))).toEqual([]);
  });

  it("sorts by expiry, risk and owner in both directions", () => {
    expect(ids(applyQuery(rows, parseQuery({ sort: "expiry" }), NOW))).toEqual(["d", "a", "b", "c"]);
    expect(ids(applyQuery(rows, parseQuery({ sort: "expiry", dir: "desc" }), NOW))).toEqual([
      "c",
      "b",
      "a",
      "d",
    ]);
    expect(ids(applyQuery(rows, parseQuery({ sort: "risk" }), NOW))).toEqual(["b", "a", "d", "c"]);
    // Two rows share an owner; the tiebreak is soonest expiry.
    expect(ids(applyQuery(rows, parseQuery({ sort: "owner" }), NOW))).toEqual(["a", "c", "d", "b"]);
  });

  it("does not mutate the input array", () => {
    const before = rows.map((r) => r.id);
    applyQuery(rows, parseQuery({ sort: "expiry", dir: "desc" }), NOW);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("facets", () => {
  it("lists each owner once and sorts frameworks", () => {
    const { owners, frameworks } = facets(rows);
    expect(owners.map((o) => o.email)).toEqual([
      "marcus@example.com",
      "priya@example.com",
      "sofia@example.com",
    ]);
    expect(frameworks).toEqual(["ISO27001", "PCI", "SOC2"]);
  });
});
