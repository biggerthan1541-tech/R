import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Workspace } from "@/db/schema";
import { EXCEPTION_TYPE_LABELS, EVENT_KIND_LABELS, RISK_LEVEL_LABELS } from "./labels";
import { daysUntilExpiry, deriveStatus } from "./status";
import { today } from "./dates";
import { shortRef, summarize, type ExceptionWithEvents } from "./export";
import type { ExceptionStatus } from "./enums";

/* — the Modernist palette, as used on screen ————————————————————————— */
const INK = "#201e1d";
const ACCENT = "#ec3013";
const ACCENT_700 = "#ae1800";
const ACCENT_100 = "#fff2ef";
const WARN = "#7a5200";
const GOOD = "#2f5d3a";
const N300 = "#d7d3d3";
const N600 = "#7d7979";
const N700 = "#605d5d";
const N800 = "#444141";

const STATUS_INK: Record<ExceptionStatus, string> = {
  expired: ACCENT_700,
  expiring: WARN,
  open: N800,
  renewed: ACCENT_700,
  closed: GOOD,
};

const STATUS_TEXT: Record<ExceptionStatus, string> = {
  expired: "EXPIRED · OPEN",
  expiring: "EXPIRING",
  open: "OPEN",
  renewed: "RENEWED",
  closed: "CLOSED",
};

const MARGIN = 48;
const PAGE_W = 595.28; // A4 portrait
const CONTENT = PAGE_W - MARGIN * 2;
const FOOT = MARGIN + 26;

const REGULAR = "Archivo";
const SEMI = "Archivo-Semi";
const BOLD = "Archivo-Bold";

type Doc = PDFKit.PDFDocument;

export type ReportOptions = {
  workspace: Pick<Workspace, "name" | "slug">;
  rows: readonly ExceptionWithEvents[];
  generatedBy: string;
  now?: string;
};

function fontFile(name: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "src", "lib", "fonts", name));
}

/** Renders the auditor-facing register report and resolves to the PDF bytes. */
export function buildRegisterPdf(opts: ReportOptions): Promise<Buffer> {
  const now = opts.now ?? today();
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: FOOT, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: `Security Exception Register — ${opts.workspace.name}`,
      Author: opts.generatedBy,
      Subject: "Security exceptions, risk acceptances and temporary access grants",
      Creator: "Lapse",
    },
  });

  doc.registerFont(REGULAR, fontFile("Archivo-Regular.ttf"));
  doc.registerFont(SEMI, fontFile("Archivo-SemiBold.ttf"));
  doc.registerFont(BOLD, fontFile("Archivo-ExtraBold.ttf"));

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  masthead(doc, opts, now);
  summaryBand(doc, opts.rows, now);
  narrative(doc, opts.rows, now);
  registerTable(doc, opts.rows, now);
  detailSection(doc, opts.rows, now);
  footers(doc, opts, now);

  doc.end();
  return done;
}

/* -------------------------------------------------------------------------- */

function masthead(doc: Doc, opts: ReportOptions, now: string) {
  const frameworks = [...new Set(opts.rows.flatMap((r) => r.frameworkTags))].sort();

  doc.font(BOLD).fontSize(21).fillColor(INK);
  doc.text("Security Exception Register", MARGIN, MARGIN + 1, { width: CONTENT * 0.64, lineBreak: false });
  const leftBottom = doc.y;

  doc.font(REGULAR).fontSize(9.5).fillColor(N700);
  doc.text(
    opts.workspace.name + (frameworks.length ? ` · ${frameworks.join(" · ")}` : ""),
    MARGIN,
    leftBottom + 2,
    { width: CONTENT * 0.6 },
  );
  const leftEnd = doc.y;

  doc.font(REGULAR).fontSize(8.5).fillColor(N700);
  doc.text(
    [
      `Generated ${now}`,
      `Prepared by ${opts.generatedBy}`,
      `Evidence ref. LAPSE-${opts.workspace.slug.toUpperCase().slice(0, 12)}-${now.replaceAll("-", "")}`,
    ].join("\n"),
    MARGIN + CONTENT * 0.6,
    MARGIN + 2,
    { width: CONTENT * 0.4, align: "right", lineGap: 3 },
  );

  doc.y = Math.max(leftEnd, doc.y) + 10;
  rule(doc, 2, INK);
  doc.y += 4;
}

