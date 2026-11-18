// Детализированные модели: шлюзовые двери, кресло пилота, терминалы, растения, ящики, руки с инструментом.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const geoCache = {};
const rbg = (w, h, d, r, seg = 3) => { const k = [w, h, d, r, seg].map(v => +v.toFixed(3)).join('_'); return geoCache[k] || (geoCache[k] = new RoundedBoxGeometry(w, h, d, seg, Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)))); };
const add = (p, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
const box = (p, w, h, d, r, mat, x, y, z) => add(p, rbg(w, h, d, r), mat, x, y, z);
const cyl = (p, r1, r2, h, mat, x, y, z, seg = 20) => add(p, new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z);
const sph = (p, r, mat, x, y, z, seg = 16) => add(p, new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat, x, y, z);
const cap = (p, r, l, mat, x, y, z) => add(p, new THREE.CapsuleGeometry(r, l, 6, 12), mat, x, y, z);
const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

export const PM = {
  gun: new THREE.MeshStandardMaterial({ color: 0x3a3e4a, metalness: 0.85, roughness: 0.32 }),
  gunL: new THREE.MeshStandardMaterial({ color: 0x8c93a3, metalness: 0.9, roughness: 0.22 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1b1c22, roughness: 0.85 }),
  orange: new THREE.MeshPhysicalMaterial({ color: 0xff7a3d, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15 }),
  cream: new THREE.MeshPhysicalMaterial({ color: 0xece4d6, roughness: 0.45, clearcoat: 0.6 }),
  leather: new THREE.MeshPhysicalMaterial({ color: 0x24252d, roughness: 0.6, sheen: 1, sheenColor: 0x6a6a80, sheenRoughness: 0.5 }),
  glove: new THREE.MeshPhysicalMaterial({ color: 0xb9b2a6, roughness: 0.8, sheen: 0.5, sheenColor: 0x9a9a9a, sheenRoughness: 0.7 }),
  suit: new THREE.MeshPhysicalMaterial({ color: 0xff8a3d, roughness: 0.75, sheen: 0.8, sheenColor: 0xffc79a }),
  tealGlow: new THREE.MeshStandardMaterial({ color: 0x5ff6ff, emissive: 0x5ff6ff, emissiveIntensity: 1.6 }),
  fluid: new THREE.MeshPhysicalMaterial({ color: 0x5ff6ff, emissive: 0x2fb8c8, emissiveIntensity: 0.8, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xcff6ff, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
  pot: new THREE.MeshPhysicalMaterial({ color: 0xe8ddd0, roughness: 0.3, clearcoat: 1 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 1 }),
  leaf: new THREE.MeshPhysicalMaterial({ color: 0x4fae6a, roughness: 0.5, sheen: 1, sheenColor: 0xb8ffcf, side: THREE.DoubleSide }),
};

// полосы «осторожно»
const hazardTex = canvas(256, 64, (x, w, h) => { x.fillStyle = '#ffc93a'; x.fillRect(0, 0, w, h); x.fillStyle = '#16161c'; for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 32, h); x.lineTo(i * 32 + 16, h); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 32, 0); x.fill(); } });
hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
const hazard = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.5, metalness: 0.2 });

