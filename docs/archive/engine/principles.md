# Principles: the UX bar for Pro Moves

Every spec, build and QA pass in this project is held to this page. The
builder reads it before touching anything a person will see, and QA checks
the result against it.

## The bar

**The `frontend-design` skill. No brand pack yet.**

- Use the `frontend-design` skill for anything visual: layout, type, color,
  spacing, animation, empty and error states.

> No brand pack yet, on purpose. Pro Moves already has its own design system
> (below), and that is the look to stay consistent with. The new Alcan app
> will replace Pro Moves, so a compiled brand pack waits for that.

`frontend-design` fills gaps; the Pro Moves design docs win wherever they
say something.

## Always true

- It works on a phone first, and on a desktop too.
- Plain words on screen. No jargon a user would have to look up.
- Every state is designed: loading, empty, error, and success.
- Nothing ships that the operator could not use without help.

## This project's conventions

Anything specific to this app goes here, or point at the doc that holds it.
Examples: design tokens, icon sizes, component library, copy tone, the
mobile ground rules, accessibility targets.

- `docs/design-system.md`: the canonical page for tokens, type and icon
  scales, motion and identity. Read it before any visual change.
- `promoves-brand/exports/README.md`: the brand kit (Signal P mark, wordmark,
  locked palette). If it and the design system disagree, the kit wins.
- `docs/dev/motion-rules.md` and `docs/dev/token-migration-pattern.md`:
  motion, and how to move a hard-coded color onto a token.
- `docs/specs/mobile-redesign-plan.md`: the mobile ground rules.
- No hard-coded colors. `npm run check:colors` (part of `npm run check`)
  fails the build on one.
- Role names come from `resolve_role_display_name()`, never the raw role
  (an RDA in one org is a Dental Nurse in another). See `docs/glossary.md`.
