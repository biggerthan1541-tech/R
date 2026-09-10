#!/usr/bin/env python3
"""Collect Miami SMB leads from Google Places, then extract public contact emails."""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.robotparser
from collections import OrderedDict

import requests

PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.primaryTypeDisplayName",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
    ]
)

# Miami-Dade core, roughly Aventura down to Cutler Bay.
MIAMI_BIAS = {
    "rectangle": {
        "low": {"latitude": 25.55, "longitude": -80.45},
        "high": {"latitude": 25.98, "longitude": -80.10},
    }
}

DEFAULT_QUERIES = [
    "hvac contractor in Miami, FL",
    "plumber in Miami, FL",
    "electrician in Miami, FL",
    "roofing contractor in Miami, FL",
    "landscaping company in Miami, FL",
    "commercial cleaning service in Miami, FL",
    "auto repair shop in Miami, FL",
    "dental office in Miami, FL",
    "chiropractor in Miami, FL",
    "medical spa in Miami, FL",
    "law firm in Miami, FL",
    "accounting firm in Miami, FL",
    "insurance agency in Miami, FL",
    "real estate agency in Miami, FL",
    "marketing agency in Miami, FL",
    "printing shop in Miami, FL",
    "moving company in Miami, FL",
    "pest control in Miami, FL",
    "catering company in Miami, FL",
    "event venue in Miami, FL",
    "gym in Miami, FL",
    "hair salon in Miami, FL",
    "pet grooming in Miami, FL",
    "boutique clothing store in Miami, FL",
    "coffee roaster in Miami, FL",
]

# National chains and franchises: not the SMBs we are after.
CHAIN_PATTERN = re.compile(
    r"\b(walmart|target|costco|home depot|lowe'?s|cvs|walgreens|starbucks|dunkin|"
    r"mcdonald'?s|burger king|wendy'?s|subway|chipotle|domino'?s|papa john|kfc|"
    r"taco bell|chick-?fil-?a|publix|winn-?dixie|whole foods|trader joe|aldi|"
    r"7-?eleven|bank of america|wells fargo|chase|citibank|truist|pnc bank|"
    r"planet fitness|la fitness|orangetheory|anytime fitness|crunch fitness|"
    r"jiffy lube|midas|pep boys|autozone|o'?reilly|firestone|mavis|"
    r"h&r block|jackson hewitt|geico|state farm|allstate|progressive|"
    r"great clips|supercuts|sport clips|petco|petsmart|ups store|fedex office|"
    r"marriott|hilton|hyatt|holiday inn|best western|re/?max|keller williams|"
    r"coldwell banker|century 21|compass|servpro|roto-?rooter|terminix|orkin)\b",
    re.I,
)

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,24}")

# `logo@2x.png` and friends match the email regex; so do vendor boilerplate addresses.
BAD_TLDS = {
    "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "css", "js", "json",
    "woff", "woff2", "ttf", "eot", "mp4", "webm", "pdf", "zip", "map",
}
BAD_DOMAINS = {
    "example.com", "example.org", "domain.com", "yourdomain.com", "email.com",
    "sentry.io", "sentry-next.wixpress.com", "wixpress.com", "wix.com",
    "squarespace.com", "godaddy.com", "shopify.com", "cloudflare.com",
    "jsdelivr.net", "gstatic.com", "googleapis.com", "w3.org", "schema.org",
    "sentry.wixpress.com", "yoursite.com", "company.com", "acme.com",
}
BAD_LOCALPARTS = {
    "noreply", "no-reply", "donotreply", "do-not-reply", "postmaster",
    "abuse", "webmaster@example", "mailer-daemon", "bounce", "bounces",
    "your", "youremail", "name", "email", "user", "username", "someone",
    "sentry", "hostmaster",
}
# Ranked best-first: a generic business inbox beats a random staff address.
PREFERRED_LOCALPARTS = [
    "info", "contact", "hello", "sales", "office", "admin", "inquiries",
    "enquiries", "support", "team", "service", "bookings", "reservations",
    "frontdesk", "owner", "manager",
]
CONTACT_PATHS = ["", "/contact", "/contact-us", "/contacto", "/about", "/about-us"]

UA = "Mozilla/5.0 (compatible; MiamiLeadResearch/1.0; +contact via site owner)"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def search_places(api_key, query, want, sleep):
    """Text Search with pagination. Returns raw place dicts."""
    out = []
    token = None
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    while len(out) < want:
        body = {"textQuery": query, "pageSize": 20, "locationBias": MIAMI_BIAS}
        if token:
            body["pageToken"] = token
        resp = requests.post(PLACES_ENDPOINT, headers=headers, json=body, timeout=30)
        if resp.status_code != 200:
            log(f"  places error {resp.status_code}: {resp.text[:300]}")
            break
        data = resp.json()
        out.extend(data.get("places", []))
        token = data.get("nextPageToken")
        if not token:
            break
        time.sleep(sleep)
    return out[:want]


def is_smb(place, max_ratings):
    name = (place.get("displayName") or {}).get("text", "")
    if not name or CHAIN_PATTERN.search(name):
        return False
    if place.get("businessStatus") not in (None, "OPERATIONAL"):
        return False
    if not place.get("websiteUri"):
        return False
    if (place.get("userRatingCount") or 0) > max_ratings:
        return False
    return True


