// ===== ByAdBlock · app =====
// Todo YouTube (vídeos y canales) con la interfaz de YTVOD.
// Inicio: «Para ti» propio (hecho con tus suscripciones, tus «me gusta», lo que ves y lo más visto en España)
// y «Suscripciones». HECHO POR @BYALVARO__
// Acepta config.js de ByAdBlock (window.BYAB) y, por si acaso, el de YTVOD (window.CHAT_REPLAY).
const CFG = (() => {
  const a = window.BYAB || {}, b = window.CHAT_REPLAY || {};
  return { maxFeedChannels: 150, ...a, apiKey: a.apiKey || b.apiKey || '', oauthClientId: a.oauthClientId || b.oauthClientId || '' };
})();
const $ = id => document.getElementById(id);
const VERSION = '1.1.0';
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
function svg(path) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path); s.append(p); return s;
}
let toastT = 0;
function toast(msg, ms = 2800) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }

/* ---------- Formatos ---------- */
const decode = s => { if (!s || s.indexOf('&') === -1) return s || ''; const d = new DOMParser().parseFromString('<!doctype html><body>' + s, 'text/html'); return d.body.textContent || ''; };
const isoDur = s => { const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s || ''); return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0; };
const fmtDur = s => { s = Math.round(s || 0); const hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; const p = n => String(n).padStart(2, '0'); return hh ? `${hh}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
const NF = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
const fmtN = n => (n == null || n === '' || isNaN(n)) ? '' : NF.format(+n);
const RTF = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function fmtAgo(ts) {
  if (!ts) return '';
  const s = (ts - Date.now()) / 1000, a = Math.abs(s);
  const u = a < 3600 ? ['minute', 60] : a < 86400 ? ['hour', 3600] : a < 604800 ? ['day', 86400] : a < 2629800 ? ['week', 604800] : a < 31557600 ? ['month', 2629800] : ['year', 31557600];
  return RTF.format(Math.round(s / u[1]), u[0]);
}
const thumbOf = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
const bestThumb = t => t && (t.medium || t.high || t.default || {}).url || '';
const initial = s => (s || '?').trim().charAt(0).toUpperCase();
const vidOf = s => { s = (s || '').trim(); if (/^[\w-]{11}$/.test(s)) return null; try { const u = new URL(s); if (/youtu\.be$/.test(u.hostname)) return u.pathname.slice(1, 12); const v = u.searchParams.get('v'); if (v) return v; const m = u.pathname.match(/\/(?:shorts|live|embed)\/([\w-]{11})/); if (m) return m[1]; } catch {} return null; };

/* ---------- API de YouTube (con caché) ---------- */
const API = 'https://www.googleapis.com/youtube/v3/';
const apiKey = () => LS.get('byab_key_user', '') || CFG.apiKey || '';
class ApiError extends Error { constructor(reason, msg) { super(msg || reason); this.reason = reason; } }
const mem = new Map();
function cacheGet(k, ttl) {
  const m = mem.get(k); if (m && Date.now() - m.t < ttl) return m.v;
  const s = LS.get('byab_c:' + k, null);
  if (s && Date.now() - s.t < ttl) { mem.set(k, s); return s.v; }
  return null;
}
function cacheSet(k, v, persist) {
  const e = { t: Date.now(), v }; mem.set(k, e);
  if (!persist) return;
  if (!LS.set('byab_c:' + k, e)) { // almacenamiento lleno: se vacía la caché y se reintenta
    try { Object.keys(localStorage).filter(x => x.startsWith('byab_c:')).forEach(x => localStorage.removeItem(x)); } catch {}
    LS.set('byab_c:' + k, e);
  }
}
async function yt(path, params, { auth = false, ttl = 0, persist = false } = {}) {
  if (window.__BYAB_MOCK) return window.__BYAB_MOCK(path, params, auth);
  const ck = path + '?' + new URLSearchParams(params).toString() + (auth ? '&a' : '');
  if (ttl) { const c = cacheGet(ck, ttl); if (c) return c; }
  const headers = {};
  const qp = { ...params };
  if (auth) { const t = await gToken(); if (!t) throw new ApiError('noauth'); headers.Authorization = 'Bearer ' + t; }
  else { const k = apiKey(); if (!k) throw new ApiError('nokey'); qp.key = k; }
  let r, j;
  try { r = await fetch(API + path + '?' + new URLSearchParams(qp), { credentials: 'omit', headers }); j = await r.json(); }
  catch (e) { throw new ApiError('offline', 'Sin conexión'); }
  if (!r.ok) {
    const er = j && j.error;
    const det = er && Array.isArray(er.details) && er.details.find(d => d && d.reason);
    const reason = (det && det.reason) || (er && er.errors && er.errors[0] && er.errors[0].reason) || String(r.status);
    if (auth && r.status === 401) { gTok = null; }
    throw new ApiError(reason, er && er.message);
  }
  if (ttl) cacheSet(ck, j, persist);
  return j;
}
function apiFail(e) {
  const r = e && e.reason;
  if (r === 'quotaExceeded' || r === 'dailyLimitExceeded') return 'Se ha gastado la cuota diaria de YouTube. Se renueva a las 9:00 (hora de España).';
  if (r === 'nokey') return 'Falta la clave de YouTube en app/config.js.';
  if (r === 'API_KEY_HTTP_REFERRER_BLOCKED') return `La clave no permite esta web. En Google Cloud → Credenciales → tu clave, añade ${location.origin}/* en «Restricciones de sitios web».`;
  if (r === 'API_KEY_SERVICE_BLOCKED' || r === 'accessNotConfigured' || r === 'SERVICE_DISABLED') return 'La clave no tiene activada «YouTube Data API v3». Actívala en Google Cloud (APIs y servicios → Biblioteca).';
  if (r === 'keyInvalid' || r === 'API_KEY_INVALID' || r === 'badRequest') return 'La clave de YouTube no es válida. Revisa app/config.js.';
  if (r === 'forbidden' || r === '403') return 'YouTube ha rechazado la clave: ' + ((e && e.message) || 'sin detalle');
  if (r === 'offline') return 'Sin conexión a internet.';
  if (r === 'noauth') return 'Tienes que conectar tu cuenta de Google.';
  return 'YouTube ha dado un error: ' + ((e && e.message) || r || 'desconocido');
}

/* Datos de vídeos y canales, en lotes de 50 */
const VMETA = new Map(), CMETA = new Map();
function normVideo(it) {
  const sn = it.snippet || {}, cd = it.contentDetails || {}, st = it.statistics || {};
  return {
    id: it.id, title: decode(sn.title), channel: decode(sn.channelTitle), channelId: sn.channelId,
    thumb: bestThumb(sn.thumbnails) || thumbOf(it.id), published: Date.parse(sn.publishedAt) || 0,
    dur: isoDur(cd.duration), views: st.viewCount, likes: st.likeCount, desc: sn.description || '',
    live: sn.liveBroadcastContent === 'live', upcoming: sn.liveBroadcastContent === 'upcoming', tags: sn.tags || [], cat: sn.categoryId || ''
  };
}
async function videosInfo(ids) {
  ids = [...new Set(ids.filter(Boolean))];
  const need = ids.filter(id => !VMETA.has(id));
  for (let i = 0; i < need.length; i += 50) {
    const part = need.slice(i, i + 50);
    const j = await yt('videos', { part: 'snippet,contentDetails,statistics', id: part.join(','), maxResults: 50 }, { ttl: 6 * 3600e3, persist: true });
    (j.items || []).forEach(it => VMETA.set(it.id, normVideo(it)));
    part.forEach(id => { if (!VMETA.has(id)) VMETA.set(id, null); });
  }
  return ids.map(id => VMETA.get(id)).filter(Boolean);
}
function normChannel(it) {
  const sn = it.snippet || {}, st = it.statistics || {}, br = it.brandingSettings || {};
  return {
    id: it.id, title: decode(sn.title), handle: sn.customUrl || '', desc: sn.description || '',
    thumb: bestThumb(sn.thumbnails), subs: st.hiddenSubscriberCount ? null : st.subscriberCount, videos: st.videoCount,
    uploads: (it.contentDetails && it.contentDetails.relatedPlaylists && it.contentDetails.relatedPlaylists.uploads) || ('UU' + String(it.id).slice(2)),
    banner: br.image && br.image.bannerExternalUrl ? br.image.bannerExternalUrl + '=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj' : ''
  };
}
async function channelsInfo(ids) {
  ids = [...new Set(ids.filter(Boolean))];
  const need = ids.filter(id => !CMETA.has(id));
  for (let i = 0; i < need.length; i += 50) {
    const part = need.slice(i, i + 50);
    const j = await yt('channels', { part: 'snippet,statistics,contentDetails,brandingSettings', id: part.join(','), maxResults: 50 }, { ttl: 24 * 3600e3, persist: true });
    (j.items || []).forEach(it => CMETA.set(it.id, normChannel(it)));
  }
  return ids.map(id => CMETA.get(id)).filter(Boolean);
}
async function uploadsPage(ch, pageToken, max = 24) {
  const j = await yt('playlistItems', { part: 'contentDetails', playlistId: ch.uploads || ('UU' + ch.id.slice(2)), maxResults: max, ...(pageToken ? { pageToken } : {}) }, { ttl: 20 * 60e3 });
  const ids = (j.items || []).map(it => it.contentDetails && it.contentDetails.videoId);
  return { videos: await videosInfo(ids), next: j.nextPageToken || '' };
}

/* ---------- Canales que sigues ---------- */
const follows = () => LS.get('byab_follows', {});
const gsubs = () => LS.get('byab_gsubs', { list: [], at: 0 });
function followedChannels() {
  const f = follows(), out = new Map();
  Object.entries(f).forEach(([id, c]) => out.set(id, { id, title: c.title, thumb: c.thumb, local: true }));
  (gsubs().list || []).forEach(c => { if (!out.has(c.id)) out.set(c.id, { id: c.id, title: c.title, thumb: c.thumb, google: true }); });
  return [...out.values()];
}
const isFollowing = id => !!follows()[id] || (gsubs().list || []).some(c => c.id === id);
function setFollow(ch, on) {
  const f = follows();
  if (on) f[ch.id] = { title: ch.title, thumb: ch.thumb, at: Date.now() }; else delete f[ch.id];
  LS.set('byab_follows', f);
  LS.del('byab_feed');
  if (!on && (gsubs().list || []).some(c => c.id === ch.id)) toast('Lo sigues desde tu cuenta de Google: deja de seguirlo en YouTube para quitarlo.', 4200);
  else toast(on ? `Sigues a ${ch.title}` : `Has dejado de seguir a ${ch.title}`);
}
function followBtn(ch, el) {
  const b = el || h('button', { class: 'follow', type: 'button' });
  const paint = () => { const on = isFollowing(ch.id); b.textContent = on ? 'Siguiendo' : 'Seguir'; b.classList.toggle('on', on); };
  b.onclick = e => { e.preventDefault(); e.stopPropagation(); setFollow(ch, !follows()[ch.id]); paint(); };
  paint(); return b;
}

/* ---------- Historial (seguir viendo) ---------- */
const HIST_KEY = 'byab_hist';
const hist = () => LS.get(HIST_KEY, {});
function saveHist(v, t, d) {
  if (!v || !d) return;
  const all = hist();
  all[v.id] = { t: Math.floor(t), d: Math.floor(d), at: Date.now(), title: v.title, channel: v.channel, channelId: v.channelId, tags: (v.tags || []).slice(0, 8), cat: v.cat || '' };
  const keys = Object.keys(all);
  if (keys.length > 300) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 300).forEach(k => delete all[k]);
  LS.set(HIST_KEY, all);
}

