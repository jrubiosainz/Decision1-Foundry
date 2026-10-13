// Caso 6 · Space Invaders en directo: Decision-1 y un LLM juegan la misma partida a la vez y el mundo no espera a ninguno.
// La partida (engine/match) no tiene DOM: aquí solo se monta la pantalla, el bucle de fotogramas y los marcadores.
import { h, fmt } from './util.js';
import { S, api, errorText, eur, emit, skuLabel } from './core.js';
import { t, tx, tn, N_ } from './i18n.js';
import { addSession } from './run.js';
import { renderResult } from './arcade-result.js';
import { renderArcadeNotes } from './arcade-notes.js';
import { D1_ID, D1_NAME, SPEED_LABEL, clock, liveStats, shortName, speedText } from './arcade-shared.js';
import { COLS, RULES, createGame, seconds } from './game/engine.js';
import { describeState, shipLane } from './game/observe.js';
import { Match, Player } from './game/match.js';
import { BoardView } from './game/render.js';

const COLORS = { d1: '#0f6cbd', rv: '#7c3aed' };
const WARM_TTL = 60_000;
const OVER_BANNER = { won: N_('¡VICTORIA!'), lost: N_('SIN VIDAS'), invaded: N_('INVADIDOS'), timeout: N_('TIEMPO') };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomSeed = () => 1 + Math.floor(Math.random() * 9998);
const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};

// La sesión sobrevive al cambio de página: al volver al caso 6 se retoma la partida donde se dejó.
const ses = {
  seedPick: null, // '7' | '11' … | 'random'
  seed: 7,
  speed: 1,
  rivalId: null,
  match: null,
  d1: null,
  rival: null,
  tally: {}, // por rival: { d1, rival, ties }
  history: [],
  warmAt: 0,
  warming: false,
  recorded: false,
};
let ui = null;
let raf = 0;
let lastPaint = 0;
let notesAt = 0;

const comparisons = () => S.config?.comparisons || [];
const cadenceMs = () => S.config?.game?.cadence_ms || 1050;

export const isArcade = () => !!ui;
export const arcadeFlags = () => ({ running: ses.match?.status === 'running' || ses.warming, hasResult: ses.history.length > 0 });

// ---------- Sesión y jugadores ----------

function makePlayer(id, label) {
  return new Player({
    id,
    label,
    cadenceMs: cadenceMs(),
    decide: async (state) => {
      const r = await api('/api/game/decide', { model: id, state }, { retry: false });
      addSession(1, 2, r.cost, id === D1_ID ? [r.latency_ms] : []);
      return r;
    },
  });
}

function build() {
  const rival = comparisons().find((c) => c.id === ses.rivalId);
  ses.d1 = makePlayer(D1_ID, D1_NAME);
  ses.rival = makePlayer(rival.id, shortName(rival.label));
  ses.match = new Match({ players: [ses.d1, ses.rival], seed: ses.seed, speed: ses.speed });
  ses.recorded = false;
}

function ensureSession(sc) {
  const comps = comparisons();
  if (!comps.some((c) => c.id === ses.rivalId)) {
    ses.rivalId = (comps.find((c) => c.id === sc.game.llm) || comps[0]).id;
    ses.match = null;
  }
  if (ses.seedPick == null) {
    ses.seedPick = String(sc.game.seeds[0]);
    ses.seed = sc.game.seeds[0];
    ses.speed = sc.game.speeds.includes(1) ? 1 : sc.game.speeds[0];
  }
  if (!ses.match) build();
}

// ---------- Pantalla ----------

function stat(label, ...value) {
  return h('div', { class: 'arc-stat' }, h('span', null, label), h('div', null, ...value));
}

