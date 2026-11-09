# Roadmap

## v0.1 — shipped

- `decision_record` tool: seven fields, ids assigned by folding the session log, non-blocking `supersedes`, hard cap per session.
- Inline card where the decision was made.
- Decisions view: timeline and list, status colours, relative time, one-click evidence, Markdown export.
- Session projection (`decisionTrace`) so the browser half never folds the log itself.
- Opt-in: off by default, so it costs no context until enabled.
- Zero new session event types; uninstalling leaves every session intact.

## v0.2 — detection

The part that needs inference, and the reason this plugin is not just a forms.

- **Extraction.** Propose candidate decisions from a long session that the agent did not record — and rank them, so a human reads five instead of fifty.
- **Precision measurement.** Build a small labelled set from real sessions and report precision/recall per category. Ship the number, not the claim.
- **Supersession inference.** When a later choice contradicts an earlier record, propose the `supersedes` link instead of waiting for the agent to notice.

## Later, if the above holds

- **Fleet roll-up.** Fold subagent sessions into their parent's view. The provenance is already in the log (`origin`, `delegationDepth`, `parentSession`), so this is a fold, not a new channel.
- **Interface filters** by status, category and file, once a session has more than a screenful.
- **Evidence depth.** Link each declared file to the nearest file operation that touched it, instead of only naming the path.

## Out of scope

Aggregating across unrelated sessions, editing decisions from the interface, and comparing sessions. Nothing here is planned for them.
