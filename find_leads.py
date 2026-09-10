#!/usr/bin/env python3
"""Build a Miami SMB lead list: Google Places (New) -> business website -> public email."""

import argparse
import concurrent.futures as futures
import csv
import os
import re
import sys
import time
import urllib.parse
import urllib.robotparser
from collections import Counter
from dataclasses import dataclass, field

import requests

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.primaryTypeDisplayName",
        "places.userRatingCount",
        "places.businessStatus",
        "nextPageToken",
    ]
)

# City of Miami through Miami Beach / Coral Gables.
DEFAULT_BOX = (25.68, -80.35, 25.92, -80.10)

DEFAULT_QUERIES = [
    "accounting firm", "air conditioning repair", "auto repair shop", "bakery",
    "barber shop", "boutique clothing store", "cafe", "catering company",
    "chiropractor", "cleaning service", "coffee shop", "dental clinic",
    "dog grooming", "electrician", "event planner", "family restaurant",
    "florist", "furniture store", "gym", "hair salon", "insurance agency",
    "interior designer", "landscaping company", "law firm", "locksmith",
    "marketing agency", "med spa", "moving company", "nail salon",
    "optometrist", "pest control", "pet store", "photographer", "physical therapy",
    "plumber", "print shop", "real estate agency", "roofing contractor",
    "tattoo studio", "tax preparation", "travel agency", "veterinarian",
]

CONTACT_PATHS = ["", "/contact", "/contact-us", "/contactus", "/about", "/about-us", "/pages/contact"]

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,24}")

# Tracking pixels, asset filenames and vendor placeholders that match the email shape.
JUNK_DOMAINS = {
    "example.com", "domain.com", "yourdomain.com", "email.com", "sentry.io",
    "sentry-next.wixpress.com", "wixpress.com", "godaddy.com", "squarespace.com",
    "wordpress.com", "shopify.com", "cloudflare.com", "schema.org", "w3.org",
}
JUNK_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js", ".ico")
ROLE_PREFERENCE = ["info", "contact", "hello", "office", "sales", "admin", "booking", "reservations"]

UA = "MiamiSMBLeadBot/1.0 (+contact via site owner; respects robots.txt)"


@dataclass
class Place:
    place_id: str
    name: str
    category: str
    address: str
    phone: str
    website: str
    reviews: int
    emails: list = field(default_factory=list)
    source: str = ""


# Two-label public suffixes common enough to matter when comparing an email
# domain against the site it was found on.
TWO_LABEL_SUFFIXES = {"co.uk", "com.au", "co.nz", "com.br", "com.mx", "co.jp", "com.ar", "co.za"}


def registrable(host: str) -> str:
    host = host.lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in TWO_LABEL_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def search_places(api_key, query, box, max_pages, session, verbose):
    low_lat, low_lng, high_lat, high_lng = box
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    body = {
        "textQuery": f"{query} in Miami, Florida",
        "pageSize": 20,
        "locationRestriction": {
            "rectangle": {
                "low": {"latitude": low_lat, "longitude": low_lng},
                "high": {"latitude": high_lat, "longitude": high_lng},
            }
        },
    }

    out, token = [], None
    for _ in range(max_pages):
        if token:
            body["pageToken"] = token
            time.sleep(2)  # next_page_token needs a moment to become valid
        resp = session.post(SEARCH_URL, headers=headers, json=body, timeout=30)
        if resp.status_code != 200:
            print(f"  ! Places API {resp.status_code} for '{query}': {resp.text[:200]}", file=sys.stderr)
            return out
        data = resp.json()
        for p in data.get("places", []):
            if p.get("businessStatus") not in (None, "OPERATIONAL"):
                continue
            if not p.get("websiteUri"):
                continue
            out.append(
                Place(
                    place_id=p.get("id", ""),
                    name=p.get("displayName", {}).get("text", ""),
                    category=p.get("primaryTypeDisplayName", {}).get("text", query),
                    address=p.get("formattedAddress", ""),
                    phone=p.get("nationalPhoneNumber", ""),
                    website=p["websiteUri"],
                    reviews=p.get("userRatingCount", 0) or 0,
                )
            )
        token = data.get("nextPageToken")
        if not token:
            break
    if verbose:
        print(f"  {query}: {len(out)} places with a website")
    return out


def robots_allows(session, base, path):
    rp = urllib.robotparser.RobotFileParser()
    try:
        resp = session.get(urllib.parse.urljoin(base, "/robots.txt"), timeout=10)
        if resp.status_code >= 400:
            return lambda _p: True
        rp.parse(resp.text.splitlines())
    except requests.RequestException:
        return lambda _p: True
    return lambda p: rp.can_fetch(UA, urllib.parse.urljoin(base, p or "/"))


