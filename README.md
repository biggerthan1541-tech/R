# Scrollstop Media — landing page

Single-page, conversion-focused landing page for a Meta (Facebook & Instagram) ads
service, plus a privacy policy page. No build step, no dependencies.

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Before you go live

Three things must be changed or the site ships broken. Everything else is cosmetic.

1. **Formspree endpoint** — `FORMSPREE_ENDPOINT` in `assets/main.js`. Create a free form
   at [formspree.io](https://formspree.io) and paste its URL (`https://formspree.io/f/xxxxxxxx`).
   Until you do, the form refuses to submit and shows the visitor an error telling them
   to email instead, so no enquiry is silently lost.
2. **Booking URL** — `BOOKING_URL` in `assets/main.js`, used by every "Book a Free Audit"
   button. The same URL is hard-coded in each `href` as a no-JS fallback, so also
   find/replace `cal.com/scrollstop-media/free-audit`.
3. **Domain** — `scrollstopmedia.com` appears in the canonical URL, Open Graph and Twitter
   tags, JSON-LD, `robots.txt`, and `sitemap.xml`. Find/replace it with your real domain
   or link previews and search listings will point at the wrong place.

## Files

```
index.html          the landing page
privacy.html        privacy policy
assets/styles.css   design tokens + all styling
assets/main.js      config, CTAs, mobile menu, video, reveals, stat count-up, form
assets/og-image.png 1200x630 social share card
assets/favicon.svg  browser icon
assets/fonts/       self-hosted Inter (woff2) + its OFL licence
robots.txt          crawler rules + sitemap pointer
sitemap.xml         both pages
netlify.toml        publish dir, security headers, cache policy
```

## Swapping the placeholder content

| What | Where |
|---|---|
| Stats | `data-count`, `data-prefix`, `data-suffix`, `data-decimals` on each `.stat__num`. The visible text is the no-JS fallback — update both. |
| Testimonials | The six `.quote` cards. All six are invented; replace before launch. |
| Social proof line | Two `.proof__text` blocks (hero + final CTA). |
| Video | `data-embed` on `.video__facade` — replace `VIDEO_ID`. While it says `VIDEO_ID` the play button does nothing rather than loading a broken frame. |
| Client avatars | `.avatar` elements use `--a` (background) + `data-initials`. Replace with `<img>` when you have real photos. |
| Email / social | `.footer__col` links, the `mailto:` in `assets/main.js` error messages, and `privacy.html`. |
| Business details | The bracketed `[...]` notes in `privacy.html` — registered name and postal address. |

## Notes

- Mobile-first; verified with no horizontal overflow from 320px up.
- Inter is self-hosted from `assets/fonts/` — one variable file per subset covering
  weights 400-800, with a system fallback stack. The page makes no third-party
  requests at all, so no visitor IP reaches Google or any other outside service.
  The font is SIL OFL 1.1 licensed; `assets/fonts/OFL.txt` must ship with it.
- The form validates on submit, then re-validates a field as you fix it. Success and
  error states are announced via `aria-live`.
- A honeypot field (`_gotcha`) catches basic spam bots; Formspree also does its own filtering.
- Animations are skipped entirely under `prefers-reduced-motion`.
