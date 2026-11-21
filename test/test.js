// Pruebas del núcleo de ByAdBlock en un entorno simulado.  Uso: node test/test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');

(async () => {
  // Contexto vm con sus propios globales (JSON, Object...) para no tocar los de Node
  const sb = {};
  const c = vm.createContext(sb);
  vm.runInContext(`
    var __store = {};
    var window = this;
    var localStorage = { getItem: function(k){ return k in __store ? __store[k] : null; }, setItem: function(k,v){ __store[k] = String(v); } };
    function El(){ return { setAttribute: function(){}, appendChild: function(){}, isConnected: true, textContent: '' }; }
    var document = { documentElement: El(), head: El(), createElement: El, addEventListener: function(){},
      getElementById: function(){ return null; }, querySelector: function(){ return null; }, querySelectorAll: function(){ return []; } };
    function MutationObserver(){ this.observe = function(){}; this.disconnect = function(){}; }
    function Response(body, url){ this._b = body; this.url = url; }
    Response.prototype.json = function(){ return Promise.resolve(JSON.parse(this._b)); };
    var __fetchCalls = [];
    function fetch(input, init){ __fetchCalls.push({ input: input, init: init }); return Promise.resolve({ ok: false }); }
    function setTimeout(){ return 0; } function setInterval(){ return 0; }
  `, c);
  vm.runInContext(code, c);
  const run = (s) => vm.runInContext(s, c);

  // 1. Poda del player response por JSON.parse
  const player = run(`JSON.parse('${JSON.stringify({
    playabilityStatus: { status: 'OK' }, videoDetails: { videoId: 'abc' },
    adPlacements: [{ x: 1 }], playerAds: [{ y: 2 }], adSlots: [{ z: 3 }],
    streamingData: { formats: [1, 2] }
  })}')`);
  assert.strictEqual(player.adPlacements, undefined, 'adPlacements debe borrarse');
  assert.strictEqual(player.playerAds, undefined);
  assert.strictEqual(player.adSlots, undefined);
  assert.strictEqual(JSON.stringify(player.streamingData.formats), '[1,2]', 'el vídeo no se toca');
  console.log('✓ poda del reproductor (JSON.parse)');

  // 2. Anidado en arrays ([].playerResponse)
  const arr = run(`JSON.parse('${JSON.stringify([{ playerResponse: { adPlacements: [1], videoDetails: { title: 'un título largo de vídeo de prueba' } } }])}')`);
  assert.strictEqual(arr[0].playerResponse.adPlacements, undefined);
  console.log('✓ poda anidada [].playerResponse');

  // 3. Feed: quitar anuncios envueltos y dejar vídeos normales
  const feed = run(`JSON.parse('${JSON.stringify({ contents: [
    { richItemRenderer: { content: { videoRenderer: { videoId: 'ok1' } } } },
    { richItemRenderer: { content: { adSlotRenderer: { foo: 1 } } } },
    { richSectionRenderer: { content: { statementBannerRenderer: {} } } },
    { compactPromotedVideoRenderer: {} },
    { compactVideoRenderer: { videoId: 'ok2' } },
    { command: { reelWatchEndpoint: { adClientParams: { a: 1 } } } },
    { command: { reelWatchEndpoint: { videoId: 'short1' } } }
  ] })}')`);
  assert.strictEqual(feed.contents.length, 3, 'solo quedan los 3 vídeos reales');
  console.log('✓ feed, recomendados y Shorts sin anuncios');

  // 4. Aviso de bloqueador
  const pop = run(`JSON.parse('${JSON.stringify({ auxiliaryUi: { messageRenderers: { enforcementMessageViewModel: { t: 1 }, other: {} } }, videoDetails: {} })}')`);
  assert.strictEqual(pop.auxiliaryUi.messageRenderers.enforcementMessageViewModel, undefined);
  assert.ok(pop.auxiliaryUi.messageRenderers.other);
  console.log('✓ aviso "bloqueadores no permitidos" eliminado');

  // 5. JSON normal intacto y JSON.parse con aspecto nativo
  const normal = run(`JSON.parse('{"a":1,"b":[1,2,3]}')`);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(normal)), { a: 1, b: [1, 2, 3] });
  assert.ok(run('Function.prototype.toString.call(JSON.parse)').includes('[native code]'), 'debe parecer nativo');
  console.log('✓ JSON normal intacto; hooks con aspecto nativo');

  // 6. isInlinePlaybackNoAd en JSON.stringify
  const body = run(`JSON.stringify({ context: {}, playbackContext: { contentPlaybackContext: { html5Preference: 'X' } } })`);
  assert.ok(body.includes('"contentPlaybackContext":{"isInlinePlaybackNoAd":true,"html5Preference"'), body);
  assert.doesNotThrow(() => JSON.parse(body));
  const empty = run(`JSON.stringify({ playbackContext: { contentPlaybackContext: {} } })`);
  assert.strictEqual(JSON.parse(empty).playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
  const twice = run(`(function(){ var s = JSON.stringify({ contentPlaybackContext: { a: 1 } }); return JSON.stringify(JSON.parse(s)); })()`);
  assert.strictEqual((twice.match(/isInlinePlaybackNoAd/g) || []).length, 1, 'no se duplica');
  console.log('✓ isInlinePlaybackNoAd (también con contexto vacío, sin duplicar)');

  // 7. fetch al reproductor con body string
  run(`fetch('https://www.youtube.com/youtubei/v1/player?key=x', { method: 'POST', body: '{"playbackContext":{"contentPlaybackContext":{"a":1}}}' })`);
  const call = run('__fetchCalls[__fetchCalls.length - 1]');
  assert.ok(call.init.body.includes('isInlinePlaybackNoAd'));
  console.log('✓ fetch a /youtubei/v1/player marcado');

  // 8. ytInitialPlayerResponse (carga directa del HTML con var)
  run(`var ytInitialPlayerResponse = { adPlacements: [1], videoDetails: { videoId: 'v' } };`);
  assert.strictEqual(run('ytInitialPlayerResponse.adPlacements'), undefined);
  assert.strictEqual(run('ytInitialPlayerResponse.videoDetails.videoId'), 'v');
  console.log('✓ ytInitialPlayerResponse podado al asignarse');

  // 9. Response.json en /youtubei/
  const resp = await run(`new Response('${JSON.stringify({ playerAds: [1], videoDetails: {} })}', 'https://www.youtube.com/youtubei/v1/player').json()`);
  assert.strictEqual(resp.playerAds, undefined);
  console.log('✓ Response.json podado');

  // 10. Reglas remotas: se fusionan sin romper nada
  const c2 = vm.createContext({});
  vm.runInContext(`
    var __store = { '__bab_r': JSON.stringify({ version: 2, adRenderers: ['nuevoAnuncioRenderer'], disable: ['adSlots'] }) };
    var window = this;
    var localStorage = { getItem: function(k){ return k in __store ? __store[k] : null; }, setItem: function(k,v){ __store[k] = String(v); } };
    function El(){ return { setAttribute: function(){}, appendChild: function(){}, isConnected: true }; }
    var document = { documentElement: El(), head: El(), createElement: El, addEventListener: function(){},
      getElementById: function(){ return null; }, querySelector: function(){ return null; }, querySelectorAll: function(){ return []; } };
    function MutationObserver(){ this.observe = function(){}; this.disconnect = function(){}; }
    function fetch(){ return Promise.resolve({ ok: false }); }
    function setTimeout(){ return 0; } function setInterval(){ return 0; }
  `, c2);
  vm.runInContext(code, c2);
  const r2 = vm.runInContext(`JSON.parse('${JSON.stringify({ items: [{ nuevoAnuncioRenderer: {} }, { videoRenderer: {} }], adSlots: [1], adPlacements: [1] })}')`, c2);
  assert.strictEqual(r2.items.length, 1, 'regla remota nueva aplicada');
  assert.ok(r2.adSlots, 'regla desactivada en remoto ya no se aplica');
  assert.strictEqual(r2.adPlacements, undefined);
  assert.strictEqual(vm.runInContext('__bab().rules', c2), 2);
  console.log('✓ reglas remotas (añadir y desactivar)');

  // 11. Rendimiento: un JSON grande tipo ytInitialData
  const big = { contents: [] };
  for (let i = 0; i < 3000; i++) big.contents.push({ richItemRenderer: { content: { videoRenderer: { videoId: 'v' + i, title: { runs: [{ text: 'x'.repeat(40) }] }, thumbnail: { thumbnails: [{ url: 'u', w: 1 }, { url: 'u2', w: 2 }] } } } } });
  big.contents.push({ richItemRenderer: { content: { adSlotRenderer: {} } } });
  const bigStr = JSON.stringify(big);
  vm.runInContext(`var __big = ${JSON.stringify(bigStr)};`, c);
  const t0 = process.hrtime.bigint();
  const bigOut = run('JSON.parse(__big)');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(bigOut.contents.length, 3000);
  console.log(`✓ JSON de ${(bigStr.length / 1024 / 1024).toFixed(1)} MB limpiado en ${ms.toFixed(1)} ms`);

  console.log('\nTodas las pruebas pasan.');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
