---
target: "Home Page at http://localhost:5211/"
total_score: 25
p0_count: 0
p1_count: 2
timestamp: 2026-07-21T17-47-03Z
slug: src-client-routes-home-route-tsx
---
Method: dual-agent (A: home_design_review · B: home_detector_review)

# WikiOS Home Page Critique

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Search loading and refresh busy states exist, but reindex completion/failure is not announced and navigation lacks current-location state. |
| 2 | Match System / Real World | 3 | Knowledge-oriented groups fit the audience, but “articles,” “notes,” “pages,” “connections,” and “backlinks” fragment the mental model. |
| 3 | User Control and Freedom | 3 | Search can be reset, but there is no explicit clear/return-to-browse action and the refresh/reindex control obscures what it does. |
| 4 | Consistency and Standards | 2 | The arrow-up search button looks actionable but submit only prevents default; terminology also drifts. |
| 5 | Error Prevention | 3 | Debouncing, aborts, and setup redirection are sound; ambiguous refresh semantics still invite mistakes. |
| 6 | Recognition Rather Than Recall | 3 | Main destinations and browse groups are visible, but the global Command-K accelerator is undiscoverable from Home. |
| 7 | Flexibility and Efficiency | 3 | Instant search and a command palette support experts, but results are flat and the visible submit control adds no efficiency. |
| 8 | Aesthetic and Minimalist Design | 2 | Search has priority, but glass, gradients, glows, rails, pills, repeated cards, and staggered entrances compete with the notes. |
| 9 | Error Recovery | 2 | Search errors are understandable but provide no Retry; refresh failure is swallowed. |
| 10 | Help and Documentation | 1 | The page does not explain Graph versus Explorer, the connection counts, or a useful first query. |
| **Total** |  | **25/40** | **Acceptable — significant improvements needed.** |

## Anti-Patterns Verdict

### Does this look AI-generated?

**Yes.** The product structure is relevant, but its styling is the saturated “calm editorial AI app” formula: Playfair on a cream surface, a pastel teal/peach/lavender triad, gradient brand text, glass cards, pill controls, glowing dots, tracked uppercase section labels, colored card rails, and staggered reveals. If someone said “AI made this,” the Home page would make that claim easy to believe.

The source crosses several explicit Impeccable bans:

- Gradient-clipped hero text in `src/components/search-box.tsx:268`.
- 4px side-stripe accents on Featured and Recent cards in `src/components/homepage-content.tsx`.
- Default glassmorphism in `.surface` and `.surface-raised`, including border-plus-wide-shadow ghost cards.
- Four repetitions of the tiny uppercase tracked eyebrow plus glowing dot.
- Multiple similar rounded card grids and decorative 60–420ms stagger choreography.
- Display serif used for product labels, result titles, chips, and person names.
- A fluid hero up to 8rem, which exceeds the shared 6rem ceiling and conflicts with the product register’s fixed type scale.

### Deterministic scan

Assessment B scanned six markup-bearing TSX files and found **1 warning**: `gradient-text` at `src/components/search-box.tsx:268` (`bg-clip-text + bg-gradient`). This is a true positive and directly agrees with the design review. The detector did not flag the broader glass/card/glow/rail pattern, which remains visible in source and demonstrates the detector’s intentionally narrow syntactic scope.

### Visual overlays

No reliable user-visible overlay is available. Assessment B’s browser runtime exposed no browser backend, while Assessment A’s fresh-tab attempts hit the shared Playwright profile lock. HTTP fallback confirmed `http://localhost:5211/` returned `200 OK` with title `WikiOS`, but that does not substitute for visual inspection or console evidence.

## Overall Impression

The page understands the product’s core task: search first, then browse by meaningful knowledge signals. The strongest opportunity is to stop decorating “calm editorial” and let the user’s actual knowledge create the identity. Flatten the chrome, clarify the controls, and make discovery explainable.

## What’s Working

1. **Search owns the hierarchy.** The Home page begins with the fastest route from a question to a note instead of defaulting to analytics or vanity metrics.
2. **Browse groups are grounded in the vault.** Featured notes, people, recent material, summaries, word counts, and backlink counts are useful entry points rather than filler content.
3. **The implementation anticipates real states.** Debouncing, request cancellation, skeletons, empty results, lazy person images, fallback initials, reduced-motion support, and a global command palette provide a strong technical foundation.

## Priority Issues

### 1. [P1] Primary controls are semantically incomplete and misleading

- **What:** The search submit is an unlabeled ArrowUp icon, while `handleSubmit` only prevents default. The article-count pill silently triggers a reindex, swallows failures, and offers no success confirmation.
- **Why it matters:** Keyboard and screen-reader users cannot confidently identify the action; sighted users are shown controls whose appearance and behavior do not match.
- **Fix:** Remove the inert submit or give it a defined action and accessible name. Separate passive “N notes” status from an explicit “Reindex vault” action. Add `aria-busy`, a live result message, and an actionable failure state with Retry.
- **Suggested command:** `$impeccable harden Home search and refresh states`

### 2. [P1] Browse structure is not robustly accessible

