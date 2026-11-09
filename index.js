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

import {
  TOOL_NAME,
  agentContextOf,
  applyDecisionEvent,
  asString,
  foldDecisions,
  initialState,
  nextDecisionId,
} from './fold.js'

const PROMPT_SECTION = 'decision-trace'
const PROJECTION_KEY = 'decisionTrace'
// 4: the view reports which agent the session belongs to (origin, depth,
// preset, parent), read from the session header at initialization.
const PROJECTION_VERSION = 4

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
  agent: z.object({
    origin: z.string(),
    depth: z.number(),
    preset: z.string().nullable(),
    parent: z.string().nullable(),
  }),
})

const projectionViewSchema = z.object({
  decisions: z.array(projectedDecisionSchema),
  agent: z.object({
    origin: z.string(),
    depth: z.number(),
    preset: z.string().nullable(),
    parent: z.string().nullable(),
  }),
})

/**
 * Child session ids the provider still knows about, including children whose
 * agent already finished. Best-effort: the entry shape is read defensively
 * because the catalog type is not ours to depend on.
 */
async function durableChildIds(ctx, rootId) {
  const subagents = ctx.get('subagents')
  if (!subagents) return []
  const collect = entries => {
    if (!Array.isArray(entries)) return []
    const ids = []
    for (const entry of entries) {
      const id = entry?.sessionId ?? entry?.id ?? entry?.childId ?? entry?.session?.id
      if (typeof id === 'string' && id !== '') ids.push(id)
    }
    return ids
  }
  try {
    if (typeof subagents.listDescendants === 'function') {
      return collect(await subagents.listDescendants(rootId))
    }
    if (typeof subagents.listChildren === 'function') {
      return collect(await subagents.listChildren(rootId))
    }
  } catch {
    // Discovery is best-effort; the live store still answers.
  }
  return []
}

function countOf(handle, session) {
  try {
    const state = handle ? handle.stateOf(session) : undefined
    if (state && Array.isArray(state.decisions)) {
      return {
        decisions: state.decisions.length,
        superseding: state.decisions.filter(entry => entry.supersedes !== null).length,
      }
    }
  } catch {
    // An unreadable cell is reported as unknown rather than failing the tree.
  }
  return { decisions: null, superseding: null }
}

function agentTreeRows(ctx, rootId, handle, discovered) {
  const sessions = ctx.get('sessions')
  const list = sessions && typeof sessions.list === 'function' ? sessions.list() : []
  const byId = new Map()
  for (const session of list) byId.set(String(session.id), session)

  const children = new Map()
  for (const session of list) {
    const parent = typeof session.header?.parentSession === 'string' ? session.header.parentSession : ''
    if (parent === '') continue
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push(session)
  }

  const root = byId.get(String(rootId))
  if (root === undefined) return []

  const rows = []
  const seen = new Set()
  const row = (id, session) => {
    const header = session?.header
    const context = agentContextOf(header)
    const counts = session ? countOf(handle, session) : { decisions: null, superseding: null }
    return {
      id,
      origin: context.origin,
      depth: context.depth,
      preset: context.preset,
      decisions: counts.decisions,
      superseding: counts.superseding,
    }
  }

  const visit = (session, depth) => {
    const id = String(session.id)
    if (seen.has(id)) return
    seen.add(id)
    const entry = row(id, session)
    rows.push({ ...entry, depth: Number.isInteger(entry.depth) && entry.depth > 0 ? entry.depth : depth })
    for (const child of children.get(id) ?? []) visit(child, depth + 1)
  }
  visit(root, 0)

  // Children the provider remembers but the live store does not carry: listed
  // for topology, with unknown counts. A child with no live session has no
  // header to read, so its origin comes from being a child at all.
  for (const id of discovered) {
    if (seen.has(id)) continue
    seen.add(id)
    const live = byId.get(id)
    rows.push(
      live
        ? row(id, live)
        : { ...row(id, undefined), origin: 'subagent', depth: 1, decisions: null, superseding: null },
    )
  }

  return rows
}

export const name = 'dsh-decision-trace'
export const inject = ['tools']

const STATUS_PATH = '/decision-trace/status'
const AGENTS_PATH = '/decision-trace/agents'

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

  // Read by the fleet route once the unit is registered below; requests that
  // arrive earlier simply see no counts.
  let projectionHandle

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

    // Topology and counts only — see agentTreeRows.
    ctx.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: AGENTS_PATH,
          resource: async request => {
            let sessionId = ''
            try {
              sessionId = new URL(request.url, 'http://localhost').searchParams.get('session') ?? ''
            } catch {
              sessionId = ''
            }
            const discovered =
              sessionId === '' ? [] : await durableChildIds(ctx, sessionId)
            const agents = sessionId === '' ? [] : agentTreeRows(ctx, sessionId, projectionHandle, discovered)
            return new Response(JSON.stringify({ session: sessionId, agents }), {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'cache-control': 'no-store',
              },
            })
          },
        }),
      'decision-trace: agents route',
    )
  }

  if (mode !== 'on') return

  // The Decisions view reads this unit: the client never folds the log.
  const projections = ctx.get('sessionProjections')
  if (projections && typeof projections.register === 'function') {
    projectionHandle = await projections.register({
      key: PROJECTION_KEY,
      stateVersion: PROJECTION_VERSION,
      stateSchema: projectionStateSchema,
      init: initialState,
      apply: applyDecisionEvent,
      wire: {
        viewSchema: projectionViewSchema,
        view: state => ({ decisions: state.decisions, agent: state.agent }),
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
      const state = session ? foldDecisions(session.snapshotEvents(), session.header) : undefined

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
