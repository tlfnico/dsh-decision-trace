# Roadmap

## v0.1 — shipped

- `decision_record` tool: ids assigned by folding the session log, non-blocking `supersedes`, hard cap per session.
- Inline card where the decision was made.
- Decisions view: list with one-click evidence.
- Session projection (`decisionTrace`) so the browser half never folds the log itself.
- Opt-in: off by default, so it costs no context until enabled.
- Zero new session event types; uninstalling leaves every session intact.

## v0.2 — shipped

- Timeline that starts at the session's own beginning and interleaves the prompts that framed each decision.
- Session provenance: root or subagent, delegation depth, preset, parent — in the view and in the export.
- Fleet topology: the session tree with a decision count per agent, read from the live store plus the provider's durable child discovery, and a way back to the parent from a delegated session.
- Filters by status and category, and a Markdown export that follows the filter.
- `weight: major | minor`: a small choice stays in the record without competing with the ones that moved the course.
- The fold extracted to `fold.js`, with a test suite over its rules and a render test that executes the view without a browser. Both run in CI on every push.
- Prompt guidance rewritten: product and interface choices count, and a late entry beats a gap.

## Next

- **Fleet roll-up, with content.** The tree shows ids and counts; what is missing is every agent's timeline in one place. Retain each child session and read its `decisionTrace` projection through the authenticated session transport (`sessions.retain(id).binding.session.projections.faceOf`), then page through the combined list.
- **The tree as a diagram.** Nodes per agent, one dot per decision coloured by status, arrows for supersession — as a detail of the roll-up, not as the landing view.
- **Counts for finished agents.** A child whose agent already left the live store is listed with unknown counts; reading its persisted projection would fill them.
- **Collapse by turn.** With a dozen decisions and as many prompts the view already scrolls; grouping per turn is the natural answer, not grouping prompts.
- **Evidence depth.** Link each declared file to the nearest file operation that touched it.

## v0.3 — detection

The part that needs inference, and the reason this plugin is not just a form.

- **Extraction.** Propose candidate decisions from a long session that the agent did not record — and rank them, so a human reads five instead of fifty.
- **Precision measurement.** Build a small labelled set from real sessions and report precision/recall per category. Ship the number, not the claim.
- **A test that is actually correct.** The two costliest defects so far were a test that encoded the author's assumption. A detector that cannot tell a green test from a right one is the same failure at a larger scale.

## Out of scope

Aggregating across unrelated sessions, editing decisions from the interface, and comparing sessions. Nothing here is planned for them.
