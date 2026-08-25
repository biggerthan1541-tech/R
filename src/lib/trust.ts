/**
 * Facts stated on /security. Keep this in step with how the app is actually
 * deployed — it is the page a prospect's security team will read.
 */
export const TRUST = {
  appRegion: process.env.NEXT_PUBLIC_APP_REGION ?? "Unset — see README",
  databaseRegion: process.env.NEXT_PUBLIC_DB_REGION ?? "Unset — see README",
  contactEmail: process.env.NEXT_PUBLIC_SECURITY_CONTACT ?? "security@example.com",
  lastReviewed: process.env.NEXT_PUBLIC_TRUST_REVIEWED ?? "2026-08-25",
} as const;

export const SUBPROCESSORS = [
  {
    name: "Vercel",
    purpose: "Application hosting and the daily expiry cron",
    data: "Request metadata, application logs",
  },
  {
    name: "Neon",
    purpose: "Managed Postgres — the register itself",
    data: "All workspace data: exceptions, events, members",
  },
  {
    name: "Resend",
    purpose: "Sign-in links and expiry reminders",
    data: "Recipient email address, exception title and expiry date",
  },
  {
    name: "Slack (optional)",
    purpose: "Reminder delivery, only if a workspace configures a webhook",
    data: "Exception title, owner name, risk level",
  },
] as const;