// ---------- ШЛЮЗ: рама + две створки + маячки + статус-лампы ----------
// дверь стоит в плоскости x = sx*4.5, проём z 7.2..8.8, высота 0..2.8. Створки уезжают по ±z.
export function makeAirlockDoor(sx) {
  const g = new THREE.Group(); g.position.set(sx * 4.5, 0, 8);
  // рама (с обеих сторон стены): верх, низ, бока + полосы «осторожно»
  for (const side of [-1, 1]) {
    const fx = side * 0.16;
    box(g, 0.14, 0.32, 2.05, 0.04, PM.gun, fx, 2.95, 0);
    box(g, 0.14, 3.2, 0.24, 0.04, PM.gun, fx, 1.4, -0.92); box(g, 0.14, 3.2, 0.24, 0.04, PM.gun, fx, 1.4, 0.92);
    const hz = add(g, new THREE.PlaneGeometry(1.6, 0.16), hazard, fx + side * 0.075, 2.9, 0); hz.rotation.y = side * Math.PI / 2;
    const hz2 = add(g, new THREE.PlaneGeometry(1.6, 0.12), hazard, fx + side * 0.075, 0.06, 0); hz2.rotation.y = side * Math.PI / 2;
  }
  // створки
  const panels = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.z = s * 0.4; g.add(p);
    box(p, 0.16, 2.78, 0.8, 0.05, PM.orange, 0, 1.4, 0);
    box(p, 0.18, 2.5, 0.06, 0.02, PM.gun, 0, 1.4, s * -0.38); // кромка-уплотнитель у шва
    for (let k = 0; k < 3; k++) box(p, 0.19, 0.08, 0.62, 0.02, PM.gun, 0, 0.55 + k * 0.85, s * 0.04);
    // иллюминатор
    const win = add(p, new THREE.CylinderGeometry(0.13, 0.13, 0.2, 20), PM.glass, 0, 1.85, s * 0.08); win.rotation.z = Math.PI / 2;
    const ring = add(p, new THREE.TorusGeometry(0.14, 0.025, 8, 24), PM.gunL, 0.09, 1.85, s * 0.08); ring.rotation.y = Math.PI / 2;
    const ring2 = ring.clone(); ring2.position.x = -0.09; p.add(ring2);
    // «зубцы» по шву створок
    for (let k = 0; k < 5; k++) box(p, 0.17, 0.18, 0.08, 0.02, PM.gun, 0, 0.5 + k * 0.48, s * -0.36);
    panels.push(p);
  }
  // статус-лампы и вращающиеся маячки с обеих сторон
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xff3b4f, emissive: 0xff3b4f, emissiveIntensity: 2 });
  const beacons = [];
  for (const side of [-1, 1]) {
    sph(g, 0.07, lampMat, side * 0.25, 2.5, -1.15, 12);
    const b = new THREE.Group(); b.position.set(side * 0.3, 3.2, 0.95); g.add(b);
    cyl(b, 0.09, 0.11, 0.12, PM.gun, 0, -0.08, 0, 12);
    const dome = sph(b, 0.1, new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff8a00, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }), 0, 0.02, 0, 14);
    const beam = add(b, new THREE.ConeGeometry(0.5, 1.6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 0, 0, 0.8);
    beam.rotation.x = -Math.PI / 2; beam.geometry.translate(0, -0.8, 0);
    beacons.push({ b, dome, beam });
  }
  // точки, откуда бьёт пар при выравнивании давления
  const vents = [];
  for (const side of [-1, 1]) for (const z of [-0.85, 0.85]) { vents.push(new THREE.Vector3(side * 0.25, 0.25, z)); vents.push(new THREE.Vector3(side * 0.25, 2.7, z)); }
  return { g, panels, lampMat, beacons, vents, sx, t: 0, target: 0, phase: 'idle', pt: 0 };
}

