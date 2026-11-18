import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FinalShader, makeSky, makeSpaceEnvFrom, SunFlare, SUN_DIR, makePlume, Debris, Flashes, DmgNumbers } from './fx.js';
import { buildShip, buildStation, buildSpace, Particles, makeAvatar, WALK, WALK_HALLS, WALK_DOOR, OBST, SEATS, TERMINALS, FIRE_SLOTS, DOCK_P, DOCK_APPROACH } from './world.js';
import { makeViewModel } from './props.js';
import { STATION_WALK, STATION_OBST, STATION_OBST_R, setNPCMarker } from './station.js';
import { makeCreature, animateCreature, CREATURE_COLORS, CREATURE_RAD } from './creatures.js';
import { initAudio, sfx, setVolume, setEngine, setHiss, setIntensity } from './audio.js';
import { icon, fillIcons } from './icons.js';

const $ = id => document.getElementById(id);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const now = () => performance.now() / 1000;

// ---------- настройки ----------
const DEF = { sens: 1, fov: 80, vol: 0.7, mus: 0.4, inv: 0, q: 1, shake: 1 };
const SET = { ...DEF };
try { Object.assign(SET, JSON.parse(localStorage.getItem('dvp_set') || '{}')); } catch { }
const saveSet = () => { try { localStorage.setItem('dvp_set', JSON.stringify(SET)); } catch { } };
let myName = ''; try { myName = localStorage.getItem('dvp_name') || ''; } catch { }

// ---------- рендер ----------
// логарифмическая глубина: и интерьер в 10 см, и планета в 8 км без мерцания поверхностей
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const sky = makeSky(renderer);
scene.background = sky; scene.backgroundIntensity = 0.8;
const camera = new THREE.PerspectiveCamera(SET.fov, innerWidth / innerHeight, 0.06, 20000);
// MSAA прямо в цепочке пост-обработки — без лесенок на краях
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.88);
const finalPass = new ShaderPass(FinalShader);
composer.addPass(bloom); composer.addPass(finalPass); composer.addPass(new OutputPass());
scene.environment = makeSpaceEnvFrom(renderer, sky);
function applySettings() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, [0.7, 1, 2][SET.q]));
  bloom.enabled = SET.q > 0; finalPass.enabled = SET.q > 0;
  rt.samples = SET.q > 0 ? 4 : 0;
  camera.fov = SET.fov; resize();
  setVolume(SET.vol, SET.mus);
}
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  for (const p of [fx, fxN, fxS, fxSN]) if (p) p.mat.uniforms.uScale.value = innerHeight * 0.5 * renderer.getPixelRatio();
}
addEventListener('resize', resize);

// ---------- мир ----------
const space = buildSpace(scene, renderer);
const station = buildStation(); scene.add(station.group);
const SH = buildShip(); scene.add(SH.group); SH.group.position.copy(DOCK_P);
SH.group.add(camera);
const vm = makeViewModel(); camera.add(vm.group);
const fx = new Particles(scene, 5000, true), fxN = new Particles(scene, 1500, false);
const fxS = new Particles(SH.inner, 1500, true), fxSN = new Particles(SH.inner, 1200, false);
const debris = new Debris(scene), flashes = new Flashes(scene), dmgNums = new DmgNumbers();
const flare = new SunFlare(scene, camera);
// ---------- двигатели: факелы, свечение сопел, вентиляторы ----------
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(200,240,255,.6)'); g.addColorStop(1, 'rgba(120,180,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
SH.strobes.forEach(s => { s.material.map = glowTex; s.material.needsUpdate = true; }); // без текстуры спрайт — квадрат
const engines = SH.nozzles.map((n, i) => {
  const g = new THREE.Group(); g.position.copy(n.p); SH.group.add(g);
  const outer = makePlume(n.r * 1.02, n.main ? 15 : 11, 0x1f4dff, 0x6fd8ff, i * 3.1); g.add(outer);
  const core = makePlume(n.r * 0.45, n.main ? 6 : 4.5, 0x6fe0ff, 0xeafcff, i * 7.7); g.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fdcff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  glow.position.z = 0.2; g.add(glow);
  return { g, outer, core, glow, n };
});
const _cw = V3(), _ed = V3(), _ep = V3();
function updateEngines(power, boost, t, dt) {
  camera.getWorldPosition(_cw);
  for (const e of engines) {
    // свечение сопла видно, только когда смотришь в само сопло (сбоку — это факел, а не шар)
    e.g.getWorldPosition(_ep); _ed.set(0, 0, 1).applyQuaternion(SH.group.quaternion);
    const look = Math.max(0, _cw.clone().sub(_ep).normalize().dot(_ed)); e.lookK = look * look;
    for (const p of [e.outer, e.core]) {
      const u = p.material.uniforms; u.uTime.value = t; u.uPower.value = power * (p === e.core ? 0.6 : 1); u.uBoost.value = boost;
      p.scale.z = p.userData.baseLen * (0.2 + power * 0.85 + boost * 0.7); p.scale.x = p.scale.y = 1 + boost * 0.15 + Math.sin(t * 40 + p.id) * 0.02;
    }
    e.glow.material.opacity = Math.min(1, 0.12 + power * 0.5 + boost * 0.3) * (0.15 + 0.85 * e.lookK); e.glow.scale.setScalar(e.n.r * (1.2 + (power * 1.8 + boost * 2.2) * (0.3 + 0.7 * e.lookK)) * (0.95 + Math.random() * 0.1));
    e.glow.material.color.setRGB(0.6 + boost * 0.4, 0.86 - boost * 0.1, 1);
    e.n.mat.emissiveIntensity = 0.5 + power * 1.1 + boost * 0.9;
    if (e.n.fan) e.n.fan.rotation.z += dt * (2 + power * 26 + boost * 20);
  }
}
const _tmp = V3(), _tmp2 = V3();
function emitExhaust(power, boost, dt) { // след раскалённого газа, остающийся в пространстве
  if (power < 0.12) return;
  for (const e of engines) {
    const n = Math.random() < power * dt * 60 ? (boost ? 2 : 1) : 0;
    for (let k = 0; k < n; k++) {
      e.g.localToWorld(_tmp.set((Math.random() - 0.5) * e.n.r, (Math.random() - 0.5) * e.n.r, e.n.r * 0.6));
      _tmp2.set(0, 0, 1).applyQuaternion(SH.group.quaternion).multiplyScalar(12 + power * 18);
      fx.emit(_tmp.x, _tmp.y, _tmp.z, _tmp2.x, _tmp2.y, _tmp2.z, boost ? new THREE.Color(0.8, 0.6, 1) : new THREE.Color(0.35, 0.65, 1), 0.55 + power * 0.3, e.n.r * (1.1 + boost * 0.6), 2.2, 2.5);
    }
  }
}
const _wl = V3(), _rp = V3(), _rn = V3(), rcsT = [];
function emitRCS(w, strafeU, dt) { // маневровые дюзы стреляют газом туда, куда нужно для поворота
  SH.rcs.forEach((r, i) => {
    const tq = _rp.copy(r.p).cross(_rn.copy(r.n).negate()); // момент от силы, противоположной струе
    let fire = tq.lengthSq() > 0.01 && w.lengthSq() > 0.02 && tq.normalize().dot(_wl.copy(w).normalize()) > 0.45 && w.length() > 0.12;
    if (strafeU && r.n.y * -strafeU > 0.5) fire = true;
    rcsT[i] = (rcsT[i] || 0) - dt;
    if (fire && rcsT[i] <= 0) {
      rcsT[i] = 0.03;
      const p = SH.group.localToWorld(_tmp.copy(r.p)), d = _tmp2.copy(r.n).applyQuaternion(SH.group.quaternion);
      for (let k = 0; k < 3; k++) fxN.emit(p.x, p.y, p.z, d.x * 26 + (Math.random() - 0.5) * 5, d.y * 26 + (Math.random() - 0.5) * 5, d.z * 26 + (Math.random() - 0.5) * 5, new THREE.Color(0.92, 0.95, 1), 0.35, 0.5, 4, 5);
      fx.emit(p.x, p.y, p.z, d.x * 10, d.y * 10, d.z * 10, new THREE.Color(0.7, 0.85, 1), 0.08, 0.7, 0, 0);
    }
  });
}
applySettings();

// ---------- сеть ----------
let ws = null, myId = null, lobby = null, snap = null, snapT = 0, phase = 'menu';
// Два режима сети:
//  ws  — игра открыта с нашего node-сервера (start.bat), всё как раньше;
//  p2p — игра на GitHub Pages: браузер хоста сам держит мир, друг подключается напрямую (WebRTC через PeerJS).
let NET = 'ws', sendRaw = () => { }, p2pRole = null, roomCode = null, peer = null, guestConn = null;
const send = o => sendRaw(o);
const onlineSt = t => { $('netSt').textContent = t; };
function connectWS() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  sendRaw = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  ws.onopen = () => { onlineSt('онлайн'); if (myName) send({ t: 'hello', n: myName }); };
  ws.onclose = () => { onlineSt('нет связи…'); if (phase === 'game') { toast('Связь с сервером потеряна', 'red'); leaveGame(); show('sMenu'); } setTimeout(connectWS, 1500); };
  ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
}
const PEER_PREFIX = 'dvp2-room-';
const newCode = () => Array.from({ length: 6 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
const PEER_OPTS = { debug: 1, config: { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
] } };
async function startHost() {
  p2pRole = 'host';
  const sim = await import('./sim.js');
  // локальный игрок подключается к своему же миру напрямую
  const local = sim.connect({ readyState: 1, send: s => queueMicrotask(() => { try { onMsg(JSON.parse(s)); } catch (e) { console.error(e); } }), close() { } }, true);
  sendRaw = o => local.message(o);
  if (myName) send({ t: 'hello', n: myName });
  const open = () => {
    roomCode = roomCode || newCode();
    onlineSt('создаю комнату…');
    peer = new window.Peer(PEER_PREFIX + roomCode, PEER_OPTS);
    peer.on('open', () => {
      const url = location.origin + location.pathname + '?room=' + roomCode;
      sim.setInviteUrl(url); onlineSt('ты хост · комната ' + roomCode);
    });
    peer.on('connection', conn => {
      let h = null;
      conn.on('open', () => {
        h = sim.connect({ get readyState() { return conn.open ? 1 : 3; }, send: s => { try { conn.send(s); } catch { } }, close: () => conn.close() }, false);
        if (!h) setTimeout(() => conn.close(), 500);
      });
      conn.on('data', d => { if (h) h.message(d); });
      conn.on('close', () => { if (h) h.close(); h = null; });
      conn.on('error', () => { if (h) h.close(); h = null; });
    });
    peer.on('disconnected', () => { onlineSt('переподключаю комнату…'); setTimeout(() => { try { peer.reconnect(); } catch { } }, 1500); });
    peer.on('error', e => {
      console.warn('peer', e.type, e);
      if (e.type === 'unavailable-id') { roomCode = null; peer.destroy(); setTimeout(open, 300); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { onlineSt('нет связи с сервером комнат, пробую снова…'); peer.destroy(); setTimeout(open, 4000); }
    });
  };
  open();
}
function startGuest(code) {
  p2pRole = 'guest'; roomCode = code;
  onlineSt('подключаюсь к комнате ' + code + '…');
  let tries = 0;
  const go = () => {
    tries++;
    if (peer) try { peer.destroy(); } catch { }
    peer = new window.Peer(PEER_OPTS);
    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + code, { serialization: 'raw', reliable: true });
      guestConn = conn;
      const to = setTimeout(() => { if (!conn.open) { conn.close(); fail('Хост не отвечает'); } }, 15000);
      conn.on('open', () => {
        clearTimeout(to); tries = 0; onlineSt('в комнате ' + code);
        sendRaw = o => { if (conn.open) conn.send(JSON.stringify(o)); };
        if (myName) send({ t: 'hello', n: myName });
      });
      conn.on('data', d => { try { onMsg(JSON.parse(d)); } catch (e) { console.error(e); } });
      conn.on('close', () => { sendRaw = () => { }; if (phase === 'game' || phase === 'over') { toast('Связь с хостом потеряна', 'red'); leaveGame(); show('sMenu'); } fail('Соединение закрыто'); });
    });
    peer.on('error', e => { console.warn('peer', e.type, e); fail(e.type === 'peer-unavailable' ? 'Комната не найдена — хост закрыл вкладку?' : 'Ошибка сети: ' + e.type); });
  };
  const fail = why => {
    onlineSt(why + ' · повтор…');
    if (tries < 20) setTimeout(go, 3000); else onlineSt(why);
  };
  go();
}
async function connect() {
  const room = new URLSearchParams(location.search).get('room');
  let viaNode = false;
  try { const r = await fetch('./__dvp', { cache: 'no-store' }); viaNode = r.ok && (await r.text()) === 'node'; } catch { }
  if (viaNode && !room) { NET = 'ws'; connectWS(); return; }
  NET = 'p2p';
  if (room) startGuest(room.toLowerCase().replace(/[^a-z0-9]/g, '')); else startHost();
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome': myId = m.id; break;
    case 'full': toast('Сервер полон (2 игрока максимум)', 'red'); break;
    case 'lobby': lobby = m; renderLobby(); break;
    case 'start': enterGame(); break;
    case 'lobbyback': leaveGame(); show('sLobby'); break;
    case 'toast': toast(m.m, m.c); break;
    case 'shot': spawnBolt(V3(...m.o), V3(...m.d), m.k, false); break;
    case 'over': onOver(m.stats); break;
    case 's': onSnap(m); break;
  }
}

