// Проставляет версию всем модулям игры через importmap — браузер не возьмёт старые файлы из кэша.
// Запуск перед выкладкой: node tools/stamp.js
const fs = require('fs'), path = require('path');
const pub = path.join(__dirname, '..', 'public'), idx = path.join(pub, 'index.html');
const v = Date.now().toString(36);
const mods = fs.readdirSync(path.join(pub, 'js')).filter(f => f.endsWith('.js'));
const imports = { three: './three/build/three.module.min.js', 'three/addons/': './three/examples/jsm/' };
for (const m of mods) imports['./js/' + m] = './js/' + m + '?v=' + v;
let s = fs.readFileSync(idx, 'utf8');
s = s.replace(/<script type="importmap">[\s\S]*?<\/script>/, '<script type="importmap">' + JSON.stringify({ imports }) + '</script>');
s = s.replace(/<script type="module" src="\.\/js\/main\.js[^"]*"><\/script>/, '<script type="module" src="./js/main.js?v=' + v + '"></script>');
s = s.replace(/<script src="\.\/lib\/peerjs\.min\.js[^"]*"><\/script>/, '<script src="./lib/peerjs.min.js?v=' + v + '"></script>');
fs.writeFileSync(idx, s);
console.log('version', v, 'modules', mods.length);
