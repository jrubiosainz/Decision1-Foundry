// Visualización de una respuesta de Decision-1 (o de un LLM) con sus probabilidades.
import { h, fmt } from '../util.js';
import { valid, qLabel, choiceLabel, answerText, sameAnswer, confPill } from './common.js';

const TYPE_LABELS = { choice: 'Elección', score: 'Escala', noul: 'Sí / No' };

function bars(rows) {
  return h(
    'div',
    { class: 'bars' },
    rows.map((r) =>
      h(
        'div',
        { class: `bar-row${r.on ? ' on' : ''}` },
        h('span', { class: 'bar-label', title: r.label }, r.label),
        h('span', { class: 'bar' }, h('i', { style: { width: `${Math.max(0.6, r.p * 100)}%` } })),
        h('span', { class: 'bar-val' }, fmt.pct(r.p, r.p > 0 && r.p < 0.1 ? 1 : 0)),
      ),
    ),
  );
}

export function answerViz(sc, q, a, { thr = 0.9, compare, compareLabel, reference } = {}) {
  const def = sc.questions?.[q] || {};
  let body;
  if (!valid(a)) body = h('div', { class: 'muted' }, 'Sin respuesta');
  else if (a.type === 'choice') {
    body = a.probs?.length
      ? bars(a.probs.slice(0, 8).map((p) => ({ label: choiceLabel(sc, q, p.key), p: p.p, on: p.key === a.value })))
      : h('div', { class: 'av-value' }, choiceLabel(sc, q, a.value));
  } else if (a.type === 'score') {
    body = a.probs?.length
      ? [
          bars(a.probs.map((p) => ({ label: p.label, p: p.p, on: p.key === a.value }))),
          h('div', { class: 'av-note' }, `Valor esperado ${fmt.num(a.expected, 2)} en una escala de 0 a ${a.probs.length - 1}`),
        ]
      : h('div', { class: 'av-value' }, a.label);
  } else if (a.type === 'noul') {
    body =
      a.confidence != null
        ? bars([
            { label: 'Sí', p: a.p, on: a.value },
            { label: 'No', p: 1 - a.p, on: !a.value },
          ])
        : h('div', { class: 'av-value' }, a.value ? 'Sí' : 'No');
  }
  const extras = [];
  if (compare) {
    const ok = sameAnswer(a, compare);
    extras.push(h('div', { class: `av-cmp ${ok ? 'ok' : 'ko'}` }, ok ? '✓ ' : '✗ ', `${compareLabel || 'LLM'}: `, h('b', null, answerText(sc, q, compare))));
  }
  if (reference != null) {
    const ok = valid(a) && a.value === reference;
    extras.push(h('div', { class: `av-cmp ${ok ? 'ok' : 'ko'}` }, ok ? '✓ ' : '✗ ', 'Referencia: ', h('b', null, choiceLabel(sc, q, reference))));
  }
  const instr = def.instructions == null ? null : typeof def.instructions === 'string' ? def.instructions : JSON.stringify(def.instructions);
  return h(
    'div',
    { class: 'av' },
    h('div', { class: 'av-head' }, h('b', null, qLabel(sc, q)), h('span', { class: 'tag' }, TYPE_LABELS[def.type || a?.type] || ''), h('span', { class: 'grow' }), confPill(a, thr)),
    instr ? h('div', { class: 'av-q' }, instr) : null,
    body,
    extras,
  );
}
