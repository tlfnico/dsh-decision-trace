import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyDecisionEvent,
  foldDecisions,
  initialState,
  nextDecisionId,
} from '../fold.js'

const header = {
  origin: 'subagent',
  delegationDepth: 1,
  agentPreset: 'standard',
  parentSession: 'session-parent',
}

const callEvent = (seq, callId, args) => ({
  type: 'tool/call',
  seq,
  time: 1000 + seq,
  data: {
    turn: 1,
    step: 1,
    callId,
    name: 'decision_record',
    arguments: JSON.stringify(args),
  },
})

const resultEvent = (seq, callId, decision, options = {}) => {
  const { isError = false } = options
  // `'time' in options` so a test can pass an explicit undefined and mean it.
  const time = 'time' in options ? options.time : 2000 + seq
  return {
    type: 'tool/result',
    seq,
    time,
    data: {
      turn: 1,
      step: 1,
      message: { toolCallId: callId, ...(isError ? { isError: true } : {}) },
      ...(decision === undefined ? {} : { meta: { decision } }),
    },
  }
}

// `user/message` carries the message itself in `data`, not wrapped in
// `message` the way developer and system events do.
const userEvent = (seq, text) => ({
  type: 'user/message',
  seq,
  time: 500 + seq,
  data: { role: 'user', content: [{ type: 'text', text }] },
})

const recorded = (id, extra = {}) => ({
  id,
  title: `title-${id}`,
  status: 'accepted',
  category: 'api',
  rationale: `why-${id}`,
  ...extra,
})

/** One complete record: call, then result. */
const record = (callSeq, callId, decision, options) => [
  callEvent(callSeq, callId, { title: 'from args', category: 'api', rationale: 'r' }),
  resultEvent(callSeq + 1, callId, decision, options),
]

test('the session start comes from the header and prompts become timeline nodes', () => {
  const state = foldDecisions(
    [userEvent(1, 'build me a plugin'), userEvent(5, 'now add filters')],
    { ...header, createdAt: 1700000000000 },
  )
  assert.equal(state.startedAt, 1700000000000)
  assert.deepEqual(
    state.prompts.map(prompt => [prompt.seq, prompt.at, prompt.text]),
    [
      [1, 501, 'build me a plugin'],
      [5, 505, 'now add filters'],
    ],
  )
})

test('a prompt with no text opens a turn but adds no timeline node', () => {
  const state = foldDecisions([userEvent(1, '')], header)
  assert.equal(state.lastUser.seq, 1)
  assert.deepEqual(state.prompts, [])
})

test('a wrapped user message is still read, in case a build nests it', () => {
  const wrapped = {
    type: 'user/message',
    seq: 1,
    time: 501,
    data: { message: { role: 'user', content: [{ type: 'text', text: 'wrapped' }] } },
  }
  const state = foldDecisions([wrapped], header)
  assert.equal(state.prompts[0].text, 'wrapped')
  assert.equal(state.lastUser.text, 'wrapped')
})

test('prompts are bounded but the session-opening prompt survives the cap', () => {
  const events = []
  for (let seq = 1; seq <= 60; seq += 1) events.push(userEvent(seq, `prompt ${seq}`))
  const state = foldDecisions(events, header)
  assert.equal(state.prompts.length, 20)
  assert.equal(state.prompts[0].text, 'prompt 41')
  assert.equal(state.firstPrompt.text, 'prompt 1', 'the opening prompt is never dropped')
})

test('an empty log keeps the agent context and no decisions', () => {
  const state = foldDecisions([], header)
  assert.deepEqual(state.decisions, [])
  assert.equal(state.agent.origin, 'subagent')
  assert.equal(state.agent.depth, 1)
  assert.equal(state.agent.preset, 'standard')
  assert.equal(state.agent.parent, 'session-parent')
})

test('a recorded call becomes the first decision with every field mapped', () => {
  const state = foldDecisions(
    [
      callEvent(1, 'call-a', {
        title: 'from args',
        category: 'api',
        rationale: 'from args',
        files: ['src/a.ts'],
        alternatives: [{ option: 'x', rejected_because: 'slower' }],
      }),
      resultEvent(2, 'call-a', recorded('d-1')),
    ],
    header,
  )

  assert.equal(state.decisions.length, 1)
  const decision = state.decisions[0]
  assert.equal(decision.id, 'd-1')
  assert.equal(decision.title, 'title-d-1', 'the result wins over the arguments')
  assert.equal(decision.status, 'accepted')
  assert.equal(decision.category, 'api')
  assert.equal(decision.rationale, 'why-d-1')
  assert.deepEqual(decision.files, ['src/a.ts'])
  assert.deepEqual(decision.alternatives, [{ option: 'x', rejected_because: 'slower' }])
  assert.equal(decision.callSeq, 1)
  assert.equal(decision.resultSeq, 2)
  assert.equal(decision.at, 2002)
  assert.equal(decision.supersedes, null)
  assert.equal(decision.dangling, false)
})