// ---------- экраны ----------
let screen = '';
function show(id) { document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === id)); screen = id; }
fillIcons();
document.addEventListener('click', e => { initAudio(); if (e.target.closest('.btn')) sfx.click(); });
document.addEventListener('mouseover', e => { if (e.target.classList && e.target.classList.contains('btn')) sfx.hover(); });
$('nameIn').value = myName;
function setName() {
  const n = $('nameIn').value.trim().slice(0, 16); if (!n) { $('nameIn').focus(); return; }
  myName = n; try { localStorage.setItem('dvp_name', n); } catch { }
  send({ t: 'hello', n }); $('whoName').textContent = n; show('sMenu');
}
$('nameOk').onclick = setName;
$('nameIn').onkeydown = e => { if (e.key === 'Enter') setName(); };
$('reName').onclick = () => show('sName');
$('mPlay').onclick = () => { show('sLobby'); renderLobby(); };
let settingsBack = 'sMenu', helpBack = 'sMenu';
$('mSet').onclick = () => { settingsBack = 'sMenu'; openSettings(); };
$('mHelp').onclick = () => { helpBack = 'sMenu'; show('sHelp'); };
$('helpBack').onclick = () => { show(helpBack); };
$('setBack').onclick = () => { show(settingsBack); };
$('lBack').onclick = () => { if (amReady()) send({ t: 'ready', v: false }); show('sMenu'); };
$('lReady').onclick = () => send({ t: 'ready', v: !amReady() });
$('lStart').onclick = () => { if (!amHost()) return toast('Запускает только хост', 'red'); if (!allReady()) return toast('Не все нажали «Готов»', 'red'); send({ t: 'start' }); };
const amHost = () => !!(lobby && lobby.hostId === myId);
const allReady = () => !!(lobby && lobby.players.length && lobby.players.every(p => p.r));
function updateStartBtn() {
  const b = $('lStart'); if (!lobby) return;
  b.style.display = amHost() ? '' : 'none';
  b.disabled = !allReady();
  const host = lobby.players.find(p => p.host);
  $('lWait').textContent = amHost() ? (allReady() ? 'Все готовы — жми «Старт»' : 'Ждём, пока все нажмут «Готов»') : 'Игру запускает хост' + (host ? ' — ' + host.n : '');
}
$('copyBtn').onclick = () => {
  const u = $('invUrl').textContent;
  (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Ссылка скопирована — кидай другу', 'green')).catch(() => { const r = document.createRange(); r.selectNode($('invUrl')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Выделил — нажми Ctrl+C', ''); });
};
const amReady = () => !!(lobby && lobby.players.find(p => p.id === myId && p.r));
function renderLobby() {
  if (!lobby) return;
  const el = $('slots'); el.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const p = lobby.players[i];
    const d = document.createElement('div');
    d.className = 'slot' + (p ? ' full' : '') + (p && p.r ? ' ready' : '');
    d.innerHTML = p ? `<div class="av">${icon('user', '#2a1404')}</div><div class="nm">${esc(p.n)}${p.id === myId ? ' <span style="color:var(--mute);font-size:13px">(ты)</span>' : ''}</div><div class="st">${p.r ? 'готов' : 'не готов'}${p.host ? ' · хост' : ''}</div>`
      : `<div class="ico" style="width:74px;height:74px;border-radius:24px">${icon('link')}</div><div class="nm" style="color:var(--mute)">Ждём напарника…</div><div class="st">кинь ссылку ниже</div>`;
    el.appendChild(d);
  }
  updateStartBtn();
  if (NET === 'p2p') {
    $('invUrl').textContent = lobby.url || 'комната создаётся…';
    $('lanHint').innerHTML = p2pRole === 'host'
      ? '<b style="color:var(--teal)">Ты хост.</b> Кидай другу ссылку — он откроет её и окажется в твоей комнате. Не закрывай эту вкладку, пока играете: мир живёт у тебя.'
      : 'Ты в комнате друга. Хост держит мир у себя — если он закроет вкладку, игра прервётся.';
    $('lReady').innerHTML = `<span class="ico">${icon('check')}</span>${amReady() ? 'Не готов' : 'Готов'}`;
    if (lobby.phase === 'game' && phase !== 'game' && screen === 'sLobby') send({ t: 'hello', n: myName });
    return;
  }
  const radmin = lobby.lan.find(u => u.startsWith('http://26.'));
  const others = lobby.lan.filter(u => u !== radmin);
  $('invUrl').textContent = radmin || lobby.url || (lobby.lan[0] || location.origin);
  $('lanHint').innerHTML = (radmin ? '<b style="color:var(--teal)">Через Radmin VPN</b> — быстро и без лагов: друг ставит Radmin VPN, заходит в твою сеть и открывает эту ссылку.<br>' : '')
    + (lobby.url ? (radmin ? 'Запасной интернет-туннель (медленный): ' : '') + '<code style="color:var(--orange2)">' + esc(lobby.url) + '</code><br>' : '')
    + (others.length ? 'В одной Wi-Fi сети: ' + others.map(esc).join(', ') : '');
  $('lReady').innerHTML = `<span class="ico">${icon('check')}</span>${amReady() ? 'Не готов' : 'Готов'}`;
  if (lobby.phase === 'game' && phase !== 'game' && screen === 'sLobby') send({ t: 'hello', n: myName });
}
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// настройки
function openSettings() {
  show('sSettings');
  const bind = (id, k, fmt) => { const el = $(id), v = $('v' + id.slice(2)); el.value = SET[k]; v.textContent = fmt(SET[k]); el.oninput = () => { SET[k] = +el.value; v.textContent = fmt(SET[k]); saveSet(); applySettings(); }; };
  bind('stSens', 'sens', x => (+x).toFixed(2)); bind('stFov', 'fov', x => x + '°'); bind('stVol', 'vol', x => Math.round(x * 100) + '%'); bind('stMus', 'mus', x => Math.round(x * 100) + '%');
  const seg = (id, k) => { const el = $(id); const upd = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === SET[k])); el.querySelectorAll('button').forEach(b => b.onclick = () => { SET[k] = +b.dataset.v; saveSet(); applySettings(); upd(); }); upd(); };
  seg('stInv', 'inv'); seg('stQ', 'q'); seg('stShake', 'shake');
}

// тосты
function toast(m, c) {
  const d = document.createElement('div'); d.className = 'toast ' + (c || ''); d.textContent = m;
  const box = $('toasts'); box.appendChild(d); while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => d.remove(), 3800);
  if (phase !== 'game') { d.style.position = 'fixed'; }
}
// тосты в меню тоже видны
$('hud').classList.add('on'); $('hud').querySelectorAll(':scope > *:not(#toasts)').forEach(e => e.dataset.hudPart = 1);
function hudParts(on) { $('hud').querySelectorAll('[data-hud-part]').forEach(e => e.style.visibility = on ? 'visible' : 'hidden'); }
hudParts(false);

// ---------- локальное состояние ----------
const me = { p: V3(0, 0, 1.5), y: 0, vy: 0, yaw: 0, pitch: 0, seat: null, seatLock: 0, tyaw: 0, tpitch: 0, hp: 100, down: false, dead: false, moving: false, tool: false, stepT: 0 };
const keys = {};
const mouse = { l: false, r: false };
const stick = new THREE.Vector2();
const PS = { active: false, p: V3(), q: new THREE.Quaternion(), v: V3(), w: V3(), thr: 0, boost: 100, gunCd: 0, rkCd: 0, ramCd: 0 };
let docked = true, panelOpen = null, chatOpen = false, shake = 0, dmgFlash = 0, lastAv = 0, lastShip = 0, alarmT = 0;
const mates = new Map();
const ENT = new Map(), EPJ = new Map(), LOOT = new Map(), FIRES = new Map();
const bolts = [];
let tGun = 0;

function enterGame() {
  phase = 'game'; show(''); hudParts(true);
  // старт — на станции, в центре миссий; на корабль попадаешь через шлюз
  Object.assign(me, { p: V3(9.4, 0, 6.6 + Math.random() * 2.8), y: 0, vy: 0, yaw: Math.PI / 2, pitch: 0, seat: null, down: false, dead: false, vel: new THREE.Vector2() });
  SH.doors.forEach(d => { d.t = 0; d.target = 0; d.phase = 'idle'; });
  SH.hull.visible = false;
  for (const m of [ENT, EPJ, LOOT, FIRES]) { for (const v of m.values()) removeObj(v); m.clear(); }
  for (const a of mates.values()) SH.inner.remove(a.group); mates.clear();
  PS.active = false; PS.thr = 0; PS.boost = 100;
  lockPointer();
  toast('Вы на станции «Улей-7». Возьмите миссию в терминале, откройте шлюз (E) и садитесь в корабль', 'blue');
  toast('Кликни по экрану, чтобы управлять', '');
}
function leaveGame() {
  phase = 'menu'; hudParts(false); $('downed').style.display = 'none';
  if (document.pointerLockElement) document.exitPointerLock();
  panelOpen = null; me.seat = null; PS.active = false;
  SH.group.position.copy(DOCK_P); SH.group.quaternion.set(0, 1, 0, 0);
}
function removeObj(v) { const o = v.o ? v.o.group : v.mesh || v.g; if (o && o.parent) o.parent.remove(o); }
function onOver(st) {
  phase = 'over'; hudParts(false);
  if (document.pointerLockElement) document.exitPointerLock();
  $('ovReason').textContent = st.reason; $('ovSec').textContent = st.sector; $('ovKills').textContent = st.kills; $('ovCr').textContent = st.credits;
  $('ovTime').textContent = Math.floor(st.time / 60) + ':' + String(st.time % 60).padStart(2, '0');
  show('sOver'); $('downed').style.display = 'none'; sfx.down();
}
$('ovBack').onclick = () => { send({ t: 'tolobby' }); };

// ---------- указатель ----------
const canvas = $('c');
function lockPointer() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch { } }
canvas.addEventListener('click', () => { if (phase === 'game' && !panelOpen && !chatOpen && screen !== 'sPause') lockPointer(); });
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && phase === 'game' && !panelOpen && !chatOpen && screen === '') show('sPause');
  if (document.pointerLockElement && screen === 'sPause') show('');
});
$('pzGo').onclick = () => { show(''); lockPointer(); };
$('pzSet').onclick = () => { settingsBack = 'sPause'; openSettings(); };
$('pzHelp').onclick = () => { helpBack = 'sPause'; show('sHelp'); };
addEventListener('mousemove', e => {
  if (!document.pointerLockElement || phase !== 'game') return;
  const s = SET.sens * 0.0022;
  if (me.down || me.dead) return;
  if (me.seat === 'pilot') { stick.x += e.movementX * s * 1.3; stick.y += e.movementY * s * 1.3 * (SET.inv ? -1 : 1); if (stick.length() > 1) stick.normalize(); }
  else if (me.seat) { me.tyaw -= e.movementX * s * 0.8; me.tpitch -= e.movementY * s * 0.8; me.tyaw = clamp(me.tyaw, -1.7, 1.7); me.tpitch = clamp(me.tpitch, -1.15, 1.45); }
  else { me.yaw -= e.movementX * s; me.pitch = clamp(me.pitch - e.movementY * s, -1.5, 1.5); }
});
addEventListener('mousedown', e => { if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.code === 'Enter' && chatOpen) { const t = $('chatTxt').value.trim(); if (t) send({ t: 'chat', m: t }); closeChat(); } if (e.code === 'Escape' && chatOpen) closeChat(); return; }
  keys[e.code] = true;
  if (phase !== 'game') return;
  if (e.code === 'Tab') e.preventDefault();
  if (panelOpen) { if (e.code === 'KeyE' || e.code === 'Escape') closePanel(); return; }
  if (e.code === 'Enter') { openChat(); return; }
  if (e.code === 'KeyE' && !e.repeat) onUse();
  if (e.code === 'KeyG' && !e.repeat && me.seat === 'pilot') send({ t: docked ? 'undock' : 'dock' });
  if (e.code === 'KeyX' && me.seat === 'pilot') PS.thr = 0;
  if (e.code === 'Space' && !me.seat && me.y <= 0 && !me.down) { me.vy = 4.6; sfx.jump(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; });
