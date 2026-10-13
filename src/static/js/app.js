// Arranque, navegación, barra superior, panel lateral y atajos de teclado.
import { h, $, $$, fmt, median, toast, openModal, closeModal, modalOpen } from './util.js';
import { S, caseState, api, errorText, takeCodeFromUrl, regionLabel, skuLabel } from './core.js';
import { t, tx, getLang, setLang } from './i18n.js';
import { renderLangSwitch } from './langswitch.js';
import { fmtCountdown } from './views/common.js';
import { mountCase, unmountCase, currentCase, refresh, caseAction } from './casepage.js';
import { mountIntro } from './intro.js';
import { mountLab, unmountLab, labRun } from './lab.js';
import { mountArcade, unmountArcade, arcadeAction, arcadeFlags, isArcade } from './arcade.js';

const stage = $('#stage');
const notes = $('#notes');
const layout = $('#layout');
const nav = {};
const sess = {};
const status = {};

const pages = () => ['intro', ...S.scenarios.map((s) => s.id), 'lab'];

// ---------- Panel izquierdo ----------

function navItem(page, icon, title, sub, num) {
  nav[page] = h(
    'a',
    { class: 'nav-item', href: `#${page}`, dataset: { page } },
    h('span', { class: 'ni-icon' }, icon, num != null ? h('span', { class: 'ni-num' }, num) : null),
    h('span', { class: 'ni-title' }, title),
    h('span', { class: 'ni-sub' }, sub),
  );
  return nav[page];
}

function sessionBox() {
  const kv = (key, label) => h('div', { class: 'kv' }, (sess[key] = h('b', null, '0')), h('span', null, label));
  return h(
    'div',
    { class: 'session' },
    h('div', { class: 'session-title' }, t('Esta sesión')),
    h('div', { class: 'session-grid' }, kv('calls', t('llamadas')), kv('decisions', t('decisiones')), kv('eur', t('coste total')), kv('p50', t('latencia p50'))),
    h('button', { class: 'shortcuts-hint', onclick: showHelp }, tx('⌨️ Atajos de teclado: pulsa {key}', { key: h('kbd', null, '?') })),
  );
}

function updateSession() {
  const s = S.session;
  if (!sess.calls) return;
  sess.calls.textContent = fmt.int(s.calls);
  sess.decisions.textContent = fmt.int(s.decisions);
  sess.eur.textContent = fmt.eur(s.eur);
  sess.p50.textContent = s.lat.length ? fmt.ms(median(s.lat)) : '—';
}

function buildSidebar() {
  $('#sidebar').replaceChildren(
    h('div', { class: 'nav-section' }, t('Presentación')),
    navItem('intro', '🏠', t('Introducción'), t('Qué es Decision-1 y por qué importa')),
    h('div', { class: 'nav-section' }, t('Casos de uso')),
    ...S.scenarios.map((sc) => navItem(sc.id, sc.icon, sc.title, `${sc.sector} · ${sc.brand}`, sc.order)),
    h('div', { class: 'nav-section' }, t('Pruébalo')),
    navItem('lab', '🧪', t('Laboratorio'), t('Tus datos, tus preguntas')),
    sessionBox(),
  );
  updateSession();
}

function updateNav() {
  for (const [page, el] of Object.entries(nav)) {
    const active = page === S.page;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
    const st = S.byId[page] ? caseState(page) : null;
    const arc = S.byId[page]?.kind === 'game' ? arcadeFlags() : null;
    el.classList.toggle('running', !!(st && (st.busy || st.race?.running)) || !!arc?.running);
    el.classList.toggle('has-result', !!(st && !st.busy && Object.keys(st.results).length) || !!arc?.hasResult);
  }
}

// ---------- Barra superior ----------

function buildStatus() {
  const d = S.config?.decision || {};
  const ok = !!S.config?.configured;
  status.region = h('b', null, '—');
  status.regionPill = h('span', { class: 'pill', title: t('Región donde se ejecutó la última inferencia (cabecera de la respuesta)'), hidden: true }, t('🧠 Inferencia: '), status.region);
  status.gauge = h('i');
  status.q = h('b', null, '—');
  status.quota = h('span', { class: 'pill quota', title: t('Peticiones por minuto disponibles para Decision-1 (estimación)') }, '⏱ ', h('span', { class: 'gauge' }, status.gauge), status.q);
  status.notesBtn = h('button', { class: 'btn ghost notes-btn', onclick: () => toggleNotes(), title: t('Mostrar u ocultar las notas (N)') }, t('📝 Notas'));
  $('#status').replaceChildren(
    h('span', { class: 'pill', title: t('Región del recurso de Microsoft Foundry') }, h('span', { class: `dot${ok ? '' : ' off'}` }), ok ? t('Foundry · ') : t('Sin configurar · '), h('b', null, regionLabel(d.location))),
    h('span', { class: 'pill', title: t('Tipo de despliegue de Decision-1') }, '🛡️ ', h('b', null, skuLabel(d.sku, d.location))),
    status.regionPill,
    status.quota,
    status.notesBtn,
  );
  toggleNotes(S.showNotes);
  updateStatus();
}

