// ДВОЕ В ПУСТОТЕ — сервер (лобби + авторитетная симуляция тварей)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn: cpSpawn } = require('child_process');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 3000;
// на хостинге (Render) — без туннелей, браузера и локальных адресов
const ON_HOSTING = !!(process.env.RENDER || process.env.HOSTED);
const PUB = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

// сжатие: через медленный туннель файлы летят в 4-5 раз быстрее
const zlib = require('zlib');
const gzCache = new Map();
const server = http.createServer((req, res) => {
  let u; try { u = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (u === '/__dvp') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('node'); }
  let base = PUB, rel = u;
  const isLib = u.startsWith('/three/');
  if (isLib) { base = THREE_DIR; rel = u.slice(6); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const fp = path.normalize(path.join(base, rel));
  if (!fp.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.stat(fp, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    const headers = { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': isLib ? 'public, max-age=604800' : 'no-cache', 'Vary': 'Accept-Encoding' };
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /\.(js|html|css|json|svg)$/.test(fp);
    const key = fp + ':' + st.mtimeMs;
    if (gz && gzCache.has(key)) { headers['Content-Encoding'] = 'gzip'; res.writeHead(200, headers); return res.end(gzCache.get(key)); }
    fs.readFile(fp, (e2, d) => {
      if (e2) { res.writeHead(404); return res.end('404'); }
      if (gz) { const z = zlib.gzipSync(d, { level: 9 }); gzCache.set(key, z); headers['Content-Encoding'] = 'gzip'; res.writeHead(200, headers); return res.end(z); }
      res.writeHead(200, headers); res.end(d);
    });
  });
});
const wss = new WebSocketServer({ server, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 6 } } });