- **What:** Section labels are styled `<p>` elements and their `<section>` landmarks have no accessible names. The translucent focus token is likely too weak on white/glass surfaces, and several compact mobile actions appear below 44px.
- **Why it matters:** Screen-reader users cannot jump among browse groups by heading, low-vision users may lose focus, and fine-motor users receive unnecessarily small targets.
- **Fix:** Use real `<h2>` headings with `aria-labelledby`, strengthen the focus token to a solid 3:1-contrast color, ensure core touch targets are 44×44px, and announce search/reindex state changes.
- **Suggested command:** `$impeccable audit Home accessibility and semantics`

### 3. [P2] The visual language is an AI-template layer over the knowledge

- **What:** Cream background, pastel triad, gradient hero text, glass surfaces, wide shadows, accent rails, glowing eyebrow dots, a huge display hero, and staggered motion all appear together.
- **Why it matters:** The interface performs “editorial calm” instead of earning trust through clarity. The chrome becomes more memorable than the user’s notes.
- **Fix:** Use a true neutral reading surface, one solid accent for action/state, a fixed product type scale, flatter grouping, and one deliberate identity gesture. Remove the gradient text, glass blur, colored rails, repeated glow dots, and decorative page-load staggering.
- **Suggested command:** `$impeccable quieter WikiOS Home`

### 4. [P2] Discovery exposes too many equal-weight choices

- **What:** Most Connected and Recent each show six items, People is not visibly capped, and search can expose twenty flat results. Featured content is randomly sampled rather than explainably selected.
- **Why it matters:** Scan cost rises with vault size, and users cannot build trust in “Discover” if the selection changes without a reason.
- **Fix:** Lead with 3–4 high-signal entries per group, add “View all,” cap People, group or tier search results, and define an explainable discovery rule such as resurfacing forgotten-but-connected notes.
- **Suggested command:** `$impeccable distill Home discovery`

### 5. [P2] Product language does not form one mental model

- **What:** Home mixes articles, notes, pages, connections, and backlinks; Graph and Explorer are equal top-level options without a task-oriented distinction.
- **Why it matters:** Users must translate the object model and guess which destination answers their current question.
- **Fix:** Use “notes” as the core object, reserve “backlinks” for the exact relationship, and label Graph versus Explorer by outcome: landscape overview versus focused reading/browsing.
- **Suggested command:** `$impeccable clarify Home navigation and knowledge terminology`

## Cognitive Load

**3 of 8 checklist failures — moderate.** Single focus, grouping, hierarchy, one-thing-at-a-time behavior, and in-context recognition pass. Chunking, minimal choices, and progressive disclosure fail.

Decision points above four visible options include the header’s search/status/Graph/Explorer/Stats set, six Most Connected chips, six Recent links, an uncapped People group, and up to twenty search results. The page replaces browse content during search, which is good progressive focus, but the browse and result lists themselves are not staged.

## Emotional Journey

- **Arrival:** Calm and inviting; the centered search creates a clear first move.
- **Orientation:** Confidence drops when Graph, Explorer, Stats, the count/reindex pill, and four browse categories appear without explaining their roles.
- **Peak:** Debounced search, skeletons, highlighting, and immediate results provide the strongest sense of momentum.
- **Valley:** “No matches” offers no suggestions; error offers no Retry; reindex gives no trustworthy outcome.
- **End:** Home delegates the payoff to the note route and does not reinforce that the user has recovered useful context.

## Persona Red Flags

### Alex — Power User

- Command-K exists but Home gives no visible shortcut cue.
- The search arrow implies an Enter-based accelerator but performs no distinct action.
- Up to twenty results are a flat list without grouping, title-only mode, or filters.
- Reindex success cannot be confirmed quickly.

### Jordan — First-Timer

- No restrained orientation sentence explains what WikiOS indexes or suggests a useful first query.
- Graph, Explorer, Stats, and the count-shaped refresh control compete without role explanations.
- “Connections” and “backlinks” appear to describe overlapping concepts.
- No-results and error states do not provide a next step.

### Sam — Accessibility-Dependent User

- The icon-only search submit lacks an accessible name.
- Browse labels are not headings and landmarks are unnamed.
- Search and reindex state changes are not announced through live regions.
- A translucent focus ring and compact controls increase visual and fine-motor difficulty.

## Minor Observations

- `config.tagline` exists but is unused; one restrained orientation line would do more work than the decorative hero treatment.
- Global scrollbar removal discards a standard position cue on long result and People lists.
- Person-image opacity transitions do not show a dedicated reduced-motion variant.
- The stored search error is replaced by a generic rendered sentence.
- “Recently Added” appears to use `modifiedAt`; “Recently Updated” may be more accurate.
- Random Featured notes can shift after reindex and weaken continuity.

## Questions to Consider

1. If search is the product’s core promise, why does the wordmark receive more vertical and typographic emphasis than the search field?
2. Should Discover optimize for serendipity, forgotten notes, unresolved links, or recently active themes?
3. Could Graph and Explorer become outcomes of a search/note selection rather than three equal starting points?
4. What remains after removing pastel glass, glows, gradients, rails, and entrance choreography—and does the knowledge become more distinctive?
5. Should reindexing be everyday Home navigation, or an explicit maintenance action with trustworthy status?
