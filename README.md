# Miami SMB Lead Finder

Builds a CSV of small and medium businesses in Miami with a public contact email:
Google Places API (New) for the business list, then each business's own website for
the email it publishes.

Emails are **not** available from Google Maps or the Places API. The only lawful
source is the business's own site, which is what `find_leads.py` reads.

## Setup

1. Create a Google Cloud project, enable **Places API (New)**, and attach billing.
2. Create an API key and restrict it to Places API (New).
3. Install and run:

```bash
pip install -r requirements.txt
export GOOGLE_MAPS_API_KEY="your-key"
python3 find_leads.py --limit 100 --out miami_smb_leads.csv --verbose
```

Output columns: `business, category, address, phone, website, email, email_source`.

Expect roughly 30–50% of businesses to yield an email, so reaching 100 leads means
searching several hundred places. The defaults (42 categories x 3 pages) surface
~1,500 places before filtering, which is comfortably enough.

## Useful flags

| Flag | Default | Purpose |
|---|---|---|
| `--limit` | 100 | Stop once this many businesses have an email |
| `--queries-file` | built-in list | One category per line, replaces the 42 defaults |
| `--max-pages` | 3 | Places pages per category (20 results each, 3 is the API max) |
| `--max-reviews` | 1500 | Drop high-volume places — a rough chain filter |
| `--chain-threshold` | 3 | Drop a domain once this many locations share it |
| `--workers` | 8 | Parallel site fetches |

## Cost

Places Text Search is billed per request, and `websiteUri` sits in a higher-priced
field tier. A full default run is ~126 requests. Check current per-SKU pricing at
https://developers.google.com/maps/billing-and-pricing/pricing before a large run.

## What the script does and does not do

- Reads each site's `robots.txt` and skips paths that disallow this crawler.
- Requests at most 7 pages per site (home plus common contact paths), stopping at
  the first page with an email, with a delay between fetches.
- Discards asset filenames, analytics DSNs and vendor placeholders that match the
  email pattern; prefers an address on the business's own domain, and `info@` /
  `contact@` style mailboxes over personal ones.
- Does not scrape google.com/maps — that is against Google's Terms of Service and
  is also what gets IPs blocked. All business data comes from the official API.

## Before you email anyone

- Google Maps Platform terms limit caching of Places content (30 days for most
  fields; place IDs may be kept). Treat the CSV as a working file, not a database.
- US commercial email must satisfy CAN-SPAM: accurate From/subject lines, a valid
  physical postal address, a working opt-out, and opt-outs honored within 10 days.
- Some of these addresses are sole proprietors, so an owner's personal name in an
  address can be personal data. Honor deletion requests and keep a suppression list.
- A published email is not consent. Volume and relevance are what separate useful
  outreach from spam complaints that will burn your sending domain.