// ---------- math ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = a => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => len(sub(a, b));
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rnd = (a, b) => a + Math.random() * (b - a);
const rdir = () => { const z = rnd(-1, 1), t = rnd(0, Math.PI * 2), r = Math.sqrt(1 - z * z); return [r * Math.cos(t), z * 0.6, r * Math.sin(t)]; };
function qrot(v, q) { // rotate vector v by quaternion q [x,y,z,w]
  const [x, y, z] = v, [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}
const r1 = x => Math.round(x * 10) / 10;
const r3 = a => [r1(a[0]), r1(a[1]), r1(a[2])];

// ---------- constants ----------
const TICK = 30, DT = 1 / TICK;
const DOCK_P = [0, 0, 230], DOCK_APPROACH = [0, 0, 265];
const STATION_P = [0, 0, 0];
const FIRE_SLOTS = [[0, 0, -8.2], [1.4, 0, -6.2], [0, 0, -3.2], [-2.2, 0, -0.6], [2.2, 0, 2.6], [0, 0, 1], [0, 0, 4.8], [-2.1, 0, 7.2], [2.1, 0, 9.6], [0, 0, 9.2]];
const SHIP_SPH = [[0, 1, -6], [0, 1, 0], [0, 1, 6]];
const SHOP = {
  gun: { base: 120, max: 5 }, rate: { base: 120, max: 5 }, hull: { base: 100, max: 5 }, shield: { base: 140, max: 5 },
  engine: { base: 90, max: 4 }, magnet: { base: 60, max: 4 }, fireproof: { base: 110, max: 4 }, rockets: { base: 200, max: 3 },
  repair: { base: 80, max: 4 }, medbay: { base: 120, max: 4 },
};
const price = (k, lvl) => Math.round(SHOP[k].base * Math.pow(1.55, lvl));

// ---------- state ----------
let nextId = 1;
const players = new Map();
let S = null; // game state
let phase = 'lobby';
let publicUrl = null;
let events = [];
const ev = e => events.push(e);
const toast = (m, c) => ev({ k: 'toast', m, c: c || '' });

function newGame() {
  S = {
    t: 0, sector: 1, credits: 150, kills: 0, startTime: Date.now(),
    ship: { p: DOCK_P.slice(), q: [0, 1, 0, 0], v: [0, 0, 0], hull: 300, sh: 60, docked: true, docking: null, lastHit: -99 },
    up: Object.fromEntries(Object.keys(SHOP).map(k => [k, 0])),
    enemies: [], ep: [], loot: [], fires: [],
    station: { hp: 1500, hm: 1500 },
    mission: null, offers: [], waveT: 0,
    doors: [false, false], // шлюзы: [левый, правый]
    quests: [],
  };
  refreshQuests();
  S.offers = makeOffers(1);
  for (const p of players.values()) resetPlayer(p);
}
function resetPlayer(p) {
  Object.assign(p, { pos: [0, 0, 1.5], yaw: 0, pitch: 0, mv: 0, seat: null, tool: 0, hp: 100, down: false, dead: false, bleed: 0, rv: 0, lastDmg: -99 });
}
const hullMax = () => 300 + 70 * S.up.hull;
const shMax = () => 60 + 40 * S.up.shield;
const diff = () => 1 + 0.38 * (S.sector - 1);

function makeOffers(sec) {
  if (sec % 3 === 0) return [{ type: 'boss', label: 'Матка Пустоты', desc: 'Огромная тварь вылезла из разлома. Убейте её.', reward: 500 + sec * 120 }];
  return [
    { type: 'clear', label: 'Зачистка сектора', desc: 'Уничтожьте ' + (14 + sec * 6) + ' тварей.', goal: 14 + sec * 6, reward: 180 + sec * 60 },
    { type: 'nests', label: 'Выжечь гнёзда', desc: 'Найдите и сожгите ' + (2 + Math.floor(sec / 2)) + ' гнезда.', goal: 2 + Math.floor(sec / 2), reward: 240 + sec * 70 },
    { type: 'defend', label: 'Оборона станции', desc: 'Держите станцию ' + (80 + sec * 10) + ' секунд.', goal: 80 + sec * 10, reward: 220 + sec * 65 },
  ];
}

// ---------- задания NPC станции «Улей-7» ----------
const QUEST_GIVERS = {
  vors: { name: 'Капитан Ворс', mk: sec => ({ title: 'Медузья напасть', text: 'Медузы плюются кислотой по моим конвоям. Сбейте ' + (6 + sec * 2) + ' штук — заплачу как следует.', ty: 'je', goal: 6 + sec * 2, reward: 160 + sec * 60 }) },
  zina: { name: 'Механик Зина', mk: sec => ({ title: 'Глазастая мелочь', text: 'Эти летающие глаза лезут в вентиляцию станции. Убейте ' + (14 + sec * 4) + ' — и я в долгу не останусь.', ty: 'sw', goal: 14 + sec * 4, reward: 140 + sec * 55 }) },
  hlup: { name: 'Торговец Хлюп', mk: sec => ({ title: 'Червивый товар', text: 'Хлюп платить за зубы червей! Хлюп нужно ' + (2 + Math.ceil(sec / 2)) + ' червя. Быстро-быстро!', ty: 'wo', goal: 2 + Math.ceil(sec / 2), reward: 200 + sec * 70 }) },
};
function questFor(npc, sec) { const q = QUEST_GIVERS[npc].mk(sec); return Object.assign({ id: nextId++, npc, npcName: QUEST_GIVERS[npc].name, prog: 0, state: 'offer' }, q); }
function refreshQuests() { // у каждого NPC — одно задание; сданные заменяются новыми
  for (const npc of Object.keys(QUEST_GIVERS)) {
    const cur = S.quests.find(q => q.npc === npc);
    if (!cur || cur.state === 'claimed') { S.quests = S.quests.filter(q => q !== cur); S.quests.push(questFor(npc, S.sector)); }
  }
}

// ---------- enemies ----------
const EHP = { sw: 18, je: 90, wo: 170, ne: 750, bo: 5200 };
const ERAD = { sw: 3, je: 6, wo: 5, ne: 22, bo: 40 };
function spawn(type, p, o = {}) {
  const hm = Math.round(EHP[type] * (type === 'bo' ? (1 + 0.45 * (S.sector / 3 - 1)) : diff()) * (players.size > 1 ? 1.25 : 1));
  const e = { id: nextId++, type, p: p.slice(), v: [0, 0, 0], hp: hm, hm, cd: rnd(1, 3), st: 0, tm: rnd(3, 6), tgtStation: !!o.station, ph: rnd(0, 6) };
  S.enemies.push(e);
  return e;
}
function shoot(from, dir, speed, dmg, size) {
  S.ep.push({ id: nextId++, p: from.slice(), v: mul(norm(dir), speed), life: 7, dmg, s: size || 1 });
}
function targetOf(e) { return e.tgtStation ? STATION_P : S.ship.p; }
function steer(e, target, speed, accel) {
  const want = mul(norm(sub(target, e.p)), speed);
  const k = Math.min(1, accel * DT);
  e.v = add(e.v, mul(sub(want, e.v), k));
}
function lead(from, speed) {
  const sp = S.ship.p, d = dist(from, sp), t = d / speed;
  return add(sp, mul(S.ship.v, t * 0.8));
}
function hurtShip(d) {
  const sh = S.ship;
  if (sh.docked || sh.docking || phase !== 'game') return;
  sh.lastHit = S.t;
  const s = Math.min(sh.sh, d); sh.sh -= s; d -= s;
  ev({ k: 'hit', d: r1(d + s), sh: s > 0 && d <= 0 ? 1 : 0 });
  if (d > 0) {
    sh.hull -= d;
    const chance = d * 0.045 * (1 - 0.2 * S.up.fireproof);
    if (Math.random() < chance) spawnFire(d > 12 && Math.random() < 0.45 ? 'breach' : 'fire');
    if (sh.hull <= 0) { sh.hull = 0; gameOver('Корабль разорван на куски'); }
  }
}
function spawnFire(kind) {
  const free = FIRE_SLOTS.map((_, i) => i).filter(i => !S.fires.some(f => f.slot === i));
  if (!free.length) return;
  const slot = free[Math.floor(Math.random() * free.length)];
  S.fires.push({ id: nextId++, slot, kind, hp: 100 });
  toast(kind === 'fire' ? 'ПОЖАР НА БОРТУ!' : 'ПРОБОИНА! Утечка кислорода!', 'red');
}
function killEnemy(e) {
  S.enemies = S.enemies.filter(x => x !== e);
  S.kills++;
  for (const q of S.quests) if (q.state === 'active' && q.ty === e.type) { q.prog++; if (q.prog >= q.goal) { q.state = 'done'; toast('Задание «' + q.title + '» выполнено — вернитесь к ' + q.npcName, 'green'); ev({ k: 'done' }); } }
  const n = { sw: 1, je: 3, wo: 4, ne: 10, bo: 36 }[e.type], val = { sw: 6, je: 9, wo: 11, ne: 16, bo: 30 }[e.type];
  for (let i = 0; i < n; i++) S.loot.push({ id: nextId++, p: add(e.p, mul(rdir(), rnd(0, ERAD[e.type]))), v: mul(rdir(), rnd(5, 25)), val, life: 40 });
  ev({ k: 'boom', p: r3(e.p), s: ERAD[e.type], ty: e.type });
  const m = S.mission;
  if (m && m.active && !m.done) {
    if (m.type === 'clear') { m.prog++; if (m.prog >= m.goal) missionDone(); }
    if (m.type === 'nests' && e.type === 'ne') { m.prog++; if (m.prog >= m.goal) missionDone(); }
    if (m.type === 'boss' && e.type === 'bo') { m.prog = 1; missionDone(); }
  }
}
function missionDone() {
  S.mission.done = true;
  toast('Миссия выполнена! Возвращайтесь на станцию', 'green');
  ev({ k: 'done' });
}

function updateEnemy(e) {
  const dm = 1 + 0.2 * (S.sector - 1);
  const tgt = targetOf(e), d = dist(e.p, tgt);
  e.cd -= DT; e.tm -= DT; e.ph += DT;
  switch (e.type) {
    case 'sw': {
      const sp = 80 + S.sector * 4;
      const w = cross(norm(sub(tgt, e.p)), [0, 1, 0]);
      steer(e, add(tgt, mul(w, Math.sin(e.ph * 2) * Math.min(d * 0.4, 40))), sp, 2.4);
      const hitR = e.tgtStation ? 75 : 8;
      if (d < hitR) { if (e.tgtStation) hurtStation(9 * dm); else hurtShip(9 * dm); ev({ k: 'boom', p: r3(e.p), s: 3, ty: 'sw' }); S.enemies = S.enemies.filter(x => x !== e); }
      break;
    }
    case 'je': {
      const want = e.tgtStation ? 200 : 170;
      if (d > want + 50) steer(e, tgt, 30, 0.8);
      else if (d < want - 40) steer(e, add(e.p, sub(e.p, tgt)), 26, 0.8);
      else { const o = cross(norm(sub(tgt, e.p)), [0, 1, 0]); e.v = add(mul(e.v, 0.97), mul(o, 0.8)); }
      if (e.cd <= 0 && d < 420) {
        e.cd = rnd(2.4, 3.6) / Math.min(1.8, 1 + S.sector * 0.06);
        const aim = e.tgtStation ? STATION_P : lead(e.p, 120);
        const base = sub(aim, e.p);
        const n = S.sector >= 3 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const spread = n > 1 ? (i - 1) * 0.12 : 0;
          const side = norm(cross(base, [0, 1, 0]));
          shoot(e.p, add(norm(base), mul(side, spread)), 120, 9 * dm, 1);
        }
      }
      break;
    }
    case 'wo': {
      if (e.st === 0) { // circle
        const r = sub(e.p, tgt), o = norm(cross(r, [0, 1, 0]));
        const desired = add(tgt, add(mul(norm(r), 240), mul(o, 80)));
        steer(e, desired, 70, 1.2);
        if (e.tm <= 0) { e.st = 1; e.tm = 2.6; e.aim = e.tgtStation ? STATION_P : lead(e.p, 170); ev({ k: 'roar', p: r3(e.p) }); }
      } else if (e.st === 1) { // charge
        steer(e, e.aim, 175 + S.sector * 5, 3);
        const hitR = e.tgtStation ? 80 : 11;
        if (d < hitR) { if (e.tgtStation) hurtStation(25 * dm); else hurtShip(24 * dm); e.st = 2; e.tm = 2.2; e.v = mul(e.v, -0.6); }
        if (e.tm <= 0) { e.st = 0; e.tm = rnd(3, 5.5); }
      } else { steer(e, add(e.p, sub(e.p, tgt)), 60, 1); if (e.tm <= 0) { e.st = 0; e.tm = rnd(3, 5); } }
      break;
    }
    case 'ne': {
      e.v = [0, 0, 0];
      const ds = dist(e.p, S.ship.p);
      if (e.cd <= 0 && ds < 750) {
        e.cd = Math.max(2.5, 6 - S.sector * 0.35);
        const alive = S.enemies.filter(x => x.type === 'sw').length;
        if (alive < 14) for (let i = 0; i < 2; i++) spawn('sw', add(e.p, mul(rdir(), 26)));
      }
      if (e.tm <= 0 && ds < 520) {
        e.tm = 4;
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + e.ph; const dirTo = norm(sub(S.ship.p, e.p)); const side = norm(cross(dirTo, [0, 1, 0])), up = cross(side, dirTo); shoot(e.p, add(mul(dirTo, 1.4), add(mul(side, Math.cos(a)), mul(up, Math.sin(a)))), 95, 8 * dm, 1.2); }
      }
      break;
    }
    case 'bo': {
      const rage = e.hp < e.hm * 0.5;
      if (e.st !== 9) { if (d > 320) steer(e, tgt, 28, 0.5); else if (d < 200) steer(e, add(e.p, sub(e.p, tgt)), 22, 0.5); else e.v = mul(e.v, 0.97); }
      if (e.st === 9) { // charge
        steer(e, e.aim, rage ? 150 : 120, 1.5);
        if (d < 46) { hurtShip(40 * dm); e.st = 0; e.v = mul(e.v, -0.5); }
        if (e.tm <= 0) { e.st = 0; }
      }
      if (e.cd <= 0) {
        e.cd = rage ? 2.0 : 3.0;
        const pat = (e.pat = ((e.pat || 0) + 1) % 4);
        const dirTo = norm(sub(S.ship.p, e.p)), side = norm(cross(dirTo, [0, 1, 0])), up = cross(side, dirTo);
        if (pat === 0) { const n = rage ? 36 : 26; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; shoot(e.p, add(mul(dirTo, 0.9), add(mul(side, Math.cos(a)), mul(up, Math.sin(a)))), 85, 10 * dm, 1.6); } }
        else if (pat === 1) { for (let k = 0; k < (rage ? 9 : 6); k++) { const aim = lead(e.p, 150); shoot(add(e.p, mul(rdir(), 10)), add(sub(aim, e.p), mul(rdir(), 18)), 150, 12 * dm, 1.4); } }
        else if (pat === 2) { for (let i = 0; i < (rage ? 6 : 4); i++) spawn('sw', add(e.p, mul(rdir(), 45))); if (rage) spawn('wo', add(e.p, mul(rdir(), 60))); }
        else { e.st = 9; e.tm = 3; e.aim = lead(e.p, 130); ev({ k: 'roar', p: r3(e.p), big: 1 }); }
      }
      break;
    }
  }
  if (e.type !== 'ne') e.p = add(e.p, mul(e.v, DT));
}
function hurtStation(d) {
  if (!S.mission || S.mission.type !== 'defend') return;
  S.station.hp -= d;
  ev({ k: 'shit' });
  if (S.station.hp <= 0) { S.station.hp = 0; gameOver('Станция пала'); }
}

