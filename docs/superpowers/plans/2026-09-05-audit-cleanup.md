# Audit cleanup implementation plan

**Goal:** Fix verified correctness issues, remove repeated vault-wide work, and simplify implementation without changing the UI.
**Architecture:** Retain the SQLite/indexer/watcher boundaries and current routes. Use database-identity/revision-scoped link caching, real DOM tests, and an isolated memoized markdown body. No production dependencies.

- [x] 1. Add failing search and portrait regressions; fix term deduplication, error propagation, name-bound portrait state and expiring negative cache.
- [x] 2. Add unchanged-scan and cache-invalidation tests; skip unnecessary materialization, cache link indexes by DB/revision, preserve explicit repair.
- [x] 3. Replace source-string and simulated React lifecycle tests with real rendered behavior; preserve meaningful pure-model and integration tests.
- [x] 4. Simplify query forwarding and shared types; remove unused schema with cache-version bump; standardize pnpm scripts/Docker and retire migration-only checks.
- [x] 5. Measure markdown render work, isolate body from reading-position changes, consolidate heading observation; verify rendering and interactions.
- [x] 6. Run tests, lint, typecheck, production build, frozen install, and inspect final diff.

For each fix, run its regression before and after implementation. Keep existing behavior tests green during refactoring. Do not commit or deploy automatically.

## Verification

- 276 tests passed across 31 files; typecheck, lint, and production build passed.
- Frozen offline pnpm install passed. Docker build and isolated production-container HTTP smoke tests passed (home, repeated-term search, note).
- Real-browser QA on the built app: repeated search terms return results; note navigation and dark appearance work; Escape restores focus; the mobile Explorer drawer and linked-note tabs work; graph loads.
- Unchanged-index regression observes zero SQLite writes; link lookup reused until revision/database changes.
- A 100-heading note incurred five extra markdown passes across five scroll updates before optimization, zero after, while active-heading state changed correctly.
- Existing Vite chunk-size and browser HydrateFallback warnings remain; no browser error-level logs observed during the checked flows.
- No production dependencies added; jsdom 26 is development-only and supports the Node 20 environment.

## Follow-up

- Review the diff before committing. No commit, push, or deployment was performed.
- Cache schema 7 automatically rebuilds previous indexes from the vault; original markdown is unchanged (only bundled sample instructions were updated for pnpm).