def normalize(place):
    return {
        "place_id": place.get("id", ""),
        "business": (place.get("displayName") or {}).get("text", ""),
        "category": (place.get("primaryTypeDisplayName") or {}).get("text", ""),
        "address": place.get("formattedAddress", ""),
        "phone": place.get("nationalPhoneNumber", ""),
        "website": place.get("websiteUri", ""),
        "rating": place.get("rating", ""),
        "review_count": place.get("userRatingCount", ""),
    }


def cmd_collect(args):
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        sys.exit("GOOGLE_MAPS_API_KEY is not set")
    seen = set()
    rows = []
    for query in args.queries or DEFAULT_QUERIES:
        found = search_places(api_key, query, args.per_query, args.sleep)
        kept = 0
        for place in found:
            if place.get("id") in seen or not is_smb(place, args.max_ratings):
                continue
            seen.add(place["id"])
            rows.append(normalize(place))
            kept += 1
        log(f"{query}: {len(found)} results, {kept} kept")
        time.sleep(args.sleep)
    with open(args.out, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row) + "\n")
    log(f"wrote {len(rows)} businesses to {args.out}")


def robots_allows(session, base, path, cache):
    if base not in cache:
        parser = urllib.robotparser.RobotFileParser()
        try:
            resp = session.get(urllib.parse.urljoin(base, "/robots.txt"), timeout=15)
            parser.parse(resp.text.splitlines() if resp.status_code == 200 else [])
        except requests.RequestException:
            parser.parse([])
        cache[base] = parser
    return cache[base].can_fetch(UA, urllib.parse.urljoin(base, path))


def clean_emails(text, site_domain):
    found = OrderedDict()
    for raw in EMAIL_PATTERN.findall(text):
        email = raw.strip(".,;:'\"()<>").lower()
        local, _, domain = email.partition("@")
        tld = domain.rsplit(".", 1)[-1]
        if tld in BAD_TLDS or domain in BAD_DOMAINS or local in BAD_LOCALPARTS:
            continue
        if len(local) > 64 or len(email) > 100:
            continue
        if re.fullmatch(r"[0-9a-f]{16,}", local):
            continue
        rank = (
            PREFERRED_LOCALPARTS.index(local)
            if local in PREFERRED_LOCALPARTS
            else len(PREFERRED_LOCALPARTS)
        )
        # An address on the business's own domain beats a gmail found in a footer.
        on_domain = 0 if site_domain and site_domain in domain else 1
        found.setdefault(email, (on_domain, rank))
    return sorted(found, key=lambda e: found[e])


def scrape_site(session, website, cache, sleep, respect_robots):
    parts = urllib.parse.urlsplit(website)
    if parts.scheme not in ("http", "https"):
        return None, None
    base = f"{parts.scheme}://{parts.netloc}"
    site_domain = parts.netloc.lower().removeprefix("www.")
    for path in CONTACT_PATHS:
        if respect_robots and not robots_allows(session, base, path or "/", cache):
            continue
        url = urllib.parse.urljoin(base, path) if path else website
        try:
            resp = session.get(url, timeout=20, allow_redirects=True)
        except requests.RequestException:
            continue
        if resp.status_code != 200 or "html" not in resp.headers.get("content-type", ""):
            continue
        emails = clean_emails(resp.text[:400_000], site_domain)
        if emails:
            return emails[0], url
        time.sleep(sleep)
    return None, None


def cmd_enrich(args):
    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept": "text/html,*/*"})
    robots_cache = {}
    seen_domains = set()
    results = []
    with open(args.infile, encoding="utf-8") as fh:
        businesses = [json.loads(line) for line in fh if line.strip()]
    for i, biz in enumerate(businesses, 1):
        if len(results) >= args.limit:
            break
        domain = urllib.parse.urlsplit(biz["website"]).netloc.lower().removeprefix("www.")
        if not domain or domain in seen_domains:
            continue
        seen_domains.add(domain)
        email, source = scrape_site(
            session, biz["website"], robots_cache, args.sleep, not args.ignore_robots
        )
        if email:
            biz = dict(biz, email=email, email_source=source)
            results.append(biz)
        log(f"[{i}/{len(businesses)}] {biz['business']}: {email or 'no email found'}")
        time.sleep(args.sleep)
    fields = [
        "business", "category", "email", "phone", "website", "address",
        "rating", "review_count", "email_source", "place_id",
    ]
    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(results)
    log(f"wrote {len(results)} leads with emails to {args.out}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("collect", help="query Google Places for Miami SMBs")
    p1.add_argument("--out", default="businesses.jsonl")
    p1.add_argument("--per-query", type=int, default=60)
    p1.add_argument("--max-ratings", type=int, default=600)
    p1.add_argument("--sleep", type=float, default=2.0)
    p1.add_argument("--queries", nargs="*")
    p1.set_defaults(func=cmd_collect)

    p2 = sub.add_parser("enrich", help="pull public contact emails from their websites")
    p2.add_argument("--infile", default="businesses.jsonl")
    p2.add_argument("--out", default="miami_smb_leads.csv")
    p2.add_argument("--limit", type=int, default=100)
    p2.add_argument("--sleep", type=float, default=1.5)
    p2.add_argument("--ignore-robots", action="store_true")
    p2.set_defaults(func=cmd_enrich)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
