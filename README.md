# VELO

A responsive e-commerce landing page for VELO, a fictional performance running
brand. React + Vite + Tailwind CSS v4.

> VELO is invented for this project. No real brand marks, slogans, product
> photography or product silhouettes are used — every visual is drawn in
> SVG/CSS and all catalogue data is dummy data.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve the production bundle
npm run lint
```

## Design language

| Token | Value | Use |
|---|---|---|
| `ink` | `#0B0B0B` | Type, dark sections |
| `paper` | `#FFFFFF` | Page ground |
| `fog` | `#F2F2F2` | Product tiles, perks strip |
| `ash` | `#6E6E6E` | Secondary labels |
| `signal` | `#FF3D00` | The one accent — fills, rules, icons, display type |
| `signal-ink` | `#D93000` | Small orange **text** on white |

Two orange steps exist for contrast reasons: `#FF3D00` on white is 3.6:1, which
clears WCAG AA for large display type and UI graphics but not for 11–16px
labels. Those use `signal-ink` (4.8:1). The primary CTA keeps the brand orange
as its fill and takes near-black type, matching the marquee.

Type is Archivo Black (uppercase display, horizontally condensed ~6% via the
`.display` class) over Inter for body copy. Both are self-hosted from
`public/fonts` — latin + latin-ext woff2 subsets, under the SIL OFL (see
`public/fonts/OFL.txt`). No third-party font requests.

## Structure

```
src/
├── App.jsx                 page composition + skip link
├── index.css               Tailwind theme tokens, keyframes, reduced-motion
├── fonts.css               generated @font-face rules
├── data/catalog.js         all dummy content (nav, products, terrain, perks…)
├── hooks/
│   └── useReveal.js        IntersectionObserver fade/slide-in
└── components/
    ├── PromoBar.jsx        slim announcement bar
    ├── Nav.jsx             sticky nav + mobile drawer
    ├── Hero.jsx            full-height hero, floating spec stats
    ├── SpeedStreaks.jsx    animated hero motion trails
    ├── Marquee.jsx         stadium-LED ticker
    ├── Terrain.jsx         "Shop by terrain" grid
    ├── CategoryTile.jsx    tile + CSS-drawn terrain art
    ├── Lineup.jsx          horizontal product rail
    ├── ProductCard.jsx     card + favourite toggle
    ├── ShoeArt.jsx         SVG shoe stand-in, 7 colourways
    ├── Editorial.jsx       carbon-plate story + cutaway diagram
    ├── Perks.jsx           shipping / returns / early access
    ├── Footer.jsx          link columns, region select, socials
    └── Icons.jsx
```

`public/og-image.png` is the social preview card (1200×630), generated from the
page's own type and palette.

## Accessibility notes

- Skip link is the first focusable element; visible 3px `signal` focus ring
  everywhere.
- The mobile drawer lives outside `<header>` (the header's `backdrop-blur`
  would otherwise become the containing block for its `position: fixed`), is
  `inert` while closed, takes focus on open and hands it back on close, and
  closes on Escape.
- Heading outline is a single `h1` followed by section `h2`s and item `h3`s.
  The perks strip is a `<dl>`.
- Decorative SVG is `aria-hidden`; every icon-only control has an `aria-label`.
- `prefers-reduced-motion: reduce` stops the marquee, hides the hero streaks
  and collapses every transition; the scroll reveals resolve to visible
  immediately rather than leaving content hidden.
- Anchor targets carry `scroll-mt` so they clear the sticky nav.

Verified on the production bundle at 360/390/768/1024/1280/1440/1920: no
horizontal overflow, no console errors, no failed requests, every scroll reveal
resolving to visible, and every interactive control carrying an accessible name.

## Responsive notes

The hero goes two-column at `xl`, not `lg`. Between 1024 and 1279 the art
column is too narrow for the floating spec stats to clear the shoe and the CTAs
wrap mid-phrase, so that range keeps the single-column stack. Below `sm` the
stats drop out of the overlay entirely and sit in a three-up row beneath the
shoe.