// ---------- КРЕСЛО ПИЛОТА ----------
export function makePilotSeat() {
  const g = new THREE.Group();
  cyl(g, 0.1, 0.16, 0.42, PM.gunL, 0, 0.21, 0, 16);
  box(g, 0.62, 0.06, 0.5, 0.02, PM.gun, 0, 0.42, 0);
  box(g, 0.6, 0.14, 0.56, 0.06, PM.leather, 0, 0.52, -0.02);                 // подушка
  for (const sx of [-1, 1]) box(g, 0.1, 0.2, 0.55, 0.05, PM.leather, sx * 0.31, 0.58, -0.02); // боковые валики
  const back = new THREE.Group(); back.position.set(0, 0.56, 0.26); back.rotation.x = -0.18; g.add(back);
  box(back, 0.58, 0.82, 0.12, 0.06, PM.leather, 0, 0.45, 0);
  for (const sx of [-1, 1]) box(back, 0.1, 0.72, 0.18, 0.05, PM.leather, sx * 0.3, 0.42, -0.03);
  box(back, 0.3, 0.2, 0.12, 0.06, PM.leather, 0, 1.0, 0);                    // подголовник
  box(back, 0.6, 0.86, 0.04, 0.02, PM.gun, 0, 0.46, 0.08);                   // каркас сзади
  box(back, 0.05, 0.6, 0.02, 0.01, PM.orange, 0, 0.45, -0.065);               // оранжевая строчка
  for (const sx of [-1, 1]) { box(g, 0.08, 0.06, 0.4, 0.03, PM.gun, sx * 0.4, 0.78, 0.0); cyl(g, 0.02, 0.02, 0.2, PM.gunL, sx * 0.4, 0.66, 0.12, 8); }
  // ремни
  for (const sx of [-1, 1]) { const st = box(g, 0.05, 0.75, 0.015, 0.005, PM.orange, sx * 0.15, 0.95, 0.19); st.rotation.x = -0.18; }
  return g;
}

// ---------- ТЕРМИНАЛ (стойка + экран с читаемым текстом + голограмма) ----------
const ICON_DRAW = {
  shop: (x, cx, cy, s) => { x.beginPath(); x.moveTo(cx - s, cy - s * 0.3); x.lineTo(cx, cy - s); x.lineTo(cx + s, cy - s * 0.3); x.lineTo(cx, cy + s); x.closePath(); x.stroke(); },
  repair: (x, cx, cy, s) => { x.beginPath(); x.arc(cx - s * 0.3, cy - s * 0.3, s * 0.5, 0, 6.3); x.stroke(); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + s, cy + s); x.stroke(); },
  missions: (x, cx, cy, s) => { for (const r of [1, 0.6, 0.2]) { x.beginPath(); x.arc(cx, cy, s * r, 0, 6.3); x.stroke(); } },
  med: (x, cx, cy, s) => { x.fillRect(cx - s * 0.22, cy - s, s * 0.44, s * 2); x.fillRect(cx - s, cy - s * 0.22, s * 2, s * 0.44); },
};
export function makeTerminal(id, title, sub, color) {
  const g = new THREE.Group();
  box(g, 0.9, 0.08, 0.7, 0.03, PM.gun, 0, 0.04, 0);
  box(g, 0.34, 1.0, 0.3, 0.08, PM.cream, 0, 0.55, 0.1);
  box(g, 0.36, 0.06, 0.32, 0.02, PM.orange, 0, 0.85, 0.1);
  const head = new THREE.Group(); head.position.set(0, 1.25, 0); head.rotation.x = -0.35; g.add(head);
  box(head, 1.15, 0.78, 0.1, 0.05, PM.gun, 0, 0, 0);
  const tex = canvas(1024, 680, (x, w, h) => {
    const bg = x.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#08141c'); bg.addColorStop(1, '#0c0a18'); x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = color; x.globalAlpha = 0.15; for (let i = 0; i < h; i += 6) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); } x.globalAlpha = 1;
    x.fillStyle = color; x.fillRect(0, 0, w, 14);
    x.lineWidth = 14; x.strokeStyle = color; x.fillStyle = color; (ICON_DRAW[id] || ICON_DRAW.missions)(x, 170, 300, 95);
    x.font = '900 86px Unbounded, Rubik, Arial, sans-serif'; x.fillStyle = '#ffffff'; x.textBaseline = 'middle';
    const words = title.split(' '); x.fillText(words[0], 320, words.length > 1 ? 250 : 300); if (words.length > 1) x.fillText(words.slice(1).join(' '), 320, 350);
    x.font = '500 40px Rubik, Arial, sans-serif'; x.fillStyle = color; x.fillText(sub, 60, 560);
    x.font = '700 34px Rubik, Arial, sans-serif'; x.fillStyle = '#ffffff'; x.globalAlpha = 0.7; x.fillText('▶ НАЖМИ  E', 700, 620); x.globalAlpha = 1;
  });
  const scr = add(head, new THREE.PlaneGeometry(1.05, 0.69), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.25, metalness: 0 }), 0, 0, -0.052);
  scr.rotation.y = Math.PI;
  const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.8, toneMapped: false }));
  holo.position.set(0, 1.95, 0); g.add(holo);
  const strip = box(g, 0.9, 0.02, 0.02, 0.005, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }), 0, 0.09, -0.34);
  return { g, holo, scr };
}

