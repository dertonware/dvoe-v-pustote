// Космо-твари: полумультяшные, полужуткие
import * as THREE from 'three';

const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0 }, o));
// кожа: пятна и прожилки (цвет + рельеф)
const skinTex = (() => {
  const mk = bump => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = bump ? '#808080' : '#ffffff'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { const r = 4 + Math.random() * 18; x.fillStyle = bump ? `rgba(40,40,40,${0.2 + Math.random() * 0.3})` : `rgba(150,90,140,${0.08 + Math.random() * 0.18})`; x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, r, r * (0.5 + Math.random() * 0.6), Math.random() * 3, 0, 7); x.fill(); }
    x.lineWidth = 2; x.strokeStyle = bump ? 'rgba(220,220,220,.7)' : 'rgba(120,40,110,.35)';
    for (let i = 0; i < 14; i++) { x.beginPath(); let px = Math.random() * 256, py = Math.random() * 256; x.moveTo(px, py); for (let k = 0; k < 8; k++) { px += (Math.random() - 0.5) * 50; py += (Math.random() - 0.5) * 50; x.lineTo(px, py); } x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (!bump) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: mk(false), bump: mk(true) };
})();
// слизистая кожа: лак сверху, бархатный отлив, светящийся контур по краю силуэта
function slime(color, rim = 0x7dffb0, o = {}) {
  const m = new THREE.MeshPhysicalMaterial(Object.assign({ color, map: skinTex.map, bumpMap: skinTex.bump, bumpScale: 2, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.18, sheen: 0.8, sheenColor: new THREE.Color(rim).multiplyScalar(0.6), sheenRoughness: 0.4 }, o));
  m.onBeforeCompile = sh => {
    sh.uniforms.uRim = { value: new THREE.Color(rim) };
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat rimF = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);\ntotalEmissiveRadiance += uRim * rimF * 1.1;');
  };
  return m;
}
const M = {
  skin: slime(0xd9a6c9), skin2: slime(0xb98ad8, 0xff6fb5), skinW: slime(0xe7c3a8, 0xffb067), skinN: slime(0x7d5a7a, 0x7dffb0, { roughness: 0.7 }),
  belly: slime(0xf3d9e6, 0xffffff), eye: new THREE.MeshPhysicalMaterial({ color: 0xfbf8f2, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }), pupil: new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.1, clearcoat: 1 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  iris: new THREE.MeshStandardMaterial({ color: 0x5ff6ff, emissive: 0x5ff6ff, emissiveIntensity: 2.2 }),
  irisR: new THREE.MeshStandardMaterial({ color: 0xff3b4f, emissive: 0xff3b4f, emissiveIntensity: 2.6 }),
  mouth: std(0x3a0712, { roughness: 0.9 }), tooth: std(0xfff4e0, { roughness: 0.3 }),
  core: new THREE.MeshStandardMaterial({ color: 0xff6fb5, emissive: 0xff4fa0, emissiveIntensity: 2.8, transparent: true, opacity: 0.95 }),
  coreG: new THREE.MeshStandardMaterial({ color: 0x7dffb0, emissive: 0x7dffb0, emissiveIntensity: 2.4 }),
  bell: new THREE.MeshPhysicalMaterial({ color: 0xe9b6dd, roughness: 0.15, transparent: true, opacity: 0.78, side: THREE.DoubleSide, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, sheen: 1, sheenColor: 0xff9fd8, emissive: 0x401030, emissiveIntensity: 0.6 }),
  bellBoss: new THREE.MeshPhysicalMaterial({ color: 0x9a6ad0, roughness: 0.2, transparent: true, opacity: 0.86, side: THREE.DoubleSide, iridescence: 1, iridescenceIOR: 1.5, clearcoat: 1, sheen: 1, sheenColor: 0xc08aff, emissive: 0x200a40, emissiveIntensity: 0.8 }),
};
const G = { s: new THREE.SphereGeometry(1, 20, 14), sLo: new THREE.SphereGeometry(1, 12, 8), cone: new THREE.ConeGeometry(1, 1, 10) };
function ball(parent, r, mat, x = 0, y = 0, z = 0, lo) { const m = new THREE.Mesh(lo ? G.sLo : G.s, mat); m.scale.setScalar(r); m.position.set(x, y, z); parent.add(m); return m; }
function makeEye(parent, r, x, y, z, red) {
  const e = new THREE.Group(); e.position.set(x, y, z); parent.add(e);
  ball(e, r, M.eye);
  const pup = new THREE.Group(); e.add(pup);
  ball(pup, r * 0.55, red ? M.irisR : M.iris, 0, 0, -r * 0.62);
  ball(pup, r * 0.32, M.pupil, 0, 0, -r * 0.88);
  return { g: e, pup };
}
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
function lookEye(eye, target) { // зрачок смотрит на цель (мировые координаты)
  eye.g.updateWorldMatrix(true, false);
  const local = eye.g.worldToLocal(_v.copy(target)).normalize();
  _m.lookAt(new THREE.Vector3(), local, new THREE.Vector3(0, 1, 0));
  eye.pup.quaternion.setFromRotationMatrix(_m);
}
function faceDir(g, vel, k) {
  if (vel.lengthSq() < 1) return;
  _m.lookAt(new THREE.Vector3(), vel, new THREE.Vector3(0, 1, 0));
  _q.setFromRotationMatrix(_m); g.quaternion.slerp(_q, k);
}

