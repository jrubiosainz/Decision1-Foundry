// Tick-based deterministic Space Invaders (20 ticks per second), with no DOM.
// Same seed + same commands on the same ticks = same game, in the browser and in Node.
// The ship has an autopilot: the model only picks the target lane; the ship moves toward it and fires on its own.

export const COLS = 13;
export const ROWS = 16;
export const SHIP_ROW = ROWS - 1;
export const TICK_MS = 50;

/** Rules and difficulty. A single place to calibrate (the test sweeps modify it in memory). */
export const RULES = {
  lives: 5,
  formRows: 5,
  formCols: 9,
  rowPoints: [30, 20, 20, 10, 10],
  maxTicks: 1800, // 90 s per game at most
  shipSpeed: 0.4, // lanes per tick (8 lanes/s)
  bulletSpeed: 0.8, // rows per tick
  bombSpeed: 0.2, // rows per tick (4 rows/s)
  fireCooldown: 10,
  invuln: 40, // ticks during which the ship can't be hit after a hit
  maxBombs: 5,
  bombGap: 18, // minimum ticks between bombs
  bombJitter: 28, // + up to this many random ticks
  aimed: 0.3, // share of bombs aimed at the ship's lane
  stepSlow: 40, // ticks between formation steps with all the invaders
  stepFast: 8, // ... and with the last one
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bomb schedule fixed by the seed: it doesn't depend on how each agent plays. */
function bombSchedule(seed) {
  const r = rng((seed ^ 0x9e3779b9) >>> 0);
  const out = [];
  let tick = 30;
  while (tick < RULES.maxTicks) {
    tick += RULES.bombGap + Math.floor(r() * RULES.bombJitter);
    out.push({ tick, lane: Math.floor(r() * COLS), aimed: r() < RULES.aimed });
  }
  return out;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Ticks between formation steps: the fewer invaders are left, the faster they go. */
export function stepTicks(g) {
  const { stepSlow, stepFast, formRows, formCols } = RULES;
  return clamp(Math.round(stepFast + ((stepSlow - stepFast) * g.form.alive) / (formRows * formCols)), stepFast, stepSlow);
}

export function createGame(seed = 1) {
  const { formRows, formCols } = RULES;
  const g = {
    seed,
    t: 0,
    over: null, // 'won' | 'lost' | 'invaded' | 'timeout'
    ship: { x: (COLS - 1) / 2, target: (COLS - 1) / 2, cooldown: 0, invuln: 0 },
    lives: RULES.lives,
    score: 0,
    kills: 0,
    shots: 0,
    form: {
      ox: Math.floor((COLS - formCols) / 2),
      oy: 1,
      dir: 1,
      timer: 0,
      grid: Array.from({ length: formRows }, () => Array(formCols).fill(true)),
      alive: formRows * formCols,
    },
    bullets: [],
    bombs: [],
    schedule: bombSchedule(seed),
    si: 0,
    events: [],
  };
  g.form.timer = stepTicks(g);
  return g;
}

/** Invaders in the lane: number alive and (absolute) row of the lowest one. */
export function laneAliens(g, lane) {
  const f = g.form;
  const c = lane - f.ox;
  if (c < 0 || c >= RULES.formCols) return { count: 0, lowest: -1 };
  let count = 0;
  let lowest = -1;
  for (let r = 0; r < RULES.formRows; r++) {
    if (f.grid[r][c]) {
      count++;
      lowest = f.oy + r;
    }
  }
  return { count, lowest };
}

function aliveExtent(g) {
  const f = g.form;
  let min = RULES.formCols;
  let max = -1;
  let low = -1;
  for (let r = 0; r < RULES.formRows; r++) {
    for (let c = 0; c < RULES.formCols; c++) {
      if (!f.grid[r][c]) continue;
      min = Math.min(min, c);
      max = Math.max(max, c);
      low = r;
    }
  }
  return { min, max, low };
}

/** Fires if there will be an invader in the lane when the bullet arrives (anticipates the formation's next step). */
function wantsFire(g, lane) {
  if (laneAliens(g, lane).count > 0) return true;
  const f = g.form;
  const { low } = aliveExtent(g);
  if (low < 0) return false;
  const travel = Math.ceil((SHIP_ROW - 1 - (f.oy + low)) / RULES.bulletSpeed);
  const steps = travel >= f.timer ? 1 + Math.floor((travel - f.timer) / stepTicks(g)) : 0;
  return steps > 0 && laneAliens(g, lane - f.dir * steps).count > 0;
}

function spawnBomb(g, entry) {
  if (g.bombs.length >= RULES.maxBombs) return;
  const want = entry.aimed ? Math.round(g.ship.x) : entry.lane;
  let best = null;
  for (let lane = 0; lane < COLS; lane++) {
    const a = laneAliens(g, lane);
    if (!a.count) continue;
    const d = Math.abs(lane - want);
    if (!best || d < best.d) best = { d, lane, row: a.lowest };
  }
  if (best) g.bombs.push({ lane: best.lane, y: best.row + 1 });
}

/** Advances one tick. `target` (optional) is the lane the ship should go to. */
export function step(g, target) {
  g.events.length = 0;
  if (g.over) return g;
  const ship = g.ship;
  if (target != null) ship.target = clamp(Math.round(target), 0, COLS - 1);
  g.t++;

  // Ship
  ship.x += clamp(ship.target - ship.x, -RULES.shipSpeed, RULES.shipSpeed);
  if (ship.cooldown > 0) ship.cooldown--;
  if (ship.invuln > 0) ship.invuln--;
  const lane = Math.round(ship.x);
  if (ship.cooldown === 0 && Math.abs(ship.x - lane) <= 0.25 && wantsFire(g, lane)) {
    g.bullets.push({ lane, y: SHIP_ROW - 1 });
    g.shots++;
    ship.cooldown = RULES.fireCooldown;
    g.events.push({ type: 'shot', lane });
  }

  // Bullets
  const f = g.form;
  g.bullets = g.bullets.filter((b) => {
    b.y -= RULES.bulletSpeed;
    if (b.y < 0) return false;
    const r = Math.floor(b.y) - f.oy;
    const c = b.lane - f.ox;
    if (r >= 0 && r < RULES.formRows && c >= 0 && c < RULES.formCols && f.grid[r][c]) {
      f.grid[r][c] = false;
      f.alive--;
      g.kills++;
      g.score += RULES.rowPoints[r];
      g.events.push({ type: 'kill', lane: b.lane, row: r + f.oy, points: RULES.rowPoints[r] });
      return false;
    }
    return true;
  });

  // Formation
  if (f.alive > 0 && --f.timer <= 0) {
    const { min, max } = aliveExtent(g);
    if ((f.dir > 0 && f.ox + max >= COLS - 1) || (f.dir < 0 && f.ox + min <= 0)) {
      f.oy++;
      f.dir = -f.dir;
    } else {
      f.ox += f.dir;
    }
    f.timer = stepTicks(g);
  }

  // Bombs
  while (g.si < g.schedule.length && g.schedule[g.si].tick <= g.t) spawnBomb(g, g.schedule[g.si++]);
  g.bombs = g.bombs.filter((b) => {
    b.y += RULES.bombSpeed;
    if (b.y >= ROWS) return false;
    if (b.y >= SHIP_ROW - 0.35 && ship.invuln === 0 && Math.abs(ship.x - b.lane) < 0.7) {
      g.lives--;
      ship.invuln = RULES.invuln;
      g.events.push({ type: 'hit', lane: b.lane });
      return false;
    }
    return true;
  });

  // End of game
  if (f.alive === 0) g.over = 'won';
  else if (f.oy + aliveExtent(g).low >= SHIP_ROW - 1) {
    g.lives = 0;
    g.over = 'invaded';
  } else if (g.lives <= 0) g.over = 'lost';
  else if (g.t >= RULES.maxTicks) g.over = 'timeout';
  return g;
}

export const seconds = (g) => (g.t * TICK_MS) / 1000;