// ---------- РАСТЕНИЕ ----------
export function makePlant(seed = 1) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.32, 0.24, 0.55, 24), PM.pot, 0, 0.275, 0);
  add(g, new THREE.TorusGeometry(0.31, 0.03, 8, 24), PM.gun, 0, 0.55, 0).rotation.x = Math.PI / 2;
  add(g, new THREE.CylinderGeometry(0.29, 0.29, 0.04, 20), PM.soil, 0, 0.53, 0);
  const leafGeo = new THREE.SphereGeometry(1, 12, 8); leafGeo.scale(0.12, 0.02, 0.45); leafGeo.translate(0, 0, 0.42);
  let r = seed * 9.7;
  const rnd = () => (r = (r * 16807 + 1) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    const l = new THREE.Mesh(leafGeo, PM.leaf); l.position.set(0, 0.55 + rnd() * 0.1, 0);
    l.rotation.set(-0.5 - rnd() * 0.8, i / 14 * Math.PI * 2 + rnd() * 0.3, 0); l.scale.setScalar(0.8 + rnd() * 0.6); g.add(l);
  }
  return g;
}

// ---------- ГРУЗОВОЙ ЯЩИК ----------
const crateTex = canvas(256, 256, (x, w, h) => {
  x.fillStyle = '#5a5f6e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#2a2d36'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16);
  x.fillStyle = '#ff8a3d'; x.fillRect(8, 100, w - 16, 56); x.fillStyle = '#16161c'; x.font = '900 40px Arial'; x.textAlign = 'center'; x.fillText('DV-CARGO', w / 2, 142);
  x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 30; i++) x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 20, 2);
});
const crateMat = new THREE.MeshPhysicalMaterial({ map: crateTex, roughness: 0.55, metalness: 0.4, clearcoat: 0.3 });
export function makeCrate(s = 0.9) {
  const g = new THREE.Group();
  box(g, s, s, s, 0.06, crateMat, 0, s / 2, 0);
  for (const y of [0.08, s - 0.08]) box(g, s + 0.04, 0.08, s + 0.04, 0.03, PM.gun, 0, y, 0);
  return g;
}

