// Datos falsos para probar la interfaz de la app sin gastar cuota: abre app/?mock
// (Solo se carga con ?mock en la URL.)
(function () {
  var names = ['Lofi Estudio', 'Química Fácil', 'Minecraft Pro', 'Ciencia Diaria', 'Música Chill', 'Tech Hoy'];
  var colors = ['e3262f', '3b82f6', '10b981', 'f59e0b', '8b5cf6', 'ec4899'];
  function pic(i, w, hgt, label) {
    var c = colors[i % colors.length];
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + hgt + "'><rect width='100%' height='100%' fill='%23" + c + "'/><text x='50%' y='54%' font-family='sans-serif' font-size='" + Math.round(hgt / 6) + "' fill='white' text-anchor='middle'>" + (label || '') + "</text></svg>";
    return 'data:image/svg+xml;utf8,' + svg;
  }
  function chId(i) { return 'UC' + ('mockchannel' + i).padEnd(22, 'x'); }
  function vId(i) { return ('vid' + i).padEnd(11, 'Q'); }
  function video(i) {
    var c = i % names.length;
    return {
      id: vId(i),
      snippet: { title: ['Cómo estudiar química en 1 hora', 'Construyo una ciudad entera', 'Música para concentrarse', 'El experimento más loco', 'Repaso de balances de materia', 'Las 10 novedades de la semana'][i % 6] + ' #' + i,
        channelTitle: names[c], channelId: chId(c), publishedAt: new Date(Date.now() - i * 9e6).toISOString(),
        description: 'Descripción de prueba con un enlace https://example.com y capítulos:\n0:00 Inicio\n2:15 Parte importante\n10:30 Final',
        thumbnails: { medium: { url: pic(i, 320, 180, '▶ ' + i) } }, liveBroadcastContent: i === 3 ? 'live' : 'none' },
      contentDetails: { duration: 'PT' + (3 + i % 40) + 'M' + (i * 7 % 60) + 'S' },
      statistics: { viewCount: String(1234 * (i + 1) * (i % 5 + 1) * 97), likeCount: String(321 * (i + 1)) }
    };
  }
  function channel(i) {
    return { id: chId(i), snippet: { title: names[i], customUrl: '@' + names[i].toLowerCase().replace(/\s/g, ''), description: 'Canal de prueba de ' + names[i] + '.', thumbnails: { medium: { url: pic(i, 88, 88, names[i][0]) } } },
      statistics: { subscriberCount: String(15000 * (i + 1) * (i + 2)), videoCount: String(120 + i * 30) }, contentDetails: { relatedPlaylists: { uploads: 'UU' + chId(i).slice(2) } },
      brandingSettings: {} };
  }
  window.__BYAB_MOCK = function (path, p) {
    return new Promise(function (res) {
      setTimeout(function () {
        if (path === 'search') {
          var items = [];
          if (String(p.type).indexOf('channel') > -1) items.push({ id: { kind: 'youtube#channel', channelId: chId(1) } }, { id: { kind: 'youtube#channel', channelId: chId(4) } });
          if (String(p.type).indexOf('video') > -1) for (var i = 0; i < 12; i++) items.push({ id: { kind: 'youtube#video', videoId: vId(i) } });
          res({ items: items, nextPageToken: 'n2' });
        } else if (path === 'videos' && (p.chart || p.myRating)) {
          var arr = []; for (var t = 0; t < 20; t++) arr.push(video(40 + t + (p.videoCategoryId ? 30 : 0)));
          res({ items: arr });
        } else if (path === 'videos') {
          res({ items: String(p.id || '').split(',').map(function (id) { var n = parseInt(id.replace(/\D/g, ''), 10) || 0; return video(n); }) });
        } else if (path === 'channels') {
          res({ items: String(p.id || '').split(',').map(function (id) { var n = parseInt(id.replace('UCmockchannel', ''), 10) || 0; return channel(n % names.length); }) });
        } else if (path === 'playlistItems') {
          var c = parseInt(String(p.playlistId).replace('UUmockchannel', ''), 10) || 0, out = [];
          for (var k = 0; k < (p.maxResults || 8); k++) { var n = c + k * names.length; out.push({ contentDetails: { videoId: vId(n), videoPublishedAt: new Date(Date.now() - n * 9e6).toISOString() } }); }
          res({ items: out });
        } else res({ items: [] });
      }, 120);
    });
  };
  // Para la prueba: dos canales seguidos y un vídeo a medias
  if (!localStorage.getItem('byab_follows')) localStorage.setItem('byab_follows', JSON.stringify({ [chId(1)]: { title: names[1], thumb: pic(1, 88, 88, 'Q'), at: 1 }, [chId(2)]: { title: names[2], thumb: pic(2, 88, 88, 'M'), at: 2 } }));
  if (!localStorage.getItem('byab_hist')) localStorage.setItem('byab_hist', JSON.stringify({ [vId(4)]: { t: 300, d: 900, at: Date.now(), title: 'Repaso de balances de materia #4', channel: names[4], channelId: chId(4) } }));
})();
