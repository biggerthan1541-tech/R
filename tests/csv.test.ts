import { describe, expect, it } from "vitest";
import { escapeCell, parseCsv, toCsv } from "@/lib/csv";

const strip = (csv: string) => csv.replace(/^﻿/, "");

describe("toCsv", () => {
  it("writes a BOM so Excel reads UTF-8 names correctly", () => {
    expect(toCsv([["Sofia Bergqvist"]]).charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings", () => {
    expect(strip(toCsv([["a"], ["b"]]))).toBe("a\r\nb\r\n");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    expect(escapeCell("plain")).toBe("plain");
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(escapeCell("=1+1")).toBe("'=1+1");
    expect(escapeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCell("+1")).toBe("'+1");
    expect(escapeCell("-1")).toBe("'-1");
  });

  it("renders null and undefined as empty cells", () => {
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
    expect(escapeCell(0)).toBe("0");
  });
});

describe("parseCsv", () => {
  it("reads quoted fields, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('a,"b,c","he said ""no""","multi\nline"');
    expect(rows).toEqual([["a", "b,c", 'he said "no"', "multi\nline"]]);
  });

  it("handles CRLF, LF and a missing trailing newline", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCsv("a,b\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips a leading BOM", () => {
    expect(parseCsv("﻿Title,Owner")).toEqual([["Title", "Owner"]]);
  });

  it("drops entirely blank rows but keeps empty cells", () => {
    expect(parseCsv("a,b\n\n,\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });

  it("round-trips everything toCsv can write", () => {
    const rows = [
      ["Title", "Why", "Owner"],
      ['Port 22 "temporarily" open', "Vendor feed,\nno API", "dana@example.com"],
      ["=INJECT()", "", "tom@example.com"],
    ];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed[0]).toEqual(rows[0]);
    expect(parsed[1]).toEqual(rows[1]);
    // The formula guard is intentionally visible in the round trip.
    expect(parsed[2]).toEqual(["'=INJECT()", "", "tom@example.com"]);
  });
});
