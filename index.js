/**
 * DecisionTrace (Host half).
 *
 * The tool/result pair is the only source of truth: this plugin appends no
 * session event types and keeps no storage of its own. Decision ids are
 * derived by folding the Session log on demand, so a reload, a fork, or a
 * replay reconstructs the same ids.
 *
 * @module dsh-decision-trace
 */

import Schema from '@deepseek-ai/schemastery'
import { z } from 'zod'

const TOOL_NAME = 'decision_record'
const PROMPT_SECTION = 'decision-trace'
const PROJECTION_KEY = 'decisionTrace'
// 3: pure fold (no clock), call-id parity, and `dangling` resolved in the fold.
const PROJECTION_VERSION = 3

const CATEGORIES = [
  'architecture',
  'dependency',
  'data',
  'api',
  'security',
  'process',
  'other',
]
const STATUSES = ['proposed', 'accepted', 'rejected', 'superseded']

const TITLE_MAX = 120

/** @type {Record<string, unknown>} */
const PARAMETERS = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      maxLength: TITLE_MAX,
      description: `What was decided, stated in one line (at most ${TITLE_MAX} characters).`,
    },
    category: {
      type: 'string',
      enum: CATEGORIES,
      description: 'The kind of decision this is.',
    },
    rationale: {
      type: 'string',
      description:
        'Why this option won, in your own words. Name the constraint or tradeoff that decided it.',
    },
    alternatives: {
      type: 'array',
      description:
        'Options that were considered and not taken. Omit when there was only one option.',
      items: {
        type: 'object',
        properties: {
          option: { type: 'string', description: 'The option that was not taken.' },
          rejected_because: {
            type: 'string',
            description: 'Why it lost.',
          },
        },
        required: ['option', 'rejected_because'],
        additionalProperties: false,
      },
    },
    status: {
      type: 'string',
      enum: STATUSES,
      description:
        "Where the decision stands. Leave it at 'proposed' unless the user already accepted or rejected it.",
    },
    supersedes: {
      type: 'string',
      description:
        'Visible id of an earlier decision this one replaces, such as "d-3". Omit when nothing is replaced.',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description: 'Workspace-relative paths this decision affects.',
    },
  },
  required: ['title', 'category', 'rationale'],
  additionalProperties: false,
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function sessionOf(ctx, exec) {
  const sessionId = exec?.agent?.id
  if (!sessionId) return undefined
  const sessions = ctx.get('sessions')
  if (!sessions || typeof sessions.get !== 'function') return undefined
  try {
    return sessions.get(sessionId)
  } catch {
    return undefined
  }
}

/**
 * The next visible id: the highest `d-N` already recorded, plus one. Records
 * that carry a non-`d-N` id (the call-id fallback used without a live Session)
 * are ignored so they cannot shift the sequence.
 */
function nextDecisionId(state) {
  let highest = 0
  for (const decision of state.decisions) {
    const match = /^d-(\d+)$/.exec(decision.id)
    if (match !== null) highest = Math.max(highest, Number(match[1]))
  }
  return `d-${highest + 1}`
}

/* ------------------------------------------------------------------ *
 * Session projection: the same fold, kept live and derived from the
 * log. No new event type; `tool/call` and `tool/result` are enough.
 * ------------------------------------------------------------------ */

const alternativeSchema = z.object({
  option: z.string(),
  rejected_because: z.string(),
})

const projectedDecisionSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  status: z.string(),
  rationale: z.string(),
  alternatives: z.array(alternativeSchema),
  files: z.array(z.string()),
  supersedes: z.string().nullable(),
  dangling: z.boolean(),
  callSeq: z.number(),
  resultSeq: z.number(),
  at: z.number(),
  askedSeq: z.number().nullable(),
  asked: z.string().nullable(),
})

const pendingCallSchema = z.object({
  callId: z.string(),
  seq: z.number(),
  // Raw tool arguments: the projection must never reject a record because a
  // model sent a shape the tool schema already refused at call time.
  args: z.unknown(),
})

const projectionStateSchema = z.object({
  decisions: z.array(projectedDecisionSchema),
  pending: z.array(pendingCallSchema),
  lastUser: z.object({ seq: z.number(), text: z.string() }).nullable(),
})

const projectionViewSchema = z.object({
  decisions: z.array(projectedDecisionSchema),
})

function userMessageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join(' ')
    .trim()
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
  // Resolved against what this fold already saw, so the fold stays pure and
  // a reader never needs the Map a presentation callback used to keep.
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
 * One fold, two consumers: `execute` folds the log to pick the next id, and
 * the session projection folds the same events to publish the view. Keeping a
 * single step function is what makes those two agree by construction.
 * Pure: the same reference is returned for events it ignores.
 */