function openChat() { chatOpen = true; $('chatIn').style.display = 'block'; $('chatTxt').value = ''; document.exitPointerLock(); setTimeout(() => $('chatTxt').focus(), 10); }
function closeChat() { chatOpen = false; $('chatIn').style.display = 'none'; $('chatTxt').blur(); lockPointer(); }

// ---------- снапшоты ----------
function onSnap(m) {
  snap = m; snapT = now();
  docked = !!m.ship.dk;
  for (const e of m.ev) onEvent(e);
  // я и напарник
  const seen = new Set();
  for (const p of m.pl) {
    if (p.id === myId) {
      me.hp = p.hp; const wasDown = me.down; me.down = !!p.dn; me.dead = !!p.dd; me.bleed = p.bl;
      if (me.down && !wasDown) { sfx.down(); me.seat = null; }
      if (wasDown && !me.down && !me.dead) sfx.revive();
      if (now() > me.seatLock && p.s !== me.seat) { setSeat(p.s); }
      continue;
    }
    seen.add(p.id);
    let a = mates.get(p.id);
    if (!a) { a = makeAvatar(p.n, 0x5fb8ff); a.p = V3(...p.p); a.yawS = p.y; SH.inner.add(a.group); mates.set(p.id, a); }
    a.st = p;
  }
  for (const [id, a] of mates) if (!seen.has(id)) { SH.inner.remove(a.group); mates.delete(id); }
  // твари
  const ids = new Set();
  for (const e of m.en) {
    const [id, ty, x, y, z, vx, vy, vz, hp, hm, st] = e; ids.add(id);
    let E = ENT.get(id);
    if (!E) { const o = makeCreature(ty); o.group.position.set(x, y, z); scene.add(o.group); E = { o, ty, sp: V3(), sv: V3(), hp, hm }; ENT.set(id, E); }
    E.sp.set(x, y, z); E.sv.set(vx, vy, vz); E.rt = snapT; E.hp = hp; E.hm = hm; E.st = st;
  }
  for (const [id, E] of ENT) if (!ids.has(id)) { scene.remove(E.o.group); ENT.delete(id); }
  // снаряды тварей
  const pids = new Set();
  for (const b of m.ep) {
    const [id, x, y, z, vx, vy, vz, s] = b; pids.add(id);
    let P = EPJ.get(id);
    if (!P) { P = { mesh: new THREE.Mesh(GEO.orb, MATS.orb), sp: V3(), sv: V3() }; P.mesh.scale.setScalar(1.2 * s); scene.add(P.mesh); EPJ.set(id, P); }
    P.sp.set(x, y, z); P.sv.set(vx, vy, vz); P.rt = snapT;
  }
  for (const [id, P] of EPJ) if (!pids.has(id)) { scene.remove(P.mesh); EPJ.delete(id); }
  // лут
  const lids = new Set();
  for (const l of m.lo) {
    const [id, x, y, z] = l; lids.add(id);
    let L = LOOT.get(id);
    if (!L) { L = { mesh: new THREE.Mesh(GEO.gem, MATS.gem), tp: V3(x, y, z) }; L.mesh.position.set(x, y, z); scene.add(L.mesh); LOOT.set(id, L); }
    L.tp.set(x, y, z);
  }
  for (const [id, L] of LOOT) if (!lids.has(id)) { scene.remove(L.mesh); LOOT.delete(id); }
  // пожары
  const fids = new Set();
  for (const f of m.fi) {
    const [id, slot, kind, hp] = f; fids.add(id);
    let F = FIRES.get(id);
    if (!F) { F = makeFire(slot, kind); FIRES.set(id, F); }
    F.hp = hp;
  }
  for (const [id, F] of FIRES) if (!fids.has(id)) { SH.inner.remove(F.g); FIRES.delete(id); }
  if (panelOpen) renderPanel(false);
}
function setSeat(s) {
  const prev = me.seat; me.seat = s;
  if (s) { me.tyaw = 0; me.tpitch = 0; stick.set(0, 0); }
  if (s === 'pilot') { PS.active = false; }
  if (!s && prev) { const sp = SEATS[prev]; me.p.set(sp.p[0] * (prev === 'pilot' ? 1 : 0.62), 0, sp.p[2] + (prev === 'pilot' ? 1.4 : 0)); me.yaw = prev === 'pilot' ? Math.PI : sp.yaw + Math.PI; }
}
function onEvent(e) {
  const camW = camera.getWorldPosition(V3());
  const distF = p => clamp(1 - camW.distanceTo(V3(...p)) / 1500, 0, 1);
  switch (e.k) {
    case 'boom': { const p = V3(...e.p), c = new THREE.Color(CREATURE_COLORS[e.ty] || 0xff8a3d); explode(p, e.s, c); sfx.boom(e.s / 3, distF(e.p)); break; }
    case 'spark': fx.burst(V3(...e.p), 10, new THREE.Color(0xff8adf), 30, 0.4, 1.2); break;
    case 'hit': if (e.sh) { sfx.shieldHit(); dmgFlash = Math.max(dmgFlash, 0.25); shieldFlash = 1; } else { sfx.hit(e.d > 15); dmgFlash = Math.max(dmgFlash, Math.min(1, e.d / 25)); } shake = Math.min(1.4, shake + e.d / 22); break;
    case 'coin': sfx.coin(); break;
    case 'fixed': sfx.fixed(); { const s = FIRE_SLOTS[e.slot]; for (let i = 0; i < 25; i++) fxSN.emit(s[0], 0.4, s[2], (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, new THREE.Color(0xdfe8f0), 1.4, 0.6, 2, 1); } break;
    case 'roar': sfx.roar(e.big, distF(e.p)); break;
    case 'done': sfx.done(); break;
    case 'buy': sfx.buy(); break;
    case 'sector': toast('СЕКТОР ' + e.n + (e.n % 3 === 0 ? ' — ВНИМАНИЕ: БОСС' : ''), e.n % 3 === 0 ? 'red' : 'green'); break;
    case 'toast': toast(e.m, e.c); if (e.c === 'red' && /ПОЖАР|ПРОБОИНА/.test(e.m)) sfx.alarm(); break;
  }
}
let shieldFlash = 0;
function explode(p, s, c) {
  const k = Math.sqrt(s);
  fx.burst(p, 30 + s * 6, c, 25 * k, 1.1, 1.4 * k, 1.5, 2);
  fx.burst(p, 16, new THREE.Color(0xffffff), 40 * k, 0.35, 1 * k, 0, 3);
  fx.emit(p.x, p.y, p.z, 0, 0, 0, new THREE.Color(0xfff0e0), 0.25, s * 5, 1);
  fxN.burst(p, 10 + s * 2, c.clone().multiplyScalar(0.6), 18 * k, 1.8, 1.2 * k, 0.5, 1.2);
  debris.burst(p, Math.min(22, 5 + Math.round(s * 1.5)), c.getHex(), 0.35 * s, 22 * k);
  flashes.add(p, 0xffd0a0, s * 6);
  const d = camera.getWorldPosition(V3()).distanceTo(p); if (d < 220) shake = Math.min(1.5, shake + (1 - d / 220) * s * 0.15);
}
// хитмаркер
const hitm = document.createElement('div');
hitm.style.cssText = 'position:fixed;left:50%;top:50%;width:34px;height:34px;margin:-17px;pointer-events:none;z-index:9;opacity:0;transition:opacity .08s;background:conic-gradient(from 45deg,transparent 0 3%,#fff 3% 7%,transparent 7% 28%,#fff 28% 32%,transparent 32% 53%,#fff 53% 57%,transparent 57% 78%,#fff 78% 82%,transparent 82%);-webkit-mask:radial-gradient(circle,transparent 7px,#000 8px,#000 16px,transparent 17px);mask:radial-gradient(circle,transparent 7px,#000 8px,#000 16px,transparent 17px)';
document.body.appendChild(hitm);
let hitmT = 0, camKick = 0;
function hitMarker(big) { hitmT = big ? 0.25 : 0.12; hitm.style.opacity = 1; hitm.style.filter = big ? 'drop-shadow(0 0 6px #ff5a6a) hue-rotate(-30deg)' : ''; sfx.click(); }

// ---------- геометрия снарядов ----------
const GEO = { bolt: new THREE.SphereGeometry(1, 8, 6), orb: new THREE.SphereGeometry(1, 14, 10), gem: new THREE.OctahedronGeometry(1.3), rocket: new THREE.CapsuleGeometry(0.35, 1.6, 4, 8) };
const MATS = {
  nose: new THREE.MeshBasicMaterial({ color: 0xffb067, toneMapped: false }), tur: new THREE.MeshBasicMaterial({ color: 0x8ffcff, toneMapped: false }),
  orb: new THREE.MeshBasicMaterial({ color: 0xff5fb0, toneMapped: false }), rk: new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xff8a3d, emissiveIntensity: 1 }),
  gem: new THREE.MeshStandardMaterial({ color: 0x8ffcff, emissive: 0x3fd6ff, emissiveIntensity: 2, roughness: 0.2 }),
};
MATS.orb.color.multiplyScalar(2.2); MATS.nose.color.multiplyScalar(2); MATS.tur.color.multiplyScalar(2);
function spawnBolt(p, vel, k, mine) {
  const mesh = new THREE.Mesh(k === 'rk' ? GEO.rocket : GEO.bolt, k === 'nose' ? MATS.nose : k === 'rk' ? MATS.rk : MATS.tur);
  if (k !== 'rk') mesh.scale.set(0.22, 0.22, k === 'nose' ? 2.6 : 2); else mesh.rotation.x = Math.PI / 2;
  mesh.position.copy(p); scene.add(mesh);
  const b = { mesh, p: p.clone(), v: vel.clone(), life: k === 'rk' ? 4 : 1.4, k, mine, dmg: 0, tgt: null };
  if (k !== 'rk') mesh.lookAt(p.clone().add(vel));
  if (k !== 'rk') flashes.add(p, k === 'nose' ? 0xffc080 : 0x9ff8ff, k === 'nose' ? 3.2 : 2.2);
  bolts.push(b); return b;
}
const upg = () => (snap && snap.up) || { gun: 0, rate: 0, rockets: 0, repair: 0, engine: 0 };
function fireWeapons(dt) {
  PS.gunCd -= dt; PS.rkCd -= dt;
  if (!document.pointerLockElement || me.down) return;
  const u = upg();
  const shipV = me.seat === 'pilot' && PS.active ? PS.v : (snap ? V3(...snap.ship.v) : V3());
  if (me.seat === 'pilot' && PS.active && mouse.l && PS.gunCd <= 0) {
    PS.gunCd = 1 / (6.5 * (1 + 0.18 * u.rate));
    const fwd = V3(0, 0, -1).applyQuaternion(PS.q);
    for (const sx of [-1, 1]) {
      const o = SH.group.localToWorld(V3(sx * 1.8, 0.1, -10.5));
      const vel = fwd.clone().multiplyScalar(680).add(shipV);
      const b = spawnBolt(o, vel, 'nose', true); b.dmg = 14 * (1 + 0.25 * u.gun);
      send({ t: 'shot', o: o.toArray().map(r2), d: vel.toArray().map(r2), k: 'nose' });
    }
    sfx.laser(1); camKick = Math.min(0.05, camKick + 0.012);
  }
  if (me.seat === 'pilot' && PS.active && mouse.r && u.rockets > 0 && PS.rkCd <= 0) {
    PS.rkCd = 2.6;
    const fwd = V3(0, 0, -1).applyQuaternion(PS.q);
    const tgt = pickTarget(PS.p, fwd);
    for (let i = 0; i < u.rockets; i++) {
      const o = SH.group.localToWorld(V3((i - (u.rockets - 1) / 2) * 2.5, -1.2, -6));
      const b = spawnBolt(o, fwd.clone().multiplyScalar(180).add(shipV).add(V3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0).applyQuaternion(PS.q)), 'rk', true);
      b.dmg = 95; b.tgt = tgt;
    }
    sfx.rocket();
  }
  if ((me.seat === 'tl' || me.seat === 'tr') && mouse.l && PS.gunCd <= 0) {
    PS.gunCd = 1 / (9 * (1 + 0.2 * u.rate));
    const piv = SH.turretGuns[me.seat], dir = camera.getWorldDirection(V3());
    tGun = (tGun + 1) % 2;
    const o = piv.localToWorld(V3(tGun ? 0.22 : -0.22, 0, 2.3));
    const vel = dir.multiplyScalar(760).add(shipV);
    const b = spawnBolt(o, vel, 'tur', true); b.dmg = 9 * (1 + 0.22 * u.gun);
    send({ t: 'shot', o: o.toArray().map(r2), d: vel.toArray().map(r2), k: 'tur' });
    sfx.turret(); piv.userData.recoil = 1; piv.userData.side = tGun; camKick = Math.min(0.04, camKick + 0.008);
  }
}
const r2 = x => Math.round(x * 100) / 100;
function pickTarget(p, fwd) {
  let best = null, bs = -1;
  for (const [id, E] of ENT) { const d = E.o.group.position.clone().sub(p); const l = d.length(); if (l > 1400) continue; const c = d.normalize().dot(fwd); if (c > 0.6 && c - l / 4000 > bs) { bs = c - l / 4000; best = id; } }
  return best;
}
const _seg = V3(), _toE = V3();
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;
    if (b.k === 'rk') {
      const E = b.tgt && ENT.get(b.tgt);
      if (E) { const want = E.o.group.position.clone().sub(b.p).normalize().multiplyScalar(320); b.v.lerp(want, 1 - Math.exp(-dt * 3)); }
      else b.v.multiplyScalar(1 + dt * 0.5);
      b.mesh.lookAt(b.p.clone().add(b.v)); b.mesh.rotateX(Math.PI / 2);
      fx.emit(b.p.x, b.p.y, b.p.z, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, new THREE.Color(0xffa060), 0.5, 1.6, 1.5, 1);
    }
    const prev = b.p.clone();
    b.p.addScaledVector(b.v, dt); b.mesh.position.copy(b.p);
    let hit = false;
    if (b.life > 0) {
      _seg.copy(b.p).sub(prev); const sl = _seg.length(); _seg.divideScalar(sl || 1);
      for (const [id, E] of ENT) {
        const c = E.o.group.position, R = CREATURE_RAD[E.ty] * (E.ty === 'je' ? 0.9 : 1) + (b.k === 'rk' ? 2 : 0.6);
        _toE.copy(c).sub(prev); const t = clamp(_toE.dot(_seg), 0, sl);
        const closest = prev.clone().addScaledVector(_seg, t);
        if (closest.distanceToSquared(c) < R * R) {
          hit = true;
          if (b.mine) {
            if (b.k === 'rk') { for (const [id2, E2] of ENT) { const d = E2.o.group.position.distanceTo(closest); if (d < 34) { const dd = Math.round(b.dmg * (1 - d / 50)); send({ t: 'hit', id: id2, d: dd }); dmgNums.add(E2.o.group.position.clone().add(V3(0, CREATURE_RAD[E2.ty], 0)), dd, true); } } }
            else { send({ t: 'hit', id, d: Math.round(b.dmg) }); dmgNums.add(closest, Math.round(b.dmg), b.dmg >= 20); }
            hitMarker(E.hp - b.dmg <= 0);
          }
          E.o.pop = 1; E.o.flash = 1;
          const col = new THREE.Color(b.k === 'nose' ? 0xffb067 : b.k === 'rk' ? 0xffa040 : 0x8ffcff);
          fx.burst(closest, b.k === 'rk' ? 40 : 7, col, b.k === 'rk' ? 50 : 22, b.k === 'rk' ? 0.8 : 0.3, b.k === 'rk' ? 3 : 0.9, 1, 2.5);
          if (b.k === 'rk') sfx.boom(1.5, 0.8);
          break;
        }
      }
    }
    if (hit || b.life <= 0) { scene.remove(b.mesh); bolts.splice(i, 1); }
  }
}

