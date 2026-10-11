// Piezas comunes del caso 6 (partida en directo): identificadores, textos y estadísticas por jugador.
import { fmt } from './util.js';
import { TICK_MS } from './game/engine.js';

export const D1_ID = 'decision-1';
export const D1_NAME = 'Decision-1';
export const OVER_LABEL = { won: 'Victoria', lost: 'Sin vidas', invaded: 'Invadido', timeout: 'Tiempo agotado' };
export const SPEED_LABEL = { 1: 'normal', 1.5: 'rápido', 2: 'turbo' };

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const shortName = (label) => String(label || '').split(' · ')[0];
export const speedText = (v) => `×${fmt.num(v, 1)}`;
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Lo medido hasta ahora para un jugador (partida en curso o terminada). */
export function liveStats(p) {
  const s = p.stats;
  return {
    decisions: s.decisions,
    skipped: s.skipped,
    modelMs: mean(s.model),
    rttMs: mean(s.rtt),
    ageMs: s.age.length ? mean(s.age) * TICK_MS : null,
    quality: mean(s.quality),
    usd: s.usd,
    perDecisionUsd: s.decisions ? s.usd / s.decisions : null,
  };
}
