## Summary

<!-- What changed and why. Lead with the problem, not the diff. -->

## Changes

<!-- The substantive changes. Group by module where it helps. Skip renames and
     formatting noise — the diff already shows those. -->

-

## Verification

Both gates must pass before review:

- [ ] `npm run lint` — clean (`noUnusedLocals` / `noUnusedParameters` mean unused imports fail)
- [ ] `npm run build` — production bundle compiles

For UI changes, a screenshot that renders is not the same as a screen without
runtime errors. Drive the real app and collect `pageerror` / `console.error`:

- [ ] Exercised in the browser through the persona picker, no console errors
- [ ] Checked in both light and dark themes
- [ ] Checked at mobile width — no horizontal page scroll

<!-- Say what you actually ran, and paste anything that failed. If a check was
     skipped, say which and why. -->

## Conventions

Tick what applies; delete the rest.

- [ ] State changes go through `src/lib/actions.ts`, not inline `update()` in a page,
      so audit entries, notifications, tasks and automation fire consistently
- [ ] Permissions are resolved **before** data is read — `can(...)` for capability,
      `visibleIds(module)` for scope. Filter then aggregate, never compute over
      everything and hide the result
- [ ] Unreachable modules render `<PermissionDenied />` rather than an empty state
- [ ] Colours use semantic tokens (`bg`, `surface`, `ink`, `muted`, brand scales),
      and chart series use `seriesColor(i)` — ad-hoc colours break the validated
      colour-vision palette and the dark theme
- [ ] Seed data stays deterministic **and date-independent** — it is generated
      relative to "today" and must work on any calendar day
- [ ] `DB_VERSION` bumped in `src/lib/seed/index.ts` if the seed shape changed

## Risk

<!-- What could break, and what a reviewer should look at hardest. "None" is a
     valid answer when it is true. Call out anything touching payroll
     calculation, the validation gate, or permission scopes — those carry the
     most blast radius. -->

## Screenshots

<!-- Before / after for visual changes. Both themes if the change touches colour. -->
