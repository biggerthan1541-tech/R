/** Minimal RFC 4180 CSV reader/writer. Auditors open these in Excel; be strict. */

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Leading =, +, -, @ are formula injection vectors in Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  // BOM so Excel reads UTF-8 (accented owner names) correctly.
  return "﻿" + rows.map((r) => r.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let started = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
    started = true;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === ",") endCell();
    else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (c === "\n") endRow();
    else cell += c;
  }
  if (cell !== "" || row.length > 0 || started) endRow();

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
