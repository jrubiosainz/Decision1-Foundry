// Pintado del tablero en un canvas. Solo lee el estado del juego: no contiene reglas.
import { COLS, ROWS, SHIP_ROW, RULES, rng } from './engine.js';

const SPRITES = {
  squid: [
    ['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
    ['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.'],
  ],
  crab: [
    ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
    ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'],
  ],
  octopus: [
    ['....####....', '.##########.', '############', '###..##..###', '############', '...##..##...', '..##.##.##..', '##........##'],
    ['....####....', '.##########.', '############', '###..##..###', '############', '..###..###..', '.##..##..##.', '..##....##..'],
  ],
};
const ROW_KIND = ['squid', 'crab', 'crab', 'octopus', 'octopus'];
const KIND_COLOR = { squid: '#f9a8d4', crab: '#fcd34d', octopus: '#86efac' };
const BOMB = '#fb7185';
const SPRITE_W = 12;
const SPRITE_H = 8;

const STARS = (() => {
  const r = rng(2026);
  return Array.from({ length: 46 }, () => ({ x: r(), y: r(), s: 0.6 + r() * 1.2, p: r() * 6.28 }));
})();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeSprite(rows, color, pw, ph) {
  const c = document.createElement('canvas');
  c.width = rows[0].length * pw;
  c.height = rows.length * ph;
  const x = c.getContext('2d');
  x.fillStyle = color;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') x.fillRect(i * pw, j * ph, pw, ph);
  });
  return c;
}

