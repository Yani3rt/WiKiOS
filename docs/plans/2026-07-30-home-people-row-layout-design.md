# Home People Row Layout Design

## Goal

Make People rows easier to scan and align their backlink treatment with Highly connected.

## Approved treatment

- Keep the avatar on the left.
- Place the person's name immediately to the avatar's right and center it vertically.
- Remove the backlink subtext beneath the name.
- Place the backlink count in the same soft-accent pill used by Highly connected.
- Place a decorative `ChevronRight` immediately after the pill.
- Keep the pill and chevron aligned at the far right.
- Truncate long names so trailing content remains visible.

## Scope

The change affects only People rows. Section headers, list dividers, other row types, navigation, avatars, and hover-card behavior remain unchanged.

## Accessibility

- Keep the full backlink count as visible text in the pill.
- Mark the chevron decorative because the row is already a descriptive link.
- Preserve the person's name as the primary link text.

## Verification

- Assert People markup contains the pill and chevron treatment.
- Assert the old backlink subtext layout is absent.
- Run Homepage tests, typecheck, lint, and the full suite.
- Use the populated server-render fixture because the current live vault may omit People.