function tentacles(parent, n, segs, r0, spread, y, mat) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, chain = [];
    for (let s = 0; s < segs; s++) { const r = r0 * (1 - s / segs * 0.7); chain.push(ball(parent, r, mat, 0, 0, 0, true)); }
    list.push({ a, chain, spread });
  }
  return { list, y, update(t, len) { for (const tt of this.list) tt.chain.forEach((b, s) => { const k = s / tt.chain.length; const sw = Math.sin(t * 2.2 + tt.a * 3 + s * 0.7) * (0.3 + k); b.position.set(Math.cos(tt.a) * (tt.spread + sw * len * 0.25), this.y - s * len, Math.sin(tt.a) * (tt.spread + Math.cos(t * 1.7 + tt.a * 2 + s) * len * 0.25)); }); } };
}

export function makeCreature(type) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const o = { type, group: g, body, eyes: [], t: Math.random() * 10, pop: 0 };
  if (type === 'sw') {
    ball(body, 2.4, M.skin).scale.set(2.4, 2.1, 2.6);
    ball(body, 1.6, M.belly, 0, -0.9, -0.3).scale.set(1.8, 1.1, 1.9);
    o.eyes.push(makeEye(body, 1.45, 0, 0.5, -1.7));
    const mouth = ball(body, 0.6, M.mouth, 0, -1, -2.1); mouth.scale.set(0.9, 0.35, 0.5);
    o.fins = [];
    for (const sx of [-1, 1]) { const f = new THREE.Group(); f.position.set(sx * 2, 0.3, 0.3); body.add(f); ball(f, 1, M.skin2, sx * 1.1, 0, 0).scale.set(1.5, 0.25, 1); o.fins.push(f); }
    o.tail = [1.6, 1.2, 0.8].map((r, i) => ball(body, r, i % 2 ? M.skin2 : M.skin, 0, 0, 2.4 + i * 1.3, true));
  } else if (type === 'je') {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(5, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.58), M.bell); body.add(bell); o.bell = bell;
    ball(body, 2.3, M.core, 0, 0.8, 0);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; o.eyes.push(makeEye(body, 0.95, Math.cos(a) * 3.6, 2.4, Math.sin(a) * 3.6)); }
    o.eyes.push(makeEye(body, 1.3, 0, 4.4, 0));
    o.tent = tentacles(body, 7, 6, 0.75, 3, -0.4, M.skin);
  } else if (type === 'wo') {
    const head = new THREE.Group(); body.add(head); o.head = head;
    ball(head, 4.6, M.skinW).scale.set(4.6, 4.2, 5);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.9, 12, 26), M.skin); lip.position.z = -4.3; head.add(lip);
    const throat = ball(head, 2.3, M.mouth, 0, 0, -4); throat.scale.set(2.3, 2.3, 1);
    o.teeth = [];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const tt = new THREE.Mesh(G.cone, M.tooth); tt.scale.set(0.35, 1.2, 0.35); tt.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, -4.4); tt.rotation.z = a + Math.PI / 2; tt.rotation.x = -0.4; tt.userData.a = a; head.add(tt); o.teeth.push(tt); }
    o.eyes.push(makeEye(head, 1.0, -2.4, 2.6, -2.4), makeEye(head, 1.0, 2.4, 2.6, -2.4), makeEye(head, 0.6, 0, 3.6, -1.4, true));
    o.segs = []; for (let i = 0; i < 13; i++) { const r = 4 - i * 0.22; const s = ball(g, r, i % 3 === 0 ? M.skin2 : M.skinW, 0, 0, 0, true); o.segs.push(s); }
    o.path = [];
  } else if (type === 'ne') {
    const geo = new THREE.IcosahedronGeometry(20, 4), p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.16 * Math.sin(v.x * 0.3) * Math.cos(v.y * 0.27) + 0.09 * Math.sin(v.z * 0.6 + v.x * 0.2); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    body.add(new THREE.Mesh(geo, M.skinN));
    o.pods = [];
    for (let i = 0; i < 14; i++) { const d = new THREE.Vector3().randomDirection(); const pd = ball(body, 2 + Math.random() * 2.5, M.coreG, d.x * 19, d.y * 19, d.z * 19, true); o.pods.push(pd); }
    for (let i = 0; i < 6; i++) { const d = new THREE.Vector3().randomDirection().multiplyScalar(20.5); const e = makeEye(body, 2.4, d.x, d.y, d.z, true); o.eyes.push(e); }
  } else if (type === 'bo') {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(32, 40, 26, 0, Math.PI * 2, 0, Math.PI * 0.6), M.bellBoss); body.add(bell); o.bell = bell;
    o.core = ball(body, 14, M.core, 0, 5, 0);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; o.eyes.push(makeEye(body, 4.2, Math.cos(a) * 24, 14, Math.sin(a) * 24, i % 3 === 0)); }
    o.eyes.push(makeEye(body, 8, 0, 29, 0, true));
    o.bigEye = makeEye(body, 7, 0, -6, 0, true);
    o.tent = tentacles(body, 10, 9, 3.4, 22, -4, M.skin2);
  }
  return o;
}

