// ==UserScript==
// @name         ByAdBlock
// @namespace    https://github.com/ByAlvaroo/ByAdblock
// @version      1.0.1
// @description  YouTube limpio, sin anuncios y sin esperas. HECHO POR @BYALVARO__
// @author       @byalvaro__
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://music.youtube.com/*
// @match        *://www.youtube-nocookie.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/ByAlvaroo/ByAdblock/main/byadblock.user.js
// @downloadURL  https://raw.githubusercontent.com/ByAlvaroo/ByAdblock/main/byadblock.user.js
// @homepageURL  https://byalvaroo.github.io/ByAdblock/
// ==/UserScript==

/*!
 * ByAdBlock — núcleo
 * HECHO POR @BYALVARO__
 *
 * Se ejecuta en la propia página de YouTube (mundo MAIN), antes que su código.
 * Técnicas (ver README):
 *   1. Poda del JSON del reproductor y del feed (JSON.parse, Response.json, ytInitial*).
 *   2. Pide al servidor que no mande anuncios (isInlinePlaybackNoAd).
 *   3. Si aun así aparece uno (SSAP / cosido), lo silencia, lo acelera a 16x y pulsa "Saltar".
 *   4. CSS que oculta los huecos de anuncios.
 *   5. Quita el aviso de "los bloqueadores no están permitidos".
 *   6. Reglas que se actualizan solas desde GitHub, sin reinstalar nada.
 * No bloquea ninguna petición de red (bloquear estadísticas también delata).
 */
