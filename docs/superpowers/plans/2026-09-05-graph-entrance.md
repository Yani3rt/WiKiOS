# Graph awakening entrance

Approved: a two-second entrance on graph opening. Nodes brighten and grow in a hub-outward sequence, edges trace behind them, labels fade in last. No camera spin or perpetual motion. First interaction completes the sequence. Reduced motion skips it. No new dependencies.

Implementation: pure BFS delay/timing model and cancellable RAF controller, existing neural edge shader gains an entrance mode, node reducer scales/mixes colors, canvas labels use entrance alpha. Begin after initial layout (bounded fallback on worker failure), preserve existing selection effects and theme tokens, clean up on unmount.

Validation: test hub ordering/disconnected nodes, stage boundaries, reduced motion and interrupted/destroyed controllers; run existing graph tests/typecheck/build; browser inspect entrance, settled state, interaction and reduced motion behavior where tools allow.

## Completed
- Hub-first BFS timing, two-second staggered scale/color reveal and late label alpha.
- Existing GPU edge shader traces from the earlier-revealed endpoint; static renderer fallback fades edges.
- Initial layout triggers entrance; one-second fallback avoids waiting indefinitely. Layout completion does not reset a user's camera.
- Pointer/keyboard/wheel interaction and reduced-motion changes finish immediately; unmount cancels RAF and timers. Completed entrance does not replay on data refresh.
- Tests cover timing, reduced motion, early finish, natural completion, and teardown. Typecheck, targeted lint, client build and full test suite pass. Existing build chunk-size warning remains.
- Browser inspected opening frames, settled graph, and click-to-finish; no console warnings/errors. Reduced-motion behavior verified by unit tests, not a changed OS setting. No new dependencies.