function buildCard(side, name, sub, caption) {
  const c = { side, laneKey: '', overKind: null, danger: null };
  c.canvas = h('canvas', { class: 'arc-canvas', role: 'img', 'aria-label': t('Tablero de {name}', { name }) });
  c.overTitle = h('b');
  c.overScore = h('span');
  c.over = h('div', { class: 'arc-over', hidden: true }, c.overTitle, c.overScore);
  c.crown = h('span', { class: 'arc-crown', hidden: true, title: t('Ganador de la partida') }, '🏆');
  c.who = h('b', null, name);
  c.sub = h('small', null, sub);
  c.score = h('b', null, '0');
  c.hearts = Array.from({ length: RULES.lives }, () => h('i', null, '♥'));
  c.time = h('span', { class: 'arc-clock' }, '0:00');
  c.lanes = Array.from({ length: COLS }, (_, i) => h('i', null, String(i)));
  c.caption = h('div', { class: 'arc-lane-cap' }, caption);
  c.dangerText = h('b', null, '—');
  c.meter = h('i');
  c.think = h('b', null, '—');
  c.age = h('b', null, '—');
  c.cost = h('b', null, '—');
  c.err = h('div', { class: 'arc-err', hidden: true });
  c.root = h(
    'section',
    { class: `arc-card ${side}`, style: { '--c': COLORS[side] } },
    h(
      'header',
      { class: 'arc-head' },
      h('div', { class: 'arc-who' }, h('div', null, c.who, c.crown), c.sub),
      h('div', { class: 'arc-hud' }, h('span', { class: 'arc-pts' }, c.score, ' pts'), h('span', { class: 'arc-lives', role: 'img', 'aria-label': t('Vidas') }, c.hearts), c.time),
    ),
    h(
      'div',
      { class: 'arc-play' },
      h('div', { class: 'arc-board' }, c.canvas, c.over, c.err),
      h('div', { class: 'arc-lanes' }, c.lanes),
    ),
    c.caption,
    h(
      'div',
      { class: 'arc-stats' },
      stat(t('⚠️ Peligro'), c.dangerText, h('span', { class: 'arc-meter', title: t('Probabilidad de que una bomba alcance a la nave en los próximos 2 s') }, c.meter)),
      stat(t('⏱ Decisión'), c.think),
      stat(t('🕰️ Mundo viejo'), c.age),
      stat(t('💶 Coste'), c.cost),
    ),
  );
  c.view = new BoardView(c.canvas, COLORS[side]);
  return c;
}

function rivalSub() {
  const comp = comparisons().find((c) => c.id === ses.rivalId);
  return comp?.label.split(' · ').slice(1).join(' · ') || t('Modelo generativo');
}