// ---------- mission spawns ----------
function missionTick() {
  const m = S.mission; if (!m || !m.active || m.done) return;
  const ship = S.ship;
  S.waveT -= DT;
  const mobs = S.enemies.filter(e => e.type !== 'ne' && e.type !== 'bo').length;
  if (m.type === 'clear') {
    if (S.waveT <= 0 && mobs < 4 + S.sector && !ship.docked) {
      S.waveT = 7;
      const n = 3 + S.sector + (players.size > 1 ? 2 : 0);
      const c = add(ship.p, mul(rdir(), rnd(450, 650)));
      for (let i = 0; i < n; i++) { const r = Math.random(); spawn(r < 0.5 ? 'sw' : r < 0.82 || S.sector < 2 ? 'je' : 'wo', add(c, mul(rdir(), rnd(10, 70)))); }
      toast('Твари на радаре!', 'red');
    }
  } else if (m.type === 'defend') {
    m.prog = Math.min(m.goal, m.prog + DT);
    if (S.waveT <= 0) {
      S.waveT = Math.max(7, 12 - S.sector);
      const n = 4 + S.sector + (players.size > 1 ? 2 : 0);
      const c = add(STATION_P, mul(rdir(), rnd(550, 700)));
      for (let i = 0; i < n; i++) { const r = Math.random(); spawn(r < 0.55 ? 'sw' : r < 0.85 ? 'je' : 'wo', add(c, mul(rdir(), rnd(10, 80))), { station: Math.random() < 0.7 }); }
      toast('Волна идёт на станцию!', 'red');
    }
    if (m.prog >= m.goal) missionDone();
  } else if (m.type === 'nests') {
    if (S.waveT <= 0 && mobs < 3 + S.sector && !ship.docked) {
      S.waveT = 14;
      const c = add(ship.p, mul(rdir(), 500));
      for (let i = 0; i < 2 + S.sector; i++) spawn(Math.random() < 0.6 ? 'je' : 'sw', add(c, mul(rdir(), 50)));
    }
  }
}
function activateMission() {
  const m = S.mission; if (!m || m.active) return;
  m.active = true; S.waveT = 3;
  S.station.hp = S.station.hm;
  if (m.type === 'nests') {
    m.marks = [];
    for (let i = 0; i < m.goal; i++) {
      const a = (i / m.goal) * Math.PI * 2 + rnd(-0.4, 0.4);
      const p = [Math.cos(a) * rnd(800, 1150), rnd(-200, 200), Math.sin(a) * rnd(800, 1150)];
      spawn('ne', p);
      for (let k = 0; k < 2 + Math.floor(S.sector / 2); k++) spawn('je', add(p, mul(rdir(), 70)));
    }
  }
  if (m.type === 'boss') spawn('bo', [rnd(-300, 300), rnd(-80, 120), -800]);
  toast('Миссия: ' + m.label, 'blue');
}

