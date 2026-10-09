// Estado global, llamadas al backend y código de acceso.
import { h, toast, openModal, closeModal } from './util.js';

export const S = {
  config: null,
  scenarios: [],
  byId: {},
  lab: { templates: [] },
  page: 'intro',
  threshold: 0.9,
  mode: 'batch',
  raceModel: null,
  showNotes: true,
  quota: null,
  session: { calls: 0, decisions: 0, usd: 0, eur: 0, lat: [] },
  cases: {},
};

export const freshCase = () => ({
  results: {},
  pending: new Set(),
  meta: { items: {} },
  heatPrev: {},
  cost: { usd: 0, eur: 0 },
  llm: null,
  race: null,
  run: null,
  busy: false,
  last: null,
  proj: null,
});

export const caseState = (id) => (S.cases[id] ||= freshCase());
export const eur = (usd) => (usd == null ? null : usd * (S.config?.pricing?.usd_to_eur ?? 0.86));
export const emit = (name, detail) => window.dispatchEvent(new CustomEvent(`d1:${name}`, { detail }));

const REGIONS = {
  spaincentral: 'Spain Central',
  swedencentral: 'Sweden Central',
  westeurope: 'West Europe',
  francecentral: 'France Central',
  germanywestcentral: 'Germany West Central',
  italynorth: 'Italy North',
  polandcentral: 'Poland Central',
  eastus: 'East US',
  eastus2: 'East US 2',
  centralus: 'Central US',
  northcentralus: 'North Central US',
  southcentralus: 'South Central US',
  westcentralus: 'West Central US',
  westus: 'West US',
  westus2: 'West US 2',
  westus3: 'West US 3',
};
const EU = new Set(['spaincentral', 'swedencentral', 'westeurope', 'francecentral', 'germanywestcentral', 'italynorth', 'polandcentral']);
export const regionLabel = (code) => REGIONS[String(code || '').toLowerCase()] || code || '—';
export function skuLabel(sku, location) {
  if (sku === 'GlobalStandard') return 'Global Standard';
  if (sku === 'DataZoneStandard') return EU.has(String(location || '').toLowerCase()) ? 'DataZone UE' : 'DataZone EE. UU.';
  return sku || '—';
}

// ---------- Código de acceso ----------

const CODE_KEY = 'd1-code';
export const getCode = () => localStorage.getItem(CODE_KEY) || '';
export const setCode = (c) => (c ? localStorage.setItem(CODE_KEY, c) : localStorage.removeItem(CODE_KEY));

export function takeCodeFromUrl() {
  const u = new URL(location.href);
  const c = u.searchParams.get('code');
  if (!c) return;
  setCode(c.trim());
  u.searchParams.delete('code');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

let codePrompt = null;

function askCode(message) {
  codePrompt ||= new Promise((resolve) => {
    let ok = false;
    const input = h('input', { type: 'password', class: 'code-input', placeholder: 'Código de acceso', autocomplete: 'off', 'aria-label': 'Código de acceso' });
    const form = h(
      'form',
      {
        class: 'code-form',
        onsubmit: (e) => {
          e.preventDefault();
          if (!input.value.trim()) return input.focus();
          setCode(input.value.trim());
          ok = true;
          closeModal();
        },
      },
      h('h2', null, '🔐 Código de acceso'),
      h('p', { class: 'muted' }, message || 'Esta demo llama a un modelo real en Azure y está protegida. Introduce el código que te han compartido.'),
      input,
      h('button', { class: 'btn primary', type: 'submit' }, 'Entrar'),
    );
    openModal(form, {
      onClose: () => {
        codePrompt = null;
        resolve(ok);
      },
    });
    setTimeout(() => input.focus(), 30);
  });
  return codePrompt;
}

// ---------- API ----------

export class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body || {};
  }
}

export async function api(path, body, { retry = true } = {}) {
  const opts = { method: body ? 'POST' : 'GET', headers: { 'X-Demo-Code': getCode() } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError(0, { detail: 'Sin conexión con el servidor' });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && retry) {
    const ok = await askCode(getCode() ? 'Ese código no es correcto. Prueba otra vez.' : null);
    if (ok) return api(path, body, { retry });
    throw new ApiError(401, data);
  }
  if (!res.ok) throw new ApiError(res.status, data);
  if (data.quota) emit('quota', data.quota);
  return data;
}

function detailText(d) {
  if (!d) return '';
  if (typeof d === 'string') return d;
  const inner = d.detail ?? d.error?.message ?? d.message;
  if (typeof inner === 'string') return inner;
  if (inner && typeof inner === 'object') return detailText(inner);
  return JSON.stringify(d).slice(0, 220);
}

export function errorText(e) {
  if (!(e instanceof ApiError)) return String(e?.message || e);
  const detail = detailText(e.body?.detail ?? e.body);
  switch (e.status) {
    case 0:
      return 'Sin conexión con el servidor.';
    case 401:
      return 'Hace falta el código de acceso.';
    case 429:
      return `Límite de peticiones por minuto alcanzado (${S.quota?.limit ?? 17} RPM). Usa el modo lote o espera unos segundos.`;
    case 503:
      return detail || 'El servicio no está configurado.';
    default:
      return `Error ${e.status}${detail ? `: ${detail}` : ''}`;
  }
}

export const fail = (e) => toast(errorText(e), e?.status === 429 ? 'warn' : 'error', 7000);
