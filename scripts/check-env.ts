/**
 * Fails loudly at deploy time rather than quietly at 08:00 when the cron runs.
 *   npx tsx scripts/check-env.ts
 */
import "./env";

type Check = {
  name: string;
  required: boolean;
  note: string;
  valid?: (value: string) => string | null;
};

const CHECKS: Check[] = [
  {
    name: "DATABASE_URL",
    required: true,
    note: "Neon/Supabase pooled connection string",
    valid: (v) =>
      v.startsWith("postgres://") || v.startsWith("postgresql://")
        ? null
        : "should start with postgres:// or postgresql://",
  },
  {
    name: "AUTH_SECRET",
    required: true,
    note: "openssl rand -base64 32",
    valid: (v) => (v.length >= 32 ? null : "should be at least 32 characters"),
  },
  {
    name: "AUTH_URL",
    required: true,
    note: "canonical app URL — magic links and reminder links point here",
    valid: (v) =>
      v.startsWith("https://") || v.startsWith("http://localhost")
        ? null
        : "should be an https:// URL in production",
  },
  {
    name: "CRON_SECRET",
    required: true,
    note: "bearer secret the daily cron endpoint requires",
    valid: (v) => (v.length >= 16 ? null : "should be at least 16 characters"),
  },
  { name: "AUTH_RESEND_KEY", required: false, note: "Resend API key — without it, nothing is emailed" },
  { name: "RESEND_FROM", required: false, note: "verified sender, e.g. Lapse <lapse@yourdomain.com>" },
  { name: "NEXT_PUBLIC_APP_REGION", required: false, note: "shown on /security" },
  { name: "NEXT_PUBLIC_DB_REGION", required: false, note: "shown on /security" },
  { name: "NEXT_PUBLIC_SECURITY_CONTACT", required: false, note: "shown on /security" },
];

let failures = 0;
let warnings = 0;

for (const check of CHECKS) {
  const value = process.env[check.name];
  if (!value) {
    if (check.required) {
      console.error(`  MISSING  ${check.name} — ${check.note}`);
      failures++;
    } else {
      console.warn(`  unset    ${check.name} — ${check.note}`);
      warnings++;
    }
    continue;
  }
  const problem = check.valid?.(value);
  if (problem) {
    console.error(`  INVALID  ${check.name} — ${problem}`);
    failures++;
  } else {
    console.log(`  ok       ${check.name}`);
  }
}

const dryRun = process.env.DRY_RUN_NOTIFICATIONS === "1" || !process.env.AUTH_RESEND_KEY;
if (dryRun) {
  console.warn("\n  Notifications are in DRY RUN — sign-in links and nags print to the log.");
}

console.log(`\n${failures} problem(s), ${warnings} optional variable(s) unset.`);
process.exit(failures > 0 ? 1 : 0);