// ---------- tick ----------
function tick() {
  if (phase !== 'game') return;
  S.t += DT;
  const sh = S.ship;
  // ship motion
  if (sh.docking) {
    const d = sh.docking; d.t += DT / 3;
    const k = Math.min(1, d.t), e = k * k * (3 - 2 * k);
    sh.p = add(d.from, mul(sub(DOCK_P, d.from), e));
    sh.q = slerp(d.q, [0, 1, 0, 0], e);
    sh.v = [0, 0, 0];
    if (k >= 1) { sh.docking = null; sh.docked = true; onDocked(); }
  } else if (!sh.docked) {
    const pilot = [...players.values()].find(p => p.seat === 'pilot');
    if (!pilot) { sh.p = add(sh.p, mul(sh.v, DT)); sh.v = mul(sh.v, 0.99); }
  }
  // shield
  if (S.t - sh.lastHit > 3.5) sh.sh = Math.min(shMax(), sh.sh + (8 + 3 * S.up.shield) * DT);
  // fires
  const breaches = S.fires.filter(f => f.kind === 'breach').length;
  for (const f of S.fires) { if (!sh.docked) sh.hull -= (f.kind === 'fire' ? 0.9 : 0.6) * DT; }
  if (sh.hull <= 0 && phase === 'game') { sh.hull = 0; gameOver('Корабль сгорел изнутри'); return; }
  // players
  for (const p of players.values()) {
    if (p.dead) continue;
    if (p.down) {
      p.bleed -= DT;
      if (p.bleed <= 0) { p.dead = true; p.down = false; toast(p.name + ' погиб. Возродится на станции', 'red'); }
      continue;
    }
    let dmg = 0;
    const inShip = Math.abs(p.pos[0]) < 5.2;
    if (inShip && !sh.docked) dmg += Math.min(3, breaches) * 1.3;
    for (const f of S.fires) if (f.kind === 'fire') { const fp = FIRE_SLOTS[f.slot]; if (Math.hypot(p.pos[0] - fp[0], p.pos[2] - fp[2]) < 2.3) dmg += 16; }
    if (dmg > 0) { p.hp -= dmg * DT; p.lastDmg = S.t; }
    else if (S.t - p.lastDmg > 5) p.hp = Math.min(100, p.hp + (2 + 3 * S.up.medbay) * DT);
    if (p.hp <= 0) { p.hp = 0; p.down = true; p.seat = null; p.bleed = 35; p.rv = 0; toast(p.name + ' без сознания! Поднимите его (E)', 'red'); }
  }
  const alive = [...players.values()].filter(p => !p.down && !p.dead);
  if (players.size && !alive.length) { gameOver('Экипаж погиб'); return; }
  // enemies
  for (const e of S.enemies.slice()) updateEnemy(e);
  if (phase !== 'game') return;
  // enemy projectiles
  for (const b of S.ep) {
    b.p = add(b.p, mul(b.v, DT)); b.life -= DT;
    if (!sh.docked) for (const c of SHIP_SPH) { const wc = add(sh.p, qrot(c, sh.q)); if (dist(b.p, wc) < 5.5 + b.s) { hurtShip(b.dmg); b.life = -1; ev({ k: 'spark', p: r3(b.p) }); break; } }
    if (b.life > 0 && S.mission && S.mission.type === 'defend' && dist(b.p, STATION_P) < 80) { hurtStation(b.dmg); b.life = -1; ev({ k: 'spark', p: r3(b.p) }); }
  }
  S.ep = S.ep.filter(b => b.life > 0);
  if (phase !== 'game') return;
  // loot
  const mag = 45 + 35 * S.up.magnet;
  for (const l of S.loot) {
    l.life -= DT;
    const d = dist(l.p, sh.p);
    if (d < mag) l.v = add(mul(l.v, 0.9), mul(norm(sub(sh.p, l.p)), 14 + (mag - d) * 2.2));
    else l.v = mul(l.v, 0.97);
    l.p = add(l.p, mul(l.v, DT));
    if (d < 9) { S.credits += l.val; l.life = -1; ev({ k: 'coin', v: l.val }); }
  }
  S.loot = S.loot.filter(l => l.life > 0);
  missionTick();
  // cleanup far enemies
  S.enemies = S.enemies.filter(e => e.type === 'ne' || e.type === 'bo' || dist(e.p, sh.p) < 3500);
}
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map(x => -x); d = -d; }
  if (d > 0.9995) { const r = a.map((x, i) => x + (b[i] - x) * t); const l = Math.hypot(...r); return r.map(x => x / l); }
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((x, i) => x * wa + b[i] * wb);
}
function onDocked() {
  S.doors = [false, false];
  toast('Стыковка завершена. Добро пожаловать на станцию «Улей-7»', 'blue');
  for (const p of players.values()) if (p.dead) { resetPlayer(p); p.pos = [0, 0, 8]; toast(p.name + ' снова в строю', 'green'); }
  S.enemies = S.enemies.filter(e => e.type === 'ne' || e.type === 'bo');
  S.ep = [];
  const m = S.mission;
  if (m && m.done) {
    S.credits += m.reward;
    toast('Награда: +' + m.reward + ' ◆', 'green');
    S.sector++;
    S.mission = null; S.enemies = [];
    S.offers = makeOffers(S.sector);
    refreshQuests();
    ev({ k: 'sector', n: S.sector });
  }
}
function gameOver(reason) {
  if (phase !== 'game') return;
  phase = 'over';
  const stats = { sector: S.sector, kills: S.kills, credits: S.credits, time: Math.round((Date.now() - S.startTime) / 1000), reason };
  bcast({ t: 'over', stats });
  for (const p of players.values()) p.ready = false;
}