function applyDecisionEvent(state, event) {
  if (event.type === 'user/message') {
    const text = userMessageText(event.data?.message).slice(0, 200)
    return { ...state, lastUser: { seq: event.seq, text } }
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

function initialDecisionState() {
  return { decisions: [], pending: [], lastUser: null }
}

function foldDecisions(events) {
  let state = initialDecisionState()
  for (const event of events) state = applyDecisionEvent(state, event)
  return state
}

export const name = 'dsh-decision-trace'
export const inject = ['tools']

const STATUS_PATH = '/decision-trace/status'

export const Config = Schema.object({
  mode: Schema.union([Schema.const('off'), Schema.const('on')])
    .default('off')
    .description(
      'Off by default: while off, neither the tool nor the system-prompt section is registered. Turning it on adds both.',
    ),
  maxDecisions: Schema.natural()
    .default(200)
    .description('Hard cap on decisions recorded in one session.'),
})

export async function apply(ctx, config) {
  const mode = config?.mode === 'on' ? 'on' : 'off'

  // The browser half is built from the client graph and never sees the row
  // config, so the mode reaches it through this route instead. It answers in
  // both modes, which is what lets the empty state say which one it is in.
  const webServer = ctx.get('webServer')
  if (webServer && typeof webServer.register === 'function') {
    ctx.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: STATUS_PATH,
          resource: async () =>
            new Response(JSON.stringify({ plugin: name, mode }), {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'cache-control': 'no-store',
              },
            }),
        }),
      'decision-trace: status route',
    )
  }

  if (mode !== 'on') return

  // The Decisions view reads this unit: the client never folds the log.
  const projections = ctx.get('sessionProjections')
  if (projections && typeof projections.register === 'function') {
    await projections.register({
      key: PROJECTION_KEY,
      stateVersion: PROJECTION_VERSION,
      stateSchema: projectionStateSchema,
      init: initialDecisionState,
      apply: applyDecisionEvent,
      wire: {
        viewSchema: projectionViewSchema,
        view: state => ({ decisions: state.decisions }),
      },
    })
  }

  const maxDecisions = Number.isInteger(config?.maxDecisions) && config.maxDecisions > 0
    ? config.maxDecisions
    : 200

  const definition = {
    name: TOOL_NAME,
    description:
      'Record a decision made in this session so it appears in the conversation and in the session\'s Decisions view. Call it once, at the moment the choice is made. It returns the visible id assigned to the decision.',
    parameters: PARAMETERS,
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['id', 'title', 'status'],
        additionalProperties: false,
      },
      render(_args, value) {
        return [
          {
            type: 'text',
            text: `Recorded ${value.id}: ${value.title} (${value.status})`,
          },
        ]
      },
      // Pure: the reference comes from the arguments alone. Whether it
      // resolves is the fold's business, so a replay cannot produce different
      // meta than the original run.
      presentationMeta(args, value) {
        const raw = args && typeof args === 'object' ? args : {}
        const decision = {
          id: value.id,
          title: value.title,
          status: value.status,
          category: asString(raw.category) || 'other',
          rationale: asString(raw.rationale),
          alternatives: Array.isArray(raw.alternatives) ? raw.alternatives : [],
          files: Array.isArray(raw.files) ? raw.files : [],
        }
        // Presentation meta must be lossless JSON: omit absent fields instead
        // of writing undefined.
        const requested = asString(raw.supersedes)
        if (requested !== '') decision.supersedes = requested
        return { decision }
      },
    },

    // Two calls folding the same log at once would compute the same id.
    isConcurrencySafe: () => false,

    async execute(args, exec) {
      const raw = args && typeof args === 'object' ? args : {}
      const title = asString(raw.title)
      if (!title) throw new Error('title must not be empty')
      if (title.length > TITLE_MAX) {
        throw new Error(`title must be at most ${TITLE_MAX} characters`)
      }

      const category = asString(raw.category) || 'other'
      if (!CATEGORIES.includes(category)) {
        throw new Error(`category must be one of: ${CATEGORIES.join(', ')}`)
      }

      const rationale = asString(raw.rationale)
      if (!rationale) throw new Error('rationale must not be empty')

      const status = asString(raw.status) || 'proposed'
      if (!STATUSES.includes(status)) {
        throw new Error(`status must be one of: ${STATUSES.join(', ')}`)
      }

      const session = sessionOf(ctx, exec)
      // Same fold the projection uses, over the same events: the next id and
      // the published view cannot disagree.
      const state = session ? foldDecisions(session.snapshotEvents()) : undefined

      if (state && state.decisions.length >= maxDecisions) {
        throw new Error(
          `This session already holds ${state.decisions.length} decisions, which is the limit set for this plugin (maxDecisions: ${maxDecisions}).`,
        )
      }

      // The fold is the source of ids; without a live Session the call id
      // keeps the decision in the log rather than failing the record, and the
      // fold shows that same id.
      const id = state ? nextDecisionId(state) : String(exec.callId ?? 'd-unknown')

      const requested = asString(raw.supersedes)
      if (requested && requested === id) {
        throw new Error('a decision cannot supersede itself')
      }

      return { id, title, status }
    },

    presentCall(args) {
      const raw = args && typeof args === 'object' ? args : {}
      const title = asString(raw.title)
      return {
        card: 'generic',
        kind: 'other',
        title: title ? `Decision: ${title}` : 'Decision',
        rawInput: raw,
      }
    },

    presentResult(_args, result) {
      return result.isError ? undefined : { card: 'generic', title: 'Decision recorded' }
    },
  }

  ctx.effect(() => ctx.tools.register(definition), 'decision-trace: decision_record tool')

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt && typeof systemPrompt.section === 'function') {
    ctx.effect(
      () =>
        systemPrompt.section({
          name: PROMPT_SECTION,
          order: 40,
          text: [
            '## Recording decisions',
            '',
            'A decision is a choice that changes the plan: what to build, which dependency to take, how data is shaped, which API to expose, a security tradeoff, a change of process. When you commit to one, record it with `decision_record` before you act on it.',
            'Record it once, in the words of the moment, with the reason that settled it. Skip routine steps, defaults with no alternative, and anything you already recorded.',
          ].join('\n'),
        }),
      'decision-trace: system prompt',
    )
  }
}
