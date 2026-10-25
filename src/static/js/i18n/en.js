// Diccionario español → inglés. Cada fragmento de ./en/ cubre un grupo de módulos de la interfaz.
// Un mismo texto repetido en dos fragmentos debe tener la misma traducción.
import core from './en/core.js';
import views from './en/views.js';
import casepage from './en/case.js';
import introLab from './en/intro-lab.js';
import arcade from './en/arcade.js';
import dx from './en/dx.js';

const EN = {};
for (const part of [core, views, casepage, introLab, arcade, dx]) {
  for (const [es, en] of Object.entries(part)) {
    if (es in EN && EN[es] !== en) console.warn(`i18n: traducciones distintas para «${es}»`);
    EN[es] = en;
  }
}

export default EN;
