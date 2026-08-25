import { EXCEPTION_TYPES, RISK_LEVELS } from "./enums";
import type { ExceptionType, RiskLevel } from "./enums";
import { isValidDate } from "./dates";

/* -------------------------------------------------------------------------- */
/* Target fields                                                              */
/* -------------------------------------------------------------------------- */

export const IMPORT_FIELDS = [
  { key: "title", label: "Title", required: true },
  { key: "type", label: "Type", required: false },
  { key: "description", label: "Why / description", required: false },
  { key: "compensatingControl", label: "Compensating control", required: false },
  { key: "riskLevel", label: "Risk level", required: false },
  { key: "riskOwnerName", label: "Risk owner name", required: true },
  { key: "riskOwnerEmail", label: "Risk owner email", required: true },
  { key: "approverName", label: "Approver name", required: false },
  { key: "approverEmail", label: "Approver email", required: false },
  { key: "expiryDate", label: "Expiry date", required: true },
  { key: "evidenceUrl", label: "Evidence URL", required: false },
  { key: "frameworkTags", label: "Framework tags", required: false },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<ImportField, number>>;

/** Header aliases seen in the wild — the spreadsheets this replaces. */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  title: ["title", "name", "exception", "summary", "item", "issue", "finding"],
  type: ["type", "category", "kind", "exceptiontype"],
  description: ["description", "why", "reason", "justification", "businessjustification", "details", "notes"],
  compensatingControl: ["compensatingcontrol", "compensatingcontrols", "mitigation", "mitigatingcontrol", "control", "compensation"],
  riskLevel: ["risklevel", "risk", "severity", "priority", "impact"],
  riskOwnerName: ["riskowner", "riskownername", "owner", "ownername", "responsible", "accountable"],
  riskOwnerEmail: ["riskowneremail", "owneremail", "ownermail", "email", "riskownercontact"],
  approverName: ["approver", "approvername", "approvedby", "signoff", "signedoffby"],
  approverEmail: ["approveremail", "approvermail", "approvedbyemail"],
  expiryDate: ["expiry", "expirydate", "expires", "expiresat", "expiration", "expirationdate", "reviewdate", "duedate", "enddate", "validuntil"],
  evidenceUrl: ["evidence", "evidenceurl", "link", "ticket", "ticketurl", "reference", "url"],
  frameworkTags: ["framework", "frameworks", "frameworktags", "tags", "compliance", "standard", "standards"],
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function guessMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<number>();

  for (const { key } of IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[key];
    let best = -1;
    let bestRank = Infinity;
    headers.forEach((header, i) => {
      if (taken.has(i)) return;
      const h = normalize(header);
      if (!h) return;
      const exact = aliases.indexOf(h);
      const rank = exact >= 0 ? exact : aliases.findIndex((a) => h.includes(a)) >= 0 ? 100 : -1;
      if (rank >= 0 && rank < bestRank) {
        bestRank = rank;
        best = i;
      }
    });
    if (best >= 0) {
      mapping[key] = best;
      taken.add(best);
    }
  }
  return mapping;
}

/* -------------------------------------------------------------------------- */
/* Value coercion                                                             */
/* -------------------------------------------------------------------------- */

const TYPE_ALIASES: Array<[RegExp, ExceptionType]> = [
  [/fire ?wall|network|acl|port|ingress|egress/i, "firewall_exception"],
  [/temp|access|grant|elevat|admin|jit|break ?glass/i, "temp_access_grant"],
  [/finding|pentest|vuln|scan|accepted risk|risk accept/i, "accepted_finding"],
  [/mfa|2fa|otp|multi ?factor/i, "mfa_waiver"],
  [/polic|standard|procedure|waiver/i, "policy_waiver"],
];

export function coerceType(raw: string): ExceptionType {
  const v = normalize(raw);
  const direct = EXCEPTION_TYPES.find((t) => normalize(t) === v);
  if (direct) return direct;
  for (const [re, type] of TYPE_ALIASES) if (re.test(raw)) return type;
  return "other";
}

const RISK_ALIASES: Array<[RegExp, RiskLevel]> = [
  [/^(crit|sev ?0|sev ?1|p0|p1|urgent|blocker)/i, "critical"],
  [/^(high|major|p2|sev ?2)/i, "high"],
  [/^(med|moderate|p3|sev ?3)/i, "medium"],
  [/^(low|minor|info|p4|p5|sev ?4)/i, "low"],
];

export function coerceRiskLevel(raw: string): RiskLevel {
  const v = raw.trim();
  const direct = RISK_LEVELS.find((r) => normalize(r) === normalize(v));
  if (direct) return direct;
  for (const [re, level] of RISK_ALIASES) if (re.test(v)) return level;
  return "medium";
}

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

/**
 * Accepts ISO, slash/dot formats and `15 Mar 2026`. Slash dates are read as
 * US M/D/Y unless the first part exceeds 12, which forces D/M/Y.
 */