// ---------- огонь / пробоины ----------
const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const fireMat2 = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const breachMat = new THREE.MeshBasicMaterial({ color: 0x8ffcff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
function makeFire(slot, kind) {
  const s = FIRE_SLOTS[slot], g = new THREE.Group(); g.position.set(s[0], 0, s[2]); SH.inner.add(g);
  const parts = [];
  if (kind === 'fire') {
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.35 + i * 0.05, 1.2, 10, 1, true), i % 2 ? fireMat2 : fireMat); c.position.set((Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6); g.add(c); parts.push(c); }
    // свет пожара берётся из заранее созданного пула (новая лампа = перекомпиляция всех шейдеров = фриз)
  } else {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0x000000 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; g.add(disc);
    for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.6 + i * 0.18, 0.04, 6, 30), breachMat); r.rotation.x = -Math.PI / 2; r.position.y = 0.05 + i * 0.05; g.add(r); parts.push(r); }
  }
  return { g, kind, slot, parts, hp: 100 };
}
function updateFires(dt, t) {
  let any = false, li = 0;
  for (const F of FIRES.values()) {
    any = true; const s = FIRE_SLOTS[F.slot], k = 0.4 + F.hp / 100 * 0.6;
    if (F.kind === 'fire') {
      F.parts.forEach((c, i) => { const f = 0.8 + Math.sin(t * 17 + i * 2) * 0.2 + Math.random() * 0.1; c.scale.set(k, f * k * (1.2 + i * 0.2), k); c.position.y = 0.5 * f * k; });
      const L = SH.fireLights[li++]; if (L) { L.position.set(s[0], 1, s[2]); L.intensity = (3 + Math.random() * 2) * k; }
      if (Math.random() < dt * 30) fxS.emit(s[0] + (Math.random() - 0.5) * 0.8, 0.3, s[2] + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.3, 1.5 + Math.random(), (Math.random() - 0.5) * 0.3, new THREE.Color(0xff9a3a), 0.7, 0.35, 0.5, 0.5);
      if (Math.random() < dt * 8) fxSN.emit(s[0], 1.4, s[2], (Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4, new THREE.Color(0x2a2630), 2, 0.6, 3, 0.4);
    } else {
      F.parts.forEach((r, i) => { r.rotation.z = t * (i ? -3 : 4); r.scale.setScalar(k * (1 + Math.sin(t * 9 + i) * 0.08)); });
      if (Math.random() < dt * 40) { const a = Math.random() * 6.28, d = 1.5 + Math.random(); fxS.emit(s[0] + Math.cos(a) * d, 0.2 + Math.random() * 1.8, s[2] + Math.sin(a) * d, -Math.cos(a) * d * 1.8, -1, -Math.sin(a) * d * 1.8, new THREE.Color(0xbff4ff), 0.5, 0.08, 0, 0); }
      if (Math.random() < dt * 12) fxS.emit(s[0], 0.1, s[2], (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, new THREE.Color(0x8ffcff), 0.3, 0.12, 0, 1);
    }
  }
  for (; li < SH.fireLights.length; li++) SH.fireLights[li].intensity = 0;
  SH.alarm.intensity = any ? (Math.sin(t * 6) > 0 ? 6 : 0.5) : 0;
  const breaches = [...FIRES.values()].filter(f => f.kind === 'breach').length, fires = FIRES.size - breaches;
  $('alarm').style.display = any && !docked ? 'block' : 'none';
  $('alarm').textContent = (fires ? 'ПОЖАР ×' + fires + '  ' : '') + (breaches ? 'ПРОБОИНА ×' + breaches + ' — КИСЛОРОД!' : '');
  alarmT -= dt; if (any && !docked && alarmT <= 0) { alarmT = 2.2; sfx.alarm(); }
}

// ---------- станция: NPC, задания, диалоги ----------
const NPC_LINES = {
  vors: ['Двадцать лет вожу конвои через этот сектор. Таких тварей ещё не видал.', 'Держите щиты заряженными, пилоты. Медузы бьют издалека.', 'Улей-7 стоит, пока стоят такие, как вы.'],
  zina: ['Опять пробоина? Тащи сюда, залатаю. Шучу — сам латай, инструмент у тебя есть.', 'Реактор у вас дышит неровно. Не гоняйте форсаж без нужды.', 'Пожар тушится струёй под основание пламени. Запомни.'],
  hlup: ['Хлюп продаёт! Хлюп покупает! Хлюп не задаёт вопросов!', 'Зубы червя — лучший товар. Хлюп знает.', 'Ты не видел Хлюпа. Хлюп не видел тебя. Хлюп?'],
  okto: ['Что будешь? «Глорп» — фирменный. Восемь щупалец, восемь вкусов.', 'Слыхал — в третьем секторе проснулась Матка. Огромная. Злющая.', 'Говорят, если тушить пожар в шлеме — уши не обжечь. Врут.', 'Пилоты, которые не возвращаются, всегда оставляют чаевые заранее.'],
  w1: ['Какая красивая станция! А тварей отсюда видно?'], w2: ['Не стой на пути, груз везу.'], w3: ['Мой первый вылет завтра. Страшно...'],
};
let dialogNpc = null;
function talkTo(n) {
  const lines = NPC_LINES[n.id] || ['...'];
  n.talkT = 3; n.line = lines[Math.floor(Math.random() * lines.length)];
  if (n.path) { toast(n.name + ': ' + n.line, 'chat'); return; }
  dialogNpc = n; openPanel('npc');
}
const QTY = { je: 'медуз', sw: 'летучих глаз', wo: 'червей', ne: 'гнёзд' };
function npcPanel(B) {
  const n = dialogNpc; if (!n) return;
  $('pTitle').textContent = n.name;
  const q = snap && snap.qs && snap.qs.find(x => x.npc === n.id);
  let qhtml = '';
  if (q) {
    const st = { offer: 'Новое задание', active: 'В процессе', done: 'Выполнено — забери награду', claimed: 'Сдано' }[q.s];
    const btn = q.s === 'offer' ? '<button class="btn" data-q="take">Взять задание</button>' : q.s === 'done' ? '<button class="btn teal" data-q="claim">Сдать — +◆ ' + q.r + '</button>' : '';
    qhtml = '<div class="it" style="margin-top:14px"><div class="row" style="justify-content:space-between"><div class="nm">' + esc(q.t) + '</div><span class="hint">' + st + '</span></div><div class="ds">' + esc(q.x) + '</div>'
      + (q.s !== 'offer' ? '<div class="pb" style="height:8px;border-radius:5px;background:rgba(0,0,0,.4);overflow:hidden"><i style="display:block;height:100%;width:' + Math.min(100, q.p / q.g * 100) + '%;background:var(--teal)"></i></div><div class="hint">' + q.p + ' / ' + q.g + ' ' + (QTY[q.ty] || '') + '</div>' : '')
      + '<div class="row" style="justify-content:space-between"><b style="font-family:Unbounded;color:var(--orange2)">Награда: ◆ ' + q.r + '</b>' + btn + '</div></div>';
  }
  B.innerHTML = '<div class="row" style="gap:18px;align-items:flex-start"><span class="ico" style="width:72px;height:72px;border-radius:22px;background:linear-gradient(160deg,#ffb067,#d95f22)">' + icon('user', '#2a1404') + '</span><div style="flex:1"><div class="it" style="border-radius:22px 22px 22px 6px"><div class="ds" style="font-size:17px;color:var(--text)">«' + esc(n.line || '') + '»</div></div>' + qhtml + '</div></div>'
    + '<div class="row end" style="margin-top:14px"><button class="btn ghost" data-q="more">Ещё поболтать</button><span></span></div>';
  B.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
    const a = b.dataset.q;
    if (a === 'more') { const L = NPC_LINES[n.id] || ['...']; n.line = L[Math.floor(Math.random() * L.length)]; n.talkT = 3; renderPanel(true); return; }
    if (q) send({ t: 'quest', id: q.id, a });
  });
}
function updateStation(dt, t) {
  const st = SH.stationIn; if (!st) return;
  const on = docked && phase === 'game';
  st.lights.forEach((l, i) => l.intensity = on ? (i === 3 ? 3 : 7) : 0);
  if (!SH.halls.visible) return;
  st.holo.rotation.y += dt * 0.25; st.mini.rotation.y += dt * 0.4;
  st.water.material.emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.15;
  for (const n of st.npcs) {
    n.update(dt, t, me.p);
    const q = snap && snap.qs && snap.qs.find(x => x.npc === n.id);
    setNPCMarker(n, q && (q.s === 'offer' || q.s === 'done') ? q.s : null);
  }
  if (Math.random() < dt * 25) { const a = Math.random() * 6.28, r = Math.random() * 2.6; fxS.emit(Math.cos(a) * r, 0.6, 28 + Math.sin(a) * r, 0, 0.5 + Math.random(), 0, new THREE.Color(0.4, 0.95, 1), 1.2, 0.12, 0, 0.3); }
}
function updateQuestHud() {
  const box = $('quests'); if (!box || !snap || !snap.qs) return;
  const act = snap.qs.filter(q => q.s === 'active' || q.s === 'done');
  box.innerHTML = act.map(q => '<div class="qrow' + (q.s === 'done' ? ' qdone' : '') + '">' + esc(q.t) + ' <b>' + (q.s === 'done' ? '✓ сдать' : q.p + '/' + q.g) + '</b></div>').join('');
}

