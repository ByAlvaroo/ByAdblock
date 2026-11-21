/*!
 * ByAdBlock — cargador de reglas (solo extensión, mundo aislado)
 * Descarga rules.json desde GitHub fuera de la CSP de YouTube y lo deja en
 * localStorage, que comparte con el núcleo. HECHO POR @BYALVARO__
 */
(function () {
  'use strict';
  var URL_RULES = 'https://raw.githubusercontent.com/ByAlvaroo/ByAdblock/main/rules.json';
  var KEY = '__bab_r', TS = '__bab_t', EVERY = 3 * 60 * 60 * 1000;
  try {
    var last = +localStorage.getItem(TS) || 0;
    if (Date.now() - last < EVERY) return;
    fetch(URL_RULES + '?v=' + Math.floor(Date.now() / EVERY), { cache: 'no-store', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && typeof j === 'object' && j.version) {
          localStorage.setItem(KEY, JSON.stringify(j));
          localStorage.setItem(TS, String(Date.now()));
        }
      })['catch'](function () {});
  } catch (e) { /* nada */ }
})();
