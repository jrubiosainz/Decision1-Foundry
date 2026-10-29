// What the models "see" and how we measure whether they decided well.
// describeState() is the only thing sent to the models. The oracle (lookahead) only measures: it is never shown to them.

import { COLS, ROWS, SHIP_ROW, TICK_MS, RULES, laneAliens, step } from './engine.js';

export function cloneGame(g) {
  return {
    ...g,
    ship: { ...g.ship },
    form: { ...g.form, grid: g.form.grid.map((r) => r.slice()) },
    bullets: g.bullets.map((b) => ({ ...b })),
    bombs: g.bombs.map((b) => ({ ...b })),
    events: [],
  };
}

export const shipLane = (g) => Math.max(0, Math.min(COLS - 1, Math.round(g.ship.x)));

/** Row of the lowest invader in the whole formation (or -1). */
export function lowestAlienRow(g) {
  let low = -1;
  for (let r = 0; r < RULES.formRows; r++) if (g.form.grid[r].some(Boolean)) low = g.form.oy + r;
  return low;
}

/** Sensors per lane: invaders alive, row of the lowest one and rows the nearest bomb still needs to reach the ship. */
export function laneSensors(g) {
  const here = shipLane(g);
  return Array.from({ length: COLS }, (_, lane) => {
    const a = laneAliens(g, lane);
    let bomb = null;
    for (const b of g.bombs) {
      if (b.lane !== lane) continue;
      const d = SHIP_ROW - b.y;
      if (d > -0.4 && (bomb === null || d < bomb)) bomb = d;
    }
    return {
      lane,
      aliens: a.count,
      lowest: a.count ? a.lowest : null,
      bomb: bomb === null ? null : Math.max(0, Math.round(bomb)),
      ship: lane === here,
    };
  });
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Game state as text, exactly as it is sent to Decision-1 and to gpt-6-luna. */
export function describeState(g, { bombs = 'filas' } = {}) {
  const f = g.form;
  const here = shipLane(g);
  const low = lowestAlienRow(g);
  const secBomb = (TICK_MS / 1000 / RULES.bombSpeed).toFixed(2).replace('.', ',');
  const secLane = (TICK_MS / 1000 / RULES.shipSpeed).toFixed(3).replace('.', ',');
  const lines = [
    'SPACE INVADERS. Eres el piloto: decide a qué carril debe ir la nave.',
    `Tablero: ${COLS} carriles (0 = izquierda, ${COLS - 1} = derecha) y ${ROWS} filas (0 = arriba, ${SHIP_ROW} = donde está la nave). ` +
      'La nave va sola al carril que elijas y dispara a los invasores que tenga encima.',
    `Nave en el carril ${here}, destino actual ${g.ship.target}. Vidas: ${g.lives}. Puntos: ${g.score}.`,
    `Invasores vivos: ${f.alive}; la formación va hacia la ${f.dir > 0 ? 'derecha' : 'izquierda'} y el más bajo está en la fila ${low} ` +
      `(si llega a la fila ${SHIP_ROW - 1} pierdes).`,
    `Una bomba tarda ${secBomb} s en bajar una fila; la nave tarda ${secLane} s en cambiar de carril.`,
    'Carriles:',
  ];
  for (const s of laneSensors(g)) {
    const parts = [s.aliens ? `${plural(s.aliens, 'invasor', 'invasores')}, el más bajo en la fila ${s.lowest}` : 'sin invasores'];
    if (s.bomb !== null) {
      parts.push(
        bombs === 'segundos'
          ? `bomba que llegará a la nave en ${((s.bomb * TICK_MS) / 1000 / RULES.bombSpeed).toFixed(1).replace('.', ',')} s`
          : `bomba a ${plural(s.bomb, 'fila', 'filas')} de la nave`
      );
    }
    lines.push(`${s.lane}${s.ship ? ' (nave)' : ''}: ${parts.join('; ')}`);
  }
  return lines.join('\n');
}

/** ASCII board (for rendering and for testing another encoding): A invader, v bomb, | bullet, N ship. */
export function boardText(g) {
  const rows = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  const f = g.form;
  for (let r = 0; r < RULES.formRows; r++) {
    for (let c = 0; c < RULES.formCols; c++) if (f.grid[r][c]) rows[f.oy + r][f.ox + c] = 'A';
  }
  for (const b of g.bullets) rows[Math.max(0, Math.min(ROWS - 1, Math.floor(b.y)))][b.lane] = '|';
  for (const b of g.bombs) rows[Math.max(0, Math.min(ROWS - 1, Math.floor(b.y)))][b.lane] = 'v';
  rows[SHIP_ROW][shipLane(g)] = 'N';
  return rows.map((r) => r.join('')).join('\n');
}

/** Result of sending the ship to `lane` and letting `ticks` pass with no further commands. */
export function lookahead(g, lane, ticks = 50) {
  const c = cloneGame(g);
  const score0 = c.score;
  const lives0 = c.lives;
  for (let i = 0; i < ticks && !c.over; i++) step(c, lane);
  return { score: c.score - score0, hits: lives0 - c.lives, over: c.over };
}

/** Value of each lane according to the oracle: points won minus a penalty for lives lost. */
export function laneValues(g, ticks = 50) {
  return Array.from({ length: COLS }, (_, lane) => {
    const r = lookahead(g, lane, ticks);
    return { lane, ...r, value: r.score - 150 * r.hits - (r.over === 'invaded' || r.over === 'lost' ? 500 : 0) };
  });
}

/** Best lane according to the oracle (ties broken by closeness to the ship). */
export function oracleLane(g, ticks = 50, vals = laneValues(g, ticks)) {
  const here = g.ship.x;
  return vals.reduce((best, v) =>
    !best || v.value > best.value || (v.value === best.value && Math.abs(v.lane - here) < Math.abs(best.lane - here)) ? v : best
  , null).lane;
}

/** Quality of a decision (0 to 1): where the chosen lane falls between the worst and the best according to the oracle. */
export function decisionQuality(g, lane, ticks = 50) {
  const vals = laneValues(g, ticks);
  const values = vals.map((v) => v.value);
  const best = Math.max(...values);
  const worst = Math.min(...values);
  const chosen = vals[Math.max(0, Math.min(COLS - 1, lane))].value;
  return { quality: best === worst ? 1 : (chosen - worst) / (best - worst), chosen, best, worst, bestLane: oracleLane(g, ticks, vals) };
}