/* ---------- Cuenta de Google (opcional) ----------
   Inicio de sesión por redirección (no ventana emergente): funciona también en la app de pantalla de inicio del iPad.
   Solo lectura (youtube.readonly). El permiso dura 1 hora; las suscripciones quedan guardadas en el dispositivo. */
let gTok = null, gTokExp = 0;
try { const t = JSON.parse(sessionStorage.getItem('byab_gtok') || 'null'); if (t && Date.now() < t.exp) { gTok = t.tok; gTokExp = t.exp; } } catch {}
const gConnected = () => !!LS.get('byab_gacct', null);
const redirectUri = () => location.origin + location.pathname;
function gLogin(consent) {
  if (!CFG.oauthClientId) throw new ApiError('noclient');
  const state = Math.random().toString(36).slice(2);
  sessionStorage.setItem('byab_gstate', state);
  sessionStorage.setItem('byab_greturn', location.hash || '#/');
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: CFG.oauthClientId, redirect_uri: redirectUri(), response_type: 'token',
    scope: 'https://www.googleapis.com/auth/youtube.readonly', include_granted_scopes: 'true',
    state, prompt: consent ? 'consent' : 'select_account'
  });
}
// Vuelta de Google: #access_token=…&expires_in=…&state=…
function gHandleReturn() {
  const hs = location.hash;
  if (!/^#(access_token|error)=/.test(hs)) return false;
  const p = new URLSearchParams(hs.slice(1));
  const back = sessionStorage.getItem('byab_greturn') || '#/';
  const okState = p.get('state') && p.get('state') === sessionStorage.getItem('byab_gstate');
  history.replaceState(null, '', location.pathname + location.search + back);
  if (p.get('access_token') && okState) {
    gTok = p.get('access_token'); gTokExp = Date.now() + ((+p.get('expires_in') || 3600) - 60) * 1000;
    try { sessionStorage.setItem('byab_gtok', JSON.stringify({ tok: gTok, exp: gTokExp })); } catch {}
    return true;
  }
  setTimeout(() => toast('No se ha completado el inicio de sesión con Google.'), 300);
  return false;
}
async function gToken() { return gTok && Date.now() < gTokExp ? gTok : null; }
async function syncGoogleSubs() {
  if (!(await gToken())) { gLogin(!gConnected()); return new Promise(() => {}); }
  const list = []; let pageToken = '';
  do {
    const j = await yt('subscriptions', { part: 'snippet', mine: 'true', maxResults: 50, order: 'alphabetical', ...(pageToken ? { pageToken } : {}) }, { auth: true });
    (j.items || []).forEach(it => { const s = it.snippet || {}, rid = s.resourceId || {}; if (rid.channelId) list.push({ id: rid.channelId, title: decode(s.title), thumb: bestThumb(s.thumbnails) }); });
    pageToken = j.nextPageToken || '';
  } while (pageToken && list.length < 2000);
  let me = null;
  try { const j = await yt('channels', { part: 'snippet', mine: 'true' }, { auth: true }); const c = j.items && j.items[0]; if (c) me = { title: decode(c.snippet.title), thumb: bestThumb(c.snippet.thumbnails) }; } catch {}
  const likes = []; let lt = '';
  try {
    do {
      const j = await yt('videos', { part: 'snippet,contentDetails,statistics', myRating: 'like', maxResults: 50, ...(lt ? { pageToken: lt } : {}) }, { auth: true });
      (j.items || []).forEach(it => { const v = normVideo(it); VMETA.set(v.id, v); likes.push(slimV(v, 10)); });
      lt = j.nextPageToken || '';
    } while (lt && likes.length < 200);
  } catch {}
  LS.set('byab_gacct', { at: Date.now(), me });
  LS.set('byab_gsubs', { list, at: Date.now() });
  LS.set('byab_glikes', { list: likes, at: Date.now() });
  LS.del('byab_feed'); LS.del('byab_fy');
  paintAccount();
  return list.length;
}
function gDisconnect() {
  if (gTok) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(gTok), { method: 'POST', mode: 'no-cors' }).catch(() => {});
  gTok = null; try { sessionStorage.removeItem('byab_gtok'); } catch {} LS.del('byab_gacct'); LS.del('byab_gsubs'); LS.del('byab_glikes'); LS.del('byab_feed'); LS.del('byab_fy'); paintAccount();
}
function paintAccount() {
  const b = $('bAccount'), a = LS.get('byab_gacct', null);
  b.replaceChildren(a && a.me && a.me.thumb ? h('img', { src: a.me.thumb, alt: '', referrerpolicy: 'no-referrer' }) : svgUser());
  b.title = a ? 'Cuenta de Google conectada' : 'Tu cuenta';
}
function svgUser() { const s = svg('M4 21a8 8 0 0 1 16 0'); const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', 12); c.setAttribute('cy', 8); c.setAttribute('r', 4); s.prepend(c); return s; }

/* ---------- Novedades de tus canales ---------- */
async function buildFeed(force) {
  const chans = followedChannels().slice(0, CFG.maxFeedChannels || 150);
  const sig = chans.map(c => c.id).sort().join(',');
  const cached = LS.get('byab_feed', null);
  if (!force && cached && cached.sig === sig && Date.now() - cached.at < 20 * 60e3) return cached.items;
  const items = [];
  let i = 0;
  const worker = async () => {
    while (i < chans.length) {
      const c = chans[i++];
      try {
        const j = await yt('playlistItems', { part: 'contentDetails', playlistId: 'UU' + c.id.slice(2), maxResults: 8 }, { ttl: 15 * 60e3 });
        (j.items || []).forEach(it => { const cd = it.contentDetails || {}; if (cd.videoId) items.push({ id: cd.videoId, at: Date.parse(cd.videoPublishedAt) || 0 }); });
      } catch (e) { if (e.reason === 'quotaExceeded') throw e; }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  items.sort((a, b) => b.at - a.at);
  const top = items.slice(0, 72).map(x => x.id);
  const vids = (await videosInfo(top)).sort((a, b) => b.published - a.published);
  const slim = vids.map(v => ({ ...v, desc: '', tags: [] }));
  LS.set('byab_feed', { at: Date.now(), sig, items: slim });
  return slim;
}

/* ---------- «Para ti» propio ----------
   Mezcla, sin el algoritmo de YouTube:
   · Suscripciones: lo último de los canales que sigues.
   · Canales afines: los que más ves o te gustan y aún no sigues.
   · Temas: 1-2 búsquedas al día con las palabras que más se repiten en lo que te gusta y ves.
   · Tendencias: lo más visto en España, y en las categorías que más te gustan.
   Se guarda 1 hora; las búsquedas de temas, 24 h (cada una gasta 100 de cuota). */
const slimV = (v, tags = 0) => ({ id: v.id, title: v.title, channel: v.channel, channelId: v.channelId, thumb: v.thumb, published: v.published, dur: v.dur, views: v.views, live: v.live, upcoming: v.upcoming, cat: v.cat, tags: tags ? (v.tags || []).slice(0, tags) : [] });
const likesList = () => (LS.get('byab_glikes', { list: [] }).list) || [];
const STOP = new Set(('para como este esta estos estas pero porque cuando donde desde hasta sobre entre tiene tienen todo todos toda todas nada algo cosas cosa video vídeo videos vídeos nuevo nueva mejor mejores parte capitulo capítulo episodio official oficial with from that this your what when have will about short shorts live directo stream hace hacer hago aqui aquí ahora solo sólo muy mucho mucha porque mientras sin con los las del una unos unas the and for you are not but can how why who all out new vs ft feat parte final completo completa').split(' '));
function interestQueries(items) {
  const tagCount = new Map(), wordCount = new Map();
  items.forEach((v, i) => {
    const w = i < 30 ? 2 : 1; // lo más reciente pesa más
    (v.tags || []).forEach(t => { t = String(t).toLowerCase().trim(); if (t.length > 3 && t.length < 40) tagCount.set(t, (tagCount.get(t) || 0) + w); });
    String(v.title || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).forEach(x => { if (x.length > 3 && !STOP.has(x) && !/^\d+$/.test(x)) wordCount.set(x, (wordCount.get(x) || 0) + w); });
  });
  const tags = [...tagCount.entries()].filter(e => e[1] >= 3).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const words = [...wordCount.entries()].filter(e => e[1] >= 2).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const qs = [];
  if (tags[0]) qs.push(tags[0]);
  if (tags[1]) qs.push(tags[1]);
  for (let i = 0; qs.length < 2 && i + 1 < words.length; i += 2) qs.push(words[i] + ' ' + words[i + 1]);
  return qs.slice(0, 2);
}
function dailyShuffle(arr, salt) {
  let seed = 0; const k = new Date().toISOString().slice(0, 10) + salt;
  for (let i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
async function buildForYou(force) {
  const cached = LS.get('byab_fy', null);
  if (!force && cached && Date.now() - cached.at < 60 * 60e3) return cached.items;
  const H = hist(), likes = likesList();
  const watched = Object.entries(H).sort((a, b) => b[1].at - a[1].at).map(([id, x]) => ({ id, ...x }));
  const done = new Set(watched.filter(x => x.t > 15).map(x => x.id)); // lo ya empezado sale en «Seguir viendo»
  const followed = new Set(followedChannels().map(c => c.id));
  const pools = { subs: [], afines: [], temas: [], tend: [] };
  let firstErr = null;
  const safe = async fn => { try { await fn(); } catch (e) { firstErr = firstErr || e; } };

  await Promise.all([
    // Suscripciones
    safe(async () => { if (followed.size) pools.subs = (await buildFeed(false)).slice(0, 48).map(v => v.id); }),
    // Canales afines (más vistos / más «me gusta» que no sigues)
    safe(async () => {
      const cnt = new Map();
      [...likes, ...watched].forEach((v, i) => { if (v.channelId && !followed.has(v.channelId)) cnt.set(v.channelId, (cnt.get(v.channelId) || 0) + (i < 40 ? 2 : 1)); });
      const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
      const res = await Promise.all(top.map(cid => yt('playlistItems', { part: 'contentDetails', playlistId: 'UU' + cid.slice(2), maxResults: 6 }, { ttl: 6 * 3600e3, persist: true }).catch(() => null)));
      res.forEach(j => (j && j.items || []).forEach(it => it.contentDetails && pools.afines.push(it.contentDetails.videoId)));
    }),
    // Temas
    safe(async () => {
      const qs = interestQueries([...likes, ...watched.slice(0, 60)]);
      const res = await Promise.all(qs.map(q => yt('search', { part: 'snippet', q, type: 'video', maxResults: 20, relevanceLanguage: 'es', regionCode: 'ES', safeSearch: 'none' }, { ttl: 24 * 3600e3, persist: true })));
      res.forEach(j => (j.items || []).forEach(it => it.id && it.id.videoId && pools.temas.push(it.id.videoId)));
    }),
    // Tendencias (general + tus categorías favoritas)
    safe(async () => {
      const cats = new Map(); likes.forEach(v => v.cat && cats.set(v.cat, (cats.get(v.cat) || 0) + 1));
      const topCats = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
      const reqs = [yt('videos', { part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: 'ES', maxResults: 30 }, { ttl: 3 * 3600e3, persist: true })]
        .concat(topCats.map(c => yt('videos', { part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: 'ES', videoCategoryId: c, maxResults: 20 }, { ttl: 3 * 3600e3, persist: true }).catch(() => null)));
      const res = await Promise.all(reqs);
      const catIds = [], gen = [];
      res.forEach((j, i) => (j && j.items || []).forEach(it => { const v = normVideo(it); VMETA.set(v.id, v); (i ? catIds : gen).push(v.id); }));
      pools.tend = [...catIds, ...gen];
    })
  ]);

  // Datos de todos los vídeos y mezcla
  const all = [...new Set([...pools.subs, ...pools.afines, ...pools.temas, ...pools.tend])].filter(id => id && !done.has(id));
  const info = new Map((await videosInfo(all).catch(e => { firstErr = firstErr || e; return []; })).map(v => [v.id, v]));
  const ok = id => { const v = info.get(id); return v && !(v.dur > 0 && v.dur <= 60) && !v.upcoming; }; // sin Shorts ni estrenos
  const q = {
    subs: pools.subs.filter(ok),
    afines: dailyShuffle(pools.afines.filter(ok), 'a'),
    temas: dailyShuffle(pools.temas.filter(ok), 't'),
    tend: dailyShuffle(pools.tend.filter(ok), 'r')
  };
  const pattern = ['subs', 'afines', 'temas', 'subs', 'tend', 'afines', 'subs', 'temas', 'tend'];
  const out = [], seen = new Set();
  for (let i = 0; out.length < 96 && Object.values(q).some(a => a.length); i++) {
    const src = q[pattern[i % pattern.length]];
    while (src.length) { const id = src.shift(); if (!seen.has(id)) { seen.add(id); out.push(slimV(info.get(id))); break; } }
  }
  if (!out.length && firstErr) throw firstErr;
  LS.set('byab_fy', { at: Date.now(), items: out });
  return out;
}

/* ---------- Tarjetas ---------- */
function videoCard(v, opts = {}) {
  const hi = hist()[v.id];
  const pct = hi && hi.d ? Math.min(100, hi.t / hi.d * 100) : 0;
  const badge = v.live ? h('span', { class: 'dur live', text: 'EN DIRECTO' }) : v.upcoming ? h('span', { class: 'dur', text: 'PRÓXIMAMENTE' }) : v.dur ? h('span', { class: 'dur', text: fmtDur(v.dur) }) : null;
  const ch = CMETA.get(v.channelId);
  const bits = [v.views != null && v.views !== undefined && !v.live ? fmtN(v.views) + ' visualizaciones' : '', fmtAgo(v.published)].filter(Boolean).join(' · ');
  return h('a', { class: 'card', href: '#/ver/' + v.id },
    h('div', { class: 'thumb' }, h('img', { src: v.thumb || thumbOf(v.id), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }), badge, pct > 2 ? h('div', { class: 'prog' }, h('i', { style: { width: pct + '%' } })) : null),
    h('div', { class: 'meta' },
      opts.noAvatar ? null : h('span', { class: 'av' }, ch && ch.thumb ? h('img', { src: ch.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : initial(v.channel)),
      h('div', { style: { minWidth: 0 } },
        h('div', { class: 'ct', text: v.title }),
        opts.noChannel ? null : h('div', { class: 'cc' }, h('span', { text: v.channel, onclick: e => { e.preventDefault(); go('#/canal/' + v.channelId); } })),
        bits ? h('div', { class: 'cc', text: bits }) : null)));
}
function compactCard(v) {
  return h('a', { class: 'cmp', href: '#/ver/' + v.id },
    h('div', { class: 'thumb' }, h('img', { src: v.thumb || thumbOf(v.id), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }), v.dur ? h('span', { class: 'dur', text: fmtDur(v.dur) }) : null),
    h('div', { style: { minWidth: 0 } }, h('div', { class: 'ct', text: v.title }), h('div', { class: 'cc', text: v.channel }), h('div', { class: 'cc', text: [v.views ? fmtN(v.views) + ' visualizaciones' : '', fmtAgo(v.published)].filter(Boolean).join(' · ') })));
}
function channelRow(c) {
  const stats = [c.handle, c.subs != null ? fmtN(c.subs) + ' suscriptores' : '', c.videos ? fmtN(c.videos) + ' vídeos' : ''].filter(Boolean).join(' · ');
  return h('a', { class: 'chrow', href: '#/canal/' + c.id },
    h('div', { class: 'big' }, c.thumb ? h('img', { src: c.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null),
    h('div', { class: 'tx' }, h('div', { class: 'nm', text: c.title }), h('div', { class: 'cc', text: stats }), c.desc ? h('div', { class: 'ds', text: c.desc }) : null),
    followBtn(c));
}
const avatarEl = (thumb, name) => h('span', { class: 'av' }, thumb ? h('img', { src: thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : initial(name));
const skeletons = n => h('div', { class: 'grid' }, Array.from({ length: n }, () => h('div', { class: 'card sk' }, h('div', { class: 'thumb' }), h('div', { class: 'l' }), h('div', { class: 'l s' }))));
const section = (title, extra, ...body) => h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', { text: title }), extra), ...body);
const errorBox = e => h('div', { class: 'notice', text: apiFail(e) });

/* ===================================================================== */
/*  Navegación                                                           */
/* ===================================================================== */
const page = $('page'), watch = $('watch');
let navId = 0;
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  const id = ++navId;
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  const q = new URLSearchParams(qs || '');
  if (parts[0] === 'ver' && parts[1]) return showWatch(parts[1], +q.get('t') || 0);
  leaveWatch();
  page.hidden = false; watch.hidden = true; page.scrollTop = 0;
  if (parts[0] === 'buscar' && parts[1]) return showSearch(parts[1], q.get('tipo') || 'todo', id);
  if (parts[0] === 'canal' && parts[1]) return showChannel(parts[1], id, q.get('q') || '');
  return showHome(id);
}
window.addEventListener('hashchange', route);

/* ---------- Buscador ---------- */
$('sbox').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('q').value.trim(); if (!v) return;
  $('q').blur();
  const vid = vidOf(v);
  if (vid) return go('#/ver/' + vid);
  go('#/buscar/' + encodeURIComponent(v));
});

/* ---------- Inicio ---------- */
async function showHome(id) {
  document.title = 'ByAdBlock';
  $('q').value = '';
  page.replaceChildren();
  if (!apiKey()) page.append(h('div', { class: 'notice' }, 'Falta la clave de YouTube en app/config.js.'));
  const tab = LS.get('byab_hometab', 'parati');
  const chans = followedChannels();
  const H = hist();
  const cont = Object.entries(H).filter(([, x]) => x.d > 60 && x.t > 15 && x.t < x.d - 20).sort((a, b) => b[1].at - a[1].at).slice(0, 20);

  const chips = h('div', { class: 'chips' },
    [['parati', 'Para ti'], ['subs', 'Suscripciones']].map(([k, t]) => h('button', { class: 'chip' + (tab === k ? ' on' : ''), type: 'button', text: t, onclick: () => { LS.set('byab_hometab', k); showHome(++navId); } })),
    h('button', { class: 'chip', type: 'button', text: 'Actualizar', style: { marginLeft: 'auto' }, onclick: () => { LS.del(tab === 'parati' ? 'byab_fy' : 'byab_feed'); showHome(++navId); } }));
  page.append(chips);

  if (cont.length) {
    const vids = cont.map(([vid, x]) => ({ id: vid, title: x.title, channel: x.channel, channelId: x.channelId, thumb: thumbOf(vid), dur: x.d }));
    page.append(section('Seguir viendo', null, h('div', { class: 'row' }, vids.map(v => videoCard(v, { noAvatar: true })))));
  }

  const fill = async (body, loader, empty) => {
    body.replaceChildren(skeletons(8));
    try {
      const vids = await loader();
      if (id !== navId) return;
      await channelsInfo([...new Set(vids.map(v => v.channelId))].slice(0, 100)).catch(() => {});
      if (id !== navId) return;
      body.replaceChildren(vids.length ? h('div', { class: 'grid' }, vids.map(v => videoCard(v))) : empty);
    } catch (e) { if (id === navId) body.replaceChildren(errorBox(e)); }
  };

  if (tab === 'parati') {
    const thin = !chans.length && !likesList().length && Object.keys(H).length < 3;
    if (thin) page.append(h('div', { class: 'notice' }, 'Tu «Para ti» mejora cuanto más uses la app: sigue canales, mira vídeos o conecta tu cuenta de Google. ', h('button', { class: 'btn sm', type: 'button', text: gConnected() ? 'Tu cuenta' : 'Conectar Google', onclick: openAccount })));
    const body = h('div'); page.append(section('Para ti', null, body));
    fill(body, () => buildForYou(false), h('p', { class: 'cc', style: { padding: '0 28px' }, text: 'Aún no hay recomendaciones. Busca y mira algunos vídeos.' }));
    return;
  }

  // Suscripciones
  if (!chans.length) {
    page.append(h('div', { class: 'empty' },
      h('img', { class: 'big', src: 'icons/icon-192.png', alt: '' }),
      h('h2', { text: 'Aún no sigues ningún canal' }),
      h('p', { text: 'Busca un canal y pulsa «Seguir», o trae tus suscripciones de YouTube.' }),
      h('div', { class: 'acts' },
        h('button', { class: 'btn p', type: 'button', onclick: () => $('q').focus(), text: 'Buscar' }),
        h('button', { class: 'btn', type: 'button', onclick: openAccount, text: gConnected() ? 'Tu cuenta de Google' : 'Conectar Google' }))));
  } else {
    page.append(section('Tus canales', h('span', { class: 'n', text: chans.length }),
      h('div', { class: 'chans' }, chans.map(c => h('a', { href: '#/canal/' + c.id }, avatarEl(c.thumb, c.title), h('span', { text: c.title }))))));
    const body = h('div'); page.append(section('Novedades', null, body));
    fill(body, () => buildFeed(false), h('p', { class: 'cc', style: { padding: '0 28px' }, text: 'Tus canales no han subido vídeos últimamente.' }));
  }
  const likes = likesList();
  if (likes.length) page.append(section('Vídeos que te gustan', h('span', { class: 'n', text: likes.length }), h('div', { class: 'row' }, likes.slice(0, 30).map(v => videoCard(v, { noAvatar: true })))));
}

/* ---------- Búsqueda ---------- */
async function showSearch(q, tipo, id) {
  document.title = q + ' · ByAdBlock';
  $('q').value = q;
  const base = '#/buscar/' + encodeURIComponent(q);
  const chips = h('div', { class: 'chips' }, [['todo', 'Todo'], ['video', 'Vídeos'], ['channel', 'Canales']].map(([k, t]) => h('a', { class: 'chip' + (tipo === k ? ' on' : ''), href: base + (k === 'todo' ? '' : '?tipo=' + k), text: t })));
  const chBox = h('div'), vBox = h('div', { class: 'grid' }), more = h('div', { class: 'loadmore' });
  page.replaceChildren(chips, chBox, skeletons(12));
  let token = '', first = true;
  const load = async () => {
    try {
      const type = tipo === 'todo' ? 'video,channel' : tipo;
      const j = await yt('search', { part: 'snippet', q, type, maxResults: 24, safeSearch: 'none', ...(token ? { pageToken: token } : {}) }, { ttl: 12 * 3600e3, persist: true });
      if (id !== navId) return;
      const items = j.items || [];
      const vIds = items.filter(x => x.id && x.id.videoId).map(x => x.id.videoId);
      const cIds = items.filter(x => x.id && x.id.channelId).map(x => x.id.channelId);
      const [vids, chs] = await Promise.all([videosInfo(vIds), channelsInfo(cIds)]);
      await channelsInfo([...new Set(vids.map(v => v.channelId))]).catch(() => {});
      if (id !== navId) return;
      if (first) { page.replaceChildren(chips, chBox, vBox, more); first = false; }
      chs.forEach(c => chBox.append(channelRow(c)));
      if (chs.length && vids.length && chBox.childNodes.length === chs.length) chBox.append(h('div', { style: { height: '18px' } }));
      vids.forEach(v => vBox.append(videoCard(v)));
      if (!vBox.childNodes.length && !chBox.childNodes.length) page.replaceChildren(chips, h('div', { class: 'empty' }, h('h2', { text: 'Sin resultados' }), h('p', { text: 'Prueba con otras palabras.' })));
      token = j.nextPageToken || '';
      more.replaceChildren(token ? h('button', { class: 'btn', type: 'button', text: 'Cargar más', onclick: e => { e.target.disabled = true; load(); } }) : '');
    } catch (e) { if (id === navId) { if (first) page.replaceChildren(chips, errorBox(e)); else more.replaceChildren(errorBox(e)); } }
  };
  load();
}

/* ---------- Canal ---------- */
async function showChannel(cid, id, inQ) {
  page.replaceChildren(skeletons(8));
  let c;
  try {
    if (cid.startsWith('@')) {
      const j = await yt('channels', { part: 'snippet,statistics,contentDetails,brandingSettings', forHandle: cid }, { ttl: 24 * 3600e3, persist: true });
      const it = j.items && j.items[0]; if (it) { c = normChannel(it); CMETA.set(c.id, c); }
    } else c = (await channelsInfo([cid]))[0];
  } catch (e) { if (id === navId) page.replaceChildren(errorBox(e)); return; }
  if (id !== navId) return;
  if (!c) { page.replaceChildren(h('div', { class: 'empty' }, h('h2', { text: 'Canal no encontrado' }))); return; }
  document.title = c.title + ' · ByAdBlock';
  const stats = [c.handle, c.subs != null ? fmtN(c.subs) + ' suscriptores' : '', c.videos ? fmtN(c.videos) + ' vídeos' : ''].filter(Boolean).join(' · ');
  const inp = h('input', { type: 'search', placeholder: 'Buscar en el canal', value: inQ, enterkeyhint: 'search' });
  const form = h('form', { class: 'minis', onsubmit: e => { e.preventDefault(); const v = inp.value.trim(); go('#/canal/' + c.id + (v ? '?q=' + encodeURIComponent(v) : '')); } }, svg('M20 20l-4.2-4.2M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0'), inp);
  const grid = h('div', { class: 'grid' }), more = h('div', { class: 'loadmore' });
  page.replaceChildren(...[
    c.banner ? h('div', { class: 'banner', style: { backgroundImage: `url("${c.banner}")` } }) : null,
    h('div', { class: 'chead' }, avatarEl(c.thumb, c.title), h('div', { class: 'tx' }, h('h1', { text: c.title }), h('div', { class: 'st', text: stats }), c.desc ? h('div', { class: 'ds', text: c.desc }) : null), followBtn(c)),
    h('div', { class: 'ctools' }, h('a', { class: 'chip' + (inQ ? '' : ' on'), href: '#/canal/' + c.id, text: 'Vídeos' }), form),
    grid, more].filter(Boolean));
  let token = '';
  const load = async () => {
    try {
      let vids;
      if (inQ) {
        const j = await yt('search', { part: 'snippet', channelId: c.id, q: inQ, type: 'video', maxResults: 24, ...(token ? { pageToken: token } : {}) }, { ttl: 12 * 3600e3, persist: true });
        vids = await videosInfo((j.items || []).map(x => x.id && x.id.videoId)); token = j.nextPageToken || '';
      } else {
        const r = await uploadsPage(c, token); vids = r.videos; token = r.next;
      }
      if (id !== navId) return;
      vids.forEach(v => grid.append(videoCard(v, { noAvatar: true, noChannel: true })));
      if (!grid.childNodes.length) grid.append(h('p', { class: 'cc', text: inQ ? 'Nada en este canal con esa búsqueda.' : 'Este canal no tiene vídeos públicos.' }));
      more.replaceChildren(token ? h('button', { class: 'btn', type: 'button', text: 'Cargar más', onclick: e => { e.target.disabled = true; load(); } }) : '');
    } catch (e) { if (id === navId) more.replaceChildren(errorBox(e)); }
  };
  load();
}

/* ===================================================================== */
/*  Ver vídeo                                                            */
/* ===================================================================== */
let player = null, ytReady = null, cur = null, progIv = 0;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise(res => {
    window.onYouTubeIframeAPIReady = () => res(window.YT);
    document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }));
  });
  return ytReady;
}
async function showWatch(vid, start) {
  page.hidden = true; watch.hidden = false; watch.scrollTop = 0;
  document.body.classList.add('watching');
  if (cur && cur.id === vid) { if (start && player && player.seekTo) player.seekTo(start, true); return; }
  saveProgress();
  cur = { id: vid, v: null };
  const hi = hist()[vid];
  if (!start && hi && hi.t > 10 && hi.d && hi.t < hi.d - 15) start = hi.t;
  $('pbox').querySelector('.blocked')?.remove();
  $('vtitle').textContent = hi ? hi.title : '';
  $('vchan').textContent = hi ? hi.channel : ''; $('vsub').textContent = ''; $('avatar').replaceChildren();
  $('bFollow').hidden = true; $('vbox').replaceChildren(); $('vbox').classList.remove('open');
  $('side').replaceChildren(h('h2', { text: 'Más del canal' }), h('div', { class: 'list' }));
  $('bYt').href = `https://www.youtube.com/watch?v=${vid}`;
  playVideo(vid, start);
  try {
    const v = (await videosInfo([vid]))[0];
    if (!cur || cur.id !== vid) return;
    if (!v) { blocked('Este vídeo no existe o es privado.'); return; }
    cur.v = v;
    document.title = v.title + ' · ByAdBlock';
    $('vtitle').textContent = v.title;
    $('vchan').textContent = v.channel;
    $('chan').href = '#/canal/' + v.channelId;
    renderDesc(v);
    const c = (await channelsInfo([v.channelId]))[0];
    if (!cur || cur.id !== vid) return;
    if (c) {
      $('avatar').replaceChildren(c.thumb ? h('img', { src: c.thumb, alt: '', referrerpolicy: 'no-referrer' }) : initial(c.title));
      $('vsub').textContent = c.subs != null ? fmtN(c.subs) + ' suscriptores' : '';
      $('bFollow').hidden = false; followBtn(c, $('bFollow'));
      const r = await uploadsPage(c, '', 16);
      if (!cur || cur.id !== vid) return;
      $('side').querySelector('.list').replaceChildren(...r.videos.filter(x => x.id !== vid).slice(0, 15).map(compactCard));
    }
  } catch (e) { if (cur && cur.id === vid) $('vbox').replaceChildren(errorBox(e)); }
}
async function playVideo(vid, start) {
  const YT = await loadYT();
  if (!cur || cur.id !== vid) return;
  if (player && player.loadVideoById) player.loadVideoById({ videoId: vid, startSeconds: Math.max(0, start) });
  else {
    player = new YT.Player('player', {
      videoId: vid, host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, iv_load_policy: 3, start: Math.max(0, Math.floor(start)), origin: location.origin, enablejsapi: 1 },
      events: { onError: e => onYtError(e.data) }
    });
  }
  clearInterval(progIv);
  progIv = setInterval(saveProgress, 5000);
}
function saveProgress() {
  try { if (cur && cur.v && player && player.getCurrentTime) saveHist(cur.v, player.getCurrentTime(), player.getDuration()); } catch {}
}
function blocked(msg) {
  $('pbox').querySelector('.blocked')?.remove();
  $('pbox').append(h('div', { class: 'blocked' }, h('div', null, h('b', { text: msg }), h('a', { class: 'btn p', href: $('bYt').href, target: '_blank', rel: 'noopener', text: 'Abrir en YouTube' }))));
}
function onYtError(code) {
  if (!cur) return;
  blocked(code === 101 || code === 150 || code === 153 ? 'El dueño de este vídeo no deja verlo fuera de YouTube.' : code === 100 ? 'Este vídeo ya no existe o es privado.' : 'YouTube no ha podido cargar el vídeo (' + code + ').');
}
function leaveWatch() {
  document.body.classList.remove('watching');
  if (!cur) return;
  saveProgress();
  cur = null; clearInterval(progIv);
  try { player && player.pauseVideo && player.pauseVideo(); } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
window.addEventListener('pagehide', saveProgress);

// Descripción con enlaces y minutos que se pueden pulsar (sin innerHTML)
function richText(txt) {
  const out = document.createDocumentFragment();
  const re = /(https?:\/\/[^\s]+)|(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/g;
  let last = 0, m;
  while ((m = re.exec(txt))) {
    if (m.index > last) out.append(txt.slice(last, m.index));
    if (m[1]) {
      const url = m[1].replace(/[),.]+$/, ''); const vid = vidOf(url);
      out.append(h('a', vid ? { href: '#/ver/' + vid, onclick: e => e.stopPropagation() } : { href: url, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation() }, url));
      if (url.length < m[1].length) out.append(m[1].slice(url.length));
    } else {
      const secs = m[2].split(':').reduce((a, b) => a * 60 + +b, 0);
      out.append(h('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); if (player && player.seekTo) { player.seekTo(secs, true); player.playVideo(); $('watch').scrollTop = 0; } } }, m[2]));
    }
    last = re.lastIndex;
  }
  if (last < txt.length) out.append(txt.slice(last));
  return out;
}
function renderDesc(v) {
  const box = $('vbox');
  const st = [v.live ? 'En directo' : v.views ? Number(v.views).toLocaleString('es-ES') + ' visualizaciones' : '', v.published ? new Date(v.published).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '', v.likes ? fmtN(v.likes) + ' «me gusta»' : ''].filter(Boolean).join(' · ');
  const tx = h('div', { class: 'tx' }); tx.append(richText(v.desc || ''));
  const long = v.desc && (v.desc.length > 160 || v.desc.split('\n').length > 3);
  box.replaceChildren(...[h('div', { class: 'st', text: st }), tx, long ? h('div', { class: 'tg', text: 'Mostrar más' }) : null].filter(Boolean));
  box.onclick = () => { if (box.classList.contains('open')) return; box.classList.add('open'); box.querySelector('.tg')?.remove(); };
}

$('bShare').addEventListener('click', async () => {
  if (!cur) return;
  let t = 0; try { t = Math.floor(player.getCurrentTime()); } catch {}
  const url = `https://www.youtube.com/watch?v=${cur.id}` + (t > 5 ? `&t=${t}s` : '');
  try { if (navigator.share && /iPad|iPhone|Android/.test(navigator.userAgent)) { await navigator.share({ title: cur.v ? cur.v.title : 'YouTube', url }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { prompt('Copia el enlace:', url); }
});

/* ===================================================================== */
/*  Tema, cuenta y menú                                                  */
/* ===================================================================== */
function applyTheme(t) {
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0f1014' : '#ffffff';
}
applyTheme(LS.get('byab_theme', 'auto'));
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(LS.get('byab_theme', 'auto')));
$('bTheme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  LS.set('byab_theme', next); applyTheme(next);
});

function sheet(...kids) {
  const s = $('sheet');
  s.replaceChildren(h('div', { class: 'sh', onclick: e => e.stopPropagation() }, ...kids));
  s.hidden = false; s.onclick = closeSheet;
}
function closeSheet() { $('sheet').hidden = true; $('sheet').replaceChildren(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
const mi = (icon, title, sub, fn) => h('button', { class: 'mi', type: 'button', onclick: fn }, h('span', { class: 'ico' }, svg(icon)), h('span', null, title, sub ? h('small', { text: sub }) : null));

function openAccount() {
  const a = LS.get('byab_gacct', null), n = (gsubs().list || []).length, local = Object.keys(follows()).length;
  if (!CFG.oauthClientId) {
    sheet(h('h3', { text: 'Tu cuenta de Google' }),
      h('p', { text: 'Sin cuenta ya puedes seguir canales con el botón «Seguir» (' + local + ' ahora). Para traer tus suscripciones de YouTube hay que activar el inicio de sesión una vez:' }),
      h('ol', null,
        h('li', null, 'Entra en console.cloud.google.com, en el mismo proyecto de tu clave.'),
        h('li', null, 'APIs y servicios → Pantalla de consentimiento: tipo «Externo», modo prueba, y añádete como usuario de prueba.'),
        h('li', null, 'Credenciales → Crear → ID de cliente OAuth → Aplicación web. En «URI de redirección autorizados» pon ', h('code', { text: redirectUri() }), '.'),
        h('li', null, 'Copia el ID de cliente en ', h('code', { text: 'app/config.js' }), ' (oauthClientId) y súbelo a GitHub.')),
      h('div', { class: 'acts' }, h('button', { class: 'btn p', type: 'button', text: 'Entendido', onclick: closeSheet })));
    return;
  }
  const err = h('div', { class: 'err' });
  const run = async (fn, okMsg) => { err.textContent = ''; try { const r = await fn(); closeSheet(); toast(okMsg(r)); route(); } catch (e) { err.textContent = e.reason === 'noauth' ? 'No se ha completado el inicio de sesión.' : apiFail(e); } };
  if (!a) {
    sheet(h('h3', { text: 'Conectar tu cuenta de Google' }),
      h('p', { text: 'Se traen tus suscripciones y tus «me gusta» para el inicio y el «Para ti». Solo lectura: la app no puede cambiar nada de tu cuenta.' }),
      err, h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', text: 'Cancelar', onclick: closeSheet }), h('button', { class: 'btn p', type: 'button', text: 'Conectar', onclick: () => run(() => syncGoogleSubs(), n => `Listo: ${n} suscripciones`) })));
  } else {
    sheet(h('div', { class: 'brand' }, a.me && a.me.thumb ? h('img', { src: a.me.thumb, alt: '', referrerpolicy: 'no-referrer', style: { borderRadius: '50%' } }) : null, h('div', null, h('h3', { text: a.me ? a.me.title : 'Cuenta conectada' }), h('div', { class: 'cc', text: n + ' suscripciones · actualizado ' + fmtAgo(gsubs().at) }))),
      mi('M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12 3M19 9A7 7 0 0 0 7 6', 'Actualizar suscripciones', 'Vuelve a traerlas de YouTube', () => run(() => syncGoogleSubs(), n => `Listo: ${n} suscripciones`)),
      mi('M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3', 'Desconectar', 'Los canales que sigues desde la app se quedan', () => { gDisconnect(); closeSheet(); toast('Cuenta desconectada'); route(); }),
      err);
  }
}
$('bAccount').addEventListener('click', openAccount);

$('bMenu').addEventListener('click', () => {
  sheet(h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), h('div', null, h('h3', { text: 'ByAdBlock' }), h('div', { class: 'sign', text: 'HECHO POR @BYALVARO__' }))),
    mi('M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M12 7v5l3 3', 'Borrar historial', 'Quita «Seguir viendo»', () => { LS.del(HIST_KEY); closeSheet(); toast('Historial borrado'); route(); }),
    mi('M12 3a9 9 0 1 0 9 9M12 3v9l6 3', 'Tema automático', 'Usa el claro u oscuro del sistema', () => { LS.set('byab_theme', 'auto'); applyTheme('auto'); closeSheet(); }),
    mi('M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M3 21a8 8 0 0 1 12-6.9M17 14l4 4-4 4M21 18h-7', 'Exportar canales', 'Copia la lista de canales que sigues', async () => {
      const txt = JSON.stringify(follows());
      try { await navigator.clipboard.writeText(txt); toast('Copiado: pégalo en «Importar canales» en otro dispositivo'); } catch { prompt('Copia esto:', txt); }
      closeSheet();
    }),
    mi('M12 3v12M7 10l5 5 5-5M5 21h14', 'Importar canales', 'Pega la lista de otro dispositivo', () => {
      const inp = h('input', { class: 'inp', placeholder: 'Pega aquí la lista' });
      const err = h('div', { class: 'err' });
      sheet(h('h3', { text: 'Importar canales' }), inp, err, h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', text: 'Cancelar', onclick: closeSheet }), h('button', { class: 'btn p', type: 'button', text: 'Importar', onclick: () => {
        try { const j = JSON.parse(inp.value); if (!j || typeof j !== 'object') throw 0; LS.set('byab_follows', { ...follows(), ...j }); LS.del('byab_feed'); closeSheet(); toast('Canales importados'); route(); }
        catch { err.textContent = 'Eso no parece una lista de canales.'; }
      } })));
    }),
    mi('M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'Clave de YouTube propia', 'Por si la de la app se queda sin cuota', () => {
      const inp = h('input', { class: 'inp', placeholder: 'AIza…', value: LS.get('byab_key_user', '') });
      sheet(h('h3', { text: 'Clave de YouTube' }), h('p', { text: 'Déjala vacía para usar la de la app. Cada búsqueda gasta 100 de las 10.000 unidades diarias gratuitas.' }), inp,
        h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', text: 'Cancelar', onclick: closeSheet }), h('button', { class: 'btn p', type: 'button', text: 'Guardar', onclick: () => { LS.set('byab_key_user', inp.value.trim()); closeSheet(); toast('Guardada'); route(); } })));
    }),
    h('p', { class: 'cc', style: { marginTop: '14px' }, text: 'Versión ' + VERSION + ' · Los vídeos se reproducen con el reproductor oficial de YouTube. El «Para ti» lo crea la app con tus canales, tus «me gusta» y lo que ves.' }));
});

/* ---------- Arranque ---------- */
const cameBack = gHandleReturn();
paintAccount();
route();
if (cameBack) syncGoogleSubs().then(n => { toast(`Cuenta conectada: ${n} suscripciones`); route(); }).catch(e => toast(apiFail(e), 4500));
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
