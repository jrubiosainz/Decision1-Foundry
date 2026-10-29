// Tests for the case 6 engine (Space Invaders) with no network or browser: node scripts/test-game.mjs
// They cover the deterministic engine, what the models see, the decision loop and the match verdict.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLS, ROWS, SHIP_ROW, TICK_MS, RULES, createGame, laneAliens, seconds, step, stepTicks } from '../src/static/js/game/engine.js';
import { boardText, cloneGame, decisionQuality, describeState, laneSensors, lookahead, oracleLane } from '../src/static/js/game/observe.js';
import { Match, Player, readAnswer, verdict } from '../src/static/js/game/match.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const flush = () => new Promise((resolve) => setImmediate(resolve));
const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

/** An answer shaped like /api/game/decide. */
const answer = (lane, extra = {}) => ({
  answers: {
    carril: { type: 'choice', value: String(lane), confidence: 0.9, probs: [{ key: String(lane), p: 0.9 }], ...extra },
    peligro: { type: 'noul', value: false, p: 0.1, confidence: 0.8 },
  },
  latency_ms: 300,
  usage: { input_tokens: 700, output_tokens: 0 },
  cost: { usd: 0.00003 },
});

function play(seed, policy, maxTicks = RULES.maxTicks) {
  const g = createGame(seed);
  for (let i = 0; i < maxTicks && !g.over; i++) step(g, policy(g));
  return g;
}
const signature = (g) => JSON.stringify({ t: g.t, over: g.over, score: g.score, lives: g.lives, x: g.ship.x, grid: g.form.grid, bombs: g.bombs });
const zigzag = (g) => (g.t % 60 < 30 ? 3 : 9);

// ---------------------------------------------------------------- Engine

test('determinism: same seed and same commands give the same game', () => {
  assert.equal(signature(play(7, zigzag)), signature(play(7, zigzag)));
  assert.notEqual(signature(play(7, zigzag)), signature(play(8, zigzag)));
});

test('the bomb schedule depends only on the seed, not on how the game is played', () => {
  const base = createGame(11).schedule;
  assert.deepEqual(createGame(11).schedule, base);
  assert.deepEqual(play(11, zigzag).schedule, base);
  assert.deepEqual(play(11, () => 0).schedule, base);
  assert.ok(base.every((b, i) => b.lane >= 0 && b.lane < COLS && (i === 0 || b.tick > base[i - 1].tick)));
});

test('the formation starts centered: 5 rows × 9 columns and 45 invaders', () => {
  const g = createGame(1);
  assert.equal(g.form.alive, RULES.formRows * RULES.formCols);
  assert.deepEqual(laneAliens(g, 6), { count: RULES.formRows, lowest: g.form.oy + RULES.formRows - 1 });
  assert.deepEqual(laneAliens(g, 0), { count: 0, lowest: -1 });
  assert.deepEqual(laneAliens(g, COLS - 1), { count: 0, lowest: -1 });
});

test('the formation speeds up as fewer invaders are left', () => {
  const g = createGame(1);
  const full = stepTicks(g);
  g.form.alive = 1;
  const last = stepTicks(g);
  assert.equal(full, RULES.stepSlow);
  assert.ok(last < full && last >= RULES.stepFast);
});

test('the ship goes to the chosen lane without exceeding its speed or leaving the board', () => {
  const g = createGame(1);
  step(g, 12);
  assert.ok(Math.abs(g.ship.x - (6 + RULES.shipSpeed)) < 1e-9);
  for (let i = 0; i < 30; i++) step(g, 0);
  assert.ok(Math.abs(g.ship.x) < 1e-9);
  step(g, 99);
  assert.equal(g.ship.target, COLS - 1);
  step(g, -4);
  assert.equal(g.ship.target, 0);
  step(g, 3.6);
  assert.equal(g.ship.target, 4);
});

test('the ship fires on its own with an invader above it, respects the cooldown and kills the lowest one in the lane', () => {
  const g = createGame(1);
  const events = [];
  for (let i = 0; i < 40 && !g.over; i++) {
    step(g, 6);
    events.push(...g.events.map((e) => ({ ...e, t: g.t })));
  }
  const shots = events.filter((e) => e.type === 'shot');
  const kills = events.filter((e) => e.type === 'kill');
  assert.equal(shots[0].t, 1);
  assert.ok(shots.every((s, i) => i === 0 || s.t - shots[i - 1].t >= RULES.fireCooldown));
  assert.deepEqual({ lane: kills[0].lane, row: kills[0].row, points: kills[0].points }, { lane: 6, row: g.form.oy + RULES.formRows - 1, points: RULES.rowPoints[RULES.formRows - 1] });
  assert.equal(g.score, kills.reduce((sum, k) => sum + k.points, 0));
});

