/**
 * DecisionTrace (Client half).
 *
 * Two surfaces, no more:
 *  - the session View "Decisions", which exists whether the plugin is on or
 *    off, so the default `mode: off` never hides the plugin;
 *  - the inline card for `decision_record`, registered only when the row
 *    config says `mode: on`.
 *
 * The card renders from the Tool call it belongs to. No I/O, no projection
 * reads, no DOM outside the component.
 *
 * @module dsh-decision-trace/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-decision-trace',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-decision-trace'
    const VIEW_ID = 'decisions'
    const TOOL_NAME = 'decision_record'
    const STATUS_PATH = '/decision-trace/status'
    const PROJECTION_KEY = 'decisionTrace'

    const messages = {
      en: {
        'tab.decisions': 'Decisions',
        'off.title': 'Decision trace is off',
        'off.body':
          'This plugin records the decisions the agent makes, as cards in the conversation and as a list in this view. It is off by default, because staying on costs a tool schema and a prompt section in every request. Nothing is recorded until you turn it on.',
        'off.action': 'Turn on',
        'off.openSettings': 'Open plugin settings',
        'off.copy': 'Copy config',
        'off.copied': 'Copied',
        'off.copyHint':
          'Paste it into the cordis.patch.yml of your profile, then reload the page.',
        'off.hint':
          'Or set mode: on in the dsh-decision-trace config of your profile patch, then reload.',
        'off.failed': 'Could not turn it on: {reason}',
        'view.title': 'Decisions',
        'view.count': '{n} recorded',
        'view.timeline': 'Timeline',
        'view.list': 'List',
        'view.export': 'Export .md',
        'view.emptyTitle': 'No decisions yet',
        'view.emptyBody':
          'The agent records a decision with decision_record when a choice changes the plan. It appears here and as a card in the conversation.',
        'detail.evidence': 'Evidence',
        'detail.call': 'call',
        'detail.result': 'result',
        'detail.asked': 'asked',
        'detail.askedWhat': 'What was being asked',
        'detail.supersedes': 'Replaces',
        'detail.replacedBy': 'replaced by',
        'card.label': 'Decision',
        'card.recording': 'recording',
        'card.rationale': 'Why',
        'card.alternatives': 'Alternatives considered',
        'card.files': 'Files',
        'card.dangling': 'Supersedes a decision that was not found:',
        'card.replaces': 'Replaces',
        'card.notRecorded': 'not recorded',
        'card.notRecordedBody': 'The record was rejected; the reason is in the tool result.',
        'status.proposed': 'proposed',
        'status.accepted': 'accepted',
        'status.rejected': 'rejected',
        'status.superseded': 'superseded',
        'category.architecture': 'architecture',
        'category.dependency': 'dependency',
        'category.data': 'data',
        'category.api': 'api',
        'category.security': 'security',
        'category.process': 'process',
        'category.other': 'other',
      },
      es: {
        'tab.decisions': 'Decisiones',
        'off.title': 'El registro de decisiones está apagado',
        'off.body':
          'Este plugin registra las decisiones que toma el agente, como tarjetas en la conversación y como lista en esta vista. Está apagado por defecto, porque estar encendido cuesta un schema de tool y una sección de prompt en cada request. No se registra nada hasta que lo actives.',
        'off.action': 'Activar',
        'off.openSettings': 'Abrir ajustes del plugin',
        'off.copy': 'Copiar configuración',
        'off.copied': 'Copiado',
        'off.copyHint':
          'Pegala en el cordis.patch.yml de tu perfil y recargá la página.',
        'off.hint':
          'O poné mode: on en la configuración de dsh-decision-trace del patch de tu perfil, y recargá.',
        'off.failed': 'No se pudo activar: {reason}',
        'view.title': 'Decisiones',
        'view.count': '{n} registradas',
        'view.timeline': 'Línea de tiempo',
        'view.list': 'Lista',
        'view.export': 'Exportar .md',
        'view.emptyTitle': 'Todavía no hay decisiones',
        'view.emptyBody':
          'El agente registra una decisión con decision_record cuando una elección cambia el rumbo. Aparece acá y como tarjeta en la conversación.',
        'detail.evidence': 'Evidencia',
        'detail.call': 'llamada',
        'detail.result': 'resultado',
        'detail.asked': 'pedido',
        'detail.askedWhat': 'Qué se estaba pidiendo',
        'detail.supersedes': 'Reemplaza a',
        'detail.replacedBy': 'reemplazada por',
        'card.label': 'Decisión',
        'card.recording': 'registrando',
        'card.rationale': 'Por qué',
        'card.alternatives': 'Alternativas consideradas',
        'card.files': 'Archivos',
        'card.dangling': 'Reemplaza una decisión que no se encontró:',
        'card.replaces': 'Reemplaza a',
        'card.notRecorded': 'no registrada',
        'card.notRecordedBody': 'El registro fue rechazado; el motivo está en el resultado de la tool.',
        'status.proposed': 'propuesta',
        'status.accepted': 'aceptada',
        'status.rejected': 'rechazada',
        'status.superseded': 'reemplazada',
        'category.architecture': 'arquitectura',
        'category.dependency': 'dependencia',
        'category.data': 'datos',
        'category.api': 'API',
        'category.security': 'seguridad',
        'category.process': 'proceso',
        'category.other': 'otra',
      },
    }

    const CSS = `
.dt-card{box-sizing:border-box;display:flex;flex-direction:column;gap:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:11px 13px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);max-width:100%}
.dt-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dt-label{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dt-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dt-status{font-size:11px;font-weight:600;padding:0 7px;border-radius:999px;border:1px solid currentColor}
.dt-status-proposed{color:var(--dsw-alias-state-idle-primary)}
.dt-status-accepted{color:var(--dsw-alias-state-success-primary)}
.dt-status-rejected{color:var(--dsw-alias-state-error-primary)}
.dt-status-superseded{color:var(--dsw-alias-state-warn-primary)}
.dt-category{font-size:11px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 7px}
.dt-recording{font-size:11px;color:var(--dsw-alias-label-secondary);font-style:italic}
.dt-title{font-weight:600;overflow-wrap:anywhere}
.dt-rationale{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;white-space:pre-wrap}
.dt-section-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:3px}
.dt-alts{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:3px}
.dt-alts li{overflow-wrap:anywhere}
.dt-opt{font-weight:500}
.dt-why{color:var(--dsw-alias-label-secondary)}
.dt-files{display:flex;gap:5px;flex-wrap:wrap}
.dt-file{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:1px 6px;overflow-wrap:anywhere;max-width:100%}
.dt-warn{font-size:11px;color:var(--dsw-alias-state-warn-primary);overflow-wrap:anywhere}
.dt-replaces{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dt-card-error{border-color:var(--dsw-alias-state-error-primary)}
.dt-view{box-sizing:border-box;height:100%;overflow:auto;padding:28px 32px;color:var(--dsw-alias-label-primary)}
.dt-view-inner{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.dt-view-title{margin:0;font-size:16px;font-weight:600}
.dt-view-body{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dt-headrow{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.dt-count{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dt-list{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.dt-item{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;overflow:hidden}
.dt-item-open{border-color:var(--dsw-alias-border-l2)}
.dt-item-head{display:flex;align-items:center;gap:9px;width:100%;box-sizing:border-box;padding:10px 12px;background:transparent;border:0;font:inherit;color:inherit;text-align:left;cursor:pointer}
.dt-item-head:hover{background:var(--dsw-alias-bg-layer-2)}
.dt-item-title{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dt-chevron{color:var(--dsw-alias-label-secondary);font-size:12px}
.dt-detail{display:flex;flex-direction:column;gap:9px;padding:0 12px 12px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:2px;padding-top:10px}
.dt-evidence{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.dt-ev-label{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dt-ev{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:1px 6px;color:var(--dsw-alias-label-secondary)}
.dt-asked{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;white-space:pre-wrap}
.dt-view-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dt-mode{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;overflow:hidden}
.dt-mode button{font:inherit;font-size:12px;padding:4px 11px;background:transparent;border:0;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dt-mode button:hover{color:var(--dsw-alias-label-primary)}
.dt-mode button[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500}
.dt-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dt-button-small{font-size:12px;padding:4px 10px}
.dt-timeline{display:flex;flex-direction:column;margin-top:6px}
.dt-tl-item{position:relative;padding-left:28px}
.dt-tl-rail{position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--dsw-alias-border-l1)}
.dt-tl-item:first-child .dt-tl-rail{top:20px}
.dt-tl-item:last-child .dt-tl-rail{bottom:auto;height:20px}
.dt-tl-item:only-child .dt-tl-rail{display:none}
.dt-tl-node{position:absolute;left:3px;top:15px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.dt-node-accepted{background:var(--dsw-alias-state-success-primary)}
.dt-node-rejected{background:var(--dsw-alias-state-error-primary)}
.dt-node-proposed{background:var(--dsw-alias-state-idle-primary)}
.dt-node-superseded{background:var(--dsw-alias-state-warn-primary)}
.dt-tl-body{display:flex;flex-direction:column;border-radius:8px}
.dt-tl-head{display:flex;flex-direction:column;gap:3px;width:100%;box-sizing:border-box;padding:7px 9px;background:transparent;border:0;border-radius:8px;font:inherit;color:inherit;text-align:left;cursor:pointer}
.dt-tl-head:hover{background:var(--dsw-alias-bg-layer-1)}
.dt-tl-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dt-tl-spacer{flex:1}
.dt-tl-title{font-weight:600;line-height:1.45;overflow-wrap:anywhere}
.dt-time{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dt-link{font-size:11px;color:var(--dsw-alias-state-warn-primary);white-space:nowrap}
.dt-tl-body>.dt-detail{border-top:0;padding:2px 9px 10px;margin-top:0}
.dt-dim{opacity:.72}
.dt-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dt-button{font:inherit;font-size:13px;font-weight:500;cursor:pointer;border-radius:7px;padding:6px 13px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dt-button:hover{background:var(--dsw-alias-bg-layer-2)}
.dt-button:disabled{cursor:default;opacity:.6}
.dt-button-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dt-hint{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dt-error{margin:0;font-size:12px;color:var(--dsw-alias-state-error-primary)}
`

    function parseMaybe(value) {
      if (value && typeof value === 'object') return value
      if (typeof value !== 'string' || value === '') return undefined
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' ? parsed : undefined
      } catch {
        return undefined
      }
    }

    function callArguments(block) {
      if (!block || typeof block !== 'object') return undefined
      const candidates = [
        block.arguments,
        block.args,
        block.input,
        block.rawInput,
        block.call && block.call.arguments,
        block.node && block.node.arguments,
      ]
      for (const candidate of candidates) {
        const parsed = parseMaybe(candidate)
        if (parsed) return parsed
      }
      return undefined
    }

    /** Find the recorded decision inside whatever stage the Tool view received. */
    function recordedDecision(block) {
      const seen = new Set()
      const walk = (value, depth) => {
        if (!value || typeof value !== 'object' || depth > 3 || seen.has(value)) return undefined
        seen.add(value)
        const decision = value.decision
        if (decision && typeof decision === 'object' && typeof decision.id === 'string') {
          return decision
        }
        if (typeof value.id === 'string' && value.id.startsWith('d-') && typeof value.title === 'string') {
          return value
        }
        for (const key of ['meta', 'result', 'value', 'node', 'call', 'data', 'view', 'output']) {
          const found = walk(value[key], depth + 1)
          if (found) return found
        }
        return undefined
      }
      return walk(block, 0)
    }

    function errorText(block) {
      const content = block?.result?.content ?? block?.content
      if (!Array.isArray(content)) return ''
      return content
        .filter(entry => entry && entry.type === 'text' && typeof entry.text === 'string')
        .map(entry => entry.text)
        .join(' ')
        .trim()
    }

    function DecisionCard(props) {
      const t = props.t
      const block = props.block
      const args = callArguments(block) ?? {}
      const meta = recordedDecision(block) ?? {}

      const id = typeof meta.id === 'string' ? meta.id : ''
      const title = (typeof meta.title === 'string' && meta.title) || args.title || ''
      const status = (typeof meta.status === 'string' && meta.status) || args.status || 'proposed'
      const category =
        (typeof meta.category === 'string' && meta.category) || args.category || 'other'
      const rationale =
        (typeof meta.rationale === 'string' && meta.rationale) || args.rationale || ''
      const alternatives = Array.isArray(meta.alternatives) && meta.alternatives.length
        ? meta.alternatives
        : Array.isArray(args.alternatives)
          ? args.alternatives
          : []
      const files = Array.isArray(meta.files) && meta.files.length
        ? meta.files
        : Array.isArray(args.files)
          ? args.files
          : []
      const pending = props.phase !== 'result'
      // The card shows the reference it was given. Whether that id resolves is
      // decided by the fold, which is what the Decisions view reads.
      const replaces =
        (typeof meta.supersedes === 'string' && meta.supersedes) ||
        (typeof args.supersedes === 'string' && args.supersedes) ||
        ''
      const errored =
        block?.isError === true ||
        block?.result?.isError === true ||
        block?.message?.isError === true

      if (errored) {
        return h(
          'div',
          { className: 'dt-card dt-card-error' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'dt-head' },
            h('span', { className: 'dt-label' }, t('card.label')),
            h(
              'span',
              { className: 'dt-status dt-status-rejected' },
              t('card.notRecorded'),
            ),
          ),
          title ? h('div', { className: 'dt-title' }, title) : null,
          h('div', { className: 'dt-warn' }, errorText(block) || t('card.notRecordedBody')),
        )
      }

      return h(
        'div',
        { className: 'dt-card' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dt-head' },
          h('span', { className: 'dt-label' }, t('card.label')),
          id ? h('span', { className: 'dt-id' }, id) : null,
          h('span', { className: `dt-status dt-status-${status}` }, t(`status.${status}`)),
          h('span', { className: 'dt-category' }, t(`category.${category}`)),
          pending ? h('span', { className: 'dt-recording' }, t('card.recording')) : null,
        ),
        title ? h('div', { className: 'dt-title' }, title) : null,
        rationale ? h('div', { className: 'dt-rationale' }, rationale) : null,
        replaces
          ? h('div', { className: 'dt-replaces' }, `${t('card.replaces')} ${replaces}`)
          : null,
        alternatives.length
          ? h(
              'div',
              null,
              h('div', { className: 'dt-section-title' }, t('card.alternatives')),
              h(
                'ul',
                { className: 'dt-alts' },
                alternatives.map((entry, index) =>
                  h(
                    'li',
                    { key: index },
                    h('span', { className: 'dt-opt' }, String(entry?.option ?? '')),
                    entry?.rejected_because
                      ? h('span', { className: 'dt-why' }, ` — ${entry.rejected_because}`)
                      : null,
                  ),
                ),
              ),
            )
          : null,
        files.length
          ? h(
              'div',
              null,
              h('div', { className: 'dt-section-title' }, t('card.files')),
              h(
                'div',
                { className: 'dt-files' },
                files.map((file, index) =>
                  h('span', { key: index, className: 'dt-file' }, String(file)),
                ),
              ),
            )
          : null,
      )
    }

    const CONFIG_SNIPPET = [
      '- id: dsh-decision-trace',
      '  config:',
      '    mode: on',
    ].join('\n')

    function decisionEvidence(decision, t) {
      const items = [
        h('span', { key: 'label', className: 'dt-ev-label' }, t('detail.evidence')),
        h('span', { key: 'call', className: 'dt-ev' }, `${t('detail.call')} #${decision.callSeq}`),
        h(
          'span',
          { key: 'result', className: 'dt-ev' },
          `${t('detail.result')} #${decision.resultSeq}`,
        ),
      ]
      if (typeof decision.askedSeq === 'number') {
        items.push(
          h(
            'span',
            { key: 'asked', className: 'dt-ev' },
            `${t('detail.asked')} #${decision.askedSeq}`,
          ),
        )
      }
      return h('div', { className: 'dt-evidence' }, items)
    }

    function decisionDetail(decision, t) {
      const parts = []
      if (decision.rationale) {
        parts.push(
          h(
            'div',
            { key: 'why' },
            h('div', { className: 'dt-section-title' }, t('card.rationale')),
            h('div', { className: 'dt-rationale' }, decision.rationale),
          ),
        )
      }
      if (decision.dangling && decision.supersedes) {
        parts.push(
          h(
            'div',
            { key: 'dangling', className: 'dt-warn' },
            `${t('card.dangling')} ${decision.supersedes}`,
          ),
        )
      } else if (decision.supersedes) {
        parts.push(
          h(
            'div',
            { key: 'supersedes', className: 'dt-why' },
            `${t('detail.supersedes')} ${decision.supersedes}`,
          ),
        )
      }
      if (Array.isArray(decision.alternatives) && decision.alternatives.length) {
        parts.push(
          h(
            'div',
            { key: 'alts' },
            h('div', { className: 'dt-section-title' }, t('card.alternatives')),
            h(
              'ul',
              { className: 'dt-alts' },
              decision.alternatives.map((entry, index) =>
                h(
                  'li',
                  { key: index },
                  h('span', { className: 'dt-opt' }, String(entry?.option ?? '')),
                  entry?.rejected_because
                    ? h('span', { className: 'dt-why' }, ` — ${entry.rejected_because}`)
                    : null,
                ),
              ),
            ),
          ),
        )
      }
      if (Array.isArray(decision.files) && decision.files.length) {
        parts.push(
          h(
            'div',
            { key: 'files' },
            h('div', { className: 'dt-section-title' }, t('card.files')),
            h(
              'div',
              { className: 'dt-files' },
              decision.files.map((file, index) =>
                h('span', { key: index, className: 'dt-file' }, String(file)),
              ),
            ),
          ),
        )
      }
      if (decision.asked) {
        parts.push(
          h(
            'div',
            { key: 'asked' },
            h('div', { className: 'dt-section-title' }, t('detail.askedWhat')),
            h('div', { className: 'dt-asked' }, decision.asked),
          ),
        )
      }
      parts.push(h('div', { key: 'ev' }, decisionEvidence(decision, t)))
      return h('div', { className: 'dt-detail' }, parts)
    }

    function decisionRow(decision, open, onToggle, t) {
      const status = typeof decision.status === 'string' ? decision.status : 'proposed'
      const category = typeof decision.category === 'string' ? decision.category : 'other'
      return h(
        'div',
        { key: decision.id, className: `dt-item${open ? ' dt-item-open' : ''}` },
        h(
          'button',
          {
            type: 'button',
            className: 'dt-item-head',
            'aria-expanded': open,
            onClick: onToggle,
          },
          h('span', { className: 'dt-id' }, String(decision.id)),
          h('span', { className: `dt-status dt-status-${status}` }, t(`status.${status}`)),
          h('span', { className: 'dt-category' }, t(`category.${category}`)),
          h('span', { className: 'dt-item-title' }, String(decision.title ?? '')),
          h('span', { className: 'dt-chevron' }, open ? '▾' : '▸'),
        ),
        open ? decisionDetail(decision, t) : null,
      )
    }

    function relativeTime(at) {
      if (typeof at !== 'number' || !Number.isFinite(at)) return ''
      const delta = at - Date.now()
      try {
        const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        for (const [unit, ms] of [
          ['day', 86400000],
          ['hour', 3600000],
          ['minute', 60000],
        ]) {
          if (Math.abs(delta) >= ms) return format.format(Math.round(delta / ms), unit)
        }
        return format.format(Math.round(delta / 1000), 'second')
      } catch {
        return ''
      }
    }

    function absoluteTime(at) {
      if (typeof at !== 'number' || !Number.isFinite(at)) return ''
      try {
        return new Date(at).toLocaleString()
      } catch {
        return ''
      }
    }

    /** Which decision replaced each superseded id, for the rail annotation. */
    function supersededIndex(decisions) {
      const map = new Map()
      for (const decision of decisions) {
        const target = decision && decision.supersedes
        if (typeof target === 'string' && !map.has(target)) map.set(target, decision.id)
      }
      return map
    }

    function timelineItem(decision, open, onToggle, t, supersededBy) {
      const status = typeof decision.status === 'string' ? decision.status : 'proposed'
      const category = typeof decision.category === 'string' ? decision.category : 'other'
      const replacedBy = supersededBy.get(decision.id)
      return h(
        'div',
        {
          key: decision.id,
          className: `dt-tl-item${status === 'superseded' || replacedBy ? ' dt-dim' : ''}`,
        },
        h('span', { className: 'dt-tl-rail', 'aria-hidden': true }),
        h('span', { className: `dt-tl-node dt-node-${status}`, 'aria-hidden': true }),
        h(
          'div',
          { className: 'dt-tl-body' },
          h(
            'button',
            {
              type: 'button',
              className: 'dt-tl-head',
              'aria-expanded': open,
              onClick: onToggle,
            },
            h(
              'span',
              { className: 'dt-tl-meta' },
              h('span', { className: 'dt-id' }, String(decision.id)),
              h('span', { className: `dt-status dt-status-${status}` }, t(`status.${status}`)),
              h('span', { className: 'dt-category' }, t(`category.${category}`)),
              h('span', { className: 'dt-tl-spacer' }),
              replacedBy
                ? h('span', { className: 'dt-link' }, `${t('detail.replacedBy')} ${replacedBy}`)
                : null,
              h(
                'span',
                { className: 'dt-time', title: absoluteTime(decision.at) },
                relativeTime(decision.at),
              ),
            ),
            h('span', { className: 'dt-tl-title' }, String(decision.title ?? '')),
          ),
          open ? decisionDetail(decision, t) : null,
        ),
      )
    }

    /** The same decisions the view shows, as a file the reader can keep. */
    function decisionsMarkdown(decisions, sessionId) {
      const out = ['# Decisions', '']
      if (typeof sessionId === 'string' && sessionId !== '') out.push(`Session: \`${sessionId}\`  `)
      out.push(`Recorded: ${decisions.length}`, '')
      for (const decision of decisions) {
        const status = typeof decision.status === 'string' ? decision.status : 'proposed'
        const category = typeof decision.category === 'string' ? decision.category : 'other'
        out.push(`## ${decision.id} · ${status} · ${category}`, '')
        out.push(`**${String(decision.title ?? '')}**`, '')
        if (decision.rationale) out.push(String(decision.rationale), '')
        if (decision.supersedes) {
          out.push(
            `Replaces: ${decision.supersedes}${decision.dangling ? ' (not found)' : ''}`,
            '',
          )
        }
        if (Array.isArray(decision.alternatives) && decision.alternatives.length) {
          out.push('Alternatives:', '')
          for (const alternative of decision.alternatives) {
            out.push(
              `- **${String(alternative?.option ?? '')}**${
                alternative?.rejected_because ? ` — ${alternative.rejected_because}` : ''
              }`,
            )
          }
          out.push('')
        }
        if (Array.isArray(decision.files) && decision.files.length) {
          out.push(`Files: ${decision.files.map(file => `\`${file}\``).join(', ')}`, '')
        }
        const evidence = [`call #${decision.callSeq}`, `result #${decision.resultSeq}`]
        if (typeof decision.askedSeq === 'number') evidence.push(`asked #${decision.askedSeq}`)
        out.push(`Evidence: ${evidence.join(' · ')}`, '')
        if (decision.asked) out.push(`> ${String(decision.asked).replace(/\s+/g, ' ')}`, '')
      }
      return `${out.join('\n').trimEnd()}\n`
    }

    function downloadText(name, text) {
      try {
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = name
        anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return true
      } catch {
        return false
      }
    }

    function DecisionsView(props) {
      const t = props.t
      const [state, setState] = React.useState({ status: 'idle', reason: '' })
      const [openId, setOpenId] = React.useState(null)
      const [layout, setLayout] = React.useState('timeline')
      const { activate, openSettings } = props

      // The projection reaches the Client already folded by the Host; the view
      // never reads session events itself.
      const useProjection =
        typeof props.useProjection === 'function' ? props.useProjection : () => null
      const projection = useProjection(PROJECTION_KEY)
      const decisions =
        projection && Array.isArray(projection.decisions) ? projection.decisions : []

      const turnOn = () => {
        if (!activate) return
        setState({ status: 'saving', reason: '' })
        activate().then(
          () => window.location.reload(),
          error => setState({ status: 'failed', reason: String(error?.message ?? error) }),
        )
      }

      const copyConfig = () => {
        const clipboard = navigator.clipboard
        if (!clipboard || typeof clipboard.writeText !== 'function') {
          setState({ status: 'copied', reason: '' })
          return
        }
        clipboard.writeText(CONFIG_SNIPPET).then(
          () => setState({ status: 'copied', reason: '' }),
          () => setState({ status: 'copy-failed', reason: '' }),
        )
      }

      const busy = state.status === 'saving'
      const failed = state.status === 'failed'

      const controls = []
      if (activate) {
        controls.push(
          h(
            'button',
            {
              key: 'on',
              type: 'button',
              className: 'dt-button dt-button-primary',
              disabled: busy,
              onClick: turnOn,
            },
            t('off.action'),
          ),
        )
      }
      if (openSettings) {
        controls.push(
          h(
            'button',
            {
              key: 'settings',
              type: 'button',
              className: 'dt-button',
              onClick: openSettings,
            },
            t('off.openSettings'),
          ),
        )
      }
      controls.push(
        h(
          'button',
          { key: 'copy', type: 'button', className: 'dt-button', onClick: copyConfig },
          state.status === 'copied' ? t('off.copied') : t('off.copy'),
        ),
      )

      const header = props.enabled
        ? h(
            'div',
            { className: 'dt-view-head' },
            h(
              'div',
              { className: 'dt-headrow' },
              h(
                'h2',
                { className: 'dt-view-title' },
                decisions.length ? t('view.title') : t('view.emptyTitle'),
              ),
              decisions.length
                ? h(
                    'span',
                    { className: 'dt-count' },
                    t('view.count').split('{n}').join(String(decisions.length)),
                  )
                : null,
            ),
            decisions.length
              ? h(
                  'div',
                  { className: 'dt-head-actions' },
                  h(
                    'div',
                    { className: 'dt-mode' },
                    h(
                      'button',
                      {
                        type: 'button',
                        'aria-pressed': layout === 'timeline',
                        onClick: () => setLayout('timeline'),
                      },
                      t('view.timeline'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        'aria-pressed': layout === 'list',
                        onClick: () => setLayout('list'),
                      },
                      t('view.list'),
                    ),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dt-button dt-button-small',
                      onClick: () =>
                        downloadText(
                          `decisions-${props.sessionId ?? 'session'}.md`,
                          decisionsMarkdown(decisions, props.sessionId),
                        ),
                    },
                    t('view.export'),
                  ),
                )
              : null,
          )
        : h('h2', { className: 'dt-view-title' }, t('off.title'))

      const toggle = decision => () =>
        setOpenId(openId === decision.id ? null : decision.id)
      const replacedBy = supersededIndex(decisions)

      const body =
        props.enabled && decisions.length
          ? layout === 'timeline'
            ? h(
                'div',
                { className: 'dt-timeline' },
                decisions.map(decision =>
                  timelineItem(decision, openId === decision.id, toggle(decision), t, replacedBy),
                ),
              )
            : h(
                'div',
                { className: 'dt-list' },
                decisions.map(decision =>
                  decisionRow(decision, openId === decision.id, toggle(decision), t),
                ),
              )
          : h('p', { className: 'dt-view-body' }, props.enabled ? t('view.emptyBody') : t('off.body'))

      return h(
        'div',
        { className: 'dt-view' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dt-view-inner' },
          header,
          body,
          props.enabled ? null : h('div', { className: 'dt-actions' }, controls),
          props.enabled ? null : h('p', { className: 'dt-hint' }, t('off.hint')),
          state.status === 'copied' || state.status === 'copy-failed'
            ? h('p', { className: 'dt-hint' }, t('off.copyHint'))
            : null,
          failed
            ? h(
                'p',
                { className: 'dt-error' },
                t('off.failed').split('{reason}').join(state.reason),
              )
            : null,
        ),
      )
    }

    function readMode(config) {
      const value = config?.mode
      if (value && typeof value === 'object' && typeof value.get === 'function') {
        try {
          return value.get() === 'on' ? 'on' : 'off'
        } catch {
          return 'off'
        }
      }
      return value === 'on' ? 'on' : 'off'
    }

    /**
     * The bundle-config form, when this build exposes one. Absent shapes are
     * treated as "no activator here" instead of a dead button.
     */
    function configForm(ctx) {
      const forms = ctx.get('configForms')
      if (!forms || typeof forms.get !== 'function') return undefined
      try {
        const form = forms.get(NS)
        return form && typeof form.set === 'function' ? form : undefined
      } catch {
        return undefined
      }
    }

    async function hostMode() {
      if (typeof fetch !== 'function') return 'off'
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined
      const timer = controller ? setTimeout(() => controller.abort(), 2000) : undefined
      try {
        const response = await fetch(STATUS_PATH, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller?.signal,
        })
        if (!response.ok) return 'off'
        const body = await response.json()
        return body && body.mode === 'on' ? 'on' : 'off'
      } catch {
        return 'off'
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
    }

    /**
     * The browser half is built from the client graph, not from the row, so
     * the config is normally absent here: the Host's status route is the
     * authoritative answer. The config is still honoured when a build does
     * pass it.
     */
    async function resolveMode(config) {
      if (readMode(config) === 'on') return 'on-config'
      return (await hostMode()) === 'on' ? 'on-route' : 'off'
    }

    async function apply(ctx, config) {
      ctx.effect(() => ctx.locale.register(NS, messages), 'decision-trace: dictionaries')
      const t = ctx.locale.bind(NS)

      const form = configForm(ctx)
      const layout = ctx.get('layout')
      const activate = form
        ? () => Promise.resolve().then(() => form.set('mode', 'on'))
        : undefined
      const openSettings =
        layout && typeof layout.selectPanel === 'function'
          ? () => layout.selectPanel('plugins')
          : undefined

      const resolved = await resolveMode(config)
      const enabled = resolved !== 'off'

      ctx.slots.inject('conversation.view', () =>
        ctx.slots.register(
          {
            name: 'conversation.view',
            id: VIEW_ID,
            order: 25,
            locale: NS,
            label: () => t('tab.decisions'),
          },
          props =>
            h(DecisionsView, {
              ...props,
              t,
              enabled,
              activate,
              openSettings,
            }),
        ),
      )

      if (!enabled) return

      ctx.slots.inject('tool.call.toolview', () =>
        ctx.slots.register(
          {
            name: 'tool.call.toolview',
            key: TOOL_NAME,
          },
          props => h(DecisionCard, { ...props, t }),
        ),
      )
    }

    return { name: NS, inject: ['slots', 'locale'], apply }
  },
})