function buildUi(sc) {
  const d = S.config?.decision || {};
  const u = { sc, stateText: '' };
  u.cards = [
    buildCard('d1', D1_NAME, t('Modelo de decisión · {sku}', { sku: skuLabel(d.sku, d.location) }), t('Mapa de calor: probabilidad que da a cada carril')),
    buildCard('rv', ses.rival.label, rivalSub(), t('Solo devuelve el carril: sin probabilidades')),
  ];

  u.play = h('button', { class: 'btn primary', onclick: () => arcadeAction('toggle'), title: t('Jugar o pausar (barra espaciadora)') });
  u.reset = h('button', { class: 'btn ghost', onclick: () => arcadeAction('reset'), title: t('Volver a empezar la partida (R)') }, t('↺ Reiniciar'));
  u.seed = h(
    'select',
    { 'aria-label': t('Semilla de la partida'), title: t('Misma semilla = misma partida para los dos modelos'), onchange: (e) => onSeed(e) },
    sc.game.seeds.map((s) => h('option', { value: String(s), selected: String(s) === ses.seedPick }, t('Semilla {n}', { n: s }))),
    h('option', { value: 'random', selected: ses.seedPick === 'random' }, t('🎲 Aleatoria')),
  );
  u.speedBtns = sc.game.speeds.map((v) =>
    h('button', { type: 'button', dataset: { speed: String(v) }, onclick: () => setSpeed(v), title: t('Acelera el mundo, no al modelo: cada decisión llega con más cambios por medio') }, speedText(v), ' ', h('small', null, SPEED_LABEL[v] ? t(SPEED_LABEL[v]) : '')),
  );
  u.rivalSel = h(
    'select',
    { 'aria-label': t('Modelo rival'), onchange: (e) => onRival(e) },
    comparisons().map((c) => h('option', { value: c.id, selected: c.id === ses.rivalId, title: c.label }, `vs ${shortName(c.label)}`)),
  );
  u.tally = h('span', { class: 'pill arc-tally', hidden: true });
  u.more = h('button', { class: 'btn ghost', hidden: true, onclick: () => u.result.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, t('Comparativa ↓'));
  const toolbar = h(
    'div',
    { class: 'toolbar' },
    u.play,
    u.reset,
    u.seed,
    h('div', { class: 'seg', role: 'group', 'aria-label': t('Velocidad del juego') }, u.speedBtns),
    u.rivalSel,
    h('span', { class: 'grow' }),
    u.more,
  );

  u.info = h('span', { class: 'arc-info' });
  const legend = h(
    'div',
    { class: 'arc-legend' },
    h('span', null, h('i', { class: 'lg-ghost' }), t('Contorno hueco: el mundo que el modelo veía al pedir su decisión')),
    h('span', null, h('i', { class: 'lg-caret' }), t('Triángulo: carril al que ha mandado la nave')),
    h('span', { class: 'grow' }),
    u.info,
  );
  u.result = h('div', { class: 'arc-result-slot' });
  u.state = h('pre', { class: 'arc-state' });
  u.seen = h(
    'details',
    { class: 'arc-seen', ontoggle: () => paintState() },
    h('summary', null, t('👁️ Lo que ve el modelo'), ' ', h('small', null, t('(el mismo texto para los dos, más dos preguntas: carril y peligro)'))),
    u.state,
  );

  const head = h(
    'div',
    { class: 'case-head' },
    h('div', { class: 'case-icon' }, sc.icon),
    h('div', null, h('div', { class: 'case-kicker' }, t('Caso {n} · {sector}', { n: sc.order, sector: sc.sector })), h('h1', { class: 'case-title' }, sc.title), h('div', { class: 'case-headline' }, sc.headline)),
    h('div', { class: 'case-brand' }, t('Duelo en directo'), h('b', null, sc.brand), u.tally),
  );
  u.duel = h('div', { class: 'arc-duel' }, u.cards[0].root, u.cards[1].root);
  u.head = head;
  u.toolbar = toolbar;
  u.root = h('div', { class: 'case arcade', dataset: { case: sc.id } }, head, toolbar, u.duel, legend, u.result, u.seen);
  u.notes = renderArcadeNotes(sc, ses);
  return u;
}

function emptyState(sc, stage, notes) {
  const head = h(
    'div',
    { class: 'case-head' },
    h('div', { class: 'case-icon' }, sc.icon),
    h('div', null, h('div', { class: 'case-kicker' }, t('Caso {n} · {sector}', { n: sc.order, sector: sc.sector })), h('h1', { class: 'case-title' }, sc.title), h('div', { class: 'case-headline' }, sc.headline)),
  );
  stage.replaceChildren(
    h(
      'div',
      { class: 'case arcade' },
      head,
      h(
        'div',
        { class: 'lab-empty' },
        h('b', null, t('Falta el modelo rival')),
        h('p', { class: 'muted' }, tx('Este caso enfrenta a Decision-1 con un LLM. Añade {llm} a {variable} y vuelve a arrancar la aplicación.', { llm: h('code', null, sc.game.llm), variable: h('code', null, 'COMPARISON_DEPLOYMENTS') })),
      ),
    ),
  );
  notes.replaceChildren(h('div', { class: 'notes-case' }, h('div', { class: 'notes-kicker' }, t('Caso {n} · notas para el presentador', { n: sc.order }))));
}

// ---------- Montaje ----------

const STACKED = '(max-width: 1100px)';
let fitRaf = 0;

/** Ajusta el alto de los tableros para que el duelo entero (tableros y métricas) se vea sin hacer scroll. */
function fitBoards() {
  fitRaf = 0;
  if (!ui) return;
  const stage = ui.root.parentElement;
  const { duel, cards } = ui;
  if (!stage || window.matchMedia(STACKED).matches) {
    duel.style.removeProperty('--arc-h');
    return;
  }
  const overhead = cards[0].root.offsetHeight - cards[0].canvas.parentElement.offsetHeight;
  const top = duel.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
  const room = Math.round(stage.clientHeight - top - overhead - 10);
  const next = `${Math.min(620, Math.max(240, room))}px`;
  if (duel.style.getPropertyValue('--arc-h') !== next) duel.style.setProperty('--arc-h', next);
}

const scheduleFit = () => {
  if (!fitRaf) fitRaf = requestAnimationFrame(fitBoards);
};

export function mountArcade(sc, stage, notes) {
  unmountArcade();
  if (!comparisons().length) return emptyState(sc, stage, notes);
  ensureSession(sc);
  ui = buildUi(sc);
  stage.replaceChildren(ui.root);
  notes.replaceChildren(ui.notes.root);
  fitBoards();
  ui.observer = new ResizeObserver(() => {
    scheduleFit();
    kick();
  });
  for (const el of [ui.duel, ui.head, ui.toolbar, stage]) ui.observer.observe(el);
  if (ses.match.status === 'finished') showResult();
  syncControls();
  paintTally();
  kick();
}

export function unmountArcade() {
  if (!ui) return;
  if (ses.match?.status === 'running') ses.match.pause();
  ui.observer?.disconnect();
  if (raf) cancelAnimationFrame(raf);
  if (fitRaf) cancelAnimationFrame(fitRaf);
  raf = 0;
  fitRaf = 0;
  ui = null;
}

// ---------- Acciones ----------

export function arcadeAction(name) {
  if (!ui) return;
  if (name === 'toggle') toggle();
  else if (name === 'reset' && ses.match.status !== 'idle') restart();
}

async function toggle() {
  const m = ses.match;
  if (!ui || ses.warming) return;
  if (m.status === 'running') {
    m.pause();
    return changed();
  }
  if (m.status === 'finished') restart();
  if (Date.now() - ses.warmAt > WARM_TTL && !(await warmUp())) return;
  m.start(performance.now());
  changed();
}

/** Tras unos minutos sin tráfico los modelos tardan ~3 s en responder: se despiertan antes de empezar la partida. */
async function warmUp() {
  const mine = ui;
  ses.warming = true;
  syncControls();
  const state = describeState(createGame(1));
  const call = (id) => api('/api/game/decide', { model: id, state }, { retry: false }).then((r) => addSession(1, 2, r.cost, []), () => {});
  await Promise.all([call(D1_ID), call(ses.rival.id)]);
  await sleep(cadenceMs());
  ses.warming = false;
  ses.warmAt = Date.now();
  if (ui) syncControls();
  return ui === mine;
}

function restart() {
  ses.match.reset(ses.seed);
  ses.recorded = false;
  for (const c of ui.cards) {
    c.view.reset();
    c.laneKey = '';
    c.root.classList.remove('winner');
    c.crown.hidden = true;
  }
  ui.result.replaceChildren();
  changed();
}

function pickSeed(value) {
  ses.seedPick = value;
  ses.seed = value === 'random' ? randomSeed() : Number(value);
  ui.seed.value = value;
}

function advanceSeed() {
  const seeds = ui.sc.game.seeds;
  if (ses.seedPick === 'random') return pickSeed('random');
  pickSeed(String(seeds[(seeds.indexOf(Number(ses.seedPick)) + 1) % seeds.length]));
}

function onSeed(e) {
  pickSeed(e.target.value);
  e.target.blur();
  restart();
}

function onRival(e) {
  ses.rivalId = e.target.value;
  e.target.blur();
  build();
  const c = ui.cards[1];
  c.who.textContent = ses.rival.label;
  c.sub.textContent = rivalSub();
  restart();
}

function setSpeed(v) {
  ses.speed = v;
  ses.match.speed = v;
  changed();
}

function nextSpeed() {
  const speeds = ui.sc.game.speeds;
  return speeds.find((v) => v > ses.speed) ?? null;
}

function changed() {
  syncControls();
  paintTally();
  notesAt = 0;
  emit('case', { id: ui.sc.id });
  kick();
}

// ---------- Resultado y marcador ----------

function finish() {
  ses.recorded = true;
  const res = ses.match.result;
  const tally = (ses.tally[ses.rivalId] ||= { d1: 0, rival: 0, ties: 0 });
  if (res.winner === 0) tally.d1++;
  else if (res.winner === 1) tally.rival++;
  else tally.ties++;
  ses.history = [{ seed: res.seed, speed: ses.speed, rival: ses.rival.label, scores: res.rows.map((r) => r.score), winner: res.winner }, ...ses.history].slice(0, 10);
  showResult();
  changed();
}

function showResult() {
  const res = ses.match.result;
  ui.cards.forEach((c, i) => {
    c.root.classList.toggle('winner', res.winner === i);
    c.crown.hidden = res.winner !== i;
  });
  const faster = nextSpeed();
  ui.result.replaceChildren(
    renderResult(ses, res, {
      again: () => (restart(), toggle()),
      nextSeed: () => (advanceSeed(), restart(), toggle()),
      faster: faster ? { speed: faster, run: () => (setSpeed(faster), restart(), toggle()) } : null,
    }),
  );
}

function paintTally() {
  const tally = ses.tally[ses.rivalId];
  const n = tally ? tally.d1 + tally.rival + tally.ties : 0;
  ui.tally.hidden = !n;
  if (!n) return;
  const games = tn(n, '{n} partida contra {rival}', '{n} partidas contra {rival}', { rival: ses.rival.label });
  ui.tally.title = tally.ties ? `${games} · ${tn(tally.ties, '{n} empate', '{n} empates')}` : games;
  ui.tally.replaceChildren('🏆 ', h('span', { class: 'd1' }, D1_NAME, ' ', h('b', null, tally.d1)), ' – ', h('span', { class: 'rv' }, h('b', null, tally.rival), ' ', ses.rival.label));
}

// ---------- Controles ----------

function syncControls() {
  const m = ses.match;
  const st = m.status;
  const busy = st === 'running' || st === 'paused' || ses.warming;
  const label = ses.warming ? [h('span', { class: 'spinner' }), ' ', t('Calentando…')] : st === 'running' ? t('⏸ Pausa') : st === 'paused' ? t('▶ Seguir') : st === 'finished' ? t('↺ Otra partida') : t('▶ Jugar');
  ui.play.replaceChildren(...[label].flat(), ' ', h('kbd', null, t('Espacio')));
  ui.play.disabled = ses.warming;
  ui.reset.disabled = st === 'idle' || ses.warming;
  ui.reset.hidden = st === 'finished';
  ui.seed.disabled = busy;
  ui.rivalSel.disabled = busy;
  for (const b of ui.speedBtns) {
    b.disabled = busy;
    b.classList.toggle('on', Number(b.dataset.speed) === ses.speed);
  }
  ui.more.hidden = st !== 'finished';
  ui.info.textContent = t('Semilla {seed} · {speed} · una decisión cada ~{s} s por modelo', { seed: ses.seed, speed: speedText(ses.speed), s: fmt.num(cadenceMs() / 1000, 2) });
}

// ---------- Bucle de fotogramas ----------

function kick() {
  if (ui && !raf) raf = requestAnimationFrame(tick);
}

function tick(now) {
  raf = 0;
  if (!ui) return;
  const dt = Math.min(Math.max((now - lastPaint) / 1000, 0), 0.1);
  lastPaint = now;
  const m = ses.match;
  m.frame(now, (p, events) => ui.cards[p === m.players[0] ? 0 : 1].view.burst(events, p.g));
  paint(now, dt);
  if (m.status === 'finished' && !ses.recorded) finish();
  if (now - notesAt > 250) {
    notesAt = now;
    ui.notes.update();
  }
  if (m.status === 'running' || ui.cards.some((c) => c.view.animating) || m.players.some((p) => p.inflight)) kick();
}

function paint(now, dt) {
  const m = ses.match;
  ui.cards.forEach((c, i) => {
    const p = m.players[i];
    const ghost = p.inflight ? { shipX: p.inflight.snap.ship.x, bombs: p.inflight.snap.bombs } : null;
    c.view.draw(p.g, { alpha: p.g.over ? 0 : m.alpha, ghost, now, dt });
    paintCard(c, p, now);
  });
  paintState();
}

function paintCard(c, p, now) {
  const g = p.g;
  const last = p.last;
  setText(c.score, fmt.int(g.score));
  c.hearts.forEach((el, i) => el.classList.toggle('lost', i >= g.lives));
  setText(c.time, clock(seconds(g)));
  if (c.overKind !== g.over) {
    c.overKind = g.over;
    c.over.hidden = !g.over;
    if (g.over) {
      c.over.className = `arc-over ${g.over}`;
      c.overTitle.textContent = t(OVER_BANNER[g.over]);
    }
  }
  if (g.over) setText(c.overScore, t('{n} puntos', { n: fmt.int(g.score) }));
  paintLanes(c, p);

  const danger = last?.danger ?? null;
  if (c.danger !== danger) {
    c.danger = danger;
    c.meter.style.transform = `scaleX(${danger ?? 0})`;
    c.dangerText.textContent = danger == null ? '—' : last.probs ? fmt.pct(danger) : danger >= 0.5 ? t('sí') : t('no');
  }
  const s = liveStats(p);
  if (p.inflight) setText(c.think, `⏳ ${fmt.ms(now - p.inflight.start)}`);
  else setText(c.think, last ? fmt.ms(last.modelMs) : '—');
  c.think.classList.toggle('live', !!p.inflight);
  setText(c.age, s.ageMs == null ? '—' : fmt.ms(s.ageMs));
  setText(c.cost, s.decisions ? fmt.eur(eur(s.usd)) : '—');
  const e = p.error;
  c.err.hidden = !e;
  if (e) setText(c.err, e.status === 429 ? t('⏱ Límite de peticiones por minuto · {n} saltadas', { n: fmt.int(s.skipped) }) : `⚠️ ${errorMessage(e)}`);
}

/** Texto de un fallo al consultar al modelo: los del bucle traen código y parámetros; el resto es el error del backend. */
function errorMessage(e) {
  if (e.code === 'timeout') return t('Sin respuesta en {s} s', { s: fmt.num(e.params.s) });
  if (e.code === 'no-lane') return t('Respuesta sin carril válido');
  return errorText(e.cause ?? e);
}

function paintLanes(c, p) {
  const last = p.last;
  const ship = shipLane(p.g);
  const key = `${last ? last.at : 0}|${ship}`;
  if (c.laneKey === key) return;
  c.laneKey = key;
  c.lanes.forEach((el, i) => {
    el.classList.toggle('ship', i === ship);
    el.classList.toggle('pick', !!last && last.lane === i);
    el.style.setProperty('--p', last?.probs ? last.probs[i].toFixed(3) : '0');
  });
}

function paintState() {
  if (!ui.seen.open) return;
  const p = ses.d1;
  const text = p.inflight?.text ?? p.last?.text ?? describeState(p.g);
  if (text !== ui.stateText) {
    ui.stateText = text;
    ui.state.textContent = text;
  }
}
