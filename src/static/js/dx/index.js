// "OpenAI Decisions API" tab: content, mounting of each page and state for the sidebar.
import { api, emit } from '../core.js';
import { DX } from './common.js';
import { mountDxIntro } from './intro.js';
import { mountCascade } from './cascade.js';
import { mountGallery } from './gallery.js';
import { mountContracts } from './contracts.js';

const VIEWS = { cascade: mountCascade, receipts: mountGallery, creatives: mountGallery, safety: mountGallery, contracts: mountContracts };

let current = null; // { page, sc, view }
let ticker = 0;

export const isDx = (page) => page === 'dx' || String(page || '').startsWith('dx-');
export const dxReady = () => !!DX.data;
export const dxPages = () => ['dx', ...DX.cases.map((c) => `dx-${c.id}`)];
export const dxCase = (page) => (isDx(page) ? DX.byId[String(page).slice(3)] || null : null);
export const dxModel = () => DX.data?.model || '';

export async function loadDx(lang) {
  applyDx(await api('/api/dx', null, lang ? { lang } : {}));
}

/** New content (on load or on language change): previous results are discarded. */
export function applyDx(data) {
  DX.data = data;
  DX.cases = [...data.cases].sort((a, b) => a.order - b.order);
  DX.byId = Object.fromEntries(DX.cases.map((c) => [c.id, c]));
  DX.st = {};
}

DX.onChange = (id) => {
  if (current?.sc?.id === id) current.view.paint?.();
  emit('case', { id: `dx-${id}` });
};

export function mountDx(page, stage, notes) {
  unmountDx();
  const sc = dxCase(page);
  const view = sc ? VIEWS[sc.kind](sc, stage, notes) : mountDxIntro(stage, notes);
  current = { page: sc ? page : 'dx', sc, view };
  if (view.tick) ticker = setInterval(() => current?.view.tick(), 200);
}

export function unmountDx() {
  clearInterval(ticker);
  ticker = 0;
  current?.view.destroy?.();
  current = null;
}

/** Keyboard actions on the current page: 'process', 'reset'. Returns whether the page supports it. */
export function dxAction(action) {
  const fn = current?.view[action];
  if (!fn) return false;
  fn();
  return true;
}

export function dxFlags(page) {
  const sc = dxCase(page);
  const run = sc && DX.st[sc.id]?.run;
  return { running: !!run?.busy, hasResult: !!run && !run.busy && run.calls > 0 };
}