// ---------- РУКИ + РЕМОНТНЫЙ ИНСТРУМЕНТ «РМ-3» (от первого лица) ----------
export function makeViewModel() {
  const g = new THREE.Group();
  const r = new THREE.Group(); r.position.set(0.2, -0.235, -0.5); r.rotation.y = 0.06; g.add(r);
  const tool = new THREE.Group(); r.add(tool);
  // корпус
  box(tool, 0.085, 0.1, 0.36, 0.025, PM.gun, 0, 0.05, -0.1);
  box(tool, 0.09, 0.045, 0.3, 0.02, PM.orange, 0, 0.11, -0.08);
  box(tool, 0.092, 0.012, 0.22, 0.004, PM.gunL, 0, 0.086, -0.08);
  // рукоять с насечками
  const grip = box(tool, 0.055, 0.15, 0.07, 0.02, PM.rubber, 0, -0.06, 0.03); grip.rotation.x = 0.28;
  for (let k = 0; k < 4; k++) { const n = box(tool, 0.058, 0.01, 0.072, 0.003, PM.gun, 0, -0.01 - k * 0.032, 0.02 + k * 0.009); n.rotation.x = 0.28; }
  const trigger = box(tool, 0.016, 0.04, 0.02, 0.006, PM.gunL, 0, -0.005, -0.04); trigger.rotation.x = 0.3;
  // баллон со светящимся составом
  const can = add(tool, new THREE.CylinderGeometry(0.035, 0.035, 0.17, 18), PM.fluid, -0.066, 0.07, -0.08); can.rotation.x = Math.PI / 2;
  for (const z of [-0.17, 0.01]) { const cr = add(tool, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 18), PM.gunL, -0.066, 0.07, z); cr.rotation.x = Math.PI / 2; }
  // сопло с катушками
  const noz = add(tool, new THREE.CylinderGeometry(0.022, 0.03, 0.14, 16), PM.gunL, 0, 0.05, -0.34); noz.rotation.x = Math.PI / 2;
  const coils = [];
  for (let k = 0; k < 3; k++) { const c = add(tool, new THREE.TorusGeometry(0.034, 0.006, 6, 20), PM.tealGlow, 0, 0.05, -0.3 - k * 0.03); coils.push(c); }
  const flare = add(tool, new THREE.CylinderGeometry(0.038, 0.024, 0.03, 16, 1, true), PM.gun, 0, 0.05, -0.425); flare.rotation.x = Math.PI / 2;
  const tip = sph(tool, 0.016, PM.tealGlow, 0, 0.05, -0.435, 10);
  // экранчик давления
  const scrT = canvas(128, 64, (x, w, h) => { x.fillStyle = '#071318'; x.fillRect(0, 0, w, h); x.fillStyle = '#5ff6ff'; x.font = '700 28px Arial'; x.fillText('87 PSI', 8, 40); x.fillRect(8, 50, 90, 6); });
  const scr = add(tool, new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ map: scrT, toneMapped: false }), 0, 0.137, 0.03); scr.rotation.x = -Math.PI / 2 + 0.5;
  // правая перчатка: ладонь, обхватившие пальцы, большой палец, манжета, рукав
  const hand = new THREE.Group(); hand.position.set(0, -0.06, 0.04); hand.rotation.x = 0.28; tool.add(hand);
  box(hand, 0.075, 0.1, 0.09, 0.03, PM.glove, 0.02, 0, 0.035);
  for (let k = 0; k < 4; k++) { const f = cap(hand, 0.013, 0.05, PM.glove, -0.018, 0.035 - k * 0.026, -0.03); f.rotation.z = Math.PI / 2; }
  const th = cap(hand, 0.014, 0.05, PM.glove, -0.03, 0.06, 0.02); th.rotation.set(0.6, 0, 0.9);
  const cuff = add(hand, new THREE.CylinderGeometry(0.05, 0.052, 0.05, 18), PM.cream, 0.02, -0.02, 0.1); cuff.rotation.x = Math.PI / 2 - 0.3;
  const sleeve = cap(hand, 0.055, 0.22, PM.suit, 0.03, -0.06, 0.22); sleeve.rotation.x = Math.PI / 2 - 0.5;
  box(hand, 0.02, 0.02, 0.12, 0.008, PM.orange, 0.085, -0.04, 0.2).rotation.x = -0.5;
  // левая рука поддерживает инструмент снизу
  const l = new THREE.Group(); l.position.set(-0.03, -0.3, -0.66); g.add(l);
  box(l, 0.08, 0.05, 0.1, 0.022, PM.glove, 0.06, 0.06, 0.02);
  for (let k = 0; k < 4; k++) { const f = cap(l, 0.012, 0.04, PM.glove, 0.09 + k * 0.004, 0.09, -0.02 + k * 0.022); f.rotation.x = 0.2; f.rotation.z = -0.9; }
  const lc = add(l, new THREE.CylinderGeometry(0.048, 0.05, 0.05, 16), PM.cream, 0.02, 0.03, 0.09); lc.rotation.x = Math.PI / 2 - 0.6; lc.rotation.z = 0.4;
  const ls = cap(l, 0.052, 0.24, PM.suit, -0.03, -0.04, 0.22); ls.rotation.x = Math.PI / 2 - 0.7; ls.rotation.z = 0.35;
  g.traverse(o => { if (o.isMesh) { o.renderOrder = 10; } });
  return { group: g, r, l, tip, trigger, coils, tool };
}
