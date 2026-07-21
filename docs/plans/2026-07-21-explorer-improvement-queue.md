# Explorer Improvement Queue

Work through this list sequentially. Complete exactly one task, then wait for the user to say **Next** before starting the following task.

## Constraints

- Preserve the intentional five-tab limit and automatic oldest-tab eviction.
- Prefer `pnpm` for project commands.
- Do not add production dependencies without confirmation.

## Queue

- [x] **1. Mobile reading order and touch targets**
  - Put the selected note's content before relationship visualizations on narrow screens.
  - Collapse mobile relationships behind a compact, labeled disclosure.
  - Bring relevant mobile controls up to comfortable touch-target sizing.
  - Verified with focused tests, the full 164-test suite, lint, typecheck, and production build.

- [x] **2. Neutral, tool-like visual normalization**
  - Reduce pastel gradients, decorative glows, and ornamental pill styling in Explorer chrome.
  - Keep the reading surface clear and calm while making controls feel more like a focused tool.
  - Verified with contrast checks, the detector, the full 165-test suite, lint, typecheck, and production build.

- [x] **3. Actionable note error recovery**
  - Add Retry and return-to-tree actions for failed or missing notes.
  - Announce errors accessibly without discarding the failed tab.
  - Verified with rendered-state coverage, the detector, the full 166-test suite, lint, typecheck, and production build.

- [x] **4. Tree density and redundant navigation**
  - Reduce initial tree expansion so users begin with a clearer overview.
  - Simplify redundant home/navigation actions on constrained layouts.
  - Verified with focused regression coverage, the detector, the full 168-test suite, lint, typecheck, and production build.

- [ ] **5. Final polish and re-critique**
  - Verify responsive behavior, focus states, contrast, touch targets, lint, tests, and build.
  - Re-run `/critique` and compare the result with the 25/40 baseline.

## Current Task

Task 5 is next. Do not start it until the user says **Next**.