function snapshot() {
  const sh = S.ship;
  return {
    t: 's', tm: r1(S.t),
    ship: { p: r3(sh.p), q: sh.q.map(x => Math.round(x * 1e4) / 1e4), v: r3(sh.v), hull: r1(sh.hull), hm: hullMax(), sh: r1(sh.sh), shm: shMax(), dk: sh.docked ? 1 : 0, dg: sh.docking ? 1 : 0 },
    pl: [...players.values()].map(p => ({ id: p.id, n: p.name, p: p.pos, y: p.yaw, pi: p.pitch, mv: p.mv, s: p.seat, tl: p.tool, hp: Math.round(p.hp), dn: p.down ? 1 : 0, dd: p.dead ? 1 : 0, bl: Math.round(p.bleed), rv: Math.round(p.rv * 100) / 100 })),
    en: S.enemies.map(e => [e.id, e.type, r1(e.p[0]), r1(e.p[1]), r1(e.p[2]), r1(e.v[0]), r1(e.v[1]), r1(e.v[2]), Math.round(e.hp), e.hm, e.st]),
    ep: S.ep.map(b => [b.id, r1(b.p[0]), r1(b.p[1]), r1(b.p[2]), r1(b.v[0]), r1(b.v[1]), r1(b.v[2]), b.s]),
    lo: S.loot.map(l => [l.id, r1(l.p[0]), r1(l.p[1]), r1(l.p[2])]),
    fi: S.fires.map(f => [f.id, f.slot, f.kind, Math.round(f.hp)]),
    cr: S.credits, sec: S.sector, kills: S.kills,
    mi: S.mission ? { type: S.mission.type, label: S.mission.label, goal: S.mission.goal, prog: Math.floor(S.mission.prog), done: S.mission.done ? 1 : 0, act: S.mission.active ? 1 : 0, marks: S.mission.type === 'nests' ? S.enemies.filter(e => e.type === 'ne').map(e => r3(e.p)) : null } : null,
    qs: S.quests.map(q => ({ id: q.id, npc: q.npc, t: q.title, x: q.text, ty: q.ty, g: q.goal, p: q.prog, r: q.reward, s: q.state })),
    of: S.offers, st: { hp: Math.round(S.station.hp), hm: S.station.hm }, up: S.up,
    dr: S.doors.map(b => b ? 1 : 0), ev: events,
  };
}