def clean_emails(raw, site_domain):
    keep = []
    for candidate in raw:
        email = candidate.strip(".,;:'\"()<>").lower()
        local, _, domain = email.partition("@")
        if not local or email.endswith(JUNK_SUFFIXES) or len(local) > 64:
            continue
        if domain in JUNK_DOMAINS or registrable(domain) in JUNK_DOMAINS:
            continue
        keep.append(email)

    on_domain = [e for e in keep if registrable(e.split("@")[1]) == site_domain]
    pool = on_domain or keep

    def rank(email):
        local = email.split("@")[0]
        return (ROLE_PREFERENCE.index(local) if local in ROLE_PREFERENCE else len(ROLE_PREFERENCE), len(email))

    seen, ordered = set(), []
    for email in sorted(dict.fromkeys(pool), key=rank):
        if email not in seen:
            seen.add(email)
            ordered.append(email)
    return ordered


def find_email(place, timeout, delay):
    session = requests.Session()
    session.headers["User-Agent"] = UA
    base = place.website
    site_domain = registrable(urllib.parse.urlparse(base).netloc)
    allowed = robots_allows(session, base, "")

    for path in CONTACT_PATHS:
        url = urllib.parse.urljoin(base, path) if path else base
        if not allowed(path):
            continue
        try:
            resp = session.get(url, timeout=timeout, allow_redirects=True)
        except requests.RequestException:
            continue
        if resp.status_code != 200 or "html" not in resp.headers.get("Content-Type", ""):
            continue
        html = resp.text[:400_000]
        raw = EMAIL_RE.findall(html) + [
            urllib.parse.unquote(m) for m in re.findall(r"mailto:([^\"'?>\s]+)", html, re.I)
        ]
        emails = clean_emails(raw, site_domain)
        if emails:
            place.emails = emails
            place.source = url
            break
        time.sleep(delay)
    return place


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--api-key", default=os.environ.get("GOOGLE_MAPS_API_KEY"))
    ap.add_argument("--limit", type=int, default=100, help="stop after this many businesses with an email")
    ap.add_argument("--out", default="miami_smb_leads.csv")
    ap.add_argument("--queries-file", help="one search term per line; overrides the built-in list")
    ap.add_argument("--max-pages", type=int, default=3, help="Places pages per query (20 results each)")
    ap.add_argument("--max-reviews", type=int, default=1500, help="drop places above this review count (chain filter)")
    ap.add_argument("--chain-threshold", type=int, default=3, help="drop domains appearing on this many places")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--timeout", type=float, default=12.0)
    ap.add_argument("--delay", type=float, default=0.5, help="pause between page fetches on the same site")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    if not args.api_key:
        sys.exit("No API key. Set GOOGLE_MAPS_API_KEY or pass --api-key. See README.md.")

    queries = DEFAULT_QUERIES
    if args.queries_file:
        with open(args.queries_file) as fh:
            queries = [line.strip() for line in fh if line.strip() and not line.startswith("#")]

    print(f"Searching {len(queries)} categories across Miami...")
    session = requests.Session()
    places, seen_ids = [], set()
    for query in queries:
        for place in search_places(args.api_key, query, DEFAULT_BOX, args.max_pages, session, args.verbose):
            if place.place_id in seen_ids:
                continue
            seen_ids.add(place.place_id)
            places.append(place)

    domain_counts = Counter(registrable(urllib.parse.urlparse(p.website).netloc) for p in places)
    candidates = [
        p
        for p in places
        if p.reviews <= args.max_reviews
        and domain_counts[registrable(urllib.parse.urlparse(p.website).netloc)] < args.chain_threshold
    ]
    print(f"{len(places)} unique businesses, {len(candidates)} look like SMBs. Checking websites for public emails...")

    rows, seen_emails = [], set()
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending = [pool.submit(find_email, p, args.timeout, args.delay) for p in candidates]
        for done in futures.as_completed(pending):
            place = done.result()
            if not place.emails:
                continue
            email = place.emails[0]
            if email in seen_emails:
                continue
            seen_emails.add(email)
            rows.append(place)
            if args.verbose:
                print(f"  [{len(rows)}/{args.limit}] {place.name} -> {email}")
            if len(rows) >= args.limit:
                for f in pending:
                    f.cancel()
                break

    with open(args.out, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["business", "category", "address", "phone", "website", "email", "email_source"])
        for p in rows:
            writer.writerow([p.name, p.category, p.address, p.phone, p.website, p.emails[0], p.source])

    print(f"Wrote {len(rows)} leads to {args.out}")
    if len(rows) < args.limit:
        print("Fewer than requested: widen --queries-file, raise --max-pages, or relax the chain filters.")


if __name__ == "__main__":
    main()