test("the ship doesn't waste ammo on a lane with no invaders and none expected to arrive", () => {
  const g = createGame(1);
  for (const row of g.form.grid) row.fill(false);
  for (let r = 0; r < RULES.formRows; r++) g.form.grid[r][RULES.formCols - 1] = true;
  g.form.alive = RULES.formRows;
  g.ship.x = 0;
  for (let i = 0; i < 30; i++) step(g, 0);
  assert.equal(g.shots, 0);
});

test("a bomb in the ship's lane takes a life and grants invulnerability", () => {
  const g = createGame(1);
  g.schedule = [];
  g.bombs.push({ lane: 6, y: SHIP_ROW - 0.5 });
  step(g, 6);
  assert.equal(g.lives, RULES.lives - 1);
  assert.equal(g.ship.invuln, RULES.invuln);
  assert.deepEqual(g.events.filter((e) => e.type === 'hit'), [{ type: 'hit', lane: 6 }]);
  g.bombs.push({ lane: 6, y: SHIP_ROW - 0.5 });
  step(g, 6);
  assert.equal(g.lives, RULES.lives - 1, 'no second hit while invulnerability lasts');
});

test("a bomb in another lane doesn't hit the ship", () => {
  const g = createGame(1);
  g.schedule = [];
  g.bombs.push({ lane: 9, y: SHIP_ROW - 0.5 });
  step(g, 6);
  assert.equal(g.lives, RULES.lives);
});

test("end of game: victory, out of lives, invaded and time's up", () => {
  const won = createGame(1);
  for (const row of won.form.grid) row.fill(false);
  won.form.alive = 0;
  assert.equal(step(won, 6).over, 'won');

  const lost = createGame(1);
  lost.schedule = [];
  lost.lives = 1;
  lost.bombs.push({ lane: 6, y: SHIP_ROW - 0.5 });
  assert.equal(step(lost, 6).over, 'lost');

  const invaded = createGame(1);
  invaded.form.oy = SHIP_ROW - RULES.formRows;
  assert.equal(step(invaded, 6).over, 'invaded');
  assert.equal(invaded.lives, 0);

  const late = createGame(1);
  late.t = RULES.maxTicks - 1;
  assert.equal(step(late, 6).over, 'timeout');

  const t = late.t;
  step(late, 0);
  assert.equal(late.t, t, 'a finished game no longer advances');
});

test('the game time comes from the ticks', () => {
  const g = createGame(1);
  for (let i = 0; i < 40; i++) step(g, 6);
  assert.equal(seconds(g), (40 * TICK_MS) / 1000);
});

test('an oracle pilot completes the games: the game can be won', () => {
  for (const seed of [7, 11, 23]) {
    const g = createGame(seed);
    while (!g.over) step(g, g.t % 10 === 0 ? oracleLane(g) : null);
    assert.equal(g.over, 'won', `seed ${seed}`);
  }
});

// ---------------------------------------------------------------- What the models see

test("describeState is deterministic, the same for everyone and doesn't leak the oracle", () => {
  const a = createGame(7);
  const b = createGame(7);
  for (let i = 0; i < 25; i++) {
    step(a, 3);
    step(b, 3);
  }
  const text = describeState(a);
  assert.equal(text, describeState(b));
  assert.ok(!/oráculo|oraculo/i.test(text));
  assert.equal(text.split('\n').filter((l) => /^\d+( \(nave\))?:/.test(l)).length, COLS);
  assert.equal((text.match(/\(nave\)/g) || []).length, 1);
});

test('describeState counts the rows each bomb still has to fall', () => {
  const g = createGame(1);
  g.bombs.push({ lane: 3, y: 10 });
  assert.equal(laneSensors(g)[3].bomb, 5);
  assert.match(describeState(g), /^3: .*bomba a 5 filas de la nave$/m);
  g.bombs.push({ lane: 4, y: 14 });
  assert.match(describeState(g), /^4: .*bomba a 1 fila de la nave$/m);
});

test("cloning and looking ahead don't modify the real game", () => {
  const g = createGame(7);
  for (let i = 0; i < 20; i++) step(g, 5);
  const before = signature(g);
  const copy = cloneGame(g);
  for (let i = 0; i < 40; i++) step(copy, 9);
  lookahead(g, 2, 50);
  decisionQuality(g, 2);
  assert.equal(signature(g), before);
  assert.notEqual(signature(copy), before);
});