// ---------- networking ----------
function send(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
function bcast(o, except) { const s = JSON.stringify(o); for (const p of players.values()) if (p.ws !== except && p.ws.readyState === 1) p.ws.send(s); }
// хост — тот, кто зашёл первым (Map хранит порядок входа); если он ушёл — хостом становится следующий
const hostP = () => players.values().next().value;
function lobbyInfo() {
  const h = hostP();
  return { t: 'lobby', phase, url: publicUrl, lan: lanUrls(), hostId: h ? h.id : null, players: [...players.values()].map(p => ({ id: p.id, n: p.name, r: p.ready ? 1 : 0, host: p === h ? 1 : 0 })) };
}
const broadcastLobby = () => bcast(lobbyInfo());

wss.on('connection', (ws, req) => {
  if (players.size >= 2) { send(ws, { t: 'full' }); ws.close(); return; }
  const local = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress) && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'] && !req.headers['x-forwarded-proto'];
  const p = { id: nextId++, name: 'Пилот', ready: false, ws, isHost: local };
  resetPlayer(p);
  players.set(p.id, p);
  send(ws, { t: 'welcome', id: p.id });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    handle(p, m);
  });
  ws.on('close', () => {
    players.delete(p.id);
    if (phase !== 'lobby' && S) bcast({ t: 'toast', m: p.name + ' отключился', c: 'red' });
    if (!players.size) { phase = 'lobby'; S = null; }
    broadcastLobby();
  });
});