export class BoardView {
  constructor(canvas, accent) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.accent = accent;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.sprites = new Map();
    this.fx = { parts: [], flash: 0, shake: 0 };
  }

  /** Ajusta el lienzo al tamaño CSS y a la densidad de píxeles. Devuelve false si aún no tiene tamaño. */
  fit() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.sprites.clear();
    }
    return true;
  }

  reset() {
    this.fx = { parts: [], flash: 0, shake: 0 };
  }

  get animating() {
    return this.fx.parts.length > 0 || this.fx.flash > 0 || this.fx.shake > 0;
  }

  sprite(kind, frame, pw, ph) {
    const key = `${kind}${frame}:${pw}x${ph}`;
    let s = this.sprites.get(key);
    if (!s) this.sprites.set(key, (s = makeSprite(SPRITES[kind][frame], KIND_COLOR[kind], pw, ph)));
    return s;
  }

  /** Efectos de un tick: explosión al abatir un invasor, destello y sacudida al recibir un impacto. */
  burst(events, g) {
    if (!this.w || reduced()) return;
    const cw = this.w / COLS;
    const ch = this.h / ROWS;
    for (const e of events) {
      if (e.type === 'kill') this.#spawn((e.lane + 0.5) * cw, (e.row + 0.5) * ch, KIND_COLOR[ROW_KIND[e.row - g.form.oy]] || '#fff', 9, cw);
      else if (e.type === 'hit') {
        this.fx.flash = 1;
        this.fx.shake = 1;
        this.#spawn((g.ship.x + 0.5) * cw, (SHIP_ROW + 0.5) * ch, BOMB, 14, cw);
      }
    }
  }

  #spawn(x, y, color, n, cw) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      const v = cw * (1.2 + Math.random() * 2);
      const life = 0.35 + Math.random() * 0.35;
      this.fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - cw, life, max: life, color, size: 2 + Math.random() * 2.5 });
    }
  }

  /** `alpha` es la fracción del tick en curso; `ghost` es el mundo tal como lo veía el modelo al pedir su decisión. */
  draw(g, { alpha = 0, ghost = null, now = 0, dt = 0 } = {}) {
    if (!this.fit()) return;
    const { ctx, w, h, dpr, fx } = this;
    const cw = w / COLS;
    const ch = h / ROWS;
    fx.flash = Math.max(0, fx.flash - dt * 2.6);
    fx.shake = Math.max(0, fx.shake - dt * 4);
    for (const p of fx.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += cw * 7 * dt;
    }
    fx.parts = fx.parts.filter((p) => p.life > 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * 7 * fx.shake, (Math.random() - 0.5) * 7 * fx.shake);
    this.#background(ctx, w, h, cw, ch, now);
    this.#invaders(ctx, g, cw, ch, dpr);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const wob = Math.floor(now / 110) % 2 ? 1 : -1;
    for (const b of g.bombs) {
      const y = Math.min(b.y + RULES.bombSpeed * alpha, ROWS - 0.4) * ch;
      this.#bomb(ctx, (b.lane + 0.5) * cw, y, ch, wob);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f8fafc';
    for (const b of g.bullets) ctx.fillRect((b.lane + 0.5) * cw - 1.5, (b.y - RULES.bulletSpeed * alpha) * ch, 3, ch * 0.5);

    if (ghost) this.#ghost(ctx, ghost, cw, ch);

    if (!g.over || g.over === 'won' || g.over === 'timeout') {
      const s = g.ship;
      const x = s.x + clamp(s.target - s.x, -RULES.shipSpeed, RULES.shipSpeed) * alpha;
      const blink = s.invuln > 0 && Math.floor(now / 90) % 2 === 0;
      if (!blink) this.#ship(ctx, (x + 0.5) * cw, cw, ch, false);
      ctx.fillStyle = this.accent;
      ctx.globalAlpha = 0.9;
      const tx = (s.target + 0.5) * cw;
      ctx.beginPath();
      ctx.moveTo(tx - 5, h - 1.5);
      ctx.lineTo(tx + 5, h - 1.5);
      ctx.lineTo(tx, h - 8.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const p of fx.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${(fx.flash * 0.3).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  #background(ctx, w, h, cw, ch, now) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a1124');
    bg.addColorStop(1, '#111f44');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    for (const s of STARS) {
      ctx.globalAlpha = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(now / 900 + s.p));
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i++) {
      ctx.moveTo(Math.round(i * cw) + 0.5, 0);
      ctx.lineTo(Math.round(i * cw) + 0.5, h);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.4)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, (SHIP_ROW - 1) * ch);
    ctx.lineTo(w, (SHIP_ROW - 1) * ch);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  #invaders(ctx, g, cw, ch, dpr) {
    const f = g.form;
    const pw = Math.max(1, Math.floor((cw * dpr * 0.84) / SPRITE_W));
    const ph = Math.max(1, Math.floor((ch * dpr * 0.78) / SPRITE_H));
    const frame = (f.ox + f.oy) & 1;
    for (let r = 0; r < RULES.formRows; r++) {
      const sp = this.sprite(ROW_KIND[r] || 'octopus', frame, pw, ph);
      const sw = sp.width / dpr;
      const sh = sp.height / dpr;
      for (let c = 0; c < RULES.formCols; c++) {
        if (f.grid[r][c]) ctx.drawImage(sp, (f.ox + c) * cw + (cw - sw) / 2, (f.oy + r) * ch + (ch - sh) / 2, sw, sh);
      }
    }
  }

  #bomb(ctx, x, y, ch, wob) {
    ctx.strokeStyle = BOMB;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = BOMB;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x - 3 * wob, y);
    ctx.lineTo(x + 3 * wob, y + ch * 0.28);
    ctx.lineTo(x - 3 * wob, y + ch * 0.56);
    ctx.lineTo(x + 3 * wob, y + ch * 0.84);
    ctx.stroke();
  }

  #ship(ctx, cx, cw, ch, hollow) {
    const top = SHIP_ROW * ch;
    const parts = [
      [cx - cw * 0.34, top + ch * 0.58, cw * 0.68, ch * 0.28],
      [cx - cw * 0.2, top + ch * 0.38, cw * 0.4, ch * 0.2],
      [cx - cw * 0.05, top + ch * 0.14, cw * 0.1, ch * 0.26],
    ];
    if (hollow) {
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      for (const p of parts) ctx.strokeRect(...p);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = this.accent;
      for (const p of parts) ctx.fillRect(...p);
    }
  }

  /** Contornos huecos: la nave y las bombas tal como estaban cuando el modelo recibió el estado. */
  #ghost(ctx, ghost, cw, ch) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.shadowBlur = 0;
    this.#ship(ctx, (ghost.shipX + 0.5) * cw, cw, ch, true);
    ctx.strokeStyle = BOMB;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 3]);
    for (const b of ghost.bombs) {
      ctx.beginPath();
      ctx.arc((b.lane + 0.5) * cw, (b.y + 0.45) * ch, Math.min(cw, ch) * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
