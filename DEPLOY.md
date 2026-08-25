# Deploying Lapse

Roughly 20 minutes end to end. Three accounts are needed — Vercel, Neon, Resend
— and all three have a free tier that comfortably covers a pilot.

## 1. Database (Neon)

1. Create a project at [neon.tech](https://neon.tech). Pick the region closest to
   your users and note it — it goes on the `/security` page.
2. Copy the **pooled** connection string (the one containing `-pooler`).
   Serverless functions open and drop connections constantly; the pooled endpoint
   is what survives that.

## 2. Email (Resend)

1. Create an API key at [resend.com](https://resend.com).
2. Verify the domain you will send from and set `RESEND_FROM` to an address on
   it, e.g. `Lapse <lapse@yourdomain.com>`.

Until a domain is verified you can send only to your own address. That is enough
to click through the product, but reminders to teammates will bounce — verify the
domain before a pilot.

## 3. Deploy (Vercel)

Import the repository at [vercel.com/new](https://vercel.com/new), then set these
in **Settings → Environment Variables** for Production:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://<your-domain>` — the canonical URL |
| `AUTH_RESEND_KEY` | Resend API key |
| `RESEND_FROM` | `Lapse <lapse@yourdomain.com>` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_REGION` | e.g. `Washington, D.C., USA (iad1)` |
| `NEXT_PUBLIC_DB_REGION` | e.g. `AWS us-east-1` |
| `NEXT_PUBLIC_SECURITY_CONTACT` | e.g. `security@yourdomain.com` |

Do **not** set `DRY_RUN_NOTIFICATIONS` in production — with it set, nothing is
ever emailed.

`AUTH_URL` must be the canonical domain. Every sign-in link and every reminder
link is built from it, so if it points at a preview URL those links will land in
the wrong place.

## 4. Migrate and seed

From a machine with the production `DATABASE_URL` exported:

```bash
npm run check-env      # catches a missing or malformed variable before it bites
npm run db:migrate     # creates the schema
npm run db:seed        # optional: a demo workspace with 11 sample exceptions
```

`SEED_EMAIL` decides which account owns the demo workspace. Set it to the address
you will sign in with, or skip the seed entirely and create a workspace from the
UI on first sign-in.

## 5. Confirm the cron

`vercel.json` registers the daily sweep at 08:00 UTC. After the first production
deploy, check **Vercel → Project → Cron Jobs** shows `/api/cron/daily` scheduled.
Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once that variable
is set.

Trigger it by hand to confirm:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily
# {"date":"...","scanned":9,"statusChanges":5,"nagsSent":5,"errors":[]}
```

Without the header it must return `401`. Check that too.

> Cron jobs run only on **production** deployments, and on Vercel's Hobby plan
> they are limited to once per day — which is exactly what this schedule needs.

## 6. Smoke test the deployment

1. `/security` renders and shows your real regions.
2. Sign in with a magic link.
3. Create a workspace; the empty state appears.
4. Invite a teammate as **Approver**; they receive the invitation email.
5. Log an exception with an expiry a few days out.
6. Run the cron by hand (above); the risk owner and approver each get a reminder.
7. Open the reminder link from a browser with no session — it signs you in and
   lands on the exception.
8. Export the register as PDF and CSV.

## Post-deploy notes

- **Separation of duties is on by default.** Whoever logs an exception cannot
  renew, extend, close or reopen it. If you seed the demo data and sign in as
  `SEED_EMAIL`, the "Contractor admin access to prod billing database" record is
  deliberately authored by you so you can see the block.
- **Reminder links are bearer secrets.** They sign the recipient in and expire
  after 45 days. A forwarded reminder grants workspace access — worth saying out
  loud during a pilot.
- **Backups** are Neon's point-in-time restore; the default retention on the free
  tier is short. Check it matches what `/security` claims before you send that
  page to anyone.
