// Genera byadblock.user.js (iPad / Tampermonkey) y la carpeta extension/ (Chrome, Edge, Firefox)
// a partir de src/. Uso:  node build.js
// HECHO POR @BYALVARO__
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };

const core = read('src/core.js');
const version = (core.match(/var VERSION = '([\d.]+)'/) || [])[1];
if (!version) throw new Error('No encuentro VERSION en src/core.js');

// Userscript
write('byadblock.user.js', read('src/userscript-header.txt').replace('{{VERSION}}', version) + '\n' + core);

// Extensión
write('extension/core.js', core);
write('extension/rules-loader.js', read('src/rules-loader.js'));
const manifest = {
  manifest_version: 3,
  name: 'ByAdBlock',
  version,
  description: 'YouTube limpio, sin anuncios y sin esperas. HECHO POR @BYALVARO__',
  author: '@byalvaro__',
  homepage_url: 'https://byalvaroo.github.io/ByAdblock/',
  icons: { '128': 'icon128.png' },
  host_permissions: ['*://*.youtube.com/*', '*://www.youtube-nocookie.com/*'],
  content_scripts: [
    {
      matches: ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://music.youtube.com/*', '*://www.youtube-nocookie.com/*'],
      js: ['core.js'],
      run_at: 'document_start',
      world: 'MAIN',
      all_frames: false
    },
    {
      matches: ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://music.youtube.com/*'],
      js: ['rules-loader.js'],
      run_at: 'document_idle'
    }
  ],
  browser_specific_settings: {
    gecko: { id: 'byadblock@byalvaroo.github.io', strict_min_version: '128.0' }
  }
};
write('extension/manifest.json', JSON.stringify(manifest, null, 2) + '\n');

console.log(`ByAdBlock ${version} generado: byadblock.user.js + extension/`);
