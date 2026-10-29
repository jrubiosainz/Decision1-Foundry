// Spanish → English dictionary. Each fragment in ./en/ covers a group of UI modules.
// The same text repeated in two fragments must have the same translation.
import core from './en/core.js';
import views from './en/views.js';
import casepage from './en/case.js';
import introLab from './en/intro-lab.js';
import arcade from './en/arcade.js';
import dx from './en/dx.js';
import brand from './en/brand.js';

const EN = {};
for (const part of [core, views, casepage, introLab, arcade, dx, brand]) {
  for (const [es, en] of Object.entries(part)) {
    if (es in EN && EN[es] !== en) console.warn(`i18n: conflicting translations for "${es}"`);
    EN[es] = en;
  }
}

export default EN;
