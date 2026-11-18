import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- общие материалы ----------
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.72, metalness: 0.04 }, o));
const glow = (color, k = 2.5) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
export const MAT = {
  hull: std(0xeee2cf, { roughness: 0.55 }), hullO: std(0xff7a3d, { roughness: 0.5 }), hullD: std(0x3b3f52),
  wall: std(0x6e7590), wallL: std(0x9aa1b8), floor: std(0x2c303d, { roughness: 0.9 }), ceil: std(0x585e74),
  seat: std(0xff8a3d, { roughness: 0.6 }), dark: std(0x1c1f2b), metal: std(0xb8bccb, { metalness: 0.5, roughness: 0.35 }),
  teal: glow(0x5ff6ff, 1.25), orange: glow(0xff8a3d, 1.5), red: glow(0xff3b4f, 2.5), green: glow(0x7dffb0, 2.2), yellow: glow(0xffd05f, 2.4),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
  rock: std(0x8a7f78, { roughness: 0.95 }), stripe: std(0xffd05f),
};
const gcache = {};
function rgeo(w, h, d, r) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const k = [w, h, d, r].map(x => x.toFixed(2)).join('_');
  return gcache[k] || (gcache[k] = new RoundedBoxGeometry(w, h, d, 3, Math.max(0.005, r)));
}
export function rbox(parent, w, h, d, r, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(rgeo(w, h, d, r), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function sph(parent, r, mat, x = 0, y = 0, z = 0, seg = 20) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat); m.position.set(x, y, z); parent.add(m); return m; }
function cyl(parent, r1, r2, h, mat, x = 0, y = 0, z = 0, seg = 18) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m; }
function capsule(parent, r, l, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 14), mat); m.position.set(x, y, z); parent.add(m); return m; }

// ---------- комната из панелей ----------
const H = 2.8, T = 0.22;
function segs(a, b, doors) { // [a,b] minus door intervals
  const out = []; let cur = a;
  for (const [d0, d1] of (doors || []).slice().sort((p, q) => p[0] - q[0])) { if (d0 > cur) out.push([cur, d0]); cur = Math.max(cur, d1); }
  if (cur < b) out.push([cur, b]); return out;
}
function room(g, x0, x1, z0, z1, doors = {}, o = {}) {
  const wm = o.wall || MAT.wall;
  rbox(g, x1 - x0 + T, 0.2, z1 - z0 + T, 0.06, o.floor || MAT.floor, (x0 + x1) / 2, -0.1, (z0 + z1) / 2);
  if (!o.noCeil) rbox(g, x1 - x0 + T, 0.2, z1 - z0 + T, 0.06, MAT.ceil, (x0 + x1) / 2, H + 0.1, (z0 + z1) / 2);
  const wallH = s => (o.h && o.h[s]) || H;
  const sides = { n: [x0, x1, z0, 'x'], s: [x0, x1, z1, 'x'], w: [z0, z1, x0, 'z'], e: [z0, z1, x1, 'z'] };
  for (const s in sides) {
    if (o.skip && o.skip.includes(s)) continue;
    const [a, b, c, ax] = sides[s], hh = wallH(s);
    for (const [p, q] of segs(a, b, doors[s])) {
      const L = q - p + (ax === 'x' ? T : 0); if (L < 0.05) continue;
      if (ax === 'x') rbox(g, L, hh, T, 0.08, wm, (p + q) / 2, hh / 2, c); else rbox(g, T, hh, L, 0.08, wm, c, hh / 2, (p + q) / 2);
    }
    for (const [p, q] of doors[s] || []) {
      if (ax === 'x') { rbox(g, q - p, 0.5, T, 0.06, wm, (p + q) / 2, H - 0.25, c); rbox(g, q - p, 0.06, T + 0.04, 0.02, MAT.teal, (p + q) / 2, H - 0.52, c); }
      else { rbox(g, T, 0.5, q - p, 0.06, wm, c, H - 0.25, (p + q) / 2); rbox(g, T + 0.04, 0.06, q - p, 0.02, MAT.teal, c, H - 0.52, (p + q) / 2); }
    }
  }
  if (o.strip) { // световые полосы под потолком
    rbox(g, 0.08, 0.08, (z1 - z0) * 0.8, 0.03, o.strip, x0 + 0.2, H - 0.15, (z0 + z1) / 2);
    rbox(g, 0.08, 0.08, (z1 - z0) * 0.8, 0.03, o.strip, x1 - 0.2, H - 0.15, (z0 + z1) / 2);
  }
}

