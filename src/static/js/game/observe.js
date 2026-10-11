// Lo que "ven" los modelos y cómo se mide si decidieron bien.
// describeState() es lo único que se envía a los modelos. El oráculo (lookahead) solo mide: nunca se les muestra.

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

/** Fila del invasor más bajo de toda la formación (o -1). */
export function lowestAlienRow(g) {
  let low = -1;
  for (let r = 0; r < RULES.formRows; r++) if (g.form.grid[r].some(Boolean)) low = g.form.oy + r;
  return low;
}

/** Sensores por carril: invasores vivos, fila del más bajo y filas que le faltan a la bomba más cercana para llegar a la nave. */
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

/** Estado del juego en texto, tal y como se envía a Decision-1 y a gpt-6-luna. */
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

/** Tablero en ASCII (para pintar y para probar otra codificación): A invasor, v bomba, | bala, N nave. */
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

/** Resultado de mandar la nave a `lane` y dejar pasar `ticks` sin más órdenes. */
export function lookahead(g, lane, ticks = 50) {
  const c = cloneGame(g);
  const score0 = c.score;
  const lives0 = c.lives;
  for (let i = 0; i < ticks && !c.over; i++) step(c, lane);
  return { score: c.score - score0, hits: lives0 - c.lives, over: c.over };
}

/** Valor de cada carril según el oráculo: puntos ganados menos penalización por vidas perdidas. */
export function laneValues(g, ticks = 50) {
  return Array.from({ length: COLS }, (_, lane) => {
    const r = lookahead(g, lane, ticks);
    return { lane, ...r, value: r.score - 150 * r.hits - (r.over === 'invaded' || r.over === 'lost' ? 500 : 0) };
  });
}

/** Mejor carril según el oráculo (desempata por cercanía a la nave). */
export function oracleLane(g, ticks = 50, vals = laneValues(g, ticks)) {
  const here = g.ship.x;
  return vals.reduce((best, v) =>
    !best || v.value > best.value || (v.value === best.value && Math.abs(v.lane - here) < Math.abs(best.lane - here)) ? v : best
  , null).lane;
}

/** Calidad de una decisión (0 a 1): dónde cae el carril elegido entre el peor y el mejor según el oráculo. */
export function decisionQuality(g, lane, ticks = 50) {
  const vals = laneValues(g, ticks);
  const values = vals.map((v) => v.value);
  const best = Math.max(...values);
  const worst = Math.min(...values);
  const chosen = vals[Math.max(0, Math.min(COLS - 1, lane))].value;
  return { quality: best === worst ? 1 : (chosen - worst) / (best - worst), chosen, best, worst, bestLane: oracleLane(g, ticks, vals) };
}
