# Design system in the app

The app's look comes from the owner's design system (`ak-design-system/`, kept outside git). Only its tokens are copied into the code; its `ak-` classes and React components are not. Screens are built with Tailwind utilities on these tokens plus shadcn/ui components restyled with them.

## Files

| File | What |
|---|---|
| `tokens.css` | Token values copied from `ak-design-system/tokens/tokens.json`, plus app tokens marked `app` |
| `../app/globals.css` | Maps tokens to Tailwind (`@theme inline`), the base styles (focus ring, selection) and the `aurora` utility |
| `../app/layout.tsx` | Brand fonts through `next/font/google`: Wix Madefor Display (headings) and Manrope (text), both with Cyrillic |
| `../lib/utils.ts` | `cn()`; lists the custom token names so tailwind-merge keeps `text-button` next to `text-ink` |

## How tokens reach the markup

- Colours, spacing and sizes are plain variables on `:root` in `tokens.css`; `globals.css` maps them to utilities: `bg-surface`, `text-teal-deep`, `gap-grid`, `px-gutter-fluid`, `max-w-narrow`
- Radius, shadow, easing and type styles are theme variables (`@theme` in `tokens.css`), so each one is both a CSS variable and a utility: `rounded-pill`, `shadow-photo`, `ease-spring`, `text-page-title`
- Tailwind's default palette is switched off (`--color-*: initial`): only token colours compile
- shadcn semantic colours point at tokens (`primary` → `accent`, `muted-foreground` → `muted`, `destructive` → `danger`, `ring` → `teal-deep`). `accent` and `muted` follow shadcn's meaning in utilities: `bg-muted` is a quiet fill, `text-muted-foreground` is the secondary text colour

## App tokens (not in the design system)

| Token | Value | Why |
|---|---|---|
| `--content-narrow` | 760px | Column of the contact card and forms |
| `--gutter-fluid` | `clamp(20px, 5vw, 52px)` | Page side padding, the clamp from the `gutter` usage note |
| `--text-page-title`, `--text-empty-title`, `--text-notes-title` | fluid `clamp()` | Titles of app screens |
| `--text-meta` | 14.5px | Secondary text in list rows |
| `--text-field` | 16px / 1.5 | Field text as in `TextField`; keeps a field 52px tall like a button |

When the design system gets one of these, take its name and value and drop the local one.

## Shared pieces

- `components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`: shadcn components restyled with tokens. Variants keep shadcn names: `default` = the one gold primary action per view, `outline` = secondary, `ghost` = text action, `size="icon"` = round arrow
- `components/page-shell.tsx`: page column (`wide` 1180 / `narrow` 760) and the optional `aurora` wash
- `components/field-error.tsx`: error under a field — `circle-alert` icon + words in `danger`
- `components/back-link.tsx`: "‹ back" link above a page title
- `components/ui/alert-dialog.tsx`: shadcn alert dialog on the design system's dialog mapping — `surface` card, `line` border, `radius-contact`, `header-glass` backdrop with blur. No `Action`: confirm with a submit button in a form, so the dialog stays open while it sends
- `components/close-button.tsx`: round 44px close button (dialog, toast), `teal-deep` on `teal-soft` on hover

## Rules

- No literal colour, radius or shadow outside `tokens.css`; add a token instead
- One gold (`default`) button per view; gold leads, teal marks what is interactive or alive; every glow is gold
- Readable text passes 4.5:1: secondary text is `muted`, readable teal is `teal-deep`, never `accent` or `teal` as text
- Errors use `danger` with an icon and words, never colour alone
- Keyboard focus: 2px `teal-deep`, 3px offset (`danger` on an invalid field). A component with `outline-none` must add `focus-visible:outline-solid`: in Tailwind v4 `outline-none` turns the outline style off

## Updating from a new design system package

1. Compare the new `ak-design-system/tokens/tokens.json` and `tokens.css` with `tokens.css` here; copy changed values
2. If fonts changed: update `next/font` in `app/layout.tsx` (subsets `latin` + `cyrillic`) and `--font-display` / `--font-sans` in `globals.css`
3. Update the copies in `design/vendor/` used by the mockups
4. Check colour or radius changes with the owner before applying them