export function coerceDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (isValidDate(v)) return v;

  const iso = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return pad(+iso[1], +iso[2], +iso[3]);

  const slash = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (slash) {
    const a = +slash[1];
    const b = +slash[2];
    const year = slash[3].length === 2 ? 2000 + +slash[3] : +slash[3];
    const [month, day] = a > 12 ? [b, a] : [a, b];
    return pad(year, month, day);
  }

  const words = v.match(/^(\d{1,2})[ -]([a-zA-Z]{3,})[ -](\d{4})$/);
  if (words) {
    const month = MONTHS.indexOf(words[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return pad(+words[3], month, +words[1]);
  }

  const wordsFirst = v.match(/^([a-zA-Z]{3,})[ -](\d{1,2}),?[ -](\d{4})$/);
  if (wordsFirst) {
    const month = MONTHS.indexOf(wordsFirst[1].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return pad(+wordsFirst[3], month, +wordsFirst[2]);
  }

  return null;
}

function pad(y: number, m: number, d: number): string | null {
  const s = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidDate(s) ? s : null;
}

export function coerceTags(raw: string): string[] {
  return raw
    .split(/[,;|/]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/^(soc ?2|iso ?27001|hipaa|pci|gdpr|nist|fedramp)$/i.test(t) ? canonTag(t) : t));
}

function canonTag(t: string): string {
  const n = normalize(t);
  const map: Record<string, string> = {
    soc2: "SOC2",
    iso27001: "ISO27001",
    hipaa: "HIPAA",
    pci: "PCI",
    gdpr: "GDPR",
    nist: "NIST",
    fedramp: "FedRAMP",
  };
  return map[n] ?? t;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* -------------------------------------------------------------------------- */
/* Row parsing                                                                */
/* -------------------------------------------------------------------------- */

export type ParsedImportRow = {
  title: string;
  type: ExceptionType;
  description: string;
  compensatingControl: string;
  riskLevel: RiskLevel;
  riskOwnerName: string;
  riskOwnerEmail: string;
  approverName: string;
  approverEmail: string;
  expiryDate: string;
  evidenceUrl: string | null;
  frameworkTags: string[];
};

export type RowResult =
  | { ok: true; row: number; value: ParsedImportRow }
  | { ok: false; row: number; errors: string[] };

export function parseRow(
  cells: readonly string[],
  mapping: ColumnMapping,
  rowNumber: number,
): RowResult {
  const get = (key: ImportField): string => {
    const i = mapping[key];
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };

  const errors: string[] = [];
  const title = get("title");
  if (!title) errors.push("Title is required");

  const expiryRaw = get("expiryDate");
  const expiryDate = coerceDate(expiryRaw);
  if (!expiryRaw) errors.push("Expiry date is required");
  else if (!expiryDate) errors.push(`Could not read expiry date "${expiryRaw}"`);

  const riskOwnerEmail = get("riskOwnerEmail").toLowerCase();
  if (!riskOwnerEmail) errors.push("Risk owner email is required");
  else if (!EMAIL.test(riskOwnerEmail)) errors.push(`"${riskOwnerEmail}" is not an email address`);

  const approverEmail = get("approverEmail").toLowerCase();
  if (approverEmail && !EMAIL.test(approverEmail)) {
    errors.push(`"${approverEmail}" is not an email address`);
  }

  const riskOwnerName = get("riskOwnerName") || nameFromEmail(riskOwnerEmail);
  if (!riskOwnerName) errors.push("Risk owner name is required");

  if (errors.length > 0) return { ok: false, row: rowNumber, errors };

  return {
    ok: true,
    row: rowNumber,
    value: {
      title,
      type: coerceType(get("type")),
      description: get("description"),
      compensatingControl: get("compensatingControl"),
      riskLevel: coerceRiskLevel(get("riskLevel")),
      riskOwnerName,
      riskOwnerEmail,
      approverName: get("approverName") || nameFromEmail(approverEmail) || riskOwnerName,
      approverEmail: approverEmail || riskOwnerEmail,
      expiryDate: expiryDate!,
      evidenceUrl: get("evidenceUrl") || null,
      frameworkTags: coerceTags(get("frameworkTags")),
    },
  };
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0];
  if (!local) return "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

export const IMPORT_TEMPLATE_HEADERS = [
  "Title",
  "Type",
  "Why / description",
  "Compensating control",
  "Risk level",
  "Risk owner name",
  "Risk owner email",
  "Approver name",
  "Approver email",
  "Expiry date",
  "Evidence URL",
  "Framework tags",
];

export const IMPORT_TEMPLATE_ROWS = [
  [
    "Legacy SFTP port 22 open to vendor CIDR",
    "firewall_exception",
    "Vendor batch feed has no API; TLS migration is scheduled for Q3.",
    "Source IP allowlist, session logging to SIEM, quarterly access review",
    "high",
    "Dana Whitfield",
    "dana@example.com",
    "Priya Raman",
    "priya@example.com",
    "2026-09-30",
    "https://jira.example.com/SEC-1841",
    "SOC2;ISO27001",
  ],
  [
    "Contractor admin access to prod billing DB",
    "temp_access_grant",
    "Migration cutover support through end of engagement.",
    "Named account, MFA enforced, all queries logged and reviewed weekly",
    "critical",
    "Marcus Ellery",
    "marcus@example.com",
    "Dana Whitfield",
    "dana@example.com",
    "2026-07-15",
    "",
    "SOC2",
  ],
];
