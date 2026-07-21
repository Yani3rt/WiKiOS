# WikiOS Home Committed Color Design

## Goal

Give the Home page noticeably more personality without undoing its search-first, utilitarian information architecture or reintroducing the pastel AI-template styling removed in the previous pass.

## Chosen Direction

Use a **committed deep-teal search band**. Teal owns the header and primary search area, while the note discovery area remains a quiet, lightly teal-tinted reading surface. Color communicates hierarchy and wayfinding rather than decorating every section.

## Palette

All new Home colors use OKLCH and remain scoped under `.home-shell`.

| Role | Token direction | Purpose |
|---|---|---|
| Hero | Deep teal | Owns the header, introduction, and search controls |
| Hero ink | Near-white tinted toward teal | Primary text on the hero |
| Hero muted | Light desaturated teal | Supporting copy and passive status |
| Accent | Medium deep teal | Links, section headings, focus, and active actions |
| Accent soft | Pale teal wash | Hover, avatar, and icon backgrounds |
| Canvas | Very light teal-tinted neutral | Keeps the content area cohesive without feeling drenched |
| Surface | Near-white teal-tinted surface | Search results and navigation destinations |
| Success | Forest green | Successful index refresh only |
| Error | Rust | Search and index failure only |

## Application

1. Wrap the Home header and primary search area in a solid deep-teal band occupying roughly the top third of the first desktop viewport.
2. Keep the search input near-white so it remains the strongest visual anchor.
3. Render note count, refresh action, and Command-K hint with hero-specific high-contrast tokens.
4. Place the three destination links directly below the hero so they visually bridge the hero and content canvas.
5. Give destination links restrained teal icon wells for faster recognition: Browse notes, Graph, and Stats.
6. Use accent-colored section headings, links, focus rings, and avatars in the discovery area. Do not assign random colors to sections.
7. Use semantic success and error colors only when those states are present.

## Explicit Non-Goals

- No gradients.
- No glassmorphism or backdrop blur.
- No glow effects.
- No colored side rails.
- No restored teal/peach/lavender cycling.
- No decorative page-load animation.
- No changes to note reading, Explorer, Graph, or Stats visual systems.

## Responsive Behavior

- Desktop keeps a generous teal search band and three-column destination row.
- Mobile uses a shorter teal band, full-width search, stacked destinations, and the same semantic color roles.
- Touch targets remain at least 44px.
- Long titles and counts retain the existing overflow protections.

## Accessibility

- Body text must remain at least 4.5:1 against its active surface.
- Large hero text and interactive UI boundaries must remain at least 3:1.
- Focus stays a solid visible ring, not color alone.
- Success and error states keep explicit text and roles in addition to color.
- Reduced-motion behavior remains unchanged.

## Verification

- Calculate contrast for every new text/surface pair.
- Run the Impeccable detector on Home markup.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Inspect desktop and mobile browser rendering when browser policy permits; otherwise document the fallback evidence.
