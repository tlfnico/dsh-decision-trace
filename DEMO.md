# Demo script — DecisionTrace v0.1

**Three minutes, one session, no slides.** The plugin demonstrates itself: the decisions used to build it are the content.

This is not a presentation and there is nothing to memorize. It is a screen walkthrough with two sentences per stop. Read it once before you show it; if nobody asks you to show it, skip it — the repository is the artifact.

## Before you start (30 seconds, off camera)

1. `mode: "on"` in the profile patch, page reloaded once.
2. A session with at least three recorded decisions — or record them live during the demo.
3. The **Decisions** view open in a second moment: you will switch to it, not start there.

If the tool does not appear, the plugin is off. Check the view: it shows "Decision trace is off" with the activation controls.

## 0:00 — The hook

> "Every agent session ends with code, and no record of why. This plugin records the decisions — not the steps — and it does it without adding a single event type to the log."

Point at the session: this one already has a timeline.

## 0:30 — The card (in the chat)

Scroll to any `decision_record` call.

> "The agent called a tool. The tool returned an id, a title and a status — that is all the model sees. The rest is here: the category, why this option won, what was rejected and why, the files it touches."

Open one card. Read the rationale aloud — that is the part no diff can give you.

> "This is one call, at the moment of the decision. Not a summary written afterwards."

## 1:15 — The timeline (Decisions view)

Switch to **Decisions**.

> "Same data, but ordered by time. Each node is a decision, the colour is its status, and the time is relative to now."

Click one entry.

> "One click opens the evidence: the call and result sequence numbers, and the user message that was being answered. Not a copy of the diff — a pointer to it."

If a decision replaced another, point at the dimmed row:

> "This one was superseded. The chain is in the log, so the view can show it."

Two optional stops, only if the session has them — one line each, do not linger:

- **Filters.** Click `accepted`, then a category. > "The tree gets noisy at twenty decisions; the chips cut it down."
- **Agents.** If the table above the timeline has more than one row: > "This session ran a subagent. Here is its tree, with how many decisions each agent recorded." Click a row to jump to that session.

## 2:15 — The export

Hit **Export .md**.

> "The timeline leaves the app as Markdown. It is generated from the same fold, so it cannot disagree with what you just saw."

## 2:30 — The close

> "Nothing here is a new event type. Uninstall the plugin and every session is still intact and readable — the decisions are just tool results. Reload, and the timeline comes back in the same order, because it is derived, not stored."

Optional, if the audience is technical:

> "The ids come from folding the log, so a rejected record leaves no gap. And the prompt section only mounts when the plugin is on — off, it costs zero tokens per request."

## Fallbacks

| If | Then |
|---|---|
| The agent did not call the tool | Ask it directly: "record the decision you just made". The prompt section is what makes it do this on its own |
| The view looks empty but the plugin is on | The decisions are in this session's log; check you are in the same session |
| A card shows "not recorded" | That call was rejected; the reason is in the tool result. It is a real state, not a render bug |
| The audience asks where data is stored | The session log. That is the whole point |

## Questions you will get

**"Does this cost tokens?"** While off, nothing. While on, one tool schema of eight fields and a short prompt section per request.

**"What stops the agent from recording trivia?"** The prompt section asks for decisions that changed the course, and `maxDecisions` caps a session at 200. It is a policy, not a guarantee — precision measurement is the next milestone.

**"What about decisions made outside the tool?"** v0.1 does not infer them. That is the funded work: extraction over long sessions and overlap detection.
