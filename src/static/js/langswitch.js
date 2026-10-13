// Selector de idioma de la barra superior: español / inglés, con las banderas dibujadas en SVG (sin emojis de bandera,
// que Windows no pinta). El cambio lo ejecuta app.js; aquí solo se dibuja el control.
import { h, $ } from './util.js';
import { UI_LANGS, getLang } from './i18n.js';

// Cada idioma se nombra en su propia lengua, igual en toda la interfaz.
const NAMES = { es: 'Español', en: 'English' }; // i18n-ok

const FLAGS = {
  es:
    '<svg viewBox="0 0 30 20" preserveAspectRatio="none" focusable="false"><rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/></svg>',
  en:
    '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" focusable="false">' +
    '<clipPath id="d1-uj-s"><path d="M0,0 v30 h60 v-30 z"/></clipPath>' +
    '<clipPath id="d1-uj-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>' +
    '<g clip-path="url(#d1-uj-s)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/>' +
    '<path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/>' +
    '<path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#d1-uj-t)" stroke="#C8102E" stroke-width="4"/>' +
    '<path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/>' +
    '<path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>',
};

/** Dibuja (o actualiza) los dos botones en #lang; onPick(code) se llama al elegir el idioma que no está activo. */
export function renderLangSwitch(onPick) {
  const box = $('#lang');
  if (!box) return;
  const current = getLang();
  box.replaceChildren(
    ...UI_LANGS.map((code) =>
      h(
        'button',
        {
          type: 'button',
          class: 'lang-btn',
          lang: code,
          dataset: { lang: code },
          title: NAMES[code],
          'aria-label': NAMES[code],
          'aria-pressed': String(code === current),
          onclick: () => code !== getLang() && onPick(code),
        },
        h('span', { class: 'lang-flag', 'aria-hidden': 'true', html: FLAGS[code] }),
        h('span', { class: 'lang-code', 'aria-hidden': 'true' }, code.toUpperCase()),
      ),
    ),
  );
}