const _tgt = new THREE.Vector3();
export function animateCreature(o, dt, vel, shipPos, state) {
  o.t += dt; const t = o.t;
  o.pop = Math.max(0, o.pop - dt * 6);
  // появление из ниоткуда + упругий «пружинный» отклик на попадание
  o.born = Math.min(1, (o.born || 0) + dt * 1.6);
  const bornK = 1 - Math.pow(1 - o.born, 3) + Math.sin(o.born * Math.PI) * 0.15;
  const sc = (1 + o.pop * 0.18 * Math.cos(o.pop * 9)) * bornK;
  // сжатие-растяжение по скорости
  const sp = vel.length(), st = Math.min(0.25, sp / 600);
  o.body.scale.set(sc * (1 - st * 0.5), sc * (1 - st * 0.5), sc * (1 + st));
  // белая вспышка при попадании
  o.flash = Math.max(0, (o.flash || 0) - dt * 14);
  const fl = o.flash > 0.35;
  if (fl !== o.flashing) {
    o.flashing = fl;
    o.group.traverse(m => { if (!m.isMesh) return; if (fl) { m.userData.m0 = m.material; m.material = M.flash; } else if (m.userData.m0) m.material = m.userData.m0; });
  }
  for (const e of o.eyes) lookEye(e, shipPos);
  switch (o.type) {
    case 'sw':
      faceDir(o.group, vel, Math.min(1, dt * 6));
      o.fins.forEach((f, i) => f.rotation.z = Math.sin(t * 16) * 0.7 * (i ? 1 : -1));
      o.tail.forEach((b, i) => b.position.x = Math.sin(t * 9 - i) * (0.4 + i * 0.35));
      break;
    case 'je': {
      const p = Math.sin(t * 2.4); o.bell.scale.set(1 + p * 0.08, 1 - p * 0.12, 1 + p * 0.08);
      o.tent.update(t, 1.7);
      o.group.rotation.y += dt * 0.3;
      break;
    }
    case 'wo': {
      faceDir(o.group, vel, Math.min(1, dt * 5));
      const open = state === 1 ? 1 : 0.2 + Math.sin(t * 3) * 0.1;
      o.teeth.forEach(tt => { const r = 2.2 + open * 1.1; tt.position.x = Math.cos(tt.userData.a) * r; tt.position.y = Math.sin(tt.userData.a) * r; });
      // хвост по траектории
      o.group.updateMatrixWorld();
      const wp = o.group.getWorldPosition(_tgt).clone();
      if (!o.path.length || o.path[0].distanceTo(wp) > 1.2) { o.path.unshift(wp); if (o.path.length > 120) o.path.pop(); }
      const inv = new THREE.Matrix4().copy(o.group.matrixWorld).invert();
      let acc = 0, idx = 0;
      o.segs.forEach((s, i) => {
        const want = 5.2 + i * 3.4;
        while (idx < o.path.length - 1 && acc + o.path[idx].distanceTo(o.path[idx + 1]) < want) { acc += o.path[idx].distanceTo(o.path[idx + 1]); idx++; }
        const p = (o.path[Math.min(idx, o.path.length - 1)] || wp).clone();
        if (o.path.length < 3) p.copy(wp).add(new THREE.Vector3(0, 0, want).applyQuaternion(o.group.quaternion));
        p.applyMatrix4(inv);
        p.x += Math.sin(t * 4 + i * 0.6) * 0.5;
        s.position.copy(p);
      });
      break;
    }
    case 'ne':
      o.group.rotation.y += dt * 0.15; o.group.rotation.x += dt * 0.05;
      o.pods.forEach((p, i) => p.scale.setScalar((2.2 + i % 3) * (1 + Math.sin(t * 3 + i) * 0.18)));
      break;
    case 'bo': {
      const p = Math.sin(t * 1.6); o.bell.scale.set(1 + p * 0.06, 1 - p * 0.09, 1 + p * 0.06);
      o.tent.update(t * 0.7, 7);
      o.core.scale.setScalar(14 * (1 + Math.sin(t * 5) * 0.06));
      faceDir(o.group, _tgt.copy(o.group.position).sub(shipPos).negate().setY(0), Math.min(1, dt * 0.5));
      lookEye(o.bigEye, shipPos);
      break;
    }
  }
}
export const CREATURE_COLORS = { sw: 0xd9a6c9, je: 0xff6fb5, wo: 0xe7c3a8, ne: 0x7dffb0, bo: 0xb98ad8 };
export const CREATURE_RAD = { sw: 3, je: 6, wo: 5, ne: 22, bo: 40 };