// ---------- шлюзы: выравнивание давления → створки → герметизация ----------
const _dv = V3();
function doorDist(d) { return camera.getWorldPosition(V3()).distanceTo(SH.group.localToWorld(V3(d.sx * 4.5, 1.4, 8))); }
function updateDoors(dt, t) {
  const dr = (snap && snap.dr) || [0, 0];
  SH.doors.forEach((d, i) => {
    const want = phase === 'game' ? dr[i] : 0;
    if (want !== d.target) {
      d.target = want; d.pt = 0;
      const df = clamp(1 - doorDist(d) / 25, 0, 1);
      if (want) { d.phase = 'vent'; sfx.airHiss(df); } else { d.phase = 'slide'; sfx.doorMotor(df); }
    }
    d.pt += dt;
    if (d.phase === 'vent') { // давление выравнивается: пар из щелей, маячки крутятся
      if (Math.random() < dt * 90) {
        const v = d.vents[Math.floor(Math.random() * d.vents.length)];
        const lp = d.g.position.clone().add(v), sgn = Math.sign(v.x) || 1;
        for (let k = 0; k < 2; k++) fxSN.emit(lp.x, lp.y, lp.z, sgn * (1.5 + Math.random() * 2.5), (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 2, new THREE.Color(0.9, 0.93, 0.97), 1.2, 0.18, 4, 1.2);
      }
      if (d.pt > 0.9) { d.phase = 'slide'; d.pt = 0; sfx.doorMotor(clamp(1 - doorDist(d) / 25, 0, 1)); }
    } else if (d.phase === 'slide') {
      const dir = d.target ? 1 : -1;
      d.t = clamp(d.t + dir * dt / 1.0, 0, 1);
      if ((dir > 0 && d.t >= 1) || (dir < 0 && d.t <= 0)) { d.phase = 'idle'; sfx.clunk(clamp(1 - doorDist(d) / 25, 0, 1)); if (dir < 0) for (let k = 0; k < 14; k++) fxSN.emit(d.g.position.x, 0.2 + Math.random() * 2.4, 8, (Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 0.5, new THREE.Color(0.8, 0.82, 0.86), 0.7, 0.12, 3, 3); }
    }
    const e = d.t < 0.5 ? 2 * d.t * d.t : 1 - Math.pow(-2 * d.t + 2, 2) / 2; // плавный старт и торможение
    d.panels[0].position.z = -0.4 - e * 0.85; d.panels[1].position.z = 0.4 + e * 0.85;
    const busy = d.phase !== 'idle';
    d.lampMat.color.set(busy ? 0xffb020 : d.t > 0.5 ? 0x7dffb0 : 0xff3b4f); d.lampMat.emissive.copy(d.lampMat.color);
    d.lampMat.emissiveIntensity = busy ? 1.5 + Math.sin(t * 20) * 1.2 : 1.8;
    for (const b of d.beacons) { b.b.rotation.y += dt * (busy ? 9 : 0); b.beam.material.opacity = busy ? 0.35 : 0; b.dome.material.emissiveIntensity = busy ? 2.2 : 0.3; }
  });
}

// ---------- ходьба ----------
function walkable(x, z) {
  let rects = docked ? WALK.concat(WALK_HALLS, STATION_WALK) : WALK;
  if (docked) SH.doors.forEach((d, i) => { if (d.t > 0.85) rects = rects.concat([WALK_DOOR[i]]); }); // в проём — только когда створки разъехались
  let ok = false;
  for (const r of rects) if (x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3]) { ok = true; break; }
  if (!ok) return false;
  for (const o of OBST) if (Math.hypot(x - o[0], z - o[1]) < o[2] + 0.3) return false;
  if (docked && z > 16) {
    for (const o of STATION_OBST) if (Math.hypot(x - o[0], z - o[1]) < o[2] + 0.3) return false;
    for (const r of STATION_OBST_R) if (x > r[0] - 0.3 && x < r[1] + 0.3 && z > r[2] - 0.3 && z < r[3] + 0.3) return false;
    for (const n of SH.stationIn.npcs) if (!n.path && Math.hypot(x - n.g.position.x, z - n.g.position.z) < 0.6) return false;
  }
  return true;
}
function updateWalk(dt) {
  if (!walkable(me.p.x, me.p.z)) me.p.set(0, 0, 8);
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const wantMove = (f || r) && !me.down && !me.dead && !chatOpen;
  // инерция тела: разгон и торможение, в прыжке управление слабее
  me.vel = me.vel || new THREE.Vector2();
  let wx = 0, wz = 0;
  if (wantMove) {
    const sp = keys.ShiftLeft ? 6.4 : 4.3;
    const fx_ = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    wx = fx_ * f + rx * r; wz = fz * f + rz * r; const l = Math.hypot(wx, wz); wx = wx / l * sp; wz = wz / l * sp;
  }
  const acc = me.y > 0 ? 2.5 : (wantMove ? 11 : 13);
  me.vel.x += (wx - me.vel.x) * Math.min(1, dt * acc); me.vel.y += (wz - me.vel.y) * Math.min(1, dt * acc);
  // корабль трясёт от попаданий — экипаж слегка сносит
  if (shake > 0.3 && me.y <= 0) { me.vel.x += (Math.random() - 0.5) * shake * 6 * dt; me.vel.y += (Math.random() - 0.5) * shake * 6 * dt; }
  const spd = me.vel.length(); me.moving = spd > 0.4;
  if (spd > 0.01) {
    const nx = me.p.x + me.vel.x * dt, nz = me.p.z + me.vel.y * dt;
    if (walkable(nx, nz)) me.p.set(nx, 0, nz); else if (walkable(nx, me.p.z)) { me.p.x = nx; me.vel.y *= 0.3; } else if (walkable(me.p.x, nz)) { me.p.z = nz; me.vel.x *= 0.3; } else me.vel.set(0, 0);
    me.stepT += dt * spd / 4.3; if (me.stepT > 0.4 && me.y <= 0) { me.stepT = 0; sfx.step(); }
  }
  const wasAir = me.y > 0;
  me.vy -= 13 * dt; me.y = Math.max(0, me.y + me.vy * dt); if (me.y <= 0) { if (wasAir && me.vy < -3) me.land = Math.min(1, -me.vy / 8); me.vy = 0; }
}

// ---------- взаимодействие ----------
let promptAct = null, holdKind = null, fixAcc = 0, fixTarget = null, revAcc = 0, revTarget = null, netT = 0;
function mateList() { return [...mates.entries()].map(([id, a]) => ({ id, a, st: a.st })); }
function findInteract() {
  if (me.down || me.dead) return null;
  if (me.seat) return { kind: 'stand', text: '<kbd>E</kbd>встать' + (me.seat === 'pilot' ? '  ·  <kbd>G</kbd>' + (docked ? 'отстыковка' : 'стыковка') : '') };
  const px = me.p.x, pz = me.p.z;
  for (const m of mateList()) if (m.st && m.st.dn) { const d = Math.hypot(m.a.group.position.x - px, m.a.group.position.z - pz); if (d < 2.2) return { kind: 'revive', id: m.id, text: '<kbd>E</kbd>держи — поднять ' + esc(m.st.n) + ' (' + Math.round(m.st.rv * 100) + '%)' }; }
  let bestF = null, bd = 2.6;
  for (const [id, F] of FIRES) { const s = FIRE_SLOTS[F.slot], d = Math.hypot(s[0] - px, s[2] - pz); if (d < bd) { bd = d; bestF = { id, F }; } }
  if (bestF) return { kind: 'fix', id: bestF.id, F: bestF.F, text: '<kbd>F</kbd>держи — ' + (bestF.F.kind === 'fire' ? 'тушить пожар' : 'заварить пробоину') + ' (' + Math.round(bestF.F.hp) + '%)' };
  const taken = s => mateList().some(m => m.st && m.st.s === s);
  for (const k in SEATS) { const s = SEATS[k]; if (Math.hypot(s.p[0] - px, s.p[2] - pz) < 1.7) return taken(k) ? { kind: 'none', text: 'Место занято напарником' } : { kind: 'sit', seat: k, text: '<kbd>E</kbd>' + s.label }; }
  if (docked) for (const t of TERMINALS) if (Math.hypot(t.p[0] - px, t.p[2] - pz) < 2.3) return { kind: 'term', id: t.id, text: '<kbd>E</kbd>' + t.label };
  if (docked) for (const n of SH.stationIn.npcs) { const d = Math.hypot(n.g.position.x - px, n.g.position.z - pz); if (d < (n.talk || 1.8)) return { kind: 'npc', n, text: '<kbd>E</kbd>поговорить: ' + esc(n.name) }; }
  // шлюзы: открыть/закрыть с обеих сторон двери
  for (let i = 0; i < SH.doors.length; i++) {
    const d = SH.doors[i], dx = px - d.sx * 4.5, dz = pz - 8;
    if (Math.hypot(dx, dz) < 1.9) {
      if (!docked) return { kind: 'none', text: 'Шлюз заблокирован — за бортом вакуум' };
      if (d.phase !== 'idle') return { kind: 'none', text: d.phase === 'vent' ? 'Выравнивание давления…' : 'Створки движутся…' };
      return { kind: 'door', i, text: '<kbd>E</kbd>' + (d.target ? 'закрыть шлюз' : 'открыть шлюз') };
    }
  }
  return null;
}
function onUse() {
  const a = promptAct; if (!a) return;
  if (a.kind === 'stand') { send({ t: 'stand' }); me.seatLock = now() + 0.6; setSeat(null); }
  else if (a.kind === 'sit') { send({ t: 'sit', s: a.seat }); me.seatLock = now() + 0.6; setSeat(a.seat); }
  else if (a.kind === 'term') openPanel(a.id);
  else if (a.kind === 'door') send({ t: 'door', i: a.i });
  else if (a.kind === 'npc') talkTo(a.n);
}
function updateInteract(dt) {
  promptAct = findInteract();
  const pr = $('prompt');
  if (promptAct && !panelOpen) { pr.style.display = 'block'; pr.innerHTML = promptAct.text; } else pr.style.display = 'none';
  // тушение
  const tooling = keys.KeyF && !me.seat && !me.down && !me.dead && !panelOpen && !chatOpen;
  me.tool = tooling; setHiss(tooling);
  if (tooling) {
    const tip = vm.tip.getWorldPosition(V3()), tl = SH.group.worldToLocal(tip.clone()), dir = camera.getWorldDirection(V3()).transformDirection(new THREE.Matrix4().copy(SH.group.matrixWorld).invert());
    for (let i = 0; i < 3; i++) fxSN.emit(tl.x, tl.y, tl.z, dir.x * 6 + (Math.random() - 0.5) * 1.5, dir.y * 6 + (Math.random() - 0.5) * 1.5, dir.z * 6 + (Math.random() - 0.5) * 1.5, new THREE.Color(0xeef6ff), 0.5, 0.18, 2.5, 3);
    if (promptAct && promptAct.kind === 'fix') { fixTarget = promptAct.id; fixAcc += dt * 30 * (1 + 0.35 * (upg().repair || 0)); }
  }
  // поднимание
  if (keys.KeyE && promptAct && promptAct.kind === 'revive') { revTarget = promptAct.id; revAcc += dt / 3; $('holdbar').style.display = 'block'; $('holdbar').firstChild.style.width = Math.round((mates.get(revTarget).st.rv || 0) * 100) + '%'; }
  else $('holdbar').style.display = 'none';
  netT -= dt;
  if (netT <= 0) { netT = 0.1; if (fixAcc > 0 && fixTarget) send({ t: 'fix', id: fixTarget, a: Math.round(fixAcc * 10) / 10 }); fixAcc = 0; if (revAcc > 0 && revTarget) send({ t: 'revive', id: revTarget, a: Math.round(revAcc * 1000) / 1000 }); revAcc = 0; }
}

// ---------- панели станции ----------
const SHOPDEF = {
  gun: ['gun', 'Калибр', 'Урон всех пушек +25%'], rate: ['rate', 'Скорострельность', 'Пушки и турели стреляют чаще'], hull: ['hull', 'Бронекорпус', 'Макс. прочность +70'],
  shield: ['shield', 'Щит', 'Ёмкость и регенерация щита'], engine: ['engine', 'Двигатели', 'Скорость корабля +15%'], magnet: ['magnet', 'Магнит лута', 'Притягивает ◆ издалека'],
  fireproof: ['fire', 'Огнеупор', 'Реже пожары и пробоины'], rockets: ['rocket', 'Ракеты', 'ПКМ пилота: самонаводящиеся ракеты (+1 за уровень)'], repair: ['wrench', 'Ремкомплект', 'Быстрее тушишь и чинишь'], medbay: ['med', 'Медблок', 'Экипаж быстрее лечится'],
};
const SHOPMAX = { gun: 5, rate: 5, hull: 5, shield: 5, engine: 4, magnet: 4, fireproof: 4, rockets: 3, repair: 4, medbay: 4 };
const SHOPBASE = { gun: 120, rate: 120, hull: 100, shield: 140, engine: 90, magnet: 60, fireproof: 110, rockets: 200, repair: 80, medbay: 120 };
let panelHash = '';
function openPanel(id) { panelOpen = id; document.exitPointerLock(); show('panel'); renderPanel(true); }
function closePanel() { panelOpen = null; show(''); lockPointer(); }
$('pClose').onclick = closePanel;
function renderPanel(force) {
  if (!snap) return;
  const hash = panelOpen + JSON.stringify([snap.cr, snap.up, snap.mi && snap.mi.label, Math.round(snap.ship.hull), snap.fi.length, snap.qs && snap.qs.map(q => q.s + q.p)]);
  if (!force && hash === panelHash) return; panelHash = hash;
  $('pCr').textContent = snap.cr;
  const B = $('pBody');
  if (panelOpen === 'npc') { npcPanel(B); return; }
  if (panelOpen === 'shop') {
    $('pTitle').textContent = 'Магазин улучшений';
    B.innerHTML = '<div class="grid">' + Object.keys(SHOPDEF).map(k => {
      const [ic, nm, ds] = SHOPDEF[k], lvl = snap.up[k], max = SHOPMAX[k], price = Math.round(SHOPBASE[k] * Math.pow(1.55, lvl));
      const can = lvl < max && snap.cr >= price;
      return `<div class="it"><div class="row" style="justify-content:space-between"><span class="ico" style="background:linear-gradient(160deg,#ffb067,#d95f22)">${icon(ic, '#2a1404')}</span><div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div><div class="nm">${nm}</div><div class="ds">${ds}</div><button class="btn${can ? '' : ' ghost'}" data-buy="${k}" ${lvl >= max ? 'disabled' : ''}>${lvl >= max ? 'МАКС' : '◆ ' + price}</button></div>`;
    }).join('') + '</div>';
    B.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => send({ t: 'buy', k: b.dataset.buy }));
  } else if (panelOpen === 'repair') {
    $('pTitle').textContent = 'Ремонтный док';
    const miss = Math.max(0, snap.ship.hm - snap.ship.hull), cost = Math.ceil(miss * 0.6);
    B.innerHTML = `<div class="it" style="max-width:520px"><span class="ico" style="background:linear-gradient(160deg,#ffe08a,#d9a422)">${icon('wrench', '#2a1404')}</span><div class="nm">Корпус: ${Math.round(snap.ship.hull)} / ${snap.ship.hm}</div><div class="ds">Бригада дока залатает корпус и потушит все пожары на борту. Пожаров сейчас: ${snap.fi.length}.</div><button class="btn" id="doRep" ${miss <= 0 && !snap.fi.length ? 'disabled' : ''}>${miss <= 0 && !snap.fi.length ? 'Всё целое' : 'Починить за ◆ ' + cost}</button></div>`;
    const b = $('doRep'); if (b) b.onclick = () => send({ t: 'repairship' });
  } else if (panelOpen === 'med') {
    $('pTitle').textContent = 'Медотсек';
    B.innerHTML = `<div class="it" style="max-width:520px"><span class="ico" style="background:linear-gradient(160deg,#b4ffd2,#3fd98a)">${icon('med', '#05281a')}</span><div class="nm">Полное лечение экипажа</div><div class="ds">Бесплатно. Погибшие возрождаются при каждой стыковке.</div><button class="btn teal" id="doHeal">Вылечить</button></div>`;
    $('doHeal').onclick = () => send({ t: 'heal' });
  } else if (panelOpen === 'missions') {
    $('pTitle').textContent = 'Терминал миссий · Сектор ' + snap.sec;
    if (snap.mi) {
      B.innerHTML = `<div class="it" style="max-width:560px"><span class="ico" style="background:linear-gradient(160deg,#a8fbff,#2bb7c7)">${icon('target', '#05282c')}</span><div class="nm">Текущая: ${esc(snap.mi.label)}</div><div class="ds">${snap.mi.done ? 'Выполнено! Награда выдаётся при стыковке.' : 'Пилот — за штурвал и <b>G</b> для отстыковки. Напарник — к турели.'}</div></div>`;
    } else {
      const ic = { clear: 'clear', nests: 'nest', defend: 'defend', boss: 'boss' };
      B.innerHTML = '<div class="mis">' + snap.of.map((o, i) => `<div class="it"><span class="ico" style="background:linear-gradient(160deg,${o.type === 'boss' ? '#ff9fb0,#e0435a' : '#a8fbff,#2bb7c7'})">${icon(ic[o.type], '#1a0b10')}</span><div class="nm">${esc(o.label)}</div><div class="ds">${esc(o.desc)}</div><div class="row" style="justify-content:space-between"><b style="font-family:Unbounded;color:var(--orange2)">+◆ ${o.reward}</b><button class="btn" data-mi="${i}">Взять</button></div></div>`).join('') + '</div><p class="hint" style="margin-top:12px">Сложность растёт с каждым сектором. Каждый 3-й сектор — босс.</p>';
      B.querySelectorAll('[data-mi]').forEach(b => b.onclick = () => { send({ t: 'mission', i: +b.dataset.mi }); setTimeout(closePanel, 200); });
    }
  }
}

