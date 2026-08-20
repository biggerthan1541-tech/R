# Scrollstop Media — landing page

Single-page, conversion-focused landing page for a Meta (Facebook & Instagram) ads
service. No build step, no dependencies — open `index.html` or serve the folder.

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Files

```
index.html          all page content
assets/styles.css   design tokens + all styling
assets/main.js      CTA links, mobile menu, video embed, scroll reveals, stat count-up
```

## Swapping the placeholder content

| What | Where |
|---|---|
| Booking link (all 4 CTAs) | `BOOKING_URL` at the top of `assets/main.js`. The same URL is hard-coded in each `href` as a no-JS fallback — find/replace `cal.com/scrollstop-media/free-audit`. |
| Accent color | `--accent` (and `--accent-soft`) in `:root`, `assets/styles.css`. |
| Stats | The `data-count`, `data-prefix`, `data-suffix`, `data-decimals` attributes on each `.stat__num` — the visible text is the no-JS fallback, so update both. |
| Testimonials | The six `.quote` cards. |
| Social proof line | Two `.proof__text` blocks (hero + final CTA). |
| Video | `data-embed` on `.video__facade` — any embed URL works; the iframe is only created on click, so nothing third-party loads on page view. |
| Client avatars | `.avatar` elements use `--a` (background) + `data-initials`. Replace with `<img>` when real photos exist. |
| Email / social | `.footer__col` links. |

## Notes

- Mobile-first; single breakpoint set at 1000px / 860px / 620px.
- One webfont (Inter) with a system fallback stack; everything else is inline SVG.
- Animations are skipped entirely under `prefers-reduced-motion`.
