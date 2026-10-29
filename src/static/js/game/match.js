// Head-to-head real-time match, with no DOM: works the same in the browser and in Node (scripts/play-match.mjs).
// The game clock runs on its own, so the match goes on while a model thinks: a slow answer arrives when the world has already changed.

import { COLS, TICK_MS, createGame, seconds, step } from './engine.js';
import { cloneGame, decisionQuality, describeState } from './observe.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Reads the backend answer (same shape for Decision-1 and for the LLMs). */
export function readAnswer(answers) {
  const c = answers?.carril;
  const lane = Number.parseInt(c?.value, 10);
  if (!Number.isInteger(lane) || lane < 0 || lane >= COLS) return null;
  let probs = null;
  if (c.probs?.length) {
    probs = Array(COLS).fill(0);
    for (const { key, p } of c.probs) {
      const k = Number.parseInt(key, 10);
      if (k >= 0 && k < COLS) probs[k] = p;
    }
  }
  return { lane, confidence: c.confidence ?? null, probs, danger: answers.peligro?.p ?? null };
}

/** Failure of the loop itself (`timeout`, `no-lane`): carries a stable code and its parameters; the UI translates it when rendering it. */
export class PlayError extends Error {
  constructor(code, params = null) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

/** A player: its game and the loop it uses to query the model (with no overlapping requests and a minimum cadence). */
export class Player {
  /** `decide(text)` returns the /api/game/decide answer: { answers, latency_ms, usage, cost }. */
  constructor({ id, label, decide, cadenceMs, timeoutMs = 20000 }) {
    this.id = id;
    this.label = label;
    this.decide = decide;
    this.cadenceMs = cadenceMs;
    this.timeoutMs = timeoutMs;
    this.epoch = 0;
    this.reset(1);
  }

  reset(seed) {
    this.epoch++;
    this.g = createGame(seed);
    this.target = null;
    this.inflight = null;
    this.lastStart = -Infinity;
    this.last = null;
    this.error = null;
    this.log = [];
    this.stats = { decisions: 0, skipped: 0, rtt: [], model: [], age: [], quality: [], tokensIn: 0, tokensOut: 0, usd: 0 };
  }

  advance(onEvents) {
    if (this.g.over) return;
    step(this.g, this.target);
    if (onEvents && this.g.events.length) onEvents(this, this.g.events);
  }

  /** Requests a decision if the cadence has elapsed and none is in flight. `now` in ms (performance.now). */
  maybeDecide(now) {
    if (this.g.over || this.inflight || now - this.lastStart < this.cadenceMs) return;
    this.lastStart = now;
    const snap = cloneGame(this.g);
    const req = { epoch: this.epoch, start: now, tick: snap.t, snap, text: describeState(snap) };
    this.inflight = req;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new PlayError('timeout', { s: this.timeoutMs / 1000 })), this.timeoutMs);
    });
    Promise.race([this.decide(req.text), timeout])
      .then(
        (r) => this.#arrived(req, r),
        (e) => this.#failed(req, e),
      )
      .finally(() => clearTimeout(timer));
  }

  #current(req) {
    return req.epoch === this.epoch && this.inflight === req;
  }

  #arrived(req, r) {
    if (!this.#current(req)) return;
    const a = readAnswer(r.answers);
    if (!a) return this.#failed(req, new PlayError('no-lane'));
    this.inflight = null;
    if (this.g.over) return;
    const age = this.g.t - req.tick;
    const quality = decisionQuality(req.snap, a.lane).quality;
    const rtt = performance.now() - req.start;
    const s = this.stats;
    s.decisions++;
    s.rtt.push(rtt);
    s.model.push(r.latency_ms);
    s.age.push(age);
    s.quality.push(quality);
    s.tokensIn += r.usage?.input_tokens || 0;
    s.tokensOut += r.usage?.output_tokens || 0;
    s.usd += r.cost?.usd || 0;
    this.target = a.lane;
    this.error = null;
    this.last = { ...a, text: req.text, raw: r, tick: req.tick, age, quality, rtt, modelMs: r.latency_ms, at: performance.now() };
    this.log.push({ n: s.decisions, t: req.tick, lane: a.lane, age, quality: +quality.toFixed(2), rtt: Math.round(rtt) });
  }

  #failed(req, e) {
    if (!this.#current(req)) return;
    this.inflight = null;
    this.stats.skipped++;
    const own = e instanceof PlayError;
    this.error = { status: e?.status ?? null, code: own ? e.code : null, params: own ? e.params : null, message: e?.message || String(e), cause: e, at: performance.now() };
  }

  /** Summary for the final table. */
  summary() {
    const g = this.g;
    const s = this.stats;
    return {
      id: this.id,
      label: this.label,
      over: g.over,
      won: g.over === 'won',
      score: g.score,
      kills: g.kills,
      lives: g.lives,
      seconds: seconds(g),
      decisions: s.decisions,
      skipped: s.skipped,
      rttMs: mean(s.rtt),
      modelMs: mean(s.model),
      ageS: s.age.length ? (mean(s.age) * TICK_MS) / 1000 : null,
      quality: mean(s.quality),
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      usd: s.usd,
    };
  }
}

/** Winner of a match: beating the game > more points > more lives > less time. -1 = tie. */
export function verdict(a, b) {
  const order = (x, y) => (x === y ? 0 : x > y ? 1 : -1);
  const c =
    order(a.won, b.won) || order(a.score, b.score) || order(a.lives, b.lives) || (a.won && b.won ? order(b.seconds, a.seconds) : 0);
  return c === 0 ? -1 : c > 0 ? 0 : 1;
}

/** Two or more players with the same clock, the same seed and the same rules. */
export class Match {
  constructor({ players, seed = 7, speed = 1 }) {
    this.players = players;
    this.speed = speed;
    this.seed = seed;
    this.status = 'idle'; // idle | running | paused | finished
    this.acc = 0;
    this.last = 0;
    this.ticks = 0;
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.status = 'idle';
    this.acc = 0;
    this.ticks = 0;
    for (const p of this.players) p.reset(seed);
  }

  start(now) {
    if (this.status === 'finished') this.reset();
    if (this.status === 'idle' || this.status === 'paused') {
      this.status = 'running';
      this.last = now;
    }
  }

  pause() {
    if (this.status === 'running') this.status = 'paused';
  }

  /** Fraction of the current tick (0 to 1): used to render smoothly between two ticks. */
  get alpha() {
    return this.acc / TICK_MS;
  }

  /** Advances the clock up to `now` (ms). Called once per frame. */
  frame(now, onEvents) {
    if (this.status !== 'running') return;
    const dt = Math.min(now - this.last, 250);
    this.last = now;
    this.acc += dt * this.speed;
    for (const p of this.players) p.maybeDecide(now);
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.ticks++;
      for (const p of this.players) p.advance(onEvents);
    }
    if (this.players.every((p) => p.g.over)) this.status = 'finished';
  }

  get result() {
    if (this.status !== 'finished') return null;
    const rows = this.players.map((p) => p.summary());
    return { seed: this.seed, rows, winner: rows.length === 2 ? verdict(rows[0], rows[1]) : null };
  }
}
