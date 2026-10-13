// Ejecución de un caso: en lote (1 llamada), uno a uno, o carrera contra un LLM.
import { pool, median, toast } from './util.js';
import { S, caseState, freshCase, api, fail, emit } from './core.js';
import { t, tn } from './i18n.js';

const changed = (id, flip = true) => emit('case', { id, flip });

export function addSession(calls, decisions, cost, lats) {
  const s = S.session;
  s.calls += calls;
  s.decisions += decisions;
  s.usd += cost?.usd || 0;
  s.eur += cost?.eur || 0;
  s.lat.push(...lats.filter((x) => x != null));
  emit('session');
}

function clearRun(st) {
  st.results = {};
  st.pending = new Set();
  st.meta = { items: {} };
  st.cost = { usd: 0, eur: 0 };
  st.last = null;
}

export function resetCase(id) {
  const st = caseState(id);
  if (st.busy || st.race?.running) return false;
  const proj = st.proj;
  Object.assign(st, freshCase(), { proj });
  changed(id);
  return true;
}

export async function runBatch(sc) {
  const st = caseState(sc.id);
  if (st.busy) return false;
  clearRun(st);
  st.busy = true;
  st.run = { mode: 'batch', t0: performance.now(), t1: null };
  sc.items.forEach((it) => st.pending.add(it.id));
  changed(sc.id, false);
  let ok = false;
  try {
    const r = await api('/api/decide-batch', { scenario: sc.id });
    st.results = r.results || {};
    st.meta = {
      mode: 'batch',
      at: Date.now(),
      latency_ms: r.latency_ms,
      wall_ms: r.wall_ms,
      wait_ms: r.wait_ms,
      calls: r.calls,
      decisions: r.decisions,
      usage: r.usage,
      items: {},
    };
    st.cost = r.cost || { usd: 0, eur: 0 };
    st.last = { mode: 'batch', request: r.request, raw: r.raw, decisions: r.decisions || 0 };
    addSession(r.calls || 1, r.decisions || 0, r.cost, [r.latency_ms]);
    ok = true;
  } catch (e) {
    fail(e);
  } finally {
    st.pending.clear();
    st.busy = false;
    st.run.t1 = performance.now();
    changed(sc.id, true);
  }
  return ok;
}

export async function runSingle(sc) {
  const st = caseState(sc.id);
  if (st.busy) return false;
  const left = S.quota?.remaining;
  if (left != null && left < sc.items.length) {
    toast(
      tn(
        left,
        'Queda {n} petición en este minuto (límite {limit} RPM): proceso en lote, 1 sola llamada.',
        'Quedan {n} peticiones en este minuto (límite {limit} RPM): proceso en lote, 1 sola llamada.',
        { limit: S.quota.limit },
      ),
      'warn',
      6000,
    );
    return runBatch(sc);
  }
  clearRun(st);
  st.busy = true;
  st.run = { mode: 'single', t0: performance.now(), t1: null };
  st.meta = { mode: 'single', at: Date.now(), items: {}, calls: 0, decisions: 0, wait_ms: 0, p50: null };
  const nq = Object.keys(sc.questions).length;
  const lats = [];
  let errors = 0;
  changed(sc.id, false);
  await pool(sc.items, sc.concurrency || 4, async (it) => {
    if (errors >= 2) return;
    st.pending.add(it.id);
    changed(sc.id, false);
    try {
      const r = await api('/api/decide', { scenario: sc.id, item_id: it.id });
      st.results[it.id] = r.answers;
      st.meta.items[it.id] = { latency_ms: r.latency_ms, at: Date.now(), request: r.request, raw: r.raw };
      lats.push(r.latency_ms);
      st.meta.p50 = median(lats);
      st.meta.calls++;
      st.meta.decisions += nq;
      st.meta.wait_ms += r.wait_ms || 0;
      st.cost = { usd: st.cost.usd + (r.cost?.usd || 0), eur: st.cost.eur + (r.cost?.eur || 0) };
      st.last = { mode: 'single', request: r.request, raw: r.raw, id: it.id };
      addSession(1, nq, r.cost, [r.latency_ms]);
    } catch (e) {
      errors++;
      if (errors === 1) fail(e);
    } finally {
      st.pending.delete(it.id);
      changed(sc.id, true);
    }
  });
  st.busy = false;
  st.run.t1 = performance.now();
  changed(sc.id, true);
  return errors === 0;
}

export const runCase = (sc) => (S.mode === 'single' ? runSingle(sc) : runBatch(sc));

/** Carrera: Decision-1 y un LLM resuelven el mismo lote a la vez, con el mismo prompt y las mismas preguntas. */
export async function runRace(sc, modelId = S.raceModel) {
  const st = caseState(sc.id);
  if (st.busy || st.race?.running) return;
  const cmp = (S.config?.comparisons || []).find((c) => c.id === modelId) || S.config?.comparisons?.[0];
  if (!cmp) {
    toast(t('No hay ningún modelo de comparación desplegado.'), 'warn');
    return;
  }
  const race = { model: cmp.id, running: true, t0: performance.now(), d1: null, llm: null, error: null };
  st.race = race;
  st.llm = null;
  changed(sc.id, false);
  const llm = api('/api/compare-batch', { scenario: sc.id, model: cmp.id })
    .then((r) => {
      race.llm = { ms: performance.now() - race.t0, latency_ms: r.latency_ms ?? r.wall_ms, cost: r.cost, usage: r.usage };
      st.llm = { ...r, model: cmp.id };
    })
    .catch((e) => {
      race.error = e;
      race.llm = { ms: performance.now() - race.t0, failed: true };
      fail(e);
    })
    .finally(() => changed(sc.id, false));
  const d1 = runBatch(sc).then((ok) => {
    race.d1 = { ms: performance.now() - race.t0, latency_ms: st.meta.latency_ms, cost: st.cost, failed: !ok };
    changed(sc.id, false);
  });
  await Promise.all([llm, d1]);
  race.running = false;
  changed(sc.id, false);
}
