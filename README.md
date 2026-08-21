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
│   ├── useReveal.js        IntersectionObserver fade/slide-in
│   └── useMediaQuery.js
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