(function () {
  'use strict';

  var FLAG = Symbol.for('byadblock');
  if (window[FLAG]) return;
  try { Object.defineProperty(window, FLAG, { value: true }); } catch (e) { /* nada */ }

  var VERSION = '1.0.1';
  var RULES_URL = 'https://raw.githubusercontent.com/ByAlvaroo/ByAdblock/main/rules.json';
  var RULES_KEY = '__bab_r';
  var RULES_TS_KEY = '__bab_t';
  var REFRESH_MS = 3 * 60 * 60 * 1000; // cada 3 horas como mucho

  // Referencias nativas guardadas antes de tocar nada
  var nativeParse = JSON.parse;
  var nativeStringify = JSON.stringify;
  var nativeFetch = window.fetch;
  var nativeAssign = Object.assign;

  // ---------------------------------------------------------------------------
  // Reglas
  // ---------------------------------------------------------------------------
  var DEFAULTS = {
    version: 1,
    // Claves que se borran del JSON del reproductor
    pruneKeys: ['adPlacements', 'playerAds', 'adSlots'],
    // Elementos de listas (feed, búsqueda, recomendados, Shorts) que son anuncios
    adRenderers: [
      'adSlotRenderer', 'displayAdRenderer', 'promotedSparklesWebRenderer',
      'promotedVideoRenderer', 'compactPromotedVideoRenderer', 'searchPyvRenderer',
      'inFeedAdLayoutRenderer', 'bannerPromoRenderer', 'statementBannerRenderer',
      'brandVideoShelfRenderer', 'brandVideoSingletonRenderer', 'mealbarPromoRenderer',
      'playerLegacyDesktopWatchAdsRenderer', 'actionCompanionAdRenderer',
      'companionAdRenderer', 'adBreakServiceRenderer'
    ],
    // Contenedores que envuelven a un posible anuncio
    wrappers: ['richItemRenderer', 'richSectionRenderer'],
    // CSS: cada selector va en su propia regla (uno no soportado no rompe el resto)
    cosmetic: [
      '#masthead-ad', '#player-ads', '#panels > ytd-ads-engagement-panel-content-renderer',
      'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', 'ytd-display-ad-renderer',
      'ytd-promoted-sparkles-web-renderer', 'ytd-promoted-video-renderer',
      'ytd-compact-promoted-video-renderer', 'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer', 'ytd-brand-video-singleton-renderer',
      'ytd-brand-video-shelf-renderer', 'ytd-search-pyv-renderer',
      'ytd-player-legacy-desktop-watch-ads-renderer', 'ytd-mealbar-promo-renderer',
      'ytd-enforcement-message-view-model',
      'ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)',
      'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)',
      'ytd-reel-video-renderer:has(ytd-ad-slot-renderer)',
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
      '.ytp-ad-overlay-container', '.ytp-ad-text-overlay', '.ytp-featured-product',
      'ad-slot-renderer', 'ytm-promoted-sparkles-web-renderer', 'ytm-companion-ad-renderer',
      'ytm-promoted-video-renderer', 'ytm-rich-item-renderer:has(ad-slot-renderer)',
      'ytm-mealbar-promo-renderer'
    ],
    skipSelectors: [
      '.ytp-skip-ad-button', '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern',
      '.ytp-ad-skip-button-slot button', 'button.ytp-ad-skip-button-container'
    ],
    noAdFlag: true,   // isInlinePlaybackNoAd en las peticiones al reproductor
    adSkip: true,     // red de seguridad para anuncios cosidos
    antiPopup: true
  };

  function uniq(list) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (typeof v === 'string' && !seen[v]) { seen[v] = 1; out.push(v); }
    }
    return out;
  }

  function mergeRules(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    var out = {};
    for (var k in base) out[k] = base[k];
    for (var key in extra) {
      var val = extra[key];
      if (Array.isArray(val) && Array.isArray(base[key])) {
        out[key] = extra.replace ? val.slice() : uniq(base[key].concat(val));
      } else if (typeof val === 'boolean' || typeof val === 'number') {
        out[key] = val;
      }
    }
    if (Array.isArray(extra.disable)) {
      var off = Object.create(null);
      extra.disable.forEach(function (d) { off[d] = 1; });
      ['pruneKeys', 'adRenderers', 'cosmetic', 'skipSelectors'].forEach(function (l) {
        out[l] = out[l].filter(function (x) { return !off[x]; });
      });
    }
    return out;
  }

  var R = DEFAULTS;
  try {
    var cached = localStorage.getItem(RULES_KEY);
    if (cached) R = mergeRules(DEFAULTS, nativeParse(cached));
  } catch (e) { R = DEFAULTS; }

  var AD_SET = Object.create(null);
  R.adRenderers.forEach(function (n) { AD_SET[n] = 1; });

  // Palabras que deben aparecer en un JSON para que merezca la pena revisarlo
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var KEYWORDS = new RegExp(
    R.pruneKeys.concat(R.adRenderers, ['enforcementMessageViewModel', 'adClientParams'])
      .map(escapeRe).join('|')
  );

  // ---------------------------------------------------------------------------
  // 1. Poda del JSON
  // ---------------------------------------------------------------------------
  function hasAdKey(obj) {
    if (!obj || typeof obj !== 'object') return false;
    for (var k in obj) if (AD_SET[k]) return true;
    return false;
  }

  function isAdItem(el) {
    if (hasAdKey(el)) return true;
    for (var i = 0; i < R.wrappers.length; i++) {
      var w = el[R.wrappers[i]];
      if (w && w.content && hasAdKey(w.content)) return true;
    }
    // Anuncios dentro de la secuencia de Shorts
    var cmd = el.command && el.command.reelWatchEndpoint;
    if (cmd && cmd.adClientParams) return true;
    return false;
  }

  function clean(node, depth) {
    if (!node || typeof node !== 'object' || depth > 80) return false;
    var changed = false, i;
    if (Array.isArray(node)) {
      for (i = node.length - 1; i >= 0; i--) {
        var el = node[i];
        if (!el || typeof el !== 'object') continue;
        if (isAdItem(el)) { node.splice(i, 1); changed = true; continue; }
        if (clean(el, depth + 1)) changed = true;
      }
      return changed;
    }
    for (i = 0; i < R.pruneKeys.length; i++) {
      if (R.pruneKeys[i] in node) { delete node[R.pruneKeys[i]]; changed = true; }
    }
    var mr = node.messageRenderers;
    if (R.antiPopup && mr && mr.enforcementMessageViewModel) {
      delete mr.enforcementMessageViewModel; changed = true;
    }
    for (var key in node) {
      var v = node[key];
      if (v && typeof v === 'object' && clean(v, depth + 1)) changed = true;
    }
    return changed;
  }

  function safeClean(obj) {
    try { if (obj && typeof obj === 'object') clean(obj, 0); } catch (e) { /* nunca romper la página */ }
    return obj;
  }

  function isYoutubei(url) {
    return typeof url === 'string' && url.indexOf('/youtubei/') !== -1;
  }

  // Sustituye una función manteniendo su aspecto nativo (un Proxy de una
  // función nativa sigue diciendo "[native code]" en toString).
  function hook(owner, name, handler) {
    try {
      var original = owner[name];
      if (typeof original !== 'function') return;
      owner[name] = new Proxy(original, { apply: handler });
    } catch (e) { /* propiedad bloqueada (locker script): se usa otra vía */ }
  }

  hook(JSON, 'parse', function (target, thisArg, args) {
    var out = Reflect.apply(target, thisArg, args);
    var s = args[0];
    if (out && typeof out === 'object' && typeof s === 'string' && s.length > 64 && KEYWORDS.test(s)) {
      safeClean(out);
    }
    return out;
  });

  if (window.Response && Response.prototype) {
    hook(Response.prototype, 'json', function (target, thisArg, args) {
      var p = Reflect.apply(target, thisArg, args);
      var url = '';
      try { url = thisArg.url; } catch (e) { /* nada */ }
      if (!isYoutubei(url)) return p;
      return p.then(safeClean);
    });
  }

  // Variables que el HTML trae ya rellenas (carga directa de /watch)
  function trap(name) {
    try {
      var d = Object.getOwnPropertyDescriptor(window, name);
      if (d && !d.configurable) return;
      var value = d && 'value' in d ? safeClean(d.value) : undefined;
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get: function () { return value; },
        set: function (v) { value = safeClean(v); }
      });
    } catch (e) { /* nada */ }
  }
  trap('ytInitialPlayerResponse');
  trap('ytInitialData');
  trap('ytInitialReelWatchSequenceResponse');

  // ---------------------------------------------------------------------------
  // 2. Que el servidor no mande anuncios
  // ---------------------------------------------------------------------------
  var CPC = '"contentPlaybackContext":{';
  function addNoAd(body) {
    if (body.indexOf(CPC) === -1 || body.indexOf('isInlinePlaybackNoAd') !== -1) return body;
    return body.replace(/"contentPlaybackContext":\{(\s*\})?/, function (m, empty) {
      return empty
        ? '"contentPlaybackContext":{"isInlinePlaybackNoAd":true}'
        : '"contentPlaybackContext":{"isInlinePlaybackNoAd":true,';
    });
  }

  if (R.noAdFlag) {
    hook(JSON, 'stringify', function (target, thisArg, args) {
      var s = Reflect.apply(target, thisArg, args);
      if (typeof s === 'string' && s.length < 500000 && s.indexOf(CPC) !== -1) {
        try { return addNoAd(s); } catch (e) { return s; }
      }
      return s;
    });

    // Si YouTube bloquea JSON.stringify, el cuerpo suele montarse con Object.assign
    hook(Object, 'assign', function (target, thisArg, args) {
      var r = Reflect.apply(target, thisArg, args);
      if (args.length >= 3 && r && typeof r.body === 'string' && r.body.length < 500000 && r.body.indexOf(CPC) !== -1) {
        try { r.body = addNoAd(r.body); } catch (e) { /* nada */ }
      }
      return r;
    });

    hook(window, 'fetch', function (target, thisArg, args) {
      try {
        var input = args[0], init = args[1];
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('/youtubei/v1/player') !== -1 && init && typeof init.body === 'string') {
          var nb = addNoAd(init.body);
          if (nb !== init.body) args = [input, nativeAssign({}, init, { body: nb })];
        }
      } catch (e) { /* nada */ }
      return Reflect.apply(target, thisArg, args);
    });
  }

  // ---------------------------------------------------------------------------
  // 4. CSS
  // ---------------------------------------------------------------------------
  function injectCss() {
    var css = R.cosmetic.map(function (sel) {
      return sel + '{display:none!important}';
    }).join('\n');
    var style = document.createElement('style');
    style.setAttribute('data-b', '');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  }
  var styleEl = null;
  function ensureCss() {
    if (styleEl && styleEl.isConnected) return;
    if (!document.documentElement) return;
    try { styleEl = injectCss(); } catch (e) { /* nada */ }
  }
  ensureCss();
  if (!styleEl) document.addEventListener('readystatechange', ensureCss, { once: true });

  // ---------------------------------------------------------------------------
  // 3 y 5. Red de seguridad en el reproductor + aviso de bloqueador
  // ---------------------------------------------------------------------------
  var player = null, playerObserver = null, saved = null, adTimer = null;

  function getVideo() { return player && player.querySelector('video'); }

  function isAdShowing() {
    return !!player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
  }

  function clickSkip() {
    for (var i = 0; i < R.skipSelectors.length; i++) {
      var b = player.querySelector(R.skipSelectors[i]);
      if (b) { try { b.click(); } catch (e) { /* nada */ } return true; }
    }
    return false;
  }

  function handleAd() {
    var v = getVideo();
    if (!v) return;
    if (isAdShowing()) {
      if (!saved) saved = { muted: v.muted, rate: v.playbackRate };
      v.muted = true;
      if (!clickSkip()) {
        try { if (v.playbackRate !== 16) v.playbackRate = 16; } catch (e) {
          try { v.playbackRate = 8; } catch (e2) { /* nada */ }
        }
      }
      if (!adTimer) adTimer = setTimeout(function () { adTimer = null; handleAd(); }, 250);
    } else if (saved) {
      try { v.muted = saved.muted; v.playbackRate = saved.rate; } catch (e) { /* nada */ }
      saved = null;
    }
  }

  function attachPlayer() {
    var p = document.getElementById('movie_player');
    if (!p || p === player) return;
    player = p;
    if (playerObserver) playerObserver.disconnect();
    playerObserver = new MutationObserver(handleAd);
    playerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    handleAd();
  }

  function removePopup() {
    var vm = document.querySelector('ytd-enforcement-message-view-model');
    if (!vm) return;
    var dialog = vm.closest('tp-yt-paper-dialog') || vm;
    dialog.remove();
    var backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop');
    for (var i = 0; i < backdrops.length; i++) backdrops[i].remove();
    var v = document.querySelector('#movie_player video');
    if (v && v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
  }

  function tick() {
    ensureCss();
    if (R.adSkip && (!player || !player.isConnected)) { player = null; attachPlayer(); }
    if (R.antiPopup) removePopup();
  }
  setInterval(tick, 1000);
  document.addEventListener('yt-navigate-finish', tick);
  document.addEventListener('DOMContentLoaded', tick);

  // ---------------------------------------------------------------------------
  // 6. Reglas remotas (se aplican en la siguiente carga)
  // ---------------------------------------------------------------------------
  function refreshRules() {
    try {
      var last = +localStorage.getItem(RULES_TS_KEY) || 0;
      if (Date.now() - last < REFRESH_MS) return;
      nativeFetch.call(window, RULES_URL + '?v=' + Math.floor(Date.now() / REFRESH_MS), {
        cache: 'no-store', credentials: 'omit'
      }).then(function (r) { return r.ok ? r.text() : null; })
        .then(function (t) {
          if (!t) return;
          var j = nativeParse(t);
          if (j && typeof j === 'object' && j.version) {
            localStorage.setItem(RULES_KEY, nativeStringify(j));
            localStorage.setItem(RULES_TS_KEY, String(Date.now()));
          }
        })['catch'](function () { /* sin red o bloqueado: se usan las reglas guardadas */ });
    } catch (e) { /* nada */ }
  }
  setTimeout(refreshRules, 4000);

  // Herramienta de depuración discreta: escribe __bab() en la consola
  try {
    Object.defineProperty(window, '__bab', {
      value: function () {
        return { version: VERSION, rules: R.version, adShowing: isAdShowing(), firma: 'HECHO POR @BYALVARO__' };
      }
    });
  } catch (e) { /* nada */ }
})();