function summaryBand(doc: Doc, rows: readonly ExceptionWithEvents[], now: string) {
  const s = summarize(rows, now);
  const cards: Array<[string, number, string]> = [
    ["On the register", s.total, INK],
    ["Expired, still open", s.overdue, s.overdue > 0 ? ACCENT_700 : GOOD],
    ["Expiring ≤14 days", s.expiringSoon, s.expiringSoon > 0 ? WARN : INK],
    ["Closed in period", s.closed, N700],
  ];

  const colW = CONTENT / cards.length;
  const top = doc.y + 10;

  cards.forEach(([label, value, color], i) => {
    const x = MARGIN + i * colW;
    doc.font(BOLD).fontSize(29).fillColor(color).text(String(value), x, top, { width: colW - 12 });
    doc
      .font(SEMI)
      .fontSize(8)
      .fillColor(N700)
      .text(label.toUpperCase(), x, top + 32, { width: colW - 12, characterSpacing: 0.5 });
  });

  doc.y = top + 48;
  rule(doc, 1, N300);
}

function narrative(doc: Doc, rows: readonly ExceptionWithEvents[], now: string) {
  const s = summarize(rows, now);
  const sentences = [
    `${count(s.total, "exception")} ${s.total === 1 ? "is" : "are"} recorded on this register.`,
    "Each carries a named accountable risk owner, a documented compensating control and a fixed expiry date.",
  ];
  if (s.overdue > 0) {
    sentences.push(
      `${count(s.overdue, "exception")} passed ${s.overdue === 1 ? "its" : "their"} expiry date without being renewed or closed; ${s.overdue === 1 ? "it is" : "they are"} listed first below.`,
    );
  } else {
    sentences.push("No exception is currently past its expiry date.");
  }
  if (s.expiringSoon > 0) {
    sentences.push(`${count(s.expiringSoon, "exception")} reach expiry within fourteen days.`);
  }

  doc.y += 14;
  doc.font(REGULAR).fontSize(10).fillColor(N800);
  doc.text(sentences.join(" "), MARGIN, doc.y, { width: CONTENT, lineGap: 2.5, align: "left" });
  doc.y += 16;
}

/* -------------------------------------------------------------------------- */

const COLS = [
  { header: "Ref", width: 62 },
  { header: "Exception / control", width: 164 },
  { header: "Owner", width: 72 },
  { header: "Logged", width: 54 },
  { header: "Expiry", width: 57 },
  { header: "Status", width: 90 },
] as const;

function registerTable(doc: Doc, rows: readonly ExceptionWithEvents[], now: string) {
  if (rows.length === 0) {
    doc.font(REGULAR).fontSize(10).fillColor(N700).text("No exceptions recorded.", MARGIN, doc.y);
    return;
  }

  tableHead(doc);

  for (const row of sortForReport(rows, now)) {
    const status = deriveStatus(row, now);
    const control = row.compensatingControl.trim() || "No compensating control recorded";
    const subtitle = `${EXCEPTION_TYPE_LABELS[row.type]} · ${RISK_LEVEL_LABELS[row.riskLevel]} risk · ${control}`;

    doc.font(SEMI).fontSize(8.5);
    const titleH = doc.heightOfString(row.title, { width: COLS[1].width - 10 });
    doc.font(REGULAR).fontSize(7.5);
    const subH = doc.heightOfString(subtitle, { width: COLS[1].width - 10, lineGap: 0.5 });
    const height = Math.max(titleH + subH + 2, 22) + 8;

    if (doc.y + height > doc.page.height - FOOT) {
      doc.addPage();
      tableHead(doc, true);
    }

    const top = doc.y;
    if (status === "expired") {
      doc.rect(MARGIN, top, CONTENT, height).fill(ACCENT_100);
      doc.rect(MARGIN, top, 2.5, height).fill(ACCENT);
    }

    let x = MARGIN + 6;
    doc.font(REGULAR).fontSize(7.5).fillColor(N700).text(shortRef(row.id), x, top + 5.5, {
      width: COLS[0].width - 6,
      lineBreak: false,
    });

    x += COLS[0].width;
    doc.font(SEMI).fontSize(8.5).fillColor(INK).text(row.title, x, top + 5, {
      width: COLS[1].width - 10,
    });
    doc.font(REGULAR).fontSize(7.5).fillColor(N700).text(subtitle, x, doc.y + 1, {
      width: COLS[1].width - 10,
      lineGap: 0.5,
    });

    x += COLS[1].width;
    doc.font(REGULAR).fontSize(8).fillColor(INK).text(row.riskOwnerName, x, top + 5, {
      width: COLS[2].width - 10,
    });

    x += COLS[2].width;
    doc
      .font(REGULAR)
      .fontSize(8)
      .fillColor(N700)
      .text(row.createdAt.toISOString().slice(0, 10), x, top + 5, {
        width: COLS[3].width - 4,
        lineBreak: false,
      });

    x += COLS[3].width;
    doc
      .font(status === "expired" ? BOLD : REGULAR)
      .fontSize(8)
      .fillColor(STATUS_INK[status])
      .text(row.expiryDate, x, top + 5, { width: COLS[4].width - 4, lineBreak: false });

    x += COLS[4].width;
    doc
      .font(BOLD)
      .fontSize(7)
      .fillColor(STATUS_INK[status])
      .text(STATUS_TEXT[status], x, top + 5.5, {
        width: COLS[5].width - 2,
        characterSpacing: 0.4,
        lineBreak: false,
      });

    doc.y = top + height;
    hairline(doc);
  }
}