function updateStatus() {
  const q = S.quota;
  if (!status.q || !q) return;
  const r = Math.max(0, Math.min(1, q.remaining / (q.limit || 1)));
  status.gauge.style.setProperty('--q', String(r));
  status.quota.classList.toggle('mid', r < 0.5 && r >= 0.2);
  status.quota.classList.toggle('low', r < 0.2);
  status.q.textContent = `${q.remaining}/${q.limit} RPM`;
  if (q.region) {
    status.region.textContent = regionLabel(q.region);
    status.regionPill.hidden = false;
  }
}

function toggleNotes(force) {
  S.showNotes = typeof force === 'boolean' ? force : !S.showNotes;
  layout.classList.toggle('no-notes', !S.showNotes);
  localStorage.setItem('d1-notes', S.showNotes ? '1' : '0');
  status.notesBtn?.classList.toggle('on', S.showNotes);
  status.notesBtn?.setAttribute('aria-pressed', String(S.showNotes));
}

// ---------- Navegación ----------

function show(page) {
  if (!pages().includes(page)) page = 'intro';
  unmountCase();
  unmountLab();
  unmountArcade();
  S.page = page;
  const sc = S.byId[page];
  if (sc?.kind === 'game') mountArcade(sc, stage, notes);
  else if (sc) mountCase(sc, stage, notes);
  else if (page === 'lab') mountLab(stage, notes);
  else mountIntro(stage, notes);
  stage.scrollTop = 0;
  notes.scrollTop = 0;
  document.title = `${sc ? `${sc.order}. ${sc.title}` : page === 'lab' ? t('Laboratorio') : t('Introducción')} · Microsoft-Decision-1`;
  updateNav();
  warm();
}

// La primera decisión tras unos minutos de inactividad tarda ~3 s: el servidor despierta el modelo antes de «Procesar».
let lastWarm = 0;
function warm() {
  if (!S.config?.configured || Date.now() - lastWarm < 60_000) return;
  lastWarm = Date.now();
  api('/api/warm', {}, { retry: false }).catch(() => {});
}

function go(page) {
  if (location.hash === `#${page}`) show(page);
  else location.hash = page;
}

function step(delta) {
  const ps = pages();
  const i = Math.max(0, ps.indexOf(S.page));
  go(ps[Math.max(0, Math.min(ps.length - 1, i + delta))]);
}

// ---------- Atajos ----------

const keys = () => [
  ['← →', t('Página anterior / siguiente')],
  ['0', t('Introducción')],
  ['1 – 6', t('Ir a un caso')],
  ['L', t('Laboratorio')],
  [t('Espacio'), t('Procesar el caso · jugar o pausar (caso 6)')],
  ['C', t('Carrera contra un LLM')],
  ['B', t('Cambiar entre lote y uno a uno')],
  ['R', t('Reiniciar el caso o la partida')],
  ['N', t('Mostrar u ocultar las notas')],
  ['Ctrl + Enter', t('Decidir en el laboratorio')],
  ['Esc', t('Cerrar la ventana')],
];

function showHelp() {
  openModal(h('div', { class: 'help' }, h('h2', null, t('⌨️ Atajos de teclado')), h('div', { class: 'help-grid' }, keys().map(([k, label]) => [h('kbd', null, k), h('span', null, label)]))));
}

const typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function onKey(e) {
  if (e.key === 'Escape' && modalOpen()) {
    closeModal();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || modalOpen() || !S.scenarios.length) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const sc = currentCase();
  if (k === 'ArrowRight') step(1);
  else if (k === 'ArrowLeft') step(-1);
  else if (k === '0') go('intro');
  else if (/^[1-9]$/.test(k) && S.scenarios.some((s) => String(s.order) === k)) go(S.scenarios.find((s) => String(s.order) === k).id);
  else if (k === 'l') go('lab');
  else if (k === ' ') {
    if (e.target.closest?.('button')) return;
    if (sc) caseAction('process');
    else if (isArcade()) arcadeAction('toggle');
    else if (S.page === 'lab') labRun();
    else return;
  } else if (sc && k === 'c') caseAction('race');
  else if (sc && k === 'b') caseAction('mode');
  else if (sc && k === 'r') caseAction('reset');
  else if (isArcade() && k === 'r') arcadeAction('reset');
  else if (k === 'n') toggleNotes();
  else if (k === '?') showHelp();
  else return;
  e.preventDefault();
}

