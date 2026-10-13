// Detalle de un elemento: texto original y cada respuesta de Decision-1 con sus probabilidades.
import { h, fmt, jsonHtml, openModal } from './util.js';
import { S } from './core.js';
import { t, tn } from './i18n.js';
import { answerViz } from './views/answer.js';
import { metaChips, primary } from './views/common.js';
import { showJson } from './notes.js';
import { rivalLabel } from './race.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Del JSON de un lote, se queda solo con las claves de este elemento ("<id>__<pregunta>"). */
function pickItem(value, id) {
  const pre = `${id}__`;
  const walk = (o) => {
    if (!o || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(walk);
    const keys = Object.keys(o);
    if (keys.some((k) => k.startsWith(pre))) return Object.fromEntries(keys.filter((k) => k.startsWith(pre)).map((k) => [k, o[k]]));
    return Object.fromEntries(keys.map((k) => [k, walk(o[k])]));
  };
  return walk(value);
}

export function openItem(sc, st, id) {
  const it = sc.items.find((x) => x.id === id);
  if (!it) return;
  const res = st.results[id];
  const llm = st.llm?.results?.[id];
  const m = st.meta?.items?.[id];
  const p = res ? primary({ sc, st, threshold: S.threshold }, id) : null;

  const conf = { conf: fmt.pct(p?.a?.confidence), thr: fmt.pct(S.threshold) };
  const verdict = p
    ? h(
        'div',
        { class: `im-verdict${p.low ? ' low' : ''}` },
        p.low ? `👀 ${sc.review_label}` : t('✅ Automatizado'),
        h('small', null, p.low ? t('confianza {conf} < umbral {thr}', conf) : t('confianza {conf} ≥ umbral {thr}', conf)),
      )
    : null;

  const head = h(
    'div',
    { class: 'im-head' },
    h('span', { class: 'case-icon' }, sc.icon),
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'case-kicker' }, `${sc.title} · ${sc.brand}`),
      h('h2', null, `${cap(sc.item_label)} ${id}`),
      h('div', { class: 'im-chips' }, metaChips(it), it.hotel ? h('span', { class: 'chip hotel' }, '🏨 ', it.hotel) : null),
    ),
    verdict,
  );

  const action = it.action
    ? h('div', { class: 'im-action' }, h('div', { class: 'im-label' }, t('Acción que propone el agente')), h('span', { class: 'tool' }, '🔧 ', h('b', null, it.action.herramienta)), h('pre', { class: 'json', html: jsonHtml(it.action.argumentos) }))
    : null;

  const grid = res
    ? h(
        'div',
        { class: 'av-grid' },
        Object.keys(sc.questions).map((q) =>
          answerViz(sc, q, res[q], {
            thr: S.threshold,
            compare: llm?.[q],
            compareLabel: rivalLabel(st.llm?.model),
            reference: q === sc.primary ? it.expected?.[sc.primary] : undefined,
          }),
        ),
      )
    : h('p', { class: 'muted' }, st.pending.has(id) ? t('⏳ Decision-1 está evaluando…') : t('Todavía sin decisión: pulsa ▶ Procesar.'));

  const req = m?.request || (st.last?.request && pickItem(st.last.request, id));
  const raw = m?.raw || (st.last?.raw && pickItem(st.last.raw, id));
  const nq = Object.keys(sc.questions).length;
  const latency =
    m?.latency_ms != null
      ? tn(nq, '⚡ {ms} en Decision-1 para {n} pregunta', '⚡ {ms} en Decision-1 para {n} preguntas', { ms: fmt.ms(m.latency_ms) })
      : st.meta?.latency_ms != null
        ? t('⚡ decidido dentro de un lote de {n} en {ms}', { n: sc.items.length, ms: fmt.ms(st.meta.latency_ms) })
        : null;
  const foot = res
    ? h(
        'div',
        { class: 'im-foot' },
        latency ? h('span', { class: 'lat' }, latency) : null,
        h('span', { class: 'grow' }),
        req ? h('button', { class: 'btn', onclick: () => showJson(t('📤 Petición · {label}', { label: id }), req) }, t('📤 Petición')) : null,
        raw ? h('button', { class: 'btn', onclick: () => showJson(t('📥 Respuesta · {label}', { label: id }), raw) }, t('📥 Respuesta')) : null,
      )
    : null;

  openModal(
    h(
      'div',
      { class: 'item-modal' },
      head,
      h('div', { class: 'im-label' }, sc.item_text_label || t('Texto')),
      h('blockquote', { class: 'im-text' }, it.text),
      action,
      h('div', { class: 'im-label' }, st.llm ? t('Respuestas de Decision-1 · comparadas con {modelo}', { modelo: rivalLabel(st.llm.model) }) : t('Respuestas de Decision-1')),
      grid,
      foot,
    ),
    { wide: true },
  );
}