// ---------- зоны ходьбы (локально в корабле: x, z) ----------
export const WALK = [
  [-1.85, 1.85, -8.5, -5.35], [-0.75, 0.75, -5.8, -1.0], [-2.65, 2.65, -1.15, 3.15], [-0.75, 0.75, 2.8, 6.5],
  [-2.65, 2.65, 6.35, 10.15], [2.4, 4.75, 0.5, 1.5], [-4.75, -2.4, 0.5, 1.5], [2.4, 4.2, 7.6, 8.4], [-4.2, -2.4, 7.6, 8.4],
];
export const WALK_DOCK = [[4.0, 5.8, 7.6, 8.4], [-5.8, -4.0, 7.6, 8.4], [4.85, 13.9, 3.35, 12.65], [-13.9, -4.85, 3.35, 12.65]];
export const OBST = [[0, 1, 0.75], [0, 10.1, 0.95], [0, -7.75, 0.5]];
export const SEATS = {
  pilot: { p: [0, 0, -7.75], cam: [0, 1.5, -7.95], yaw: 0, label: 'сесть за штурвал' },
  tl: { p: [-5.15, 0, 1], cam: [-5.05, 1.38, 1], yaw: Math.PI / 2, label: 'сесть за левую турель' },
  tr: { p: [5.15, 0, 1], cam: [5.05, 1.38, 1], yaw: -Math.PI / 2, label: 'сесть за правую турель' },
};
export const TERMINALS = [
  { id: 'shop', p: [-13.6, 0, 5.5], label: 'Магазин улучшений', side: -1 },
  { id: 'repair', p: [-13.6, 0, 10.5], label: 'Ремонтный док', side: -1 },
  { id: 'missions', p: [13.6, 0, 5.5], label: 'Терминал миссий', side: 1 },
  { id: 'med', p: [13.6, 0, 10.5], label: 'Медотсек', side: 1 },
];
export const FIRE_SLOTS = [[0, 0, -8.2], [1.4, 0, -6.2], [0, 0, -3.2], [-2.2, 0, -0.6], [2.2, 0, 2.6], [0, 0, 1], [0, 0, 4.8], [-2.1, 0, 7.2], [2.1, 0, 9.6], [0, 0, 9.2]];
export const DOCK_P = new THREE.Vector3(0, 0, 230), DOCK_APPROACH = new THREE.Vector3(0, 0, 265);

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
export function textSprite(text, color = '#fff', scale = 1) {
  const tex = canvasTex(512, 128, (x, w, h) => {
    x.font = '700 54px Unbounded, Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const tw = x.measureText(text).width + 50; x.fillStyle = 'rgba(12,12,28,.65)';
    x.beginPath(); x.roundRect((w - tw) / 2, 18, tw, 92, 30); x.fill(); x.fillStyle = color; x.fillText(text, w / 2, h / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  s.scale.set(2 * scale, 0.5 * scale, 1); return s;
}
function screenTex(color, kind) {
  return canvasTex(256, 160, (x, w, h) => {
    x.fillStyle = '#071318'; x.fillRect(0, 0, w, h); x.strokeStyle = color; x.fillStyle = color; x.lineWidth = 3;
    if (kind === 0) { x.beginPath(); for (let i = 0; i < w; i += 4) x.lineTo(i, h / 2 + Math.sin(i * 0.07) * 30 + Math.sin(i * 0.21) * 10); x.stroke(); }
    else if (kind === 1) { x.beginPath(); x.arc(w / 2, h / 2, 60, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(w / 2, h / 2, 30, 0, Math.PI * 2); x.stroke(); for (let i = 0; i < 6; i++) x.fillRect(w / 2 + Math.cos(i) * 45, h / 2 + Math.sin(i * 2) * 40, 6, 6); }
    else { for (let i = 0; i < 8; i++) x.fillRect(20, 16 + i * 17, 40 + Math.random() * 170, 8); }
  });
}

// ---------- КОРАБЛЬ ----------
export function buildShip() {
  const ship = new THREE.Group(); ship.name = 'ship';
  const inner = new THREE.Group(); ship.add(inner);
  const hull = new THREE.Group(); ship.add(hull);
  const I = inner;
  const strip = MAT.teal;

  // Кабина
  room(I, -2.2, 2.2, -9.5, -5, { s: [[-1.1, 1.1]] }, { noCeil: true, h: { n: 0.55, w: 0.8, e: 0.8 } });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass);
  canopy.scale.set(2.35, 2.25, 3.1); canopy.position.set(0, 0.95, -6.6); I.add(canopy);
  rbox(I, 4.4, 0.25, 0.5, 0.1, MAT.hullD, 0, 2.95, -5.1); // дуга
  // приборная панель
  const dash = rbox(I, 3.6, 0.45, 0.8, 0.18, MAT.hullD, 0, 0.62, -9.05); dash.rotation.x = -0.35;
  [[-1.1, 0], [0, 1], [1.1, 2]].forEach(([x, k]) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.52), new THREE.MeshBasicMaterial({ map: screenTex(k === 1 ? '#ff8a3d' : '#5ff6ff', k), toneMapped: false })); s.position.set(x, 0.9, -8.8); s.rotation.x = -0.75; I.add(s); });
  const btnM = [0xff8a3d, 0x5ff6ff, 0x7dffb0, 0xff3b4f].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 }));
  for (let i = 0; i < 10; i++) sph(I, 0.022, btnM[i % 4], -1.45 + i * 0.32, 0.78, -8.55, 8);
  // кресло пилота
  rbox(I, 0.9, 0.25, 0.85, 0.12, MAT.seat, 0, 0.5, -7.6); rbox(I, 0.9, 1.05, 0.22, 0.12, MAT.seat, 0, 1.0, -7.15);
  cyl(I, 0.12, 0.18, 0.45, MAT.hullD, 0, 0.22, -7.6); rbox(I, 0.18, 0.5, 0.18, 0.06, MAT.hullD, 0.38, 0.75, -8.05);
  const stickTop = sph(I, 0.08, MAT.orange, 0.38, 1.02, -8.05, 10);

  // Коридор A
  room(I, -1.1, 1.1, -5, -1.5, { n: [[-1.1, 1.1]], s: [[-1.1, 1.1]] }, { strip, skip: [] });
  for (let z = -4.5; z < -1.8; z += 0.9) { rbox(I, 0.12, 0.6, 0.12, 0.05, MAT.metal, -1.0, 1.4, z); rbox(I, 0.12, 0.6, 0.12, 0.05, MAT.metal, 1.0, 1.4, z); }
  cyl(I, 0.07, 0.07, 3.4, MAT.hullO, 0.7, 2.55, -3.25).rotation.x = Math.PI / 2;
  cyl(I, 0.05, 0.05, 3.4, MAT.metal, -0.7, 2.6, -3.25).rotation.x = Math.PI / 2;

  // Хаб
  room(I, -3, 3, -1.5, 3.5, { n: [[-1.1, 1.1]], s: [[-1.1, 1.1]], w: [[0.2, 1.8]], e: [[0.2, 1.8]] }, { strip });
  cyl(I, 0.7, 0.8, 0.9, MAT.hullD, 0, 0.45, 1); cyl(I, 0.72, 0.72, 0.06, MAT.teal, 0, 0.92, 1, 24);
  const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: 0x5ff6ff, wireframe: true, transparent: true, opacity: 0.8, toneMapped: false }));
  holo.position.set(0, 1.6, 1); I.add(holo);
  const holoCone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ff6ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  holoCone.position.set(0, 1.3, 1); holoCone.rotation.x = Math.PI; I.add(holoCone);
  for (const sx of [-1, 1]) {
    rbox(I, 0.7, 0.45, 1.4, 0.15, MAT.seat, sx * 2.5, 0.25, -0.6);
    rbox(I, 0.5, 2.0, 0.9, 0.12, MAT.wallL, sx * 2.65, 1.0, 2.7);
    rbox(I, 0.06, 0.06, 0.6, 0.02, MAT.orange, sx * 2.38, 1.6, 2.7);
  }
  // турельные пузыри
  const turretGuns = {};
  for (const [id, sx] of [['tl', -1], ['tr', 1]]) {
    const cx = sx * 4.7;
    cyl(I, 1.5, 1.5, 0.2, MAT.floor, cx, -0.1, 1, 28);
    rbox(I, 1.6, 0.2, 1.8, 0.06, MAT.floor, sx * 3.6, -0.1, 1);
    sph(I, 1.75, MAT.glass, cx, 1.3, 1, 32);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.14, 10, 40), MAT.hullD); ring.position.set(cx, 0.15, 1); ring.rotation.x = Math.PI / 2; I.add(ring);
    rbox(I, 0.7, 0.22, 0.75, 0.1, MAT.seat, sx * 5.2, 0.45, 1); rbox(I, 0.2, 0.8, 0.75, 0.1, MAT.seat, sx * 4.82, 0.85, 1);
    const piv = new THREE.Group(); piv.position.set(sx * 5.9, -0.15, 1); I.add(piv);
    sph(piv, 0.5, MAT.hullD, 0, 0, 0, 14);
    for (const o of [-0.22, 0.22]) { const b = cyl(piv, 0.09, 0.11, 2.2, MAT.metal, o, 0, 1.1); b.rotation.x = Math.PI / 2; sph(piv, 0.1, MAT.orange, o, 0, 2.2, 8); }
    turretGuns[id] = piv;
  }

  // Коридор B
  room(I, -1.1, 1.1, 3.5, 6, { n: [[-1.1, 1.1]], s: [[-1.1, 1.1]] }, { strip });
  // Машинное отделение
  room(I, -3, 3, 6, 10.5, { n: [[-1.1, 1.1]], w: [[7.2, 8.8]], e: [[7.2, 8.8]] }, { strip: MAT.orange });
  cyl(I, 0.95, 0.95, 0.25, MAT.hullD, 0, 0.12, 10.1, 24); cyl(I, 0.95, 0.95, 0.25, MAT.hullD, 0, 2.65, 10.1, 24);
  const reactor = cyl(I, 0.62, 0.62, 2.3, new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff6a1d, emissiveIntensity: 2.6, transparent: true, opacity: 0.92 }), 0, 1.4, 10.1, 24);
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 8, 28), MAT.metal); r.position.set(0, 0.6 + i * 0.55, 10.1); r.rotation.x = Math.PI / 2; I.add(r); }
  for (const sx of [-1, 1]) {
    rbox(I, 0.8, 0.8, 0.8, 0.12, MAT.hullO, sx * 2.3, 0.4, 6.6); rbox(I, 0.6, 0.6, 0.6, 0.1, MAT.wallL, sx * 2.3, 1.1, 6.6);
    cyl(I, 0.1, 0.1, 3.5, MAT.metal, sx * 2.7, 2.3, 8.2).rotation.x = Math.PI / 2;
  }
  // шлюзы
  const outerDoors = [];
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -4.5 : 3, x1 = sx < 0 ? -3 : 4.5;
    room(I, x0, x1, 7.2, 8.8, {}, { skip: ['w', 'e'] });
    rbox(I, 0.08, 0.08, 1.6, 0.03, MAT.yellow, sx * 3.75, H - 0.12, 8);
    const door = new THREE.Group(); door.position.set(sx * 4.5, 0, 8); I.add(door);
    const pan = rbox(door, 0.18, H, 1.62, 0.07, MAT.hullO, 0, H / 2, 0);
    for (let k = 0; k < 4; k++) rbox(door, 0.2, 0.12, 1.5, 0.04, MAT.dark, 0, 0.5 + k * 0.6, 0).rotation.x = 0;
    sph(door, 0.08, MAT.red, sx * -0.12, 1.6, 0.5, 8);
    pan.userData.sx = sx; outerDoors.push(door);
  }

  // Свет внутри
  const lights = [];
  for (const [p, c, i] of [[[0, 2.3, -7], 0x9fefff, 4], [[0, 2.4, 1], 0xffd9b0, 5], [[0, 2.3, 8.2], 0xffa066, 5], [[0, 2.4, -3.2], 0xbfe8ff, 2]]) {
    const l = new THREE.PointLight(c, i, 9, 1.6); l.position.set(...p); I.add(l); lights.push(l);
  }
  const alarm = new THREE.PointLight(0xff2a3a, 0, 14, 1.4); alarm.position.set(0, 2.4, 2); I.add(alarm);

  // ---------- Корпус снаружи ----------
  rbox(hull, 6.6, 3.6, 17, 1.5, MAT.hull, 0, 1.3, 2.1);
  rbox(hull, 5, 1.7, 5.2, 0.75, MAT.hull, 0, 0.05, -7.3);
  rbox(hull, 6.7, 0.35, 14, 0.15, MAT.hullO, 0, 1.0, 3.2);
  rbox(hull, 3.4, 0.5, 12, 0.24, MAT.hullD, 0, 3.15, 3.5);
  for (const sx of [-1, 1]) {
    const eng = capsule(hull, 1.15, 4, MAT.hull, sx * 2.4, 0.35, 11.8); eng.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.22, 10, 26), MAT.hullD); ring.position.set(sx * 2.4, 0.35, 14.3); hull.add(ring);
    const noz = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), MAT.teal); noz.position.set(sx * 2.4, 0.35, 14.35); hull.add(noz);
    const w = rbox(hull, 6.2, 0.45, 4.4, 0.2, MAT.hull, sx * 5.6, -0.8, 7.2); w.rotation.z = sx * -0.13;
    rbox(hull, 2.4, 0.47, 1.2, 0.2, MAT.hullO, sx * 7.4, -1.0, 6.2).rotation.z = sx * -0.13;
    sph(hull, 0.22, sx < 0 ? MAT.red : MAT.green, sx * 8.6, -1.15, 7.2, 10);
    rbox(hull, 1.9, 2.9, 2.5, 0.5, MAT.hull, sx * 3.9, 1.3, 8);
    const tb = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.2, 10, 36), MAT.hullD); tb.position.set(sx * 4.7, 1.3, 1); tb.rotation.y = Math.PI / 2; hull.add(tb);
  }
  const fin = rbox(hull, 0.45, 2.4, 3.6, 0.2, MAT.hullO, 0, 3.9, 8.6); fin.rotation.x = 0.3;
  sph(hull, 0.18, MAT.red, 0, 5.05, 9.4, 10);
  // пламя двигателей
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const sx of [-1, 1]) {
    const f = new THREE.Group(); f.position.set(sx * 2.4, 0.35, 14.4); ship.add(f);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 18, 1, true), flameMat); c1.rotation.x = -Math.PI / 2; c1.position.z = 2; f.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 14, 1, true), flameMat2); c2.rotation.x = -Math.PI / 2; c2.position.z = 1.2; f.add(c2);
    flames.push(f);
  }

  // ---------- Залы станции (видны только при стыковке) ----------
  const halls = new THREE.Group(); I.add(halls);
  const hallMat = std(0x7d7195), hallFloor = std(0x3a3346, { roughness: 0.9 });
  room(halls, -15, -4.5, 3, 13, { e: [[7.2, 8.8]] }, { wall: hallMat, floor: hallFloor, strip: MAT.orange });
  room(halls, 4.5, 15, 3, 13, { w: [[7.2, 8.8]] }, { wall: hallMat, floor: hallFloor, strip: MAT.teal });
  const termMeshes = {};
  for (const t of TERMINALS) {
    const g = new THREE.Group(); g.position.set(t.p[0], 0, t.p[2]); halls.add(g);
    rbox(g, 0.9, 1.2, 1.6, 0.25, MAT.hullD, t.side * 0.35, 0.6, 0);
    const scr = rbox(g, 0.12, 0.9, 1.3, 0.05, new THREE.MeshStandardMaterial({ color: 0x0b1820, emissive: t.id === 'shop' ? 0xff8a3d : t.id === 'missions' ? 0x5ff6ff : t.id === 'med' ? 0x7dffb0 : 0xffd05f, emissiveIntensity: 0.55, roughness: 0.3 }), t.side * -0.1, 1.55, 0);
    scr.rotation.z = t.side * 0.25;
    const lab = textSprite(t.label, '#fff', 1.2); lab.position.set(t.side * -0.3, 2.45, 0); g.add(lab);
    termMeshes[t.id] = g;
  }
  // декор: ящики, растения-шарики, окна-иллюминаторы
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) rbox(halls, 0.9, 0.9, 0.9, 0.15, i % 2 ? MAT.hullO : MAT.wallL, sx * (6 + i * 1.1), 0.45, 12.2);
    rbox(halls, 0.9, 0.9, 0.9, 0.15, MAT.hullO, sx * 6.5, 1.35, 12.2);
    for (const z of [4.2, 11.8]) { cyl(halls, 0.35, 0.28, 0.6, MAT.hullD, sx * 12.5, 0.3, z); sph(halls, 0.55, std(0x6fd38f), sx * 12.5, 0.95, z, 14); sph(halls, 0.35, std(0x8fe8a8), sx * 12.3, 1.35, z - 0.2, 12); }
    const sign = textSprite(sx < 0 ? '◆ ТОРГОВОЕ КРЫЛО' : 'ЦЕНТР МИССИЙ ◆', sx < 0 ? '#ffb067' : '#5ff6ff', 2.2); sign.position.set(sx * 9.7, 2.4, 3.3); halls.add(sign);
    const hl = new THREE.PointLight(sx < 0 ? 0xffc890 : 0xa0e8ff, 6, 16, 1.5); hl.position.set(sx * 9.7, 2.5, 8); halls.add(hl);
  }
  halls.visible = false;

  return { group: ship, inner, hull, holo, holoCone, reactor, lights, alarm, flames, turretGuns, outerDoors, halls, stickTop };
}

