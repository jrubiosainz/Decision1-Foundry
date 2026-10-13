// Partida comparada en tiempo real, sin DOM: sirve igual en el navegador y en Node (scripts/partida.mjs).
// El reloj del juego avanza solo, así que mientras un modelo piensa la partida sigue: una respuesta lenta llega con el mundo ya cambiado.

import { COLS, TICK_MS, createGame, seconds, step } from './engine.js';
import { cloneGame, decisionQuality, describeState } from './observe.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Lee la respuesta del backend (misma forma para Decision-1 y para los LLM). */
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

/** Fallo propio del bucle (`timeout`, `no-lane`): lleva un código estable y sus parámetros; la interfaz lo traduce al pintarlo. */
export class PlayError extends Error {
  constructor(code, params = null) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

/** Un jugador: su partida y el bucle con el que consulta al modelo (sin solapar peticiones y con una cadencia mínima). */
export class Player {
  /** `decide(texto)` devuelve la respuesta de /api/game/decide: { answers, latency_ms, usage, cost }. */
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

  /** Pide una decisión si ha pasado la cadencia y no hay otra en curso. `now` en ms (performance.now). */
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

  /** Resumen para la tabla final. */
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

/** Ganador de una partida: pasarse el juego > más puntos > más vidas > menos tiempo. -1 = empate. */
export function verdict(a, b) {
  const order = (x, y) => (x === y ? 0 : x > y ? 1 : -1);
  const c =
    order(a.won, b.won) || order(a.score, b.score) || order(a.lives, b.lives) || (a.won && b.won ? order(b.seconds, a.seconds) : 0);
  return c === 0 ? -1 : c > 0 ? 0 : 1;
}

/** Dos o más jugadores con el mismo reloj, la misma semilla y las mismas reglas. */
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

  /** Fracción del tick en curso (0 a 1): sirve para pintar con suavidad entre dos ticks. */
  get alpha() {
    return this.acc / TICK_MS;
  }

  /** Avanza el reloj hasta `now` (ms). Se llama una vez por fotograma. */
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