function handle(p, m) {
  switch (m.t) {
    case 'hello': p.name = String(m.n || 'Пилот').slice(0, 16); broadcastLobby(); if (phase === 'game') { resetPlayer(p); send(p.ws, { t: 'start' }); } break;
    case 'ready': p.ready = !!m.v; broadcastLobby(); break;
    case 'start':
      if (phase === 'game') return;
      if (p !== hostP()) { send(p.ws, { t: 'toast', m: 'Запускает только хост', c: 'red' }); return; }
      if (![...players.values()].every(x => x.ready)) { send(p.ws, { t: 'toast', m: 'Не все нажали «Готов»', c: 'red' }); return; }
      newGame(); phase = 'game'; bcast({ t: 'start' }); broadcastLobby(); break;
    case 'tolobby': if (phase === 'over') { phase = 'lobby'; S = null; } broadcastLobby(); send(p.ws, { t: 'lobbyback' }); break;
    case 'chat': bcast({ t: 'toast', m: p.name + ': ' + String(m.m).slice(0, 80), c: 'chat' }); break;
  }
  if (phase !== 'game' || !S) return;
  const sh = S.ship;
  switch (m.t) {
    case 'av':
      if (Array.isArray(m.p) && m.p.length === 3) p.pos = m.p.map(Number);
      p.yaw = +m.y || 0; p.pitch = +m.pi || 0; p.mv = m.mv ? 1 : 0; p.tool = m.tl ? 1 : 0;
      break;
    case 'sit': {
      if (p.down || p.dead) return;
      const taken = [...players.values()].some(o => o !== p && o.seat === m.s);
      if (!taken && ['pilot', 'tl', 'tr'].includes(m.s)) p.seat = m.s;
      break;
    }
    case 'stand': p.seat = null; break;
    case 'ship':
      if (p.seat === 'pilot' && !sh.docked && !sh.docking && m.p && m.q && m.v) { sh.p = m.p; sh.q = m.q; sh.v = m.v; }
      break;
    case 'hit': {
      const e = S.enemies.find(x => x.id === m.id);
      if (e) { e.hp -= Math.min(+m.d || 0, 400); if (e.hp <= 0) killEnemy(e); }
      break;
    }
    case 'ram': hurtShip(Math.min(+m.d || 0, 60)); break;
    case 'shot': bcast({ t: 'shot', o: m.o, d: m.d, k: m.k }, p.ws); break;
    case 'fix': {
      const f = S.fires.find(x => x.id === m.id);
      if (f) { f.hp -= Math.min(+m.a || 0, 30); if (f.hp <= 0) { S.fires = S.fires.filter(x => x !== f); ev({ k: 'fixed', slot: f.slot }); } }
      break;
    }
    case 'revive': {
      const o = players.get(m.id);
      if (o && o.down && !p.down) { o.rv += Math.min(+m.a || 0, 0.2); if (o.rv >= 1) { o.down = false; o.hp = 45; o.rv = 0; o.lastDmg = S.t; toast(o.name + ' поднят!', 'green'); } }
      break;
    }
    case 'dock':
      if (p.seat === 'pilot' && !sh.docked && !sh.docking && dist(sh.p, DOCK_APPROACH) < 110 && len(sh.v) < 45) { sh.docking = { t: 0, from: sh.p.slice(), q: sh.q.slice() }; toast('Автостыковка...', 'blue'); }
      break;
    case 'undock':
      if (p.seat === 'pilot' && sh.docked) {
        if (!S.mission) { send(p.ws, { t: 'toast', m: 'Сначала возьмите миссию в терминале (правое крыло)', c: 'red' }); return; }
        if (S.doors.some(Boolean)) { send(p.ws, { t: 'toast', m: 'Закройте шлюзы перед отстыковкой!', c: 'red' }); return; }
        for (const o of players.values()) if ((Math.abs(o.pos[0]) > 4.25 && Math.abs(o.pos[2] - 8) < 5) || o.pos[2] > 12) { send(p.ws, { t: 'toast', m: 'Напарник ещё на станции!', c: 'red' }); return; }
        sh.docked = false; sh.p = DOCK_P.slice(); sh.q = [0, 1, 0, 0]; sh.v = [0, 0, 35];
        activateMission();
      }
      break;
    case 'door': {
      const i = m.i ? 1 : 0;
      if (!sh.docked) { send(p.ws, { t: 'toast', m: 'Шлюз заблокирован: за бортом вакуум', c: 'red' }); return; }
      if (S.doors[i]) { // нельзя закрыть, если кто-то стоит в проёме
        for (const o of players.values()) if (Math.abs(o.pos[0]) > 4.2 && Math.abs(o.pos[0]) < 5.0 && Math.abs(o.pos[2] - 8) < 1) { send(p.ws, { t: 'toast', m: 'В проёме кто-то стоит', c: 'red' }); return; }
      }
      S.doors[i] = !S.doors[i]; ev({ k: 'door', i, o: S.doors[i] ? 1 : 0 });
      break;
    }
    case 'buy': {
      const k = m.k; if (!sh.docked || !SHOP[k]) return;
      const lvl = S.up[k]; if (lvl >= SHOP[k].max) return;
      const c = price(k, lvl); if (S.credits < c) { send(p.ws, { t: 'toast', m: 'Не хватает ◆', c: 'red' }); return; }
      S.credits -= c; S.up[k]++;
      if (k === 'hull') sh.hull += 70;
      toast(p.name + ' купил улучшение', 'green'); ev({ k: 'buy' });
      break;
    }
    case 'repairship': {
      if (!sh.docked) return;
      const miss = hullMax() - sh.hull, c = Math.ceil(miss * 0.6);
      if (miss <= 0 && !S.fires.length) return;
      if (S.credits < c) { send(p.ws, { t: 'toast', m: 'Не хватает ◆ на ремонт (' + c + ')', c: 'red' }); return; }
      S.credits -= c; sh.hull = hullMax(); S.fires = []; toast('Корабль отремонтирован', 'green'); ev({ k: 'buy' });
      break;
    }
    case 'quest': {
      const q = S.quests.find(x => x.id === m.id); if (!q || !sh.docked) return;
      if (m.a === 'take' && q.state === 'offer') { q.state = 'active'; toast(p.name + ' взял задание «' + q.title + '»', 'blue'); }
      else if (m.a === 'claim' && q.state === 'done') { q.state = 'claimed'; S.credits += q.reward; toast('Награда от ' + q.npcName + ': +' + q.reward + ' ◆', 'green'); ev({ k: 'buy' }); refreshQuests(); }
      break;
    }
    case 'heal': if (sh.docked) { for (const o of players.values()) if (!o.dead) { o.hp = 100; o.down = false; } toast('Экипаж вылечен', 'green'); } break;
    case 'mission': if (sh.docked && !S.mission && S.offers[m.i]) { S.mission = Object.assign({ prog: 0, done: false, active: false }, S.offers[m.i]); toast('Миссия выбрана: ' + S.mission.label + '. Пилот, отстыковка — G', 'blue'); } break;
  }
}

let tickN = 0;
setInterval(() => {
  try {
    tick();
    if (phase === 'game' && S && (++tickN % 2 === 0)) { bcast(snapshot()); events = []; }
  } catch (e) { console.error(e); }
}, 1000 / TICK);