// ---------- СТАНЦИЯ ----------
export function buildStation() {
  const g = new THREE.Group();
  const m1 = std(0xe6dccb, { roughness: 0.6 }), m2 = std(0x5b5470), mo = MAT.hullO;
  sph(g, 55, m1, 0, 0, 0, 48);
  for (const y of [-20, 0, 20]) { const t = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(55 * 55 - y * y) + 1, 3, 12, 64), y ? m2 : mo); t.position.y = y; t.rotation.x = Math.PI / 2; g.add(t); }
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; const w = rbox(g, 3, 1.4, 0.8, 0.3, i % 3 ? MAT.yellow : MAT.teal, Math.cos(a) * 55.5, 10, Math.sin(a) * 55.5); w.lookAt(0, 10, 0); }
  cyl(g, 3, 6, 40, m2, 0, 70, 0); sph(g, 5, MAT.red, 0, 92, 0, 16); cyl(g, 4, 8, 30, m2, 0, -65, 0);
  const ring = new THREE.Group(); g.add(ring);
  const rt = new THREE.Mesh(new THREE.TorusGeometry(140, 13, 20, 96), m1); ring.add(rt);
  const rt2 = new THREE.Mesh(new THREE.TorusGeometry(140, 13.5, 8, 96, Math.PI * 2), mo); rt2.scale.set(1, 1, 0.25); ring.add(rt2);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const s = cyl(ring, 3, 3, 90, m2, Math.cos(a) * 97, Math.sin(a) * 97, 0); s.rotation.z = a + Math.PI / 2; }
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; sph(ring, 1.6, i % 2 ? MAT.teal : MAT.yellow, Math.cos(a) * 140, Math.sin(a) * 140, 13, 8); }
  // док-рукав и захваты корабля
  for (const sx of [-1, 1]) { rbox(g, 4, 4, 170, 1.5, m2, sx * 10, -5.5, 137); for (let z = 70; z < 215; z += 20) sph(g, 1, MAT.yellow, sx * 10, -3.1, z, 8); }
  const cradles = new THREE.Group(); g.add(cradles);
  for (const sx of [-1, 1]) { rbox(cradles, 11.2, 4.4, 11, 1.6, m1, sx * 10.05, 1.4, 222); rbox(cradles, 11.4, 0.6, 11.2, 0.25, mo, sx * 10.05, 3.2, 222); }
  const dockRing = new THREE.Mesh(new THREE.TorusGeometry(18, 1.1, 10, 48), MAT.yellow); dockRing.position.copy(DOCK_APPROACH); g.add(dockRing);
  const name = textSprite('СТАНЦИЯ «УЛЕЙ-7»', '#ffd05f', 60); name.position.set(0, 120, 0); g.add(name);
  return { group: g, ring, cradles, dockRing };
}