// ---------- пилотирование ----------
const _dq = new THREE.Quaternion(), _e = new THREE.Euler();
function updatePilot(dt) {
  const u = upg();
  stick.multiplyScalar(Math.exp(-dt * 2.4));
  const roll = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  const tw = V3(-stick.y * 1.35, -stick.x * 1.55, roll * 2.0);
  PS.w.lerp(tw, 1 - Math.exp(-dt * 5));
  _e.set(PS.w.x * dt, PS.w.y * dt, PS.w.z * dt, 'XYZ'); _dq.setFromEuler(_e); PS.q.multiply(_dq).normalize();
  if (keys.KeyW) PS.thr = Math.min(1, PS.thr + dt * 0.8); if (keys.KeyS) PS.thr = Math.max(-0.3, PS.thr - dt * 0.8);
  const boosting = keys.ShiftLeft && PS.boost > 0 && PS.thr > 0.1;
  PS.boost = clamp(PS.boost + (boosting ? -32 : 14) * dt, 0, 100);
  const maxS = 105 * (1 + 0.15 * u.engine) * (boosting ? 1.9 : 1);
  // ньютоновский полёт с ассистом: вдоль носа — тяга, поперёк — занос, который гасится не сразу
  const fwd = V3(0, 0, -1).applyQuaternion(PS.q), up = V3(0, 1, 0).applyQuaternion(PS.q), right = V3(1, 0, 0).applyQuaternion(PS.q);
  const vf = PS.v.dot(fwd), vu = PS.v.dot(up), vr = PS.v.dot(right);
  const nf = vf + (PS.thr * maxS - vf) * (1 - Math.exp(-dt * (boosting ? 1.8 : 1.1)));
  const strafeU = ((keys.Space ? 1 : 0) - (keys.KeyC ? 1 : 0)) * 38, strafeR = ((keys.KeyQ ? -1 : 0) + (keys.KeyZ ? 1 : 0)) * 0;
  const drift = Math.exp(-dt * 0.9);
  const nu = strafeU ? vu + (strafeU - vu) * (1 - Math.exp(-dt * 2.5)) : vu * drift, nr = vr * drift + strafeR;
  PS.v.copy(fwd.multiplyScalar(nf)).addScaledVector(up, nu).addScaledVector(right, nr);
  PS.p.addScaledVector(PS.v, dt);
  PS.boosting = boosting;
  PS.acc = PS.acc || V3(); PS.prevV = PS.prevV || PS.v.clone();
  PS.acc.copy(PS.v).sub(PS.prevV).divideScalar(Math.max(dt, 1e-3)); PS.prevV.copy(PS.v);
  // столкновения
  PS.ramCd -= dt;
  const bump = (c, r) => { const d = PS.p.clone().sub(c), l = d.length(); if (l < r) { d.normalize(); PS.p.copy(c).addScaledVector(d, r); const vn = PS.v.dot(d); if (vn < 0) { const spd = -vn; PS.v.addScaledVector(d, -vn * 1.5); if (spd > 18 && PS.ramCd <= 0) { PS.ramCd = 0.6; send({ t: 'ram', d: Math.round(spd * 0.3) }); shake = 1.2; PS.w.add(V3((Math.random() - 0.5) * spd * 0.04, (Math.random() - 0.5) * spd * 0.04, (Math.random() - 0.5) * spd * 0.06)); sfx.hit(true); fx.burst(PS.p.clone().addScaledVector(d, -r + 4), 30, new THREE.Color(0xffc080), 30, 0.6, 1.2, 1, 2); } } } };
  for (const r of space.rocks) if (Math.abs(r.p.x - PS.p.x) < r.r + 12 && Math.abs(r.p.z - PS.p.z) < r.r + 12) bump(r.p, r.r + 7);
  bump(V3(), 63);
  { const rr = Math.hypot(PS.p.x, PS.p.y) - 140, dz = PS.p.z; if (Math.hypot(rr, dz) < 21) { const a = Math.atan2(PS.p.y, PS.p.x); bump(V3(Math.cos(a) * 140, Math.sin(a) * 140, 0), 21); } }
  if (PS.p.length() > 2800) PS.v.addScaledVector(PS.p.clone().normalize(), -60 * dt);
}