// ---------- startup ----------
function lanUrls() {
  const out = [];
  if (ON_HOSTING) return out;
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push('http://' + i.address + ':' + PORT);
  return out;
}
// ---------- туннели: localhost.run (ssh) + cloudflared параллельно ----------
const { spawnSync } = require('child_process');
const tunnels = {};
let tunnelProcs = [];
function pickUrl() {
  const prev = publicUrl;
  publicUrl = (tunnels.lhr && tunnels.lhr.url) || (tunnels.cf && tunnels.cf.url) || null;
  if (publicUrl !== prev) {
    if (publicUrl) {
      console.log('\n  =============================================');
      console.log('   ССЫЛКА ДЛЯ ДРУГА:  ' + publicUrl);
      console.log('  =============================================');
      console.log('  (если не открылась сразу — подожди 10-20 секунд)\n');
    }
    broadcastLobby();
  }
}
function runTunnel(name, label, exe, args, re, opts) {
  const st = tunnels[name] || (tunnels[name] = { tries: 0, url: null });
  st.tries++;
  const p = cpSpawn(exe, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  tunnelProcs.push(p);
  let lastErr = '', blocked = false;
  const onData = d => {
    const txt = String(d);
    for (const line of txt.split(/\r?\n/)) if (/ERR|failed|error|denied|refused|closed/i.test(line) && !/faq/i.test(line)) lastErr = line.trim();
    if (/failed to request quick Tunnel/i.test(txt)) blocked = true;
    const m = txt.match(re);
    if (m && st.url !== m[0]) { st.url = m[0]; console.log('  [' + label + '] туннель готов'); pickUrl(); }
  };
  p.stdout.on('data', onData); p.stderr.on('data', onData);
  p.on('error', e => { lastErr = e.message; });
  p.on('exit', c => {
    tunnelProcs = tunnelProcs.filter(x => x !== p);
    if (shuttingDown) return;
    st.url = null; pickUrl();
    console.log('  [' + label + '] не вышло' + (lastErr ? ': ' + lastErr.slice(0, 160) : ' (код ' + c + ')'));
    const maxTries = blocked ? 2 : opts.maxTries;
    if (st.tries < maxTries) setTimeout(() => opts.restart(), opts.delay);
    else if (!publicUrl) console.log('  [' + label + '] сдаюсь. ' + (blocked ? 'Провайдер блокирует Cloudflare.' : ''));
  });
}
function startLhr() {
  const ssh = fs.existsSync('C:\\Windows\\System32\\OpenSSH\\ssh.exe') ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' : 'ssh';
  const keygen = fs.existsSync('C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe') ? 'C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe' : 'ssh-keygen';
  const bin = path.join(__dirname, 'bin'), key = path.join(bin, 'tunnel_key');
  if (!fs.existsSync(bin)) fs.mkdirSync(bin);
  if (!fs.existsSync(key)) { try { spawnSync(keygen, ['-q', '-t', 'ed25519', '-N', '', '-f', key, '-C', 'dvp-tunnel'], { windowsHide: true }); } catch { } }
  const args = ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'UserKnownHostsFile=' + path.join(bin, 'known_hosts'), '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=15'];
  if (fs.existsSync(key)) args.push('-i', key, '-o', 'IdentitiesOnly=yes');
  args.push('-R', '80:localhost:' + PORT, 'nokey@localhost.run');
  runTunnel('lhr', 'localhost.run', ssh, args, /https:\/\/[a-z0-9.-]+\.lhr\.life/, { maxTries: 50, delay: 4000, restart: startLhr });
}
function startCf() {
  const exe = path.join(__dirname, 'bin', 'cloudflared.exe');
  if (!fs.existsSync(exe)) return;
  const proto = (tunnels.cf && tunnels.cf.tries % 2 === 1) ? 'http2' : 'quic';
  runTunnel('cf', 'cloudflare', exe, ['tunnel', '--no-autoupdate', '--protocol', proto, '--url', 'http://localhost:' + PORT], /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/, { maxTries: 6, delay: 5000, restart: startCf });
}
let shuttingDown = false;
function startTunnel() {
  console.log('  Поднимаю туннели для друга (localhost.run + cloudflare)...');
  startLhr(); startCf();
}
const killTunnel = () => { shuttingDown = true; for (const p of tunnelProcs) { try { p.kill(); } catch { } } };
process.on('exit', killTunnel); process.on('SIGINT', () => { killTunnel(); process.exit(); });
server.listen(PORT, () => {
  console.log('\n  ДВОЕ В ПУСТОТЕ — сервер запущен');
  console.log('  Ты играешь тут:  http://localhost:' + PORT);
  const lan = lanUrls(), radmin = lan.find(u => u.startsWith('http://26.'));
  if (radmin) {
    console.log('\n  #############################################');
    console.log('   ДРУГУ ЧЕРЕЗ RADMIN VPN (лучший вариант):');
    console.log('   ' + radmin);
    console.log('   Друг ставит Radmin VPN, заходит в твою сеть');
    console.log('   и открывает эту ссылку в браузере.');
    console.log('  #############################################\n');
  }
  for (const u of lan) if (u !== radmin) console.log('  Та же Wi-Fi сеть:  ' + u);
  if (ON_HOSTING) { publicUrl = process.env.RENDER_EXTERNAL_URL || null; console.log('  Хостинг: ' + (publicUrl || 'адрес сервиса')); return; }
  if (!process.env.NO_TUNNEL) startTunnel();
  if (!process.env.NO_OPEN) cpSpawn('cmd', ['/c', 'start', '', 'http://localhost:' + PORT], { detached: true, stdio: 'ignore' }).unref();
});