// ---------- Eventos y temporizadores ----------

window.addEventListener('d1:case', (e) => {
  if (currentCase()?.id === e.detail?.id) refresh();
  updateNav();
});
window.addEventListener('d1:session', updateSession);
window.addEventListener('d1:quota', (e) => {
  S.quota = e.detail;
  updateStatus();
});
window.addEventListener('hashchange', () => S.scenarios.length && show(location.hash.slice(1)));
document.addEventListener('keydown', onKey);

setInterval(() => {
  const now = Date.now();
  for (const el of $$('[data-deadline]')) el.textContent = `⏱ ${fmtCountdown(Number(el.dataset.deadline) - now)}`;
}, 1000);

async function pollQuota() {
  if (document.hidden || !S.config?.configured || !S.scenarios.length) return;
  try {
    S.quota = await api('/api/quota', null, { retry: false });
    updateStatus();
  } catch {
    // Sin código o sin conexión: se reintenta en el siguiente ciclo.
  }
}
setInterval(pollQuota, 5000);

// ---------- Idioma ----------

// Textos que ya vienen en el HTML; el resto de la interfaz se construye con t() al montar cada vista.
function applyStaticTexts() {
  $('meta[name="description"]')?.setAttribute('content', t('Demo de Microsoft-Decision-1 en Microsoft Foundry: seis casos de uso de decisiones rápidas, baratas y calibradas.'));
  $('#sidebar').setAttribute('aria-label', t('Casos de uso'));
  $('#notes').setAttribute('aria-label', t('Notas para el presentador'));
  const bootText = $('#boot-text');
  if (bootText) bootText.textContent = t('Cargando la demo…');
}

function applyContent(data) {
  S.scenarios = [...data.scenarios].sort((a, b) => a.order - b.order);
  S.byId = Object.fromEntries(S.scenarios.map((s) => [s.id, s]));
  S.lab = data.lab || { templates: [] };
}

let switching = false;

// El servidor devuelve escenarios, laboratorio y comparativas ya traducidos: se piden primero y solo entonces cambia la interfaz.
async function switchLang(code) {
  if (switching || code === getLang()) return;
  if (!S.scenarios.length) {
    // Todavía sin contenido (código de acceso o error de arranque): basta con recargar en el idioma nuevo.
    setLang(code);
    location.reload();
    return;
  }
  switching = true;
  $('#lang')?.classList.add('busy');
  try {
    const config = await api('/api/config', null, { lang: code });
    const data = await api('/api/scenarios', null, { lang: code });
    setLang(code);
    S.config = config;
    applyContent(data);
    closeModal();
    applyStaticTexts();
    buildStatus();
    buildSidebar();
    show(S.page);
  } catch (e) {
    toast(errorText(e), 'error', 7000);
  } finally {
    switching = false;
    $('#lang')?.classList.remove('busy');
    renderLangSwitch(switchLang);
  }
}

// ---------- Arranque ----------

function bootError(title, e, label) {
  stage.replaceChildren(h('div', { class: 'boot-error' }, h('h2', null, title), h('p', { class: 'muted' }, errorText(e)), h('button', { class: 'btn primary', onclick: boot }, label)));
}

async function boot() {
  takeCodeFromUrl();
  applyStaticTexts();
  renderLangSwitch(switchLang);
  S.showNotes = localStorage.getItem('d1-notes') !== '0';
  layout.classList.toggle('no-notes', !S.showNotes);
  try {
    S.config = await api('/api/config');
  } catch (e) {
    return bootError(t('No se pudo conectar con el servidor'), e, t('Reintentar'));
  }
  buildStatus();
  try {
    applyContent(await api('/api/scenarios'));
  } catch (e) {
    return bootError(t('🔐 Demo protegida'), e, t('Introducir el código'));
  }
  const cmps = S.config.comparisons || [];
  S.raceModel = (cmps.find((c) => c.id === 'gpt-6-sol') || cmps[0])?.id || null;
  buildSidebar();
  if (!S.config.configured) toast(t('Falta AZURE_AI_ENDPOINT: la interfaz funciona, pero no puede llamar al modelo.'), 'warn', 10000);
  show(location.hash.slice(1) || 'intro');
  pollQuota();
}

boot();
