// Генерирует public/js/sim.js (браузерный хост) из логики server.js
const fs = require('fs');
const [srv, out] = process.argv.slice(2);
const s = fs.readFileSync(srv, 'utf8');
const cut = (a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker: ' + a + ' / ' + b); return s.slice(i, j); };
let logic = cut('// ---------- math ----------', '// ---------- networking ----------');
let net = cut('function send(ws, o)', "wss.on('connection'");
let handle = cut('function handle(p, m) {', 'let tickN = 0;');
net = net.replace('lan: lanUrls()', 'lan: []');
const head = `// ДВОЕ В ПУСТОТЕ — симуляция в браузере хоста (P2P). Сгенерировано из server.js.
// Хост держит мир, друг подключается по WebRTC.
`;
const tail = `
export function connect(ws, isHost) {
  if (players.size >= 2) { send(ws, { t: 'full' }); try { ws.close(); } catch { } return null; }
  const p = { id: nextId++, name: 'Пилот', ready: false, ws, isHost: !!isHost };
  resetPlayer(p);
  players.set(p.id, p);
  send(ws, { t: 'welcome', id: p.id });
  return {
    message(raw) { let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; } try { handle(p, m); } catch (e) { console.error(e); } },
    close() {
      if (!players.has(p.id)) return;
      players.delete(p.id);
      if (phase !== 'lobby' && S) bcast({ t: 'toast', m: p.name + ' отключился', c: 'red' });
      if (!players.size) { phase = 'lobby'; S = null; }
      broadcastLobby();
    },
  };
}
export function setInviteUrl(u) { publicUrl = u; broadcastLobby(); }

let tickN = 0, acc = 0, lastT = performance.now();
// фиксированный шаг: даже если вкладка притормозила, мир догоняет
setInterval(() => {
  const now = performance.now(); acc += Math.min(1000, now - lastT); lastT = now;
  let n = 0;
  while (acc >= 1000 / TICK && n < 8) {
    acc -= 1000 / TICK; n++;
    try { tick(); if (phase === 'game' && S && (++tickN % 2 === 0)) { bcast(snapshot()); events = []; } } catch (e) { console.error(e); }
  }
}, 1000 / TICK);
`;
fs.writeFileSync(out, head + logic + '\n// ---------- networking ----------\n' + net + '\n' + handle + tail);
console.log('sim.js written', (head + logic + net + handle + tail).length, 'chars');