// ---------- КОСМОС ----------
export function buildSpace(scene) {
  const out = {};
  // звёзды
  const N = 7000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(9000); pos.set([v.x, v.y, v.z], i * 3);
    const c = new THREE.Color().setHSL(Math.random() < 0.5 ? 0.6 : 0.08, 0.5, 0.65 + Math.random() * 0.35); col.set([c.r, c.g, c.b], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, toneMapped: false, depthWrite: false }));
  scene.add(out.stars);
  // туманности
  const neb = canvasTex(256, 256, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  const nebCols = [0x7a3cff, 0xff4f9a, 0x2fd6ff, 0xff8a3d, 0x5b2cff, 0x30ffc0, 0xc040ff, 0x2f6bff];
  out.nebula = new THREE.Group(); scene.add(out.nebula);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: neb, color: nebCols[i % nebCols.length], transparent: true, opacity: 0.22 + Math.random() * 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    const d = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.5, Math.random() - 0.5).normalize().multiplyScalar(7500);
    s.position.copy(d); const sc = 3000 + Math.random() * 5000; s.scale.set(sc, sc, 1); out.nebula.add(s);
  }
  // планета
  const ptex = canvasTex(1024, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3b2a6b'); g.addColorStop(0.5, '#ff8a5c'); g.addColorStop(1, '#2a1f55'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { x.fillStyle = `hsla(${(i * 37) % 60 + 250},60%,${30 + Math.random() * 40}%,.25)`; x.fillRect(0, Math.random() * h, w, 4 + Math.random() * 26); }
    for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(255,220,200,.12)'; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 70, 8 + Math.random() * 20, 0, 0, 7); x.fill(); }
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1900, 64, 40), new THREE.MeshStandardMaterial({ map: ptex, roughness: 1 }));
  planet.position.set(-5200, -1400, -6200); scene.add(planet); out.planet = planet;
  const atm = new THREE.Mesh(new THREE.SphereGeometry(2050, 64, 40), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)), 2.5); gl_FragColor = vec4(vec3(1.0,0.55,0.75)*f*1.6, f); }',
  }));
  atm.position.copy(planet.position); scene.add(atm);
  // солнце
  const sunDir = new THREE.Vector3(0.7, 0.45, 0.55).normalize();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: neb, color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sun.position.copy(sunDir.clone().multiplyScalar(8500)); sun.scale.set(1600, 1600, 1); scene.add(sun);
  const dl = new THREE.DirectionalLight(0xfff1dc, 2.4); dl.position.copy(sunDir.clone().multiplyScalar(100)); scene.add(dl);
  scene.add(new THREE.HemisphereLight(0x8a7cff, 0x2a1a30, 0.75));
  scene.add(new THREE.AmbientLight(0x404060, 0.35));
  // космическая пыль вокруг камеры
  const D = 1400, dp = new Float32Array(D * 3);
  for (let i = 0; i < D * 3; i++) dp[i] = (Math.random() - 0.5) * 400;
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  out.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.9, color: 0xc8d8ff, transparent: true, opacity: 0.55, depthWrite: false }));
  out.dust.frustumCulled = false; scene.add(out.dust);
  // астероиды
  const ag = new THREE.IcosahedronGeometry(1, 3), ap = ag.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < ap.count; i++) { v.fromBufferAttribute(ap, i); const n = 1 + 0.22 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3) + 0.1 * Math.sin(v.y * 7); v.multiplyScalar(n); ap.setXYZ(i, v.x, v.y * 0.85, v.z); }
  ag.computeVertexNormals();
  const AN = 170, im = new THREE.InstancedMesh(ag, MAT.rock, AN), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const rocks = []; let seed = 7; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < AN; i++) {
    let p; do { p = new THREE.Vector3((rr() - 0.5) * 4200, (rr() - 0.5) * 900, (rr() - 0.5) * 4200); } while (p.length() < 420 || p.distanceTo(DOCK_APPROACH) < 300);
    const s = 6 + Math.pow(rr(), 2) * 50; q.setFromEuler(new THREE.Euler(rr() * 6, rr() * 6, rr() * 6)); sc.set(s, s, s);
    mtx.compose(p, q, sc); im.setMatrixAt(i, mtx); rocks.push({ p, r: s * 0.95 });
    im.setColorAt(i, new THREE.Color().setHSL(0.05 + rr() * 0.08, 0.15 + rr() * 0.2, 0.35 + rr() * 0.25));
  }
  scene.add(im); out.rocks = rocks;
  return out;
}

