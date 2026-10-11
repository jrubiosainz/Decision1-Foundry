// Partida de Space Invaders en tiempo real, sin navegador: Decision-1 contra un LLM, mismas reglas y misma semilla.
// Uso: node scripts/partida.mjs [--url http://localhost:8000] [--code CODIGO] [--semillas 7,11] [--velocidad 1] [--rival gpt-6-luna] [--reglas '{"bombSpeed":0.25}'] [--json salida.json]
// El código de acceso también puede ir en la variable DEMO_ACCESS_CODE. `--reglas` sobrescribe reglas del motor (calibración).
import { writeFileSync } from 'node:fs';
import { Match, Player } from '../src/static/js/game/match.js';
import { RULES, createGame } from '../src/static/js/game/engine.js';
import { describeState } from '../src/static/js/game/observe.js';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const next = argv[i + 1];
  args[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? 'true' : argv[++i];
}
const URL_BASE = (args.url || 'http://localhost:8000').replace(/\/$/, '');
const CODE = args.code || process.env.DEMO_ACCESS_CODE || '';
const SPEED = Number(args.velocidad || 1);
const RIVAL = args.rival || 'gpt-6-luna';
const SEEDS = (args.semillas || '7').split(',').map(Number);
if (args.reglas) Object.assign(RULES, JSON.parse(args.reglas));

const headers = { 'Content-Type': 'application/json', 'X-Demo-Code': CODE };

async function call(path, body) {
  const res = await fetch(URL_BASE + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}: ${JSON.stringify(data.detail ?? data).slice(0, 160)}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

const fmt = (n, d = 1) => (n == null ? '—' : n.toFixed(d).replace('.', ','));
const pad = (s, n) => String(s).padEnd(n);

const config = await call('/api/config');
const rival = config.comparisons.find((c) => c.id === RIVAL);
if (!rival) {
  console.error(`El modelo rival «${RIVAL}» no está desplegado. Disponibles: ${config.comparisons.map((c) => c.id).join(', ') || 'ninguno'}`);
  process.exit(1);
}
const cadenceMs = config.game?.cadence_ms ?? 1050;
const ids = [
  { id: 'decision-1', label: 'Decision-1' },
  { id: rival.id, label: rival.label.split(' · ')[0] },
];

console.log(`Calentando modelos… (cadencia ${cadenceMs} ms, velocidad ×${SPEED})`);
const warmText = describeState(createGame(1));
await Promise.all(ids.map((m) => call('/api/game/decide', { model: m.id, state: warmText }).catch((e) => console.warn(`  ${m.label}: ${e.message}`))));
await new Promise((r) => setTimeout(r, cadenceMs));

const all = [];
for (const seed of SEEDS) {
  const players = ids.map((m) => new Player({ ...m, cadenceMs, decide: (state) => call('/api/game/decide', { model: m.id, state }) }));
  const match = new Match({ players, seed, speed: SPEED });
  match.start(performance.now());
  let lastPrint = 0;
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      match.frame(performance.now());
      if (match.ticks - lastPrint >= 200) {
        lastPrint = match.ticks;
        console.log(`  t=${fmt(match.ticks / 20, 0)} s  ` + players.map((p) => `${p.label}: ${p.g.score} pts, ${p.g.lives} vidas, ${p.g.form.alive} invasores`).join('  |  '));
      }
      if (match.status === 'finished') {
        clearInterval(timer);
        resolve();
      }
    }, 16);
  });
  const result = match.result;
  all.push({ ...result, logs: players.map((p) => p.log) });
  const END = { won: 'ha ganado la partida', lost: 'sin vidas', invaded: 'invadido', timeout: 'tiempo agotado' };
  console.log(`\nSemilla ${seed}`);
  console.log(pad('', 24) + result.rows.map((r) => pad(r.label, 16)).join(''));
  const row = (name, f) => console.log(pad(name, 24) + result.rows.map((r) => pad(f(r), 16)).join(''));
  row('Resultado', (r) => END[r.over] || r.over);
  row('Puntos', (r) => `${r.score} (${r.kills} inv.)`);
  row('Vidas', (r) => r.lives);
  row('Tiempo de partida (s)', (r) => fmt(r.seconds));
  row('Decisiones / saltadas', (r) => `${r.decisions} / ${r.skipped}`);
  row('Latencia modelo (ms)', (r) => fmt(r.modelMs, 0));
  row('Latencia total (ms)', (r) => fmt(r.rttMs, 0));
  row('Edad media decisión (s)', (r) => fmt(r.ageS, 2));
  row('Calidad vs oráculo', (r) => fmt(r.quality, 2));
  row('Coste (USD)', (r) => r.usd.toFixed(5));
  console.log(`Ganador: ${result.winner === -1 ? 'empate' : result.rows[result.winner].label}\n`);
}

if (args.json) writeFileSync(args.json, JSON.stringify(all, null, 1));
const wins = ids.map((_, i) => all.filter((m) => m.winner === i).length);
console.log(`Resumen de ${all.length} partidas: ` + ids.map((m, i) => `${m.label} ${wins[i]}`).join(' · ') + ` · empates ${all.filter((m) => m.winner === -1).length}`);
