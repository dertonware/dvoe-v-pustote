// Станция «Улей-7» изнутри: проходы из залов → огромный атриум со стеклянным куполом,
// фонтаном-голограммой, баром, лавкой, колоннами и живыми NPC с заданиями.
// Всё в координатах корабля (виден только при стыковке), ось Z — вглубь станции.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { panelTextures } from './fx.js';
import { makePlant, makeCrate, PM } from './props.js';

const gc = {};
const rbg = (w, h, d, r) => { const k = [w, h, d, r].map(v => +v.toFixed(3)).join('_'); return gc[k] || (gc[k] = new RoundedBoxGeometry(w, h, d, 3, Math.max(0.003, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)))); };
const add = (p, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
const box = (p, w, h, d, r, mat, x, y, z) => add(p, rbg(w, h, d, r), mat, x, y, z);
const cyl = (p, r1, r2, h, mat, x, y, z, seg = 24) => add(p, new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z);
const sph = (p, r, mat, x, y, z, seg = 18) => add(p, new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat, x, y, z);
const cap = (p, r, l, mat, x, y, z) => add(p, new THREE.CapsuleGeometry(r, l, 6, 14), mat, x, y, z);
const tex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
// плоская плита с плиткой текстуры по размеру
function slab(p, w, h, d, mat, x, y, z, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const [su, sv] = ay > 0.5 ? [w, d] : ax > 0.5 ? [d, h] : [w, h]; uv.setXY(i, uv.getX(i) * su / tile, uv.getY(i) * sv / tile); }
  return add(p, g, mat, x, y, z);
}

const HA = 7; // высота атриума
export const STATION_WALK = [[11.95, 13.25, 12.4, 17.7], [-13.25, -11.95, 12.4, 17.7], [-16.65, 16.65, 17.35, 39.6]];
export const STATION_OBST = [[0, 28, 3.6], [-9, 20, 0.8], [9, 20, 0.8], [-9, 37, 0.8], [9, 37, 0.8], [-4, 37.3, 1.1], [6.4, 37.6, 1.2], [-5, 24, 0.6], [5, 24, 0.6], [-5, 32, 0.6], [5, 32, 0.6]];
export const STATION_OBST_R = [[-17, -13.55, 23.6, 32.4], [13.75, 17, 21.4, 27.6]];

