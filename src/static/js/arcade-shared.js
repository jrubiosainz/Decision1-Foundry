// Shared pieces of case 6 (live game): identifiers, texts and per-player stats.
import { fmt } from './util.js';
import { N_ } from './i18n.js';
import { TICK_MS } from './game/engine.js';

export const D1_ID = 'decision-1';
export const D1_NAME = 'Decision-1';
// Translated with t() when rendered.
export const OVER_LABEL = { won: N_('Victoria'), lost: N_('Sin vidas'), invaded: N_('Invadido'), timeout: N_('Tiempo agotado') };
export const SPEED_LABEL = { 1: N_('normal'), 1.5: N_('rápido'), 2: N_('turbo') };

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const shortName = (label) => String(label || '').split(' · ')[0];
export const speedText = (v) => `×${fmt.num(v, 1)}`;
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** What has been measured so far for a player (game in progress or finished). */
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
