# Scrollstop Media — landing page

Single-page, conversion-focused landing page for a Meta (Facebook & Instagram) ads
service, plus a privacy policy page. No build step, no dependencies.

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Before you go live

Nothing blocks launch. These are live-but-improvable.

1. **Domain** — every absolute URL currently reads `your-domain.example`, a reserved TLD
   that can never resolve. It appears in the canonical tag, Open Graph and Twitter tags,
   JSON-LD, `robots.txt`, and `sitemap.xml`. Find/replace it with the real domain — or,
   once deployed, the `*.netlify.app` URL — or link previews will show no image and
   search engines will be told the page lives somewhere that does not exist.
2. **Booking link** (optional) — `BOOKING_URL` in `assets/main.js` is `#contact`, so every
   "Book a Free Audit" button scrolls to the form. That works as-is. Paste a cal.com or
   Calendly URL there and all four CTAs switch to it. The same value is repeated in each
   `href` as a no-JS fallback, so find/replace `#contact` on the `data-book` links too.
3. **X / Twitter** (optional) — Instagram and LinkedIn are linked from the footer and
   listed in the JSON-LD `sameAs`. No X account was supplied; add one in both places
   if it exists.

## Files

```
index.html          the landing page
privacy.html        privacy policy
assets/styles.css   design tokens + all styling
assets/main.js      config, CTAs, mobile menu, video, scroll reveals, contact form
assets/og-image.png 1200x630 social share card
assets/favicon.svg  browser icon
assets/fonts/       self-hosted Inter (woff2) + its OFL licence
robots.txt          crawler rules + sitemap pointer
sitemap.xml         both pages
netlify.toml        publish dir, security headers, cache policy
```

## Swapping the placeholder content

The contact form is wired to `https://formspree.io/f/myegojgn`. Confirm the first
submission in your inbox — Formspree emails a one-time confirmation link that must be
clicked before it starts delivering.

| What | Where |
|---|---|
| Video | `data-embed` on `.video__facade` — replace `VIDEO_ID`. While it says `VIDEO_ID` the play button does nothing rather than loading a broken frame. |
| Email and social links | `.footer__col` and `.contact__alt` links, the `mailto:` in `assets/main.js` error messages, and `privacy.html`. |

## Honesty constraints

The site deliberately makes **no claims about past results** — no client count, no
spend figure, no ROAS, no testimonials. It is positioned around method and a founding
client offer instead. If you add results later, add them only where you can evidence
them from account data, and add the testimonial with the client's written permission.
The share image (`assets/og-image.png`) carries copy too — if you change the pitch,
regenerate it, or link previews will contradict the page.

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