export function buildStationInterior(parent) {
  const g = new THREE.Group(); parent.add(g);
  const WT = panelTextures('#d9d2c4');
  const wall = new THREE.MeshStandardMaterial({ map: WT.map, bumpMap: WT.bump, bumpScale: 1.2, roughness: 0.6 });
  const wallDark = new THREE.MeshStandardMaterial({ color: 0x2e3140, roughness: 0.5, metalness: 0.4 });
  const floorT = tex(512, 512, (x, w) => { // полированный камень с латунными вставками
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const v = 205 + ((i + j) % 2) * 22; x.fillStyle = `rgb(${v},${v - 6},${v - 16})`; x.fillRect(i * 256, j * 256, 256, 256); }
    for (let k = 0; k < 2000; k++) { x.fillStyle = `rgba(90,80,70,${Math.random() * 0.08})`; x.fillRect(Math.random() * w, Math.random() * w, 1 + Math.random() * 3, 1); }
    x.strokeStyle = '#b8894a'; x.lineWidth = 5; for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(i * 256, 0); x.lineTo(i * 256, w); x.stroke(); x.beginPath(); x.moveTo(0, i * 256); x.lineTo(w, i * 256); x.stroke(); }
  });
  floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping;
  const floor = new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.22, metalness: 0.15 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.06, roughness: 0, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9964f, metalness: 0.9, roughness: 0.3 });
  const warm = new THREE.MeshStandardMaterial({ color: 0xfff1d8, emissive: 0xffd9a0, emissiveIntensity: 1.4 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x5ff6ff, emissive: 0x5ff6ff, emissiveIntensity: 1.3 });

  // ---- переходы из залов ----
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -13.6 : 11.6, x1 = sx < 0 ? -11.6 : 13.6, cx = (x0 + x1) / 2;
    slab(g, 2, 0.2, 4, floor, cx, -0.1, 15, 2); slab(g, 2, 0.2, 4, wallDark, cx, 2.9, 15);
    slab(g, 0.22, 2.8, 4, wall, x0, 1.4, 15); slab(g, 0.22, 2.8, 4, wall, x1, 1.4, 15);
    for (const z of [13.6, 15, 16.4]) box(g, 1.7, 0.04, 0.3, 0.01, warm, cx, 2.78, z);
    box(g, 0.05, 0.04, 3.8, 0.01, teal, x0 + 0.13, 0.05, 15); box(g, 0.05, 0.04, 3.8, 0.01, teal, x1 - 0.13, 0.05, 15);
  }
  // ---- атриум: пол, стены ----
  slab(g, 34, 0.2, 23, floor, 0, -0.1, 28.5, 3);
  // северная стена с проходами (z=17)
  const nw = (a, b) => slab(g, b - a, HA, 0.3, wall, (a + b) / 2, HA / 2, 17);
  nw(-17, -13.6); nw(-11.6, 11.6); nw(13.6, 17);
  for (const sx of [-1, 1]) { slab(g, 2, HA - 2.8, 0.3, wall, sx * 12.6, 2.8 + (HA - 2.8) / 2, 17); box(g, 2.2, 0.12, 0.4, 0.04, brass, sx * 12.6, 2.85, 17); }
  // боковые стены
  for (const sx of [-1, 1]) {
    slab(g, 0.3, HA, 23, wall, sx * 17, HA / 2, 28.5);
    for (let z = 19; z <= 38; z += 3.8) box(g, 0.1, HA - 0.6, 0.22, 0.04, brass, sx * 16.82, HA / 2, z);
  }
  // южная стена — панорамное окно
  slab(g, 34, 0.8, 0.3, wall, 0, 0.4, 40); slab(g, 34, 0.6, 0.3, wall, 0, HA - 0.3, 40);
  add(g, new THREE.PlaneGeometry(34, HA - 1.4), glass, 0, 0.8 + (HA - 1.4) / 2, 40);
  for (let x = -17; x <= 17.01; x += 3.4) box(g, 0.18, HA - 1.4, 0.2, 0.04, wallDark, x, 0.8 + (HA - 1.4) / 2, 40);
  box(g, 34, 0.1, 0.35, 0.03, brass, 0, 0.82, 39.9);
  // потолок со стеклянным куполом
  slab(g, 34, 0.3, 4, wallDark, 0, HA + 0.15, 19); slab(g, 34, 0.3, 4, wallDark, 0, HA + 0.15, 38);
  slab(g, 8, 0.3, 15, wallDark, -13, HA + 0.15, 28.5); slab(g, 8, 0.3, 15, wallDark, 13, HA + 0.15, 28.5);
  const dome = add(g, new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, HA, 28.5); dome.scale.set(9, 3.2, 7.5);
  for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI, rad = 1 / Math.sqrt((Math.cos(ang) / 9) ** 2 + (Math.sin(ang) / 7.5) ** 2); const rib = add(g, new THREE.TorusGeometry(1, 0.025, 6, 48, Math.PI), wallDark, 0, HA, 28.5); rib.rotation.y = -ang; rib.scale.set(rad, 3.2, 1); }
  for (const z of [21, 36]) slab(g, 18, 0.25, 0.3, brass, 0, HA - 0.1, z);
  // гирлянды ламп под потолком
  for (const z of [20.5, 36.5]) for (let x = -15; x <= 15; x += 1.5) sph(g, 0.09, warm, x, HA - 0.6 - Math.sin((x + 15) / 30 * Math.PI) * 0.5, z, 8);
  // колонны
  for (const [x, z] of [[-9, 20], [9, 20], [-9, 37], [9, 37]]) {
    cyl(g, 0.5, 0.55, 0.4, brass, x, 0.2, z); cyl(g, 0.4, 0.4, HA - 0.8, PM.cream, x, HA / 2, z); cyl(g, 0.55, 0.45, 0.4, brass, x, HA - 0.2, z);
    for (const y of [1.5, 3, 4.5]) add(g, new THREE.TorusGeometry(0.42, 0.03, 8, 24), teal, x, y, z).rotation.x = Math.PI / 2;
  }
  // ---- фонтан с голограммой планеты ----
  cyl(g, 3.3, 3.45, 0.55, PM.cream, 0, 0.27, 28, 48); cyl(g, 3.0, 3.0, 0.1, new THREE.MeshStandardMaterial({ color: 0x1a3a48, roughness: 0.1, metalness: 0.3 }), 0, 0.5, 28, 48);
  const water = add(g, new THREE.CircleGeometry(2.95, 48), new THREE.MeshStandardMaterial({ color: 0x3fd0e8, emissive: 0x1a8fa8, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8 }), 0, 0.56, 28); water.rotation.x = -Math.PI / 2;
  add(g, new THREE.TorusGeometry(3.38, 0.08, 8, 64), brass, 0, 0.55, 28).rotation.x = Math.PI / 2;
  cyl(g, 0.5, 0.7, 1.4, PM.cream, 0, 0.7, 28); cyl(g, 0.75, 0.55, 0.2, brass, 0, 1.45, 28);
  const holo = new THREE.Group(); holo.position.set(0, 3.6, 28); g.add(holo);
  add(holo, new THREE.SphereGeometry(1.3, 32, 20), new THREE.MeshBasicMaterial({ color: 0x5ff6ff, wireframe: true, transparent: true, opacity: 0.35, toneMapped: false }));
  add(holo, new THREE.SphereGeometry(1.22, 32, 20), new THREE.MeshBasicMaterial({ color: 0xff9ad0, transparent: true, opacity: 0.12, toneMapped: false, depthWrite: false }));
  const hring = add(holo, new THREE.TorusGeometry(2.0, 0.05, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffd05f, transparent: true, opacity: 0.6, toneMapped: false })); hring.rotation.x = Math.PI / 2 - 0.4;
  const beam = add(g, new THREE.ConeGeometry(1.4, 2.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ff6ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 2.5, 28); beam.rotation.x = Math.PI;
  // скамейки вокруг
  for (const [x, z, r] of [[-5, 24, 0.8], [5, 24, -0.8], [-5, 32, -0.8], [5, 32, 0.8]]) {
    const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = r; g.add(b);
    box(b, 2.2, 0.1, 0.6, 0.04, new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.6 }), 0, 0.48, 0);
    box(b, 2.2, 0.5, 0.08, 0.03, new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.6 }), 0, 0.8, 0.28);
    for (const s of [-0.9, 0.9]) box(b, 0.08, 0.45, 0.5, 0.02, brass, s, 0.22, 0);
  }
  // ---- бар «Глорп» (левая сторона) ----
  box(g, 1.0, 1.1, 8.4, 0.08, new THREE.MeshPhysicalMaterial({ color: 0x3a2a3e, roughness: 0.3, clearcoat: 1 }), -14.1, 0.55, 28);
  box(g, 1.2, 0.08, 8.6, 0.03, brass, -14.1, 1.14, 28);
  box(g, 0.04, 0.06, 8.2, 0.02, new THREE.MeshStandardMaterial({ color: 0xff6fb5, emissive: 0xff6fb5, emissiveIntensity: 1.6 }), -13.58, 0.9, 28);
  for (const y of [1.6, 2.3, 3.0]) box(g, 0.4, 0.06, 8, 0.02, wallDark, -16.7, y, 28);
  const bottleCols = [0xff6fb5, 0x7dffb0, 0xffd05f, 0x5ff6ff, 0xb98ad8];
  for (const y of [1.6, 2.3, 3.0]) for (let z = 24.4; z < 31.8; z += 0.45) { const c = bottleCols[Math.floor(Math.random() * 5)]; cyl(g, 0.07, 0.08, 0.3 + Math.random() * 0.15, new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.85, roughness: 0.05, clearcoat: 1 }), -16.7, y + 0.2, z, 10); }
  for (const z of [25, 28, 31]) { cyl(g, 0.22, 0.22, 0.08, PM.leather, -12.9, 0.78, z, 16); cyl(g, 0.04, 0.12, 0.74, brass, -12.9, 0.37, z, 10); }
  const barSign = signTex('БАР «ГЛОРП»', '#ff6fb5'); const bs = add(g, new THREE.PlaneGeometry(4.5, 1.1), new THREE.MeshStandardMaterial({ map: barSign, emissiveMap: barSign, emissive: 0xffffff, emissiveIntensity: 0.9, transparent: true }), -16.8, 4.4, 28); bs.rotation.y = Math.PI / 2;
  // ---- лавка Хлюпа (правая сторона) ----
  box(g, 1.0, 1.0, 5.6, 0.08, new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.7 }), 14.3, 0.5, 24.5);
  const awnT = tex(256, 64, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ff8a3d' : '#f4ead8'; x.fillRect(i * 32, 0, 32, h); } });
  const awn = add(g, new THREE.PlaneGeometry(3, 6), new THREE.MeshStandardMaterial({ map: awnT, side: THREE.DoubleSide, roughness: 0.8 }), 15.4, 3.1, 24.5); awn.rotation.set(-Math.PI / 2, 0.45, Math.PI / 2);
  for (const z of [21.8, 27.2]) cyl(g, 0.05, 0.05, 3.2, brass, 13.9, 1.6, z, 8);
  for (const [z, s] of [[22.5, 0.6], [23.3, 0.5], [26.4, 0.7]]) { const c = makeCrate(s); c.position.set(14.3, 1.0, z); c.rotation.y = z; g.add(c); }
  for (let i = 0; i < 6; i++) sph(g, 0.15, new THREE.MeshStandardMaterial({ color: [0x7dffb0, 0xff6fb5, 0x5ff6ff][i % 3], emissive: [0x7dffb0, 0xff6fb5, 0x5ff6ff][i % 3], emissiveIntensity: 1.2 }), 14.1 + (i % 2) * 0.3, 1.15, 24 + i * 0.35, 12);
  const shopSign = signTex('ХЛЮП · РЕДКИЙ ТОВАР', '#ffd05f'); const ss = add(g, new THREE.PlaneGeometry(4.5, 1.0), new THREE.MeshStandardMaterial({ map: shopSign, emissiveMap: shopSign, emissive: 0xffffff, emissiveIntensity: 0.9, transparent: true }), 16.8, 4.4, 24.5); ss.rotation.y = -Math.PI / 2;
  // ---- голостол капитана и мастерская Зины ----
  cyl(g, 0.9, 1.0, 0.95, wallDark, -4, 0.48, 37.3, 32); const map = add(g, new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ color: 0x5ff6ff, transparent: true, opacity: 0.5, toneMapped: false }), -4, 0.97, 37.3); map.rotation.x = -Math.PI / 2;
  const mini = new THREE.Group(); mini.position.set(-4, 1.4, 37.3); g.add(mini);
  for (let i = 0; i < 7; i++) sph(mini, 0.05 + Math.random() * 0.08, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff6fb5 : 0xffd05f, toneMapped: false }), Math.cos(i) * 0.5, Math.random() * 0.3, Math.sin(i * 1.7) * 0.5, 8);
  cyl(g, 0.7, 0.7, 2.0, PM.gunL, 6.6, 1.0, 37.8, 24).rotation.z = Math.PI / 2;
  for (const x of [5.8, 6.6, 7.4]) add(g, new THREE.TorusGeometry(0.75, 0.06, 8, 24), wallDark, x, 1.0, 37.8).rotation.y = Math.PI / 2;
  box(g, 0.8, 0.35, 0.4, 0.04, new THREE.MeshStandardMaterial({ color: 0xd84a3a, roughness: 0.4, metalness: 0.4 }), 5.3, 0.18, 36.6);
  // растения и рекламные голо-щиты
  for (const [x, z, k] of [[-15.6, 18.4, 21], [15.6, 18.4, 22], [-15.6, 38.6, 23], [15.6, 38.6, 24], [-11.2, 37.5, 25], [11.2, 37.5, 26]]) { const p = makePlant(k); p.position.set(x, 0, z); p.scale.setScalar(1.3); g.add(p); }
  const ads = [['УЛЕЙ-7', 'лучший порт сектора', '#5ff6ff'], ['ВЕРБУЕМ ПИЛОТОВ', 'хорошо платим. почти.', '#ffb067']];
  ads.forEach(([a, b, c], i) => { const t = adTex(a, b, c); const m = add(g, new THREE.PlaneGeometry(5, 2.2), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.8 }), i ? 16.8 : -16.8, 4.6, 35); m.rotation.y = i ? -Math.PI / 2 : Math.PI / 2; });
  // ---- свет атриума (лампы созданы всегда, яркость — только при стыковке) ----
  const lights = [[-8, 5.6, 25, 0xffd9b0], [8, 5.6, 25, 0xffd9b0], [0, 5.6, 35, 0xffe2c0], [0, 2.2, 28, 0x5ff6ff]].map(([x, y, z, c]) => { const l = new THREE.PointLight(c, 0, 22, 1.3); l.position.set(x, y, z); parent.add(l); return l; });

  // ---- NPC ----
  const npcs = [
    makeNPC({ id: 'vors', name: 'Капитан Ворс', kind: 'captain', pos: [-4, 0, 35.7], yaw: Math.PI, talk: 2.4 }),
    makeNPC({ id: 'zina', name: 'Механик Зина', kind: 'mechanic', pos: [5.2, 0, 35.9], yaw: Math.PI * 0.85, talk: 2.4 }),
    makeNPC({ id: 'hlup', name: 'Торговец Хлюп', kind: 'alien', pos: [15.7, 0, 24.5], yaw: -Math.PI / 2, talk: 2.8 }),
    makeNPC({ id: 'okto', name: 'Бармен Окто', kind: 'octo', pos: [-15.6, 0, 28], yaw: Math.PI / 2, talk: 2.9 }),
    makeNPC({ id: 'w1', name: 'Турист', kind: 'tourist', path: { r: 7.6, c: [0, 28], speed: 0.13, ph: 0 } }),
    makeNPC({ id: 'w2', name: 'Докер', kind: 'docker', path: { r: 8.4, c: [0, 28], speed: -0.1, ph: 2.2 } }),
    makeNPC({ id: 'w3', name: 'Пилот-новичок', kind: 'pilot', path: { pts: [[-10, 22], [10, 22], [10, 34], [-10, 34]], speed: 1.3 } }),
  ];
  for (const n of npcs) g.add(n.g);
  return { group: g, holo, water, mini, lights, npcs };
}