test("decision quality between 0 and 1: the oracle's best lane scores 1", () => {
  const g = createGame(7);
  for (let i = 0; i < 90; i++) step(g, g.t % 20 === 0 ? oracleLane(g) : null);
  const { bestLane } = decisionQuality(g, 0);
  assert.equal(decisionQuality(g, bestLane).quality, 1);
  for (let lane = 0; lane < COLS; lane++) {
    const q = decisionQuality(g, lane).quality;
    assert.ok(q >= 0 && q <= 1);
  }
});

test('the text board has the size of the game and a single ship', () => {
  const rows = boardText(createGame(1)).split('\n');
  assert.equal(rows.length, ROWS);
  assert.ok(rows.every((r) => r.length === COLS));
  assert.equal(rows.join('').split('N').length - 1, 1);
});

// ---------------------------------------------------------------- Model answer and verdict

test('readAnswer understands Decision-1 (with probabilities) and the LLMs (without them)', () => {
  const d1 = readAnswer({
    carril: { type: 'choice', value: '6', confidence: 0.8, probs: [{ key: '6', p: 0.7 }, { key: '5', p: 0.3 }] },
    peligro: { type: 'noul', value: true, p: 0.9 },
  });
  assert.equal(d1.lane, 6);
  assert.equal(d1.probs.length, COLS);
  assert.equal(d1.probs[6], 0.7);
  assert.equal(d1.probs[5], 0.3);
  assert.equal(d1.danger, 0.9);
  const llm = readAnswer({ carril: { type: 'choice', value: '0', confidence: null, probs: [] }, peligro: { type: 'noul', value: false, p: 0 } });
  assert.deepEqual({ lane: llm.lane, probs: llm.probs, confidence: llm.confidence, danger: llm.danger }, { lane: 0, probs: null, confidence: null, danger: 0 });
});

test("readAnswer rejects lanes that don't exist", () => {
  for (const value of ['13', '-1', 'abc', '', undefined]) assert.equal(readAnswer({ carril: { type: 'choice', value } }), null, String(value));
  assert.equal(readAnswer(undefined), null);
  assert.equal(readAnswer({}), null);
});

test('verdict: beating the game > points > lives > time; tie = -1', () => {
  const r = (won, score, lives, seconds) => ({ won, score, lives, seconds });
  assert.equal(verdict(r(true, 810, 1, 50), r(false, 780, 4, 40)), 0);
  assert.equal(verdict(r(false, 780, 4, 40), r(true, 810, 1, 50)), 1);
  assert.equal(verdict(r(false, 700, 0, 40), r(false, 750, 0, 40)), 1);
  assert.equal(verdict(r(true, 810, 1, 50), r(true, 810, 4, 33)), 1);
  assert.equal(verdict(r(true, 810, 3, 50), r(true, 810, 3, 33)), 1);
  assert.equal(verdict(r(true, 810, 3, 33), r(true, 810, 3, 50)), 0);
  assert.equal(verdict(r(true, 810, 3, 33), r(true, 810, 3, 33)), -1);
});

// ---------------------------------------------------------------- Decision loop

const player = (decide, cadenceMs = 1000, id = 'x') => new Player({ id, label: id, decide, cadenceMs, timeoutMs: 5000 });

test("the player doesn't overlap requests and respects the cadence", async () => {
  let calls = 0;
  let release;
  const p = player(() => new Promise((resolve) => { calls++; release = () => resolve(answer(6)); }));
  p.reset(7);
  p.maybeDecide(0);
  p.maybeDecide(10);
  p.maybeDecide(1500);
  assert.equal(calls, 1, 'a request is in flight');
  release();
  await flush();
  assert.equal(p.stats.decisions, 1);
  assert.equal(p.target, 6);
  p.maybeDecide(500);
  assert.equal(calls, 1, 'the cadence has not elapsed yet');
  p.maybeDecide(1000);
  assert.equal(calls, 2);
  release();
  await flush();
});

test('both players receive exactly the same text for the same state', () => {
  const texts = [];
  const a = player((t) => (texts.push(t), new Promise(() => {})), 1000, 'a');
  const b = player((t) => (texts.push(t), new Promise(() => {})), 1000, 'b');
  a.reset(23);
  b.reset(23);
  a.maybeDecide(0);
  b.maybeDecide(0);
  assert.equal(texts[0], texts[1]);
  assert.equal(texts[0], describeState(createGame(23)));
});

test("an error or an answer with no valid lane skips the turn and doesn't crash the match", async () => {
  const boom = Object.assign(new Error('Quota exhausted'), { status: 429 });
  const p = player(() => Promise.reject(boom));
  p.reset(7);
  p.maybeDecide(0);
  await flush();
  assert.equal(p.stats.skipped, 1);
  assert.deepEqual({ status: p.error.status, message: p.error.message }, { status: 429, message: 'Quota exhausted' });
  assert.equal(p.inflight, null);

  const q = player(() => Promise.resolve({ answers: { carril: { type: 'choice', value: '99' } } }));
  q.reset(7);
  q.maybeDecide(0);
  await flush();
  assert.equal(q.stats.skipped, 1);
  assert.equal(q.target, null);
});