// ---------- HUD ----------
const markPool = [];
function marker(i) { if (!markPool[i]) { const d = document.createElement('div'); d.className = 'mk'; d.innerHTML = '<div class="d"></div><span></span>'; $('marks').appendChild(d); markPool[i] = d; } return markPool[i]; }
const _pv = V3();
function placeMark(i, wp, text, color, cls) {
  const d = marker(i); _pv.copy(wp).project(camera);
  const behind = _pv.z > 1;
  let x = _pv.x, y = _pv.y; if (behind) { x = -x; y = -y; }
  const edge = behind || Math.abs(x) > 0.95 || Math.abs(y) > 0.9;
  if (edge) { const m = Math.max(Math.abs(x) / 0.95, Math.abs(y) / 0.9); x /= m; y /= m; }
  d.style.display = 'flex'; d.className = 'mk ' + (cls || ''); d.style.color = color;
  d.style.left = ((x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - y) / 2 * innerHeight) + 'px';
  d.lastChild.textContent = text; d.style.opacity = edge ? 0.7 : 1;
}
function updateHUD(dt) {
  if (!snap) return;
  const s = snap.ship;
  const setBar = (b, t, v, m, lab) => { $(b).style.width = clamp(v / m * 100, 0, 100) + '%'; $(t).textContent = lab + ' ' + Math.round(v) + ' / ' + m; };
  setBar('bHull', 'tHull', s.hull, s.hm, 'КОРПУС'); setBar('bSh', 'tSh', s.sh, s.shm, 'ЩИТ'); setBar('bHp', 'tHp', me.hp, 100, me.down ? 'ЛЕЖИШЬ' : 'ЗДОРОВЬЕ');
  const def = snap.mi && snap.mi.type === 'defend' && snap.mi.act; $('stBar').style.display = def ? 'grid' : 'none'; if (def) setBar('bSt', 'tSt', snap.st.hp, snap.st.hm, 'СТАНЦИЯ');
  const mate = mateList()[0];
  $('mate').style.display = mate ? 'flex' : 'none';
  if (mate && mate.st) { $('mName').textContent = mate.st.n; $('mSt').innerHTML = mate.st.dd ? '<span style="color:var(--red)">погиб</span>' : mate.st.dn ? '<span style="color:var(--red)">ЛЕЖИТ — подними! ' + mate.st.bl + 'с</span>' : ({ pilot: 'за штурвалом', tl: 'левая турель', tr: 'правая турель' }[mate.st.s] || 'на ногах') + ' · ' + mate.st.hp + '♥'; }
  $('cr').textContent = snap.cr; $('sec').textContent = snap.sec;
  const mi = snap.mi; let t = '', p = '', pr = 0;
  if (!mi) { t = docked ? 'Выберите миссию' : 'Нет миссии'; p = docked ? 'Терминал в правом крыле станции (через шлюз)' : 'Вернитесь на станцию'; }
  else if (!mi.act) { t = mi.label; p = 'Пилот: G — отстыковка'; }
  else if (mi.done) { t = 'Миссия выполнена!'; p = 'Летите к доку станции и стыкуйтесь (G)'; pr = 1; }
  else { t = mi.label; pr = mi.prog / mi.goal; p = mi.type === 'defend' ? 'Держитесь: ' + Math.max(0, mi.goal - mi.prog) + ' с' : mi.type === 'boss' ? 'Убейте Матку' : mi.prog + ' / ' + mi.goal; }
  $('misT').textContent = t; $('misP').textContent = p; $('misB').style.width = (pr * 100) + '%';
  // метки
  let mi_ = 0;
  if (!docked) {
    placeMark(mi_++, DOCK_APPROACH, 'ДОК ' + Math.round(SH.group.position.distanceTo(DOCK_APPROACH)) + 'м', '#ffd05f');
    if (mi && mi.marks) for (const m of mi.marks) placeMark(mi_++, V3(...m), 'ГНЕЗДО ' + Math.round(SH.group.position.distanceTo(V3(...m))) + 'м', '#7dffb0');
    if (me.seat) for (const E of ENT.values()) { if (mi_ > 40) break; const d = E.o.group.position.distanceTo(SH.group.position); if (d < 900 || E.ty === 'bo') placeMark(mi_++, E.o.group.position, E.ty === 'bo' ? 'МАТКА ' + Math.round(E.hp / E.hm * 100) + '%' : E.ty === 'ne' ? Math.round(E.hp / E.hm * 100) + '%' : '', E.ty === 'bo' ? '#ff6fb5' : '#ff5a6a', E.ty === 'bo' || E.ty === 'ne' ? '' : 'en'); }
  }
  for (let i = mi_; i < markPool.length; i++) markPool[i].style.display = 'none';
  // прицелы
  const walking = !me.seat;
  $('cross').style.display = walking && !me.down ? 'block' : 'none';
  $('reticle').style.display = $('stick').style.display = me.seat === 'pilot' ? 'block' : 'none';
  $('tcross').style.display = me.seat === 'tl' || me.seat === 'tr' ? 'block' : 'none';
  if (me.seat === 'pilot') { $('stick').style.transform = `translate(${stick.x * 75}px,${stick.y * 75 * (SET.inv ? -1 : 1)}px)`; }
  $('flight').style.display = me.seat === 'pilot' ? 'flex' : 'none';
  if (me.seat === 'pilot') { const sp = PS.active ? PS.v.length() : 0; $('spd').textContent = Math.round(sp); $('thr').style.width = Math.max(0, PS.thr * 100) + '%'; $('boost').textContent = Math.round(PS.boost); $('rk').textContent = upg().rockets ? (PS.rkCd > 0 ? PS.rkCd.toFixed(1) : 'ГОТОВ') : '—'; }
  // урон
  dmgFlash = Math.max(0, dmgFlash - dt * 1.8); shieldFlash = Math.max(0, shieldFlash - dt * 3);
  const lowHp = me.hp < 35 && !me.dead ? 0.35 + Math.sin(now() * 6) * 0.1 : 0;
  $('dmg').style.boxShadow = `inset 0 0 ${120 + dmgFlash * 160}px rgba(255,40,60,${Math.max(dmgFlash * 0.8, lowHp)})` + (shieldFlash ? `, inset 0 0 120px rgba(95,246,255,${shieldFlash * 0.5})` : '');
  $('downed').style.display = (me.down || me.dead) && phase === 'game' ? 'flex' : 'none';
  if (me.down) { $('downed').firstChild.textContent = 'ТЫ ЛЕЖИШЬ'; $('downHint').textContent = 'Напарник должен подойти и держать E. Осталось: ' + me.bleed + ' с'; }
  if (me.dead) { $('downed').firstChild.textContent = 'ТЫ ПОГИБ'; $('downHint').textContent = 'Возродишься, когда напарник пристыкуется к станции'; }
}

