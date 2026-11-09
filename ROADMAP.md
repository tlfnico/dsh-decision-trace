# Roadmap

## v0.1 — shipped

- `decision_record` tool: seven fields, ids assigned by folding the session log, non-blocking `supersedes`, hard cap per session.
- Inline card where the decision was made.
- Decisions view: timeline and list, status colours, relative time, one-click evidence, Markdown export.
- Session projection (`decisionTrace`) so the browser half never folds the log itself.
- Session provenance: root or subagent, delegation depth, preset — in the view and in the export.
- Fleet topology: the session tree with decision counts per agent, read from the live store plus the provider's durable child discovery.
- Opt-in: off by default, so it costs no context until enabled.
- Zero new session event types; uninstalling leaves every session intact.

## Next

- **Fleet roll-up, with content.** v0.1 shows the tree as topology and counts, and lets you open another agent's session. What is missing is every agent's timeline in one place: retain each child session and read its `decisionTrace` projection through the authenticated session transport (`sessions.retain(id).binding.session.projections.faceOf`), then page through the combined list.
- **The tree as a diagram.** Nodes per agent, one dot per decision coloured by status, arrows for supersession — as a detail of the roll-up table, not as the landing view.
- **Counts for finished agents.** A child whose agent already left the live store is listed with unknown counts. Reading its persisted projection would fill them.
- **Filters** by status, category and file, once a session has more than a screenful.
- **Evidence depth.** Link each declared file to the nearest file operation that touched it, instead of only naming the path.
- **Tests.** The fold is pure and its rules are subtle (rejected records take no id, the call-id fallback, dangling references). A table-driven test would pin them down without a harness.

## v0.2 — detection

The part that needs inference, and the reason this plugin is not just a form.

- **Extraction.** Propose candidate decisions from a long session that the agent did not record — and rank them, so a human reads five instead of fifty.
- **Precision measurement.** Build a small labelled set from real sessions and report precision/recall per category. Ship the number, not the claim.
- **Supersession inference.** When a later choice contradicts an earlier record, propose the `supersedes` link instead of waiting for the agent to notice.

## Out of scope

Aggregating across unrelated sessions, editing decisions from the interface, and comparing sessions. Nothing here is planned for them.
