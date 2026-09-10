# Miami SMB Lead Builder

Builds a CSV of small/medium Miami businesses with a public contact email, in two stages.

## Why two stages

The Google Places API **does not return email addresses** — there is no email field in
the schema. It returns name, address, phone, and `websiteUri`. Emails have to come from
the business's own website, which is why `enrich` exists.

## Setup

```bash
pip install -r requirements.txt
export GOOGLE_MAPS_API_KEY="..."   # Places API (New) enabled in Google Cloud
```

## Run

```bash
# 1. ~25 category queries across Miami-Dade -> businesses.jsonl
python3 miami_leads.py collect

# 2. visit each site, pull the best public contact email -> miami_smb_leads.csv
python3 miami_leads.py enrich --limit 100
```

Expect stage 1 to yield several hundred businesses and stage 2 to convert roughly
30–50% of them, so a few hundred candidates comfortably clears 100 emails. Raise
`--per-query` or add `--queries "..."` if it comes up short.

## What counts as an SMB

`is_smb()` keeps a place only if it is operational, has a website, is not on the
national-chain blocklist, and has at most `--max-ratings` reviews (default 600, a rough
proxy for independent rather than large/regional).

## Email selection

Each site is checked at `/`, `/contact`, `/contact-us`, `/contacto`, `/about`,
`/about-us`. Candidates are filtered (asset filenames like `logo@2x.png`, placeholder
domains, Sentry/Wix boilerplate, `noreply@`) and ranked: an address on the business's
own domain beats an off-domain one, and a generic inbox (`info@`, `contact@`, `sales@`)
beats a random staff address. One email per business, one business per domain.

`robots.txt` is honored by default; `--ignore-robots` disables that.

## Cost and rate limits

Stage 1 is billed per Places Text Search request (~75 requests for the default query
set — check current Google Maps Platform pricing). Stage 2 is free but slow: it sleeps
`--sleep` seconds (default 1.5) between requests to stay polite.

## Before you email the list

These are scraped business addresses, not opt-ins. US commercial email must carry a
real physical postal address and a working unsubscribe (CAN-SPAM); some of these
businesses will have EU/UK contacts where consent rules are stricter. Sending from your
primary domain at volume without warmup will hurt its deliverability — use a separate
sending domain.
