/**
 * The decision fold: the single pure function the rest of the plugin reads.
 *
 * `decision_record`'s tool result is the only source of truth. `execute` folds
 * the log to pick the next visible id, and the session projection folds the
 * same events to publish the view. Both call `applyDecisionEvent`, so the two
 * cannot disagree — that is the whole design, in one file with no imports so
 * it can be tested without a Harness.
 *
 * Pure: no clock, no module state, no I/O. The same log always folds to the
 * same state.
 *
 * @module dsh-decision-trace/fold
 */

export const TOOL_NAME = 'decision_record'

/** Prompts kept for the timeline; the first one is kept apart and never dropped. */
const PROMPT_LIMIT = 20

export function asString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function userMessageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join(' ')
    .trim()
}

/**
 * Which agent the session belongs to. The header is the only durable source:
 * a subagent's log does not record that it is one, and the parent's log does
 * not record its children.
 */
export function agentContextOf(header) {
  return {
    origin: header?.origin === 'subagent' ? 'subagent' : 'root',
    depth: Number.isInteger(header?.delegationDepth) ? header.delegationDepth : 0,
    preset: typeof header?.agentPreset === 'string' ? header.agentPreset : null,
    parent: typeof header?.parentSession === 'string' ? header.parentSession : null,
  }
}

export function initialState(header) {
  return {
    decisions: [],
    pending: [],
    lastUser: null,
    agent: agentContextOf(header),
    // The session's own beginning, so the timeline can start before the first
    // decision instead of floating.
    startedAt: typeof header?.createdAt === 'number' ? header.createdAt : 0,
    // The prompt that opened the session is the one node that must survive any
    // cap, so it is held apart from the rolling window.
    firstPrompt: null,
    prompts: [],
  }
}

function finalizedDecision(state, event, pending) {
  const recorded = event.data?.meta?.decision
  const args = pending.args ?? {}
  // Parity with the tool: without a live Session the tool returns the call id
  // as the visible id, so the view must show that same id instead of
  // inventing a `d-N`.
  const recordedId = typeof recorded?.id === 'string' ? recorded.id : ''
  const id = recordedId !== '' ? recordedId : pending.callId
  const requested = asString(args.supersedes)
  const supersedes = requested !== '' ? requested : null
  // Resolved against what the fold already saw, so the fold stays pure and a
  // reader never needs state outside it.
  const dangling =
    supersedes !== null && !state.decisions.some(entry => entry.id === supersedes)
  const alternatives = Array.isArray(args.alternatives)
    ? args.alternatives
        .map(entry => ({
          option: asString(entry?.option),
          rejected_because: asString(entry?.rejected_because),
        }))
        .filter(entry => entry.option || entry.rejected_because)
    : []
  return {
    id,
    title: asString(recorded?.title) || asString(args.title),
    category: asString(recorded?.category) || asString(args.category) || 'other',
    status: asString(recorded?.status) || asString(args.status) || 'proposed',
    rationale: asString(recorded?.rationale) || asString(args.rationale),
    alternatives,
    files: Array.isArray(args.files) ? args.files.map(String) : [],
    supersedes,
    dangling,
    callSeq: pending.seq,
    resultSeq: event.seq,
    // A fold may not read the clock: replaying the same log must produce the
    // same state. A result without a time simply has no time.
    at: typeof event.time === 'number' ? event.time : 0,
    askedSeq: state.lastUser?.seq ?? null,
    asked: state.lastUser?.text ?? null,
  }
}

/**
 * One fold step. Returns the same state reference for events it ignores, so
 * unchanged state costs nothing downstream.
 */
/**
 * A `user/message` event carries the message itself in `data`, while the
 * developer and system events wrap theirs in `data.message`. Read both, so the
 * evidence never silently comes back empty again.
 */
function messageOf(event) {
  const data = event.data ?? {}
  const looksLikeMessage =
    typeof data.content === 'string' ||
    Array.isArray(data.content) ||
    typeof data.role === 'string'
  return looksLikeMessage ? data : data.message
}

export function applyDecisionEvent(state, event) {
  if (event.type === 'user/message') {
    const text = userMessageText(messageOf(event)).slice(0, 200)
    const next = { ...state, lastUser: { seq: event.seq, text } }
    // A message with no text still opens a turn, but it makes a poor timeline
    // node, so only readable prompts are kept.
    if (text === '') return next
    const prompt = {
      seq: event.seq,
      at: typeof event.time === 'number' ? event.time : 0,
      text,
    }
    return {
      ...next,
      firstPrompt: state.firstPrompt === null ? prompt : state.firstPrompt,
      prompts: [...state.prompts, prompt].slice(-PROMPT_LIMIT),
    }
  }

  if (event.type === 'tool/call') {
    const data = event.data ?? {}
    if (data.name !== TOOL_NAME) return state
    let args = {}
    try {
      const parsed = JSON.parse(data.arguments)
      if (parsed && typeof parsed === 'object') args = parsed
    } catch {
      args = {}
    }
    return {
      ...state,
      pending: [...state.pending, { callId: String(data.callId), seq: event.seq, args }],
    }
  }

  if (event.type === 'tool/result') {
    const callId = String(event.data?.message?.toolCallId ?? '')
    if (callId === '') return state
    const pending = state.pending.find(entry => entry.callId === callId)
    if (pending === undefined) return state
    const rest = state.pending.filter(entry => entry.callId !== callId)
    // A rejected record leaves no decision behind, so it takes no id.
    if (event.data?.message?.isError === true || event.data?.meta?.decision === undefined) {
      return { ...state, pending: rest }
    }
    return {
      ...state,
      pending: rest,
      decisions: [...state.decisions, finalizedDecision(state, event, pending)],
    }
  }

  return state
}

export function foldDecisions(events, header) {
  let state = initialState(header)
  for (const event of events) state = applyDecisionEvent(state, event)
  return state
}

/**
 * The next visible id: the highest `d-N` already recorded, plus one. Records
 * that carry a non-`d-N` id (the call-id fallback used without a live Session)
 * are ignored so they cannot shift the sequence.
 */
export function nextDecisionId(state) {
  let highest = 0
  for (const decision of state.decisions) {
    const match = /^d-(\d+)$/.exec(decision.id)
    if (match !== null) highest = Math.max(highest, Number(match[1]))
  }
  return `d-${highest + 1}`
}
