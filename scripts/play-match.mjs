// Real-time Space Invaders match with no browser: Decision-1 against an LLM, same rules and same seed.
// Usage: node scripts/play-match.mjs [--url http://localhost:8000] [--code CODE] [--seeds 7,11] [--speed 1] [--rival gpt-6-luna] [--rules '{"bombSpeed":0.25}'] [--json output.json]
// The access code can also go in the DEMO_ACCESS_CODE variable. `--rules` overrides engine rules (calibration).
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
const SPEED = Number(args.speed || 1);
const RIVAL = args.rival || 'gpt-6-luna';
const SEEDS = (args.seeds || '7').split(',').map(Number);
if (args.rules) Object.assign(RULES, JSON.parse(args.rules));

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

const fmt = (n, d = 1) => (n == null ? '—' : n.toFixed(d));
const pad = (s, n) => String(s).padEnd(n);

const config = await call('/api/config');
const rival = config.comparisons.find((c) => c.id === RIVAL);
if (!rival) {
  console.error(`The opponent model "${RIVAL}" is not deployed. Available: ${config.comparisons.map((c) => c.id).join(', ') || 'none'}`);
  process.exit(1);
}
const cadenceMs = config.game?.cadence_ms ?? 1050;
const ids = [
  { id: 'decision-1', label: 'Decision-1' },
  { id: rival.id, label: rival.label.split(' · ')[0] },
];

console.log(`Warming up models… (cadence ${cadenceMs} ms, speed ×${SPEED})`);
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
        console.log(`  t=${fmt(match.ticks / 20, 0)} s  ` + players.map((p) => `${p.label}: ${p.g.score} pts, ${p.g.lives} lives, ${p.g.form.alive} invaders`).join('  |  '));
      }
      if (match.status === 'finished') {
        clearInterval(timer);
        resolve();
      }
    }, 16);
  });
  const result = match.result;
  all.push({ ...result, logs: players.map((p) => p.log) });
  const END = { won: 'won the match', lost: 'out of lives', invaded: 'invaded', timeout: "time's up" };
  console.log(`\nSeed ${seed}`);
  console.log(pad('', 24) + result.rows.map((r) => pad(r.label, 16)).join(''));
  const row = (name, f) => console.log(pad(name, 24) + result.rows.map((r) => pad(f(r), 16)).join(''));
  row('Result', (r) => END[r.over] || r.over);
  row('Points', (r) => `${r.score} (${r.kills} inv.)`);
  row('Lives', (r) => r.lives);
  row('Match time (s)', (r) => fmt(r.seconds));
  row('Decisions / skipped', (r) => `${r.decisions} / ${r.skipped}`);
  row('Model latency (ms)', (r) => fmt(r.modelMs, 0));
  row('Total latency (ms)', (r) => fmt(r.rttMs, 0));
  row('Mean decision age (s)', (r) => fmt(r.ageS, 2));
  row('Quality vs oracle', (r) => fmt(r.quality, 2));
  row('Cost (USD)', (r) => r.usd.toFixed(5));
  console.log(`Winner: ${result.winner === -1 ? 'tie' : result.rows[result.winner].label}\n`);
}

if (args.json) writeFileSync(args.json, JSON.stringify(all, null, 1));
const wins = ids.map((_, i) => all.filter((m) => m.winner === i).length);
console.log(`Summary of ${all.length} matches: ` + ids.map((m, i) => `${m.label} ${wins[i]}`).join(' · ') + ` · ties ${all.filter((m) => m.winner === -1).length}`);