test('a rejected record leaves no decision and consumes no id', () => {
  const state = foldDecisions(
    [
      ...record(1, 'call-a', recorded('d-1'), { isError: true }),
      ...record(3, 'call-b', recorded('d-1')),
    ],
    header,
  )
  assert.equal(state.decisions.length, 1)
  assert.equal(state.decisions[0].id, 'd-1')
  assert.equal(nextDecisionId(state), 'd-2')
})

test('a result without recorded meta leaves no decision', () => {
  const state = foldDecisions(record(1, 'call-a', undefined), header)
  assert.equal(state.decisions.length, 0)
  assert.deepEqual(state.pending, [])
  assert.equal(nextDecisionId(state), 'd-1')
})

test('ids follow the highest recorded id, not the count', () => {
  const state = foldDecisions(
    [...record(1, 'call-a', recorded('d-1')), ...record(3, 'call-b', recorded('d-2'))],
    header,
  )
  assert.deepEqual(
    state.decisions.map(entry => entry.id),
    ['d-1', 'd-2'],
  )
  assert.equal(nextDecisionId(state), 'd-3')
})

test('a resolved supersedes keeps the reference and is not dangling', () => {
  const state = foldDecisions(
    [
      ...record(1, 'call-a', recorded('d-1')),
      callEvent(3, 'call-b', { title: 'b', category: 'api', rationale: 'r', supersedes: 'd-1' }),
      resultEvent(4, 'call-b', recorded('d-2', { supersedes: 'd-1' })),
    ],
    header,
  )
  assert.equal(state.decisions[1].supersedes, 'd-1')
  assert.equal(state.decisions[1].dangling, false)
})

test('an unresolved supersedes is recorded and marked dangling', () => {
  const state = foldDecisions(
    [
      callEvent(1, 'call-a', { title: 'a', category: 'api', rationale: 'r', supersedes: 'd-9' }),
      resultEvent(2, 'call-a', recorded('d-1', { supersedes: 'd-9' })),
    ],
    header,
  )
  assert.equal(state.decisions[0].supersedes, 'd-9')
  assert.equal(state.decisions[0].dangling, true)
})

test('a call-id fallback id is kept and never shifts the sequence', () => {
  const state = foldDecisions(
    [
      callEvent(1, 'call-a', { title: 'a', category: 'api', rationale: 'r' }),
      resultEvent(2, 'call-a', { id: 'call-a', title: 'a', status: 'accepted' }),
    ],
    header,
  )
  assert.equal(state.decisions[0].id, 'call-a')
  assert.equal(nextDecisionId(state), 'd-1', 'a non d-N id must not move the sequence')
})

test('the same log folds twice to the same state', () => {
  const events = [
    userEvent(1, 'please decide'),
    ...record(2, 'call-a', recorded('d-1')),
    ...record(4, 'call-b', recorded('d-2', { supersedes: 'd-1' })),
  ]
  const first = foldDecisions(events, header)
  const second = foldDecisions(events.map(event => ({ ...event })), header)
  assert.deepEqual(second, first)
})

test('an ignored event returns the same state reference', () => {
  const state = initialState(header)
  const next = applyDecisionEvent(state, { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } })
  assert.equal(next, state)
})

test('a foreign tool call does not start a pending record', () => {
  const state = foldDecisions(
    [
      {
        type: 'tool/call',
        seq: 1,
        time: 1,
        data: { turn: 1, step: 1, callId: 'x', name: 'other_tool', arguments: '{}' },
      },
    ],
    header,
  )
  assert.deepEqual(state.pending, [])
})

test('the user message that opened the turn becomes the evidence of the next decision', () => {
  const state = foldDecisions(
    [userEvent(1, 'should we ship it?'), ...record(2, 'call-a', recorded('d-1'))],
    header,
  )
  assert.equal(state.decisions[0].askedSeq, 1)
  assert.equal(state.decisions[0].asked, 'should we ship it?')
})

test('a result with no time has no time, instead of reading the clock', () => {
  const state = foldDecisions(record(1, 'call-a', recorded('d-1'), { time: undefined }), header)
  assert.equal(state.decisions[0].at, 0)
})

test('arguments supply the fields the result does not carry', () => {
  const state = foldDecisions(
    [
      callEvent(1, 'call-a', {
        title: 'from args',
        category: 'data',
        rationale: 'argued',
        alternatives: [{ option: 'a', rejected_because: 'b' }, { option: '' }],
        files: ['x'],
      }),
      resultEvent(2, 'call-a', { id: 'd-1' }),
    ],
    header,
  )
  const decision = state.decisions[0]
  assert.equal(decision.title, 'from args')
  assert.equal(decision.category, 'data')
  assert.equal(decision.rationale, 'argued')
  assert.deepEqual(decision.alternatives, [{ option: 'a', rejected_because: 'b' }])
  assert.deepEqual(decision.files, ['x'])
  assert.equal(decision.status, 'proposed')
})