// ---------- ЧАСТИЦЫ ----------
export class Particles {
  constructor(parent, max = 2000, additive = true) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.ml = new Float32Array(max); this.s0 = new Float32Array(max); this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.rgb = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('col', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: innerHeight * 0.5 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float size; attribute vec4 col; uniform float uScale; varying vec4 vC; void main(){ vC = col; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*uScale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.05,d)*vC.a; if(a<0.01) discard; gl_FragColor = vec4(vC.rgb, a); }',
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; parent.add(this.points); this.g = g;
  }
  emit(x, y, z, vx, vy, vz, color, life, size, grow = 0, drag = 0) {
    let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = life; this.ml[i] = life; this.s0[i] = size; this.grow[i] = grow; this.drag[i] = drag;
    this.rgb.set([color.r, color.g, color.b], i * 3);
  }
  burst(p, n, color, speed, life, size, grow = 0, drag = 1.5) {
    for (let k = 0; k < n; k++) { const d = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.3 + Math.random() * 0.7)); this.emit(p.x, p.y, p.z, d.x, d.y, d.z, color, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), grow, drag); }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // swap-remove
        const j = --this.n;
        if (i !== j) { for (const [a, s] of [[this.pos, 3], [this.vel, 3], [this.rgb, 3]]) for (let k = 0; k < s; k++) a[i * s + k] = a[j * s + k]; this.life[i] = this.life[j]; this.ml[i] = this.ml[j]; this.s0[i] = this.s0[j]; this.grow[i] = this.grow[j]; this.drag[i] = this.drag[j]; i--; }
        continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      for (let k = 0; k < 3; k++) { this.vel[i * 3 + k] *= dr; this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt; }
      const t = this.life[i] / this.ml[i];
      this.size[i] = this.s0[i] * (1 + this.grow[i] * (1 - t));
      this.col[i * 4] = this.rgb[i * 3]; this.col[i * 4 + 1] = this.rgb[i * 3 + 1]; this.col[i * 4 + 2] = this.rgb[i * 3 + 2]; this.col[i * 4 + 3] = Math.min(1, t * 1.6);
    }
    this.g.setDrawRange(0, this.n);
    this.g.attributes.position.needsUpdate = true; this.g.attributes.col.needsUpdate = true; this.g.attributes.size.needsUpdate = true;
  }
}