function signTex(text, color) {
  return tex(1024, 256, (x, w, h) => {
    x.fillStyle = 'rgba(10,8,20,.85)'; x.beginPath(); x.roundRect(8, 8, w - 16, h - 16, 60); x.fill();
    x.strokeStyle = color; x.lineWidth = 8; x.stroke();
    x.font = '900 92px Unbounded, Rubik, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
    x.shadowColor = color; x.shadowBlur = 30; x.fillText(text, w / 2, h / 2 + 4, w - 80);
  });
}
function adTex(a, b, c) {
  return tex(1024, 450, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#120a24'); g.addColorStop(1, '#0a1824'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = c; x.lineWidth = 10; x.strokeRect(10, 10, w - 20, h - 20);
    x.font = '900 110px Unbounded, Rubik, Arial, sans-serif'; x.fillStyle = c; x.textAlign = 'center'; x.fillText(a, w / 2, 210, w - 80);
    x.font = '500 54px Rubik, Arial, sans-serif'; x.fillStyle = '#ffffff'; x.fillText(b, w / 2, 320, w - 80);
  });
}

// ---------- персонажи ----------
const skinTones = [0xf1c9a5, 0xd9a07a, 0x8a5a3c];
function makeNPC(def) {
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const mat = (c, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: c, roughness: 0.65, sheen: 0.6, sheenColor: 0xffffff }, o));
  const K = def.kind;
  const coat = { captain: 0x23314f, mechanic: 0xff8a3d, alien: 0x6b4a8f, octo: 0x2a2a3a, tourist: 0x5fb8ff, docker: 0x7d8a5a, pilot: 0xe0d6c6 }[K];
  const skin = K === 'alien' ? 0x8fd96a : K === 'octo' ? 0xb98ad8 : skinTones[(def.id.charCodeAt(0) + def.id.length) % 3];
  const mCoat = mat(coat), mSkin = mat(skin, { sheen: 0.3, roughness: 0.55, clearcoat: K === 'alien' || K === 'octo' ? 0.8 : 0 }), mDark = mat(0x1d1e26);
  // туловище
  cap(body, 0.3, 0.5, mCoat, 0, 1.0, 0);
  box(body, 0.62, 0.08, 0.38, 0.03, mDark, 0, 0.78, 0); // ремень
  if (K === 'captain') { const skirt = add(body, new THREE.CylinderGeometry(0.33, 0.45, 0.6, 20, 1, true), mCoat, 0, 0.55, 0); skirt.material = mCoat; for (const s of [-1, 1]) box(body, 0.14, 0.06, 0.05, 0.02, new THREE.MeshStandardMaterial({ color: 0xffd05f, metalness: 0.9, roughness: 0.3 }), s * 0.22, 1.42, -0.12); }
  if (K === 'mechanic') { box(body, 0.42, 0.3, 0.06, 0.03, mat(0x3a3e4a), 0, 1.05, -0.3); }
  // голова
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); body.add(head);
  if (K === 'alien') {
    sph(head, 0.36, mSkin, 0, 0.05, 0, 24).scale.set(1.15, 0.95, 1);
    sph(head, 0.17, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.1, clearcoat: 1 }), 0, 0.1, -0.28, 18);
    sph(head, 0.09, new THREE.MeshStandardMaterial({ color: 0x111111 }), 0, 0.1, -0.42, 12);
    for (const s of [-1, 1]) { const a = cap(head, 0.025, 0.3, mSkin, s * 0.18, 0.42, 0); a.rotation.z = -s * 0.4; sph(head, 0.06, new THREE.MeshStandardMaterial({ color: 0xffd05f, emissive: 0xffd05f, emissiveIntensity: 1.5 }), s * 0.26, 0.58, 0, 10); }
    const mouth = box(head, 0.18, 0.03, 0.04, 0.01, mDark, 0, -0.12, -0.33);
  } else if (K === 'octo') {
    sph(head, 0.38, mSkin, 0, 0.12, 0, 24).scale.set(1, 1.2, 1);
    for (const s of [-1, 1]) { sph(head, 0.09, new THREE.MeshPhysicalMaterial({ color: 0xfff6a0, emissive: 0xffd05f, emissiveIntensity: 0.6, clearcoat: 1 }), s * 0.14, 0.12, -0.32, 14); sph(head, 0.04, mDark, s * 0.14, 0.12, -0.4, 8); }
    for (let i = 0; i < 6; i++) { const t = cap(head, 0.05, 0.3, mSkin, Math.cos(i) * 0.18, -0.28, Math.sin(i) * 0.12 - 0.05); t.rotation.x = 0.3; }
  } else {
    sph(head, 0.27, mSkin, 0, 0, 0, 24);
    for (const s of [-1, 1]) { sph(head, 0.05, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }), s * 0.1, 0.03, -0.235, 10); sph(head, 0.028, mDark, s * 0.1, 0.03, -0.27, 8); }
    box(head, 0.1, 0.02, 0.02, 0.008, new THREE.MeshStandardMaterial({ color: 0x7a3a3a }), 0, -0.1, -0.25);
    const hairC = { captain: 0xd8d8d8, mechanic: 0x8a3a1a, tourist: 0x2a1a10, docker: 0x111111, pilot: 0xd9a050 }[K] || 0x222222;
    const hair = add(head, new THREE.SphereGeometry(0.285, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), mat(hairC)); hair.position.y = 0.02; hair.rotation.x = 0.15;
    if (K === 'captain') { box(head, 0.3, 0.12, 0.1, 0.04, mat(0xd8d8d8), 0, -0.17, -0.17); const capH = cyl(head, 0.3, 0.3, 0.12, mCoat, 0, 0.24, 0); box(head, 0.36, 0.03, 0.18, 0.01, mDark, 0, 0.19, -0.26); sph(head, 0.04, new THREE.MeshStandardMaterial({ color: 0xffd05f, metalness: 0.9 }), 0, 0.26, -0.3, 8); }
    if (K === 'mechanic') { for (const s of [-1, 1]) add(head, new THREE.TorusGeometry(0.07, 0.025, 8, 16), mat(0x3a3e4a), s * 0.1, 0.17, -0.22); add(head, new THREE.TorusGeometry(0.29, 0.02, 6, 32), mat(0x3a3e4a), 0, 0.17, 0).rotation.x = Math.PI / 2; }
    if (K === 'docker') { const h = add(head, new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffc93a, { clearcoat: 1 })); h.position.y = 0.04; }
    if (K === 'tourist') { for (const s of [-1, 1]) box(head, 0.12, 0.06, 0.02, 0.02, mDark, s * 0.09, 0.04, -0.27); }
  }
  // руки и ноги
  const limb = (x, y, r, l, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); body.add(p); cap(p, r, l, m, 0, -l / 2 - r * 0.4, 0); return p; };
  const armL = limb(-0.4, 1.3, 0.09, 0.42, mCoat), armR = limb(0.4, 1.3, 0.09, 0.42, mCoat);
  sph(armL, 0.1, mSkin, 0, -0.62, 0, 10); sph(armR, 0.1, mSkin, 0, -0.62, 0, 10);
  if (K === 'mechanic') { const w = new THREE.Group(); w.position.set(0, -0.66, -0.08); armR.add(w); box(w, 0.05, 0.05, 0.35, 0.02, PM.gunL, 0, 0, -0.1); add(w, new THREE.TorusGeometry(0.06, 0.02, 6, 12), PM.gunL, 0, 0, -0.3).rotation.y = Math.PI / 2; }
  if (K === 'octo') { const glassW = new THREE.Group(); glassW.position.set(0, -0.66, -0.06); armR.add(glassW); cyl(glassW, 0.05, 0.04, 0.14, new THREE.MeshPhysicalMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.4, roughness: 0 }), 0, 0.05, 0, 10); }
  const pants = K === 'captain' ? mCoat : mat(K === 'mechanic' ? 0x3a3e4a : 0x2c3040);
  const legL = limb(-0.15, 0.62, 0.11, 0.32, pants), legR = limb(0.15, 0.62, 0.11, 0.32, pants);
  box(legL, 0.2, 0.12, 0.3, 0.05, mDark, 0, -0.58, -0.04); box(legR, 0.2, 0.12, 0.3, 0.05, mDark, 0, -0.58, -0.04);
  // табличка с именем и маркер задания
  const label = nameSprite(def.name); label.position.y = 2.35; g.add(label);
  const marker = markerSprite(); marker.position.y = 2.75; marker.visible = false; g.add(marker);
  if (def.pos) { g.position.set(...def.pos); g.rotation.y = def.yaw || 0; }
  const n = { ...def, g, body, head, armL, armR, legL, legR, label, marker, t: Math.random() * 10, baseYaw: def.yaw || 0, talkT: 0, pathT: Math.random() * 10 };
  n.update = (dt, t, player) => updateNPC(n, dt, t, player);
  return n;
}
function nameSprite(text) {
  const c = document.createElement('canvas'), x = c.getContext('2d'); x.font = '700 44px Rubik, Arial'; const w = Math.ceil(x.measureText(text).width) + 50; c.width = w; c.height = 72;
  x.font = '700 44px Rubik, Arial'; x.fillStyle = 'rgba(10,10,24,.7)'; x.beginPath(); x.roundRect(2, 2, w - 4, 68, 30); x.fill(); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, 38);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, color: 0xdddddd })); s.scale.set(0.3 * w / 72, 0.3, 1); return s;
}
const markTex = (ch, col) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = col; x.beginPath(); x.arc(64, 64, 56, 0, 7); x.fill(); x.fillStyle = '#1a1206'; x.font = '900 88px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 70); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const MARK = { offer: markTex('!', '#ffd05f'), done: markTex('?', '#7dffb0') };
function markerSprite() { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: MARK.offer, transparent: true, toneMapped: false })); s.scale.setScalar(0.42); return s; }
export function setNPCMarker(n, state) { n.marker.visible = !!state; if (state) { n.marker.material.map = MARK[state]; n.marker.material.needsUpdate = true; } }

