import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * A render smoke test with no React and no browser.
 *
 * `client.js` is a plain script that registers a module on
 * `window.__ModuleLoader__`; with a fake loader and a fake `React` whose hooks
 * return their initial value, the view can be executed head-on. That is enough
 * to catch what `node --check` cannot: a value used before its declaration
 * (temporal dead zone), a missing helper, a crash inside the render path.
 *
 * It runs one render pass, so it does not test state updates or effects.
 */

const React = {
  Fragment: 'Fragment',
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial
    return [value, () => {}]
  },
  useEffect() {},
}

const requireStub = id => {
  if (id === 'react') return React
  throw new Error(`unexpected require: ${id}`)
}

/** Execute every function component in a tree, so their bodies actually run. */
function render(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(render)
  if (typeof node.type === 'function') return render(node.type(node.props))
  return { type: node.type, children: node.children.map(render) }
}

function collectText(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  collectText(node.children ?? [], out)
  return out
}

const decision = {
  id: 'd-7',
  title: 'One pure fold',
  category: 'architecture',
  status: 'accepted',
  rationale: 'because',
  alternatives: [{ option: 'two folds', rejected_because: 'they drift' }],
  files: ['fold.js'],
  weight: 'minor',
  supersedes: 'd-6',
  dangling: false,
  callSeq: 10,
  resultSeq: 11,
  at: Date.now() - 60000,
  askedSeq: 9,
  asked: 'what should we do',
}

const projection = {
  decisions: [decision],
  agent: { origin: 'subagent', depth: 1, preset: 'standard', parent: 'session-parent' },
  startedAt: Date.now() - 120000,
  firstPrompt: { seq: 1, at: Date.now() - 120000, text: 'build me a plugin' },
  prompts: [
    { seq: 1, at: Date.now() - 120000, text: 'build me a plugin' },
    { seq: 9, at: Date.now() - 90000, text: 'what should we do' },
  ],
}

function context() {
  const ctx = {
    effect(callback) {
      callback()
      return () => {}
    },
    on() {
      return () => {}
    },
    get() {
      return undefined
    },
    locale: {
      register() {
        return () => {}
      },
      bind() {
        return key => key
      },
    },
    slots: {
      registered: [],
      inject(_key, callback) {
        callback()
        return () => {}
      },
      register(options, component) {
        ctx.slots.registered.push({ options, component })
        return () => {}
      },
    },
  }
  return ctx
}

let pluginRef = null
let modulePromise = null

/** The module body runs once; every mount reuses it and gets a fresh context. */
function loadClient() {
  if (modulePromise !== null) return modulePromise
  globalThis.window = {
    __ModuleLoader__: {
      load({ factory }) {
        pluginRef = factory(requireStub)
      },
    },
  }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ mode: 'on' }) })
  modulePromise = (async () => {
    await import('../client.js')
    assert.ok(pluginRef, 'the module registers itself on the loader')
    return pluginRef
  })()
  return modulePromise
}

const viewComponent = async () => {
  const plugin = await loadClient()
  const ctx = context()
  await plugin.apply(ctx, {})
  const entry = ctx.slots.registered.find(item => item.options.name === 'conversation.view')
  assert.ok(entry, 'the Decisions view is registered')
  return entry.component
}

test('the Decisions view renders with a full projection', async () => {
  const component = await viewComponent()
  const tree = render(
    component({ sessionId: 'session-1', useProjection: () => projection, openFile() {} }),
  )
  const text = collectText(tree).join(' ')
  assert.match(text, /d-7/, 'the decision id is rendered')
  assert.match(text, /One pure fold/, 'the decision title is rendered')
})

test('the Decisions view renders with an empty projection', async () => {
  const component = await viewComponent()
  const tree = render(
    component({
      sessionId: 'session-1',
      useProjection: () => ({ decisions: [], agent: null, startedAt: 0, firstPrompt: null, prompts: [] }),
      openFile() {},
    }),
  )
  assert.ok(collectText(tree).length > 0, 'the empty state renders text')
})

test('the Decisions view renders without a projection at all', async () => {
  const component = await viewComponent()
  const tree = render(
    component({ sessionId: 'session-1', useProjection: () => null, openFile() {} }),
  )
  assert.ok(collectText(tree).length > 0, 'a missing projection still renders the empty state')
})