function tableHead(doc: Doc, continued = false) {
  if (continued) {
    doc.font(BOLD).fontSize(9).fillColor(N600).text("REGISTER (CONTINUED)", MARGIN, doc.y, {
      characterSpacing: 0.6,
    });
    doc.y += 6;
  }
  const top = doc.y;
  let x = MARGIN + 6;
  for (const col of COLS) {
    doc
      .font(BOLD)
      .fontSize(7)
      .fillColor(N600)
      .text(col.header.toUpperCase(), x, top, {
        width: col.width - 6,
        characterSpacing: 0.6,
        lineBreak: false,
      });
    x += col.width;
  }
  doc.y = top + 11;
  rule(doc, 2, INK);
}

/* -------------------------------------------------------------------------- */

function detailSection(doc: Doc, rows: readonly ExceptionWithEvents[], now: string) {
  if (rows.length === 0) return;

  doc.addPage();
  doc.font(BOLD).fontSize(15).fillColor(INK).text("Exception detail and event history", MARGIN, MARGIN);
  doc.y += 4;
  rule(doc, 2, INK);
  doc.y += 12;

  for (const row of sortForReport(rows, now)) {
    const status = deriveStatus(row, now);
    const days = daysUntilExpiry(row, now);

    if (doc.y > doc.page.height - FOOT - 120) doc.addPage();

    const top = doc.y;
    doc.rect(MARGIN, top, 2.5, 14).fill(STATUS_INK[status]);

    doc.font(BOLD).fontSize(7).fillColor(STATUS_INK[status]).text(
      `${shortRef(row.id)}   ${STATUS_TEXT[status]}`,
      MARGIN + 9,
      top + 1,
      { characterSpacing: 0.6, lineBreak: false },
    );
    doc.font(REGULAR).fontSize(7.5).fillColor(N700).text(
      row.closedAt
        ? `Closed ${row.closedAt.toISOString().slice(0, 10)}`
        : days < 0
          ? `${-days} days past expiry`
          : `${days} days remaining`,
      MARGIN,
      top + 1,
      { width: CONTENT, align: "right", lineBreak: false },
    );

    doc.y = top + 15;
    doc.font(BOLD).fontSize(12).fillColor(INK).text(row.title, MARGIN + 9, doc.y, {
      width: CONTENT - 9,
      lineGap: -1,
    });
    doc.y += 5;

    field(doc, "Why", row.description || "Not recorded.");
    field(doc, "Compensating control", row.compensatingControl || "Not recorded.");
    field(doc, "Type / risk", `${EXCEPTION_TYPE_LABELS[row.type]} · ${RISK_LEVEL_LABELS[row.riskLevel]}`);
    field(doc, "Risk owner", `${row.riskOwnerName} <${row.riskOwnerEmail}>`);
    field(doc, "Approver", `${row.approverName} <${row.approverEmail}>`);
    field(doc, "Expiry date", row.expiryDate);
    if (row.frameworkTags.length) field(doc, "Frameworks", row.frameworkTags.join(", "));
    if (row.evidenceUrl) field(doc, "Evidence", row.evidenceUrl);

    doc.y += 4;
    doc.font(BOLD).fontSize(7).fillColor(N600).text("EVENT HISTORY", MARGIN + 9, doc.y, {
      characterSpacing: 0.6,
    });
    doc.y += 3;

    const history = [...row.events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    if (history.length === 0) {
      doc.font(REGULAR).fontSize(8).fillColor(N700).text("No recorded events.", MARGIN + 9, doc.y);
      doc.y += 4;
    }

    for (const e of history) {
      if (doc.y > doc.page.height - FOOT - 24) doc.addPage();
      const y = doc.y;
      doc
        .font(REGULAR)
        .fontSize(7.5)
        .fillColor(N600)
        .text(e.timestamp.toISOString().replace("T", " ").slice(0, 16), MARGIN + 9, y, {
          width: 86,
          lineBreak: false,
        });
      doc
        .font(SEMI)
        .fontSize(7.5)
        .fillColor(e.kind === "nag_sent" ? ACCENT_700 : N800)
        .text(EVENT_KIND_LABELS[e.kind], MARGIN + 100, y, { width: 74, lineBreak: false });
      doc
        .font(REGULAR)
        .fontSize(7.5)
        .fillColor(INK)
        .text(`${e.note || "—"}  (${e.actor})`, MARGIN + 178, y, {
          width: CONTENT - 178,
          lineGap: 0.5,
        });
      doc.y = Math.max(doc.y, y + 10);
    }

    doc.y += 10;
    hairline(doc);
    doc.y += 12;
  }
}

function field(doc: Doc, label: string, value: string) {
  const top = doc.y;
  doc.font(BOLD).fontSize(7).fillColor(N600).text(label.toUpperCase(), MARGIN + 9, top + 1, {
    width: 100,
    characterSpacing: 0.5,
  });
  const labelEnd = doc.y;
  doc.font(REGULAR).fontSize(8.5).fillColor(INK).text(value, MARGIN + 118, top, {
    width: CONTENT - 118,
    lineGap: 1,
  });
  doc.y = Math.max(doc.y, labelEnd) + 4;
}

/* -------------------------------------------------------------------------- */

function footers(doc: Doc, opts: ReportOptions, now: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise make pdfkit add a page.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN + 2;

    doc
      .moveTo(MARGIN, y - 10)
      .lineTo(MARGIN + CONTENT, y - 10)
      .lineWidth(2)
      .strokeColor(INK)
      .stroke();

    doc
      .font(REGULAR)
      .fontSize(7)
      .fillColor(N700)
      .text(
        `${opts.workspace.name} — attested complete and accurate as at ${now}. Generated by Lapse.`,
        MARGIN,
        y,
        { width: CONTENT * 0.75, lineBreak: false },
      )
      .font(SEMI)
      .text(`Page ${i - range.start + 1} / ${range.count}`, MARGIN + CONTENT * 0.75, y, {
        width: CONTENT * 0.25,
        align: "right",
        lineBreak: false,
      });
  }
  doc.flushPages();
}

function rule(doc: Doc, width: number, color: string) {
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT, doc.y)
    .lineWidth(width)
    .strokeColor(color)
    .stroke();
}

function hairline(doc: Doc) {
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT, doc.y)
    .lineWidth(0.5)
    .strokeColor(N300)
    .stroke();
}

function count(n: number, noun: string): string {
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const word = n <= 10 ? words[n] : String(n);
  return `${word} ${noun}${n === 1 ? "" : "s"}`;
}

/** Most urgent first: overdue, then soonest expiry; closed items sink to the bottom. */
function sortForReport(rows: readonly ExceptionWithEvents[], now: string) {
  const rank: Record<ExceptionStatus, number> = {
    expired: 0,
    expiring: 1,
    open: 2,
    renewed: 2,
    closed: 3,
  };
  return [...rows].sort((a, b) => {
    const ra = rank[deriveStatus(a, now)];
    const rb = rank[deriveStatus(b, now)];
    if (ra !== rb) return ra - rb;
    return a.expiryDate.localeCompare(b.expiryDate);
  });
}
