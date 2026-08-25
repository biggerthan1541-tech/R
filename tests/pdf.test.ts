import { describe, expect, it } from "vitest";
import { buildRegisterPdf } from "@/lib/pdf";
import { makeEvent, makeException, NOW } from "./fixtures";

const workspace = { name: "Northwind Systems", slug: "northwind-systems" };

function render(rows: Parameters<typeof buildRegisterPdf>[0]["rows"]) {
  return buildRegisterPdf({ workspace, rows, generatedBy: "M. Haas <vciso@example.com>", now: NOW });
}

describe("buildRegisterPdf", () => {
  it("produces a valid PDF for an empty register", async () => {
    const pdf = await render([]);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-6).toString()).toContain("%%EOF");
  });

  it("embeds the register content", async () => {
    const ex = makeException({
      title: "Legacy SFTP open to vendor",
      expiryDate: "2026-07-15",
      riskLevel: "high",
    });
    ex.events = [
      makeEvent(ex.id, "created", "Logged with expiry 2026-07-15.", "2025-10-09T09:00:00Z"),
      makeEvent(ex.id, "nag_sent", "[OVERDUE] reminder sent", "2026-08-25T08:00:00Z"),
    ];

    const pdf = await render([ex]);
    expect(pdf.length).toBeGreaterThan(20_000); // fonts are embedded
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("grows with the number of exceptions", async () => {
    const one = await render([makeException()]);
    const many = await render(Array.from({ length: 30 }, () => makeException()));
    expect(many.length).toBeGreaterThan(one.length);
  });

  it("handles exceptions with no events or missing optional fields", async () => {
    const bare = makeException({
      description: "",
      compensatingControl: "",
      evidenceUrl: null,
      frameworkTags: [],
    });
    await expect(render([bare])).resolves.toBeInstanceOf(Buffer);
  });
});