// ---------- кадр ----------
let last = now(), menuT = 0, frame = 0;
const CI = { init: false, q: new THREE.Quaternion(), p: new THREE.Vector3(), v: new THREE.Vector3(), ox: 0, oy: 0, oz: 0, roll: 0, pit: 0, fovK: 0 };
// отражения окружения: металл блестит сильнее, интерьер — мягко
scene.traverse(o => { if (o.material && o.material.isMeshStandardMaterial && !SH.hull.getObjectById(o.id)) o.material.envMapIntensity = o.material.metalness > 0.3 ? 0.9 : 0.35; });
SH.inner.traverse(o => { if (o.material && o.material.isMeshStandardMaterial && o.material !== MAT_GLASS()) o.material.envMapIntensity = o.material.metalness > 0.5 ? 0.45 : 0.15; });
function MAT_GLASS() { return SH.inner.children.find(c => c.material && c.material.iridescence > 0)?.material; }
const camWorld = V3();
function loop() {
  requestAnimationFrame(loop);
  const t = now(), dt = Math.min(0.05, t - last); last = t; frame++;
  if (phase === 'game') gameFrame(dt, t); else menuFrame(dt, t);
  // окружение
  station.ring.rotation.z += dt * 0.04; station.dockRing.rotation.z -= dt * 0.5;
  SH.holo.rotation.y += dt * 0.8; SH.holo.rotation.x += dt * 0.3;
  SH.strobes.forEach((s, i) => { const ph = (t * (i < 2 ? 1 : 0.7) + i * 0.25) % 1; s.material.opacity = ph < 0.08 ? 1 : (i < 2 ? 0.35 : 0); });
  SH.reactor.material.emissiveIntensity = 2.3 + Math.sin(t * 3) * 0.5;
  camera.getWorldPosition(camWorld);
  const dp = space.dust.geometry.attributes.position, a = dp.array;
  for (let i = 0; i < a.length; i += 3) { for (let k = 0; k < 3; k++) { const c = k ? (k === 1 ? camWorld.y : camWorld.z) : camWorld.x; let r = a[i + k] - c; if (r > 200) a[i + k] -= 400; else if (r < -200) a[i + k] += 400; } }
  dp.needsUpdate = true;
  space.stars.position.copy(camWorld); space.nebula.position.copy(camWorld);
  fx.update(dt); fxN.update(dt); fxS.update(dt); fxSN.update(dt);
  debris.update(dt, fxN); flashes.update(dt); dmgNums.update(dt, camera);
  flare.update(camera, phase === 'game' ? (me.seat ? 1 : 0.12) : 1);
  composer.render(dt);
}
function menuFrame(dt, t) {
  menuT += dt;
  SH.hull.visible = true; SH.halls.visible = false; vm.group.visible = false; station.cradles.visible = false;
  SH.group.position.lerp(DOCK_P.clone().add(V3(0, Math.sin(t * 0.6) * 0.4, 0)), 0.1); SH.group.quaternion.set(0, 1, 0, 0);
  // кинематографичный кадр: 3/4 спереди, медленный облёт, корабль справа от меню
  const a = -2.45 + Math.sin(menuT * 0.045) * 0.42;
  const dist = 25 + Math.sin(menuT * 0.07) * 2;
  camera.position.set(Math.sin(a) * dist, 4.5 + Math.sin(menuT * 0.09) * 1.5, Math.cos(a) * dist + 1);
  camera.lookAt(SH.group.localToWorld(V3(0, 0.6, 0.5)));
  camera.rotateY(innerWidth > 900 ? 0.26 : 0); camera.rotateZ(Math.sin(menuT * 0.06) * 0.03);
  const co = window.__camOverride; if (co) { camera.position.set(...co.p); camera.lookAt(SH.group.localToWorld(V3(...co.l))); }
  updateEngines(window.__engPow ?? 0.32, window.__engBoost ?? 0, t, dt);
  setEngine(0, false, false);
}
function gameFrame(dt, t) {
  if (!snap) return;
  const age = t - snapT;
  // корабль
  const pilotActive = me.seat === 'pilot' && !snap.ship.dk && !snap.ship.dg && !me.down;
  if (pilotActive && !PS.active) { PS.active = true; PS.p.copy(SH.group.position); PS.q.copy(SH.group.quaternion); PS.v.set(...snap.ship.v); PS.w.set(0, 0, 0); if (PS.v.length() > 1) PS.thr = 0.3; }
  if (!pilotActive) PS.active = false;
  if (PS.active) {
    if (!chatOpen) updatePilot(dt); else { PS.p.addScaledVector(PS.v, dt); }
    SH.group.position.copy(PS.p); SH.group.quaternion.copy(PS.q);
    if (t - lastShip > 0.05) { lastShip = t; send({ t: 'ship', p: PS.p.toArray().map(r2), q: PS.q.toArray().map(x => Math.round(x * 1e5) / 1e5), v: PS.v.toArray().map(r2) }); }
  } else {
    const tp = V3(...snap.ship.p).addScaledVector(V3(...snap.ship.v), Math.min(age, 0.25));
    const k = 1 - Math.exp(-dt * 14);
    if (SH.group.position.distanceTo(tp) > 60) SH.group.position.copy(tp); else SH.group.position.lerp(tp, k);
    SH.group.quaternion.slerp(new THREE.Quaternion(...snap.ship.q), k);
  }
  const shipSpeed = PS.active ? PS.v.length() : Math.hypot(...snap.ship.v);
  const thr = PS.active ? Math.max(0, PS.thr) * (PS.boosting ? 1.8 : 1) : clamp(shipSpeed / 110, 0, 1.8);
  const engPow = docked ? 0.06 : PS.active ? Math.max(0.1, PS.thr) : clamp(shipSpeed / 110, 0.1, 1);
  const engBoost = PS.active ? (PS.boosting ? 1 : 0) : (shipSpeed > 140 ? 1 : 0);
  CI.eb = (CI.eb || 0) + (engBoost - (CI.eb || 0)) * Math.min(1, dt * 5);
  updateEngines(engPow, CI.eb, t, dt);
  if (!docked) emitExhaust(engPow, CI.eb > 0.5, dt);
  SH.hallLights.forEach(l => l.intensity = docked ? 3.5 : 0);
  setEngine(Math.min(1, thr), PS.boosting, !docked);
  // локальный игрок
  if (!me.seat && !me.down && !me.dead && !panelOpen) updateWalk(dt); else me.moving = false;
  updateInteract(dt);
  fireWeapons(dt);
  // камера
  const inTurret = me.seat === 'tl' || me.seat === 'tr';
  SH.hull.visible = inTurret; station.cradles.visible = inTurret; SH.halls.visible = docked;
  for (const id in SH.turretSeats) SH.turretSeats[id].visible = me.seat !== id; // своё кресло не лезет в кадр
  vm.group.visible = !me.seat && !me.down && !me.dead;
  camera.rotation.order = 'YXZ';
  // инерция экипажа: корабль крутится и ускоряется — тело и голову ведёт следом
  const sq = SH.group.quaternion, sp_ = SH.group.position;
  if (!CI.init) { CI.q.copy(sq); CI.p.copy(sp_); CI.init = true; }
  const dqi = CI.q.clone().invert().multiply(sq); const w = V3(dqi.x, dqi.y, dqi.z).multiplyScalar(2 / Math.max(dt, 1e-3));
  const vel = sp_.clone().sub(CI.p).divideScalar(Math.max(dt, 1e-3));
  const accL = vel.clone().sub(CI.v).divideScalar(Math.max(dt, 1e-3)).applyQuaternion(sq.clone().invert());
  CI.q.copy(sq); CI.p.copy(sp_); CI.v.copy(vel);
  if (docked || accL.length() > 2000) accL.set(0, 0, 0);
  const kS = 1 - Math.exp(-dt * 5);
  CI.ox += (clamp(-accL.x * 0.0016, -0.16, 0.16) - CI.ox) * kS; CI.oy += (clamp(-accL.y * 0.0016, -0.12, 0.12) - CI.oy) * kS; CI.oz += (clamp(-accL.z * 0.0018, -0.2, 0.2) - CI.oz) * kS;
  CI.roll += (clamp(w.z * 0.06 + w.y * 0.05, -0.12, 0.12) - CI.roll) * kS; CI.pit += (clamp(w.x * 0.04, -0.08, 0.08) - CI.pit) * kS;
  if (!docked) emitRCS(w, PS.active ? ((keys.Space ? 1 : 0) - (keys.KeyC ? 1 : 0)) : 0, dt);
  camKick *= Math.exp(-dt * 14); me.land = Math.max(0, (me.land || 0) - dt * 4);
  let shx = 0, shy = 0;
  shake = Math.max(0, shake - dt * 2.2); if (SET.shake && shake > 0) { shx = (Math.random() - 0.5) * shake * 0.12; shy = (Math.random() - 0.5) * shake * 0.12; }
  if (me.down || me.dead) { camera.position.set(me.p.x, 0.35, me.p.z); camera.rotation.set(0.2, me.yaw, 0.6 + Math.sin(t * 1.3) * 0.05); }
  else if (me.seat === 'pilot') {
    const c = SEATS.pilot.cam; camera.position.set(c[0] + shx + CI.ox * 0.6, c[1] + shy + CI.oy * 0.6, c[2] - CI.oz * 0.8);
    camera.rotation.set(-0.04 + PS.w.x * 0.03 + camKick, PS.w.y * 0.04, PS.w.z * 0.04);
    SH.stickTop.position.set(0.38 + stick.x * 0.08, 1.02, -8.05 + stick.y * 0.08);
  }
  else if (inTurret) { const s = SEATS[me.seat], c = s.cam; camera.position.set(c[0] + shx + CI.ox * 0.5, c[1] + shy + CI.oy * 0.5, c[2] - CI.oz * 0.5); camera.rotation.set(me.tpitch + camKick + CI.pit * 0.5, s.yaw + me.tyaw, CI.roll * 0.6); }
  else {
    const bobAmt = clamp(((me.vel && me.vel.length()) || 0) / 4.3, 0, 1.5);
    const ph = t * (keys.ShiftLeft ? 13 : 10);
    const bob = me.y <= 0 ? Math.sin(ph) * 0.045 * bobAmt : 0, sway = Math.cos(ph * 0.5) * 0.03 * bobAmt;
    camera.position.set(me.p.x + shx + CI.ox, 1.62 + me.y + bob + shy + CI.oy - me.land * 0.18, me.p.z - CI.oz);
    camera.rotation.set(me.pitch + CI.pit - me.land * 0.06, me.yaw, CI.roll + sway * 0.4 - (me.vel ? (me.vel.x * Math.cos(me.yaw) - me.vel.y * Math.sin(me.yaw)) * 0.006 : 0));
    vm.group.position.set(sway + Math.cos(t * 1.6) * 0.004, bob * 0.5 + Math.sin(t * 1.6) * 0.004 + (me.tool ? 0.04 : 0) - me.land * 0.05 + CI.oy * 0.3, (me.tool ? -0.05 : 0) - CI.oz * 0.3);
    vm.group.rotation.set(CI.pit * 0.5, 0, CI.roll * 0.5);
    vm.r.rotation.x = me.tool ? -0.12 + Math.sin(t * 40) * 0.012 : 0; vm.r.position.z = -0.5 + (me.tool ? 0.02 + Math.random() * 0.006 : 0);
    vm.trigger.rotation.x = me.tool ? 0.65 : 0.3; vm.tip.material.emissiveIntensity = me.tool ? 3 + Math.sin(t * 30) * 1.2 : 1.4; vm.coils.forEach((c, i) => c.rotation.z = t * (me.tool ? 12 : 1) * (i % 2 ? -1 : 1));
    vm.tip.scale.setScalar(me.tool ? 1.5 + Math.random() * 0.4 : 1);
  }
  // FOV и эффекты скорости
  const boostK = PS.active && PS.boosting ? 1 : 0;
  CI.fovK += (boostK - CI.fovK) * Math.min(1, dt * 3);
  const wantFov = SET.fov + CI.fovK * 10 + clamp((shipSpeed - 110) / 20, 0, 4);
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
  finalPass.uniforms.uTime.value = t % 100; finalPass.uniforms.uSpeed.value = CI.fovK * (me.seat ? 1 : 0.3);
  finalPass.uniforms.uHurt.value = Math.max(dmgFlash * 0.8, me.hp < 30 && !me.dead ? 0.35 + Math.sin(t * 5) * 0.15 : 0);
  hitmT -= dt; if (hitmT <= 0) hitm.style.opacity = 0;
  camera.updateMatrixWorld();
  // турели смотрят туда же, куда стрелок
  for (const id of ['tl', 'tr']) {
    const piv = SH.turretGuns[id];
    if (!piv.userData.base) piv.userData.base = piv.position.clone();
    piv.position.copy(piv.userData.base);
    if (me.seat === id) piv.lookAt(camera.localToWorld(V3(0, 0, -300)));
    else { const m = mateList().find(m => m.st && m.st.s === id); if (m) { const yaw = SEATS[id].yaw + m.st.y, pi = m.st.pi; const d = V3(-Math.sin(yaw) * Math.cos(pi), Math.sin(pi), -Math.cos(yaw) * Math.cos(pi)); piv.lookAt(SH.group.localToWorld(piv.position.clone().addScaledVector(d, 300))); } }
    // отдача ствола
    const rc = piv.userData.recoil || 0; if (rc > 0) { piv.translateZ(-rc * 0.35); piv.userData.recoil = Math.max(0, rc - dt * 12); }
  }
  // рычаг тяги в кабине
  if (SH.throttle) SH.throttle.rotation.x = -0.6 + Math.max(0, PS.active ? PS.thr : 0) * 1.1;
  // шлюзы
  updateDoors(dt, t);
  for (const id in SH.terminals) SH.terminals[id].holo.rotation.y += dt * 1.2;
  updateStation(dt, t);
  // напарник
  for (const a of mates.values()) {
    const st = a.st; if (!st) continue;
    a.group.visible = !st.dd;
    let tp = V3(...st.p), yaw = st.y;
    if (st.s) { const s = SEATS[st.s]; tp = V3(...s.p); yaw = s.yaw; if (st.s === 'pilot') tp.z += 0.05; }
    a.group.position.lerp(tp, 1 - Math.exp(-dt * 12));
    let dy = yaw - a.yawS; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yawS += dy * Math.min(1, dt * 12); a.group.rotation.y = a.yawS;
    a.pose({ mv: st.mv && !st.s, seat: st.s, down: st.dn, tool: st.tl, pitch: st.pi }, dt);
    if (st.tl && !st.s) { const wp = a.group.localToWorld(V3(0.42, 1.3, -0.8)); const lp = SH.group.worldToLocal(wp); const d = V3(-Math.sin(a.yawS), 0, -Math.cos(a.yawS)); fxSN.emit(lp.x, lp.y, lp.z, d.x * 5 + (Math.random() - 0.5), (Math.random() - 0.5), d.z * 5 + (Math.random() - 0.5), new THREE.Color(0xeef6ff), 0.5, 0.18, 2.5, 3); }
  }
  // твари
  const shipPos = SH.group.position;
  let near = 0;
  for (const E of ENT.values()) {
    const tp = E.sp.clone().addScaledVector(E.sv, Math.min(age, 0.3));
    const g = E.o.group;
    if (!E.init) { g.position.copy(tp); E.init = true; } else g.position.lerp(tp, 1 - Math.exp(-dt * 10));
    animateCreature(E.o, dt, E.sv, shipPos, E.st);
    if (g.position.distanceTo(shipPos) < 700) near++;
  }
  setIntensity(near > 0 && !docked ? 1 : 0);
  for (const P of EPJ.values()) { P.mesh.position.copy(P.sp).addScaledVector(P.sv, age); if (Math.random() < dt * 20) fx.emit(P.mesh.position.x, P.mesh.position.y, P.mesh.position.z, 0, 0, 0, new THREE.Color(0xff5fb0), 0.4, 1.5 * P.mesh.scale.x, 0, 0); }
  for (const L of LOOT.values()) { L.mesh.position.lerp(L.tp, 1 - Math.exp(-dt * 8)); L.mesh.rotation.y += dt * 3; L.mesh.rotation.x += dt; }
  updateBolts(dt);
  updateFires(dt, t);
  updateHUD(dt); updateQuestHud();
  // отправка аватара
  if (t - lastAv > 0.05) {
    lastAv = t;
    const yaw = me.seat && me.seat !== 'pilot' ? me.tyaw : me.yaw, pi = me.seat && me.seat !== 'pilot' ? me.tpitch : me.pitch;
    const sp = me.seat ? SEATS[me.seat].p : [me.p.x, 0, me.p.z];
    send({ t: 'av', p: [r2(sp[0]), 0, r2(sp[2])], y: r2(yaw), pi: r2(pi), mv: me.moving ? 1 : 0, tl: me.tool ? 1 : 0 });
  }
}

// ---------- старт ----------
window.__g = { me, PS, send, SH, keys, stick, mouse, ENT, tick: (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) { if (phase === "game") gameFrame(dt, now()); } fx.update(dt); fxN.update(dt); fxS.update(dt); fxSN.update(dt); composer.render(dt); } };
// ---------- мост к админке (admin.html в соседней вкладке того же браузера) ----------
const adminCh = 'BroadcastChannel' in window ? new BroadcastChannel('dvp-admin') : null;
const godBadge = document.createElement('div');
godBadge.textContent = 'РЕЖИМ БОГА'; godBadge.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:9;font:900 13px Unbounded,sans-serif;letter-spacing:.2em;color:#ffd05f;background:rgba(40,30,0,.7);border:1px solid #ffd05f;border-radius:12px;padding:6px 14px;display:none;pointer-events:none';
document.body.appendChild(godBadge);
function adminState() {
  return { t: 'state', phase, host: amHost(), net: NET, name: myName, room: roomCode,
    cr: snap ? snap.cr : null, sec: snap ? snap.sec : null, god: snap ? !!snap.god : false, docked,
    hull: snap ? Math.round(snap.ship.hull) : null, hm: snap ? snap.ship.hm : null, en: snap ? snap.en.length : 0,
    mi: snap && snap.mi ? snap.mi.label + (snap.mi.done ? ' ✓' : snap.mi.act ? ' (' + snap.mi.prog + '/' + snap.mi.goal + ')' : '') : null };
}
if (adminCh) {
  adminCh.onmessage = e => {
    const m = e.data || {};
    if (m.t === 'ping') return adminCh.postMessage(adminState());
    if (m.t !== 'cmd') return;
    if (!amHost()) return; // командует только вкладка хоста (вкладка друга молчит)
    if (phase !== 'game') return adminCh.postMessage({ t: 'ack', ok: false, msg: 'Игра не запущена — нажми «Старт» в лобби' });
    send({ t: 'admin', cmd: m.cmd, v: m.v });
    adminCh.postMessage({ t: 'ack', ok: true, msg: 'Отправлено: ' + m.cmd });
  };
  setInterval(() => { try { adminCh.postMessage(adminState()); } catch { } godBadge.style.display = phase === 'game' && snap && snap.god ? 'block' : 'none'; }, 500);
}

// прогрев: всё, что может появиться в бою, компилируется сейчас, а не посреди перестрелки (иначе фризы)
function prewarm() {
  const tmp = [], base = camera.getWorldPosition(V3()).add(V3(0, 0, -60));
  for (const ty of ['sw', 'je', 'wo', 'ne', 'bo']) { const o = makeCreature(ty); o.group.position.copy(base); scene.add(o.group); tmp.push(o.group); }
  for (const c of Object.values(CREATURE_COLORS)) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), debris.mat(c)); m.position.copy(base); scene.add(m); tmp.push(m); }
  const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); fl.position.copy(base); scene.add(fl); tmp.push(fl);
  for (const k of ['nose', 'tur', 'rk']) spawnBolt(base.clone(), V3(0, 0, -1), k, false);
  const f1 = makeFire(0, 'fire'), f2 = makeFire(1, 'breach');
  const hv = SH.halls.visible, hh = SH.hull.visible, cv = station.cradles.visible;
  SH.halls.visible = true; SH.hull.visible = true; station.cradles.visible = true;
  try { renderer.compile(scene, camera); } catch (e) { console.warn(e); }
  SH.halls.visible = hv; SH.hull.visible = hh; station.cradles.visible = cv;
  for (const o of tmp) scene.remove(o);
  for (const b of bolts) scene.remove(b.mesh); bolts.length = 0;
  SH.inner.remove(f1.g); SH.inner.remove(f2.g);
}
prewarm();
connect();
$('whoName').textContent = myName;
setTimeout(() => { $('loading').style.display = 'none'; show(myName ? 'sMenu' : 'sName'); if (!myName) $('nameIn').focus(); }, 300);
loop();