// ---------- АВАТАР (космонавт) ----------
export function makeAvatar(name, suitColor = 0xff8a3d) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const suit = std(suitColor, { roughness: 0.6 }), white = std(0xf2ece2, { roughness: 0.5 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.1, metalness: 0.6, emissive: 0x2a8fff, emissiveIntensity: 0.35 });
  capsule(body, 0.33, 0.5, suit, 0, 0.98, 0);
  rbox(body, 0.5, 0.6, 0.28, 0.12, white, 0, 1.05, 0.3);
  const head = new THREE.Group(); head.position.set(0, 1.58, 0); body.add(head);
  sph(head, 0.31, white, 0, 0, 0, 22);
  const vz = sph(head, 0.24, visor, 0, 0.02, -0.14, 18); vz.scale.set(1.05, 0.75, 0.75);
  sph(head, 0.04, MAT.teal, 0.16, 0.26, 0.05, 8);
  const limb = (x, y, r, l, m) => { const piv = new THREE.Group(); piv.position.set(x, y, 0); body.add(piv); const c = capsule(piv, r, l, m, 0, -l / 2 - r * 0.4, 0); return piv; };
  const armL = limb(-0.42, 1.25, 0.11, 0.38, suit), armR = limb(0.42, 1.25, 0.11, 0.38, suit);
  sph(armL, 0.13, white, 0, -0.62, 0, 10); sph(armR, 0.13, white, 0, -0.62, 0, 10);
  const legL = limb(-0.16, 0.62, 0.13, 0.32, suit), legR = limb(0.16, 0.62, 0.13, 0.32, suit);
  rbox(legL, 0.26, 0.16, 0.36, 0.07, white, 0, -0.58, -0.05); rbox(legR, 0.26, 0.16, 0.36, 0.07, white, 0, -0.58, -0.05);
  const tool = new THREE.Group(); tool.position.set(0, -0.6, -0.15); armR.add(tool);
  rbox(tool, 0.16, 0.16, 0.45, 0.05, MAT.hullO, 0, 0, -0.1); sph(tool, 0.06, MAT.teal, 0, 0, -0.36, 8);
  const label = textSprite(name, '#ffffff', 0.9); label.position.y = 2.25; g.add(label);
  const api = {
    group: g, label, t: 0,
    pose(st, dt) {
      api.t += dt * (st.mv ? 9 : 2);
      const s = Math.sin(api.t);
      body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
      legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0); armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0.08);
      if (st.down) { body.rotation.x = -1.45; body.position.set(0, 0.32, 0.6); armL.rotation.x = Math.sin(api.t * 0.7) * 0.3 - 2.5; head.rotation.x = 0.3; return; }
      if (st.seat) { legL.rotation.x = 1.45; legR.rotation.x = 1.45; body.position.y = -0.38; armL.rotation.x = 1.1; armR.rotation.x = 1.1; head.rotation.x = -st.pitch * 0.6; return; }
      head.rotation.x = -st.pitch * 0.7;
      if (st.mv) { legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7; armL.rotation.x = -s * 0.6; armR.rotation.x = s * 0.6; body.position.y = Math.abs(Math.cos(api.t)) * 0.06; }
      else { armL.rotation.z = -0.08 - Math.sin(api.t) * 0.03; body.position.y = Math.sin(api.t) * 0.015; }
      if (st.tool) { armR.rotation.x = 1.4 + Math.sin(api.t * 6) * 0.05; }
    },
  };
  return api;
}

// ---------- руки от первого лица ----------
export function makeViewModel() {
  const g = new THREE.Group();
  const glove = std(0xf2ece2, { roughness: 0.5 }), suit = std(0xff8a3d);
  const r = new THREE.Group(); r.position.set(0.32, -0.32, -0.55); g.add(r);
  capsule(r, 0.08, 0.35, suit, 0.05, -0.05, 0.25).rotation.x = Math.PI / 2 - 0.25;
  sph(r, 0.1, glove, 0, 0, 0, 12);
  rbox(r, 0.14, 0.15, 0.42, 0.05, MAT.hullO, 0, 0.07, -0.12); rbox(r, 0.1, 0.1, 0.2, 0.04, MAT.hullD, 0, 0.07, -0.38);
  const tip = sph(r, 0.055, MAT.teal, 0, 0.07, -0.49, 10);
  const l = new THREE.Group(); l.position.set(-0.36, -0.36, -0.5); g.add(l);
  capsule(l, 0.08, 0.35, suit, -0.04, -0.05, 0.25).rotation.x = Math.PI / 2 - 0.25;
  sph(l, 0.1, glove, 0, 0, 0, 12);
  return { group: g, r, l, tip };
}