function updateNPC(n, dt, t, player) {
  n.t += dt;
  let moving = false;
  if (n.path) { // прохожие гуляют по маршруту
    n.pathT += dt;
    let x, z, yaw;
    if (n.path.r) { const a = n.path.ph + n.pathT * n.path.speed; x = n.path.c[0] + Math.cos(a) * n.path.r; z = n.path.c[1] + Math.sin(a) * n.path.r; yaw = Math.atan2(Math.sin(a) * Math.sign(n.path.speed), -Math.cos(a) * Math.sign(n.path.speed)); }
    else { const P = n.path.pts, L = P.length; let seg = 0, tt = (n.pathT * n.path.speed) % (L * 10); const per = 10; seg = Math.floor(tt / per) % L; const f = (tt % per) / per; const a = P[seg], b = P[(seg + 1) % L]; x = a[0] + (b[0] - a[0]) * f; z = a[1] + (b[1] - a[1]) * f; yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])); }
    n.g.position.set(x, 0, z); let dy = yaw - n.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.g.rotation.y += dy * Math.min(1, dt * 6); moving = true;
  }
  // разговорчивые NPC поворачиваются к игроку и жестикулируют
  const dx = player.x - n.g.position.x, dz = player.z - n.g.position.z, d = Math.hypot(dx, dz);
  const near = !n.path && d < 5;
  if (!n.path) { const want = near ? Math.atan2(-dx, -dz) : n.baseYaw; let dy = want - n.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.g.rotation.y += dy * Math.min(1, dt * 3); }
  n.talkT = Math.max(0, n.talkT - dt);
  const s = Math.sin(n.t * (moving ? 7 : 1.6));
  n.legL.rotation.x = moving ? s * 0.6 : 0; n.legR.rotation.x = moving ? -s * 0.6 : 0;
  n.armL.rotation.set(moving ? -s * 0.5 : Math.sin(n.t * 1.3) * 0.05, 0, 0.08); n.armR.rotation.set(moving ? s * 0.5 : 0, 0, -0.08);
  n.body.position.y = moving ? Math.abs(Math.cos(n.t * 7)) * 0.05 : Math.sin(n.t * 1.6) * 0.012;
  if (near && !moving) { // машет / объясняет руками
    const k = n.talkT > 0 ? 1 : 0.35;
    n.armR.rotation.x = -1.1 - Math.sin(n.t * 5) * 0.35 * k; n.armR.rotation.z = -0.3 - Math.sin(n.t * 3) * 0.2 * k;
    n.head.rotation.x = Math.sin(n.t * 2) * 0.06;
  } else n.head.rotation.x = 0;
  n.marker.position.y = 2.75 + Math.sin(n.t * 3) * 0.06; n.marker.material.rotation = Math.sin(n.t * 2) * 0.15;
}