test('an answer that arrives after the match restarts is discarded', async () => {
  let release;
  const p = player(() => new Promise((resolve) => { release = () => resolve(answer(6)); }));
  p.reset(7);
  p.maybeDecide(0);
  p.reset(11);
  release();
  await flush();
  assert.equal(p.stats.decisions, 0);
  assert.equal(p.target, null);
});

test('the match goes on while the model thinks: the answer arrives already aged', async () => {
  let release;
  const p = player(() => new Promise((resolve) => { release = () => resolve(answer(6)); }));
  const m = new Match({ players: [p], seed: 7, speed: 1 });
  m.start(0);
  let now = 0;
  for (let i = 0; i < 10; i++) m.frame((now += TICK_MS));
  assert.equal(p.g.t, 10);
  assert.ok(p.inflight);
  release();
  await flush();
  assert.equal(p.last.age, 10);
  assert.equal(p.last.tick, 0);
  assert.equal(p.target, 6);
});

test('the speed only scales the game clock', () => {
  const run = (speed, ms) => {
    const p = player(() => new Promise(() => {}));
    const m = new Match({ players: [p], seed: 7, speed });
    m.start(0);
    m.frame(ms);
    return p.g.t;
  };
  assert.equal(run(1, 100), 2);
  assert.equal(run(2, 100), 4);
  assert.equal(run(0.5, 100), 1);
  assert.equal(run(1, 10_000), 5, 'a frame after a long pause advances no more than 250 ms');
});

test('pause, resume and restart; both players share the seed and the schedule', () => {
  const [a, b] = ['a', 'b'].map((id) => player(() => new Promise(() => {}), 1000, id));
  const m = new Match({ players: [a, b], seed: 11, speed: 1 });
  assert.deepEqual(a.g.schedule, b.g.schedule);
  m.start(0);
  m.frame(200);
  m.pause();
  const t = a.g.t;
  m.frame(1000);
  assert.equal(a.g.t, t);
  m.start(2000);
  m.frame(2100);
  assert.equal(a.g.t, t + 2);
  m.reset(23);
  assert.equal(m.status, 'idle');
  assert.equal(a.g.t, 0);
  assert.equal(a.g.seed, 23);
  assert.equal(b.g.seed, 23);
});

test('a full two-player match ends, computes the summary and declares a winner', async () => {
  const lane = (n) => () => Promise.resolve(answer(n));
  const m = new Match({ players: [player(lane(6), 1000, 'a'), player(lane(0), 1000, 'b')], seed: 7, speed: 1 });
  assert.equal(m.result, null);
  m.start(0);
  let now = 0;
  for (let i = 0; i < RULES.maxTicks + 50 && m.status !== 'finished'; i++) {
    m.frame((now += TICK_MS));
    await flush();
  }
  assert.equal(m.status, 'finished');
  const { rows, winner } = m.result;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.over && r.decisions > 0 && r.usd > 0 && r.quality >= 0 && r.quality <= 1));
  assert.ok(winner === -1 || winner === 0 || winner === 1);
  assert.equal(verdict(rows[0], rows[1]), winner);
  m.start(now);
  assert.equal(m.status, 'running', 'after finishing, Play starts another match');
  assert.equal(m.players[0].g.t, 0);
});

// ---------------------------------------------------------------- Scenario and pricing

test('the case 6 scenario and the price catalog are consistent with the game', () => {
  const sc = json('../src/scenarios/06-invaders.json');
  assert.equal(sc.kind, 'game');
  assert.equal(sc.primary, 'carril');
  assert.deepEqual(Object.keys(sc.questions.carril.criteria), Array.from({ length: COLS }, (_, i) => String(i)));
  assert.equal(sc.questions.peligro.type, 'noul');
  assert.ok(sc.game.seeds.length >= 3 && sc.game.seeds.every(Number.isInteger));
  assert.ok(sc.game.speeds.includes(1));
  const pricing = json('../src/pricing.json');
  const luna = pricing.comparisons.find((c) => c.id === sc.game.llm);
  assert.ok(luna && luna.reasoning_effort === 'none', "the default opponent doesn't reason");
  assert.ok(pricing.models[luna.deployment]);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${String(e.message).split('\n').join('\n      ')}`);
  }
}
console.log(failed ? `\n${failed} of ${tests.length} tests failed` : `\n${tests.length}/${tests.length} tests passed`);
process.exit(failed ? 1 : 0);
