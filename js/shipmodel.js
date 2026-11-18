// Внешний корпус корабля «DV-07»: обтекаемый фюзеляж, крылья, мотогондолы, детали.
// Корабль смотрит носом в -Z, пол интерьера на y=0, потолок ~3.0. Всё подогнано так, чтобы интерьер не торчал наружу.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CY = 1.4, SY = 0.68; // центр сечения фюзеляжа по высоте и сплюснутость

function lathe(points, segs = 48) { // профиль [r, z] → тело вращения вокруг оси Z
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segs);
  g.rotateX(Math.PI / 2); // ось лейта (Y) → Z, без зеркалирования (иначе грани вывернутся)
  return g;
}
function ext(shapePts, depth, bevel = 0.1) { // плоская форма (x, z) → вытянутая по высоте деталь с фаской
  const s = new THREE.Shape(shapePts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); g.translate(0, -depth / 2, 0);
  return g;
}
const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
// точка на поверхности фюзеляжа: угол a вокруг оси, радиус профиля r
const onHull = (r, a, z, out = 0) => V(Math.cos(a) * (r + out), CY + Math.sin(a) * (r + out) * SY, z);

export function buildHullModel(hull, MAT, hullTex) {
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: hullTex.map, bumpMap: hullTex.bump, bumpScale: 1.4, roughness: 0.42, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.28 });
  paint.map.repeat.set(5, 2); paint.bumpMap.repeat.set(5, 2);
  const orange = new THREE.MeshPhysicalMaterial({ color: 0xff7a3d, roughness: 0.38, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.45, metalness: 0.6 });
  const gun = new THREE.MeshStandardMaterial({ color: 0x9aa0b0, roughness: 0.25, metalness: 0.95 });
  const nozzleIn = new THREE.MeshStandardMaterial({ color: 0x331a10, emissive: 0xff7a2a, emissiveIntensity: 1.6, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
  const vent = new THREE.MeshStandardMaterial({ color: 0x15161d, roughness: 0.7, metalness: 0.4 });
  const glowT = new THREE.MeshStandardMaterial({ color: 0x5ff6ff, emissive: 0x5ff6ff, emissiveIntensity: 1.6 });
  const glowO = new THREE.MeshStandardMaterial({ color: 0xffb067, emissive: 0xff8a3d, emissiveIntensity: 1.6 });

  // ---- фюзеляж ----
  const body = lathe([[0, -6.9], [1.5, -6.75], [2.6, -6.2], [3.45, -5.1], [3.95, -3.4], [4.2, -1.2], [4.28, 2], [4.32, 5], [4.3, 8], [4.12, 10], [3.8, 11.2], [3.2, 12.0], [2.5, 12.45], [2.0, 12.55], [1.6, 12.35], [0, 12.2]], 64);
  body.scale(1, SY, 1); body.translate(0, CY, 0);
  mesh(hull, body, paint);
  // оранжевый пояс по борту (чуть выпуклее корпуса, чтобы не мерцал)
  const belt = lathe([[4.24, -2.2], [4.33, -2.0], [4.38, 2], [4.42, 5], [4.4, 8], [4.22, 10], [4.14, 10.3]], 64);
  belt.scale(1, SY * 0.18, 1); belt.translate(0, CY - 0.15, 0);
  mesh(hull, belt, orange);
  // подбородок под кабиной + сенсорный купол
  const noseG = lathe([[0, -13.6], [0.45, -13.45], [1.15, -12.8], [1.85, -11.6], [2.45, -10.1], [2.85, -8.4], [3.02, -6.6], [3.0, -5.0], [2.6, -3.8], [0, -3.6]], 56);
  noseG.scale(1, 0.46, 1); noseG.translate(0, 0.12, 0);
  mesh(hull, noseG, paint);
  const noseStripe = lathe([[1.9, -11.5], [1.98, -11.3], [2.1, -10.9], [2.02, -10.7]], 56); noseStripe.scale(1, 0.47, 1); noseStripe.translate(0, 0.12, 0); mesh(hull, noseStripe, orange);
  const sensor = mesh(hull, new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0x0a0f1c, roughness: 0.05, metalness: 0.3, clearcoat: 1, iridescence: 1 }), 0, 0.02, -13.25);
  sensor.scale.set(1, 0.7, 1);
  for (const sx of [-1, 1]) { // воздухозаборники на подбородке
    const intake = mesh(hull, rb(0.5, 0.35, 1.8, 0.15), vent, sx * 2.15, -0.55, -8.2); intake.rotation.y = sx * 0.25;
    for (let k = 0; k < 4; k++) mesh(hull, rb(0.04, 0.3, 1.5, 0.015), dark, sx * (2.05 + k * 0.07), -0.54, -8.2).rotation.y = sx * 0.25;
  }
  // ободок фонаря кабины (купол z -9.4..-5.0)
  const rim = mesh(hull, new THREE.TorusGeometry(1, 0.07, 10, 64), dark, 0, 0.95, -7.2); rim.scale.set(2.37, 2.21, 1); rim.rotation.x = Math.PI / 2;
  const brow = mesh(hull, rb(4.6, 0.3, 0.5, 0.12), paint, 0, 3.05, -5.05);

  // ---- хребет с радиаторами ----
  const spine = mesh(hull, new THREE.CapsuleGeometry(0.75, 9, 8, 20), paint, 0, CY + 4.32 * SY - 0.15, 4.2); spine.rotation.x = Math.PI / 2; spine.scale.set(0.8, 1, 0.55);
  for (let i = 0; i < 6; i++) {
    for (const sx of [-1, 1]) {
      const r = mesh(hull, rb(1.3, 0.06, 0.85, 0.03), dark, sx * 1.05, CY + 4.32 * SY + 0.05, 0.8 + i * 1.2); r.rotation.z = sx * -0.35;
      mesh(hull, rb(1.1, 0.02, 0.06, 0.01), glowO, sx * 1.05, CY + 4.32 * SY + 0.09, 0.8 + i * 1.2).rotation.z = sx * -0.35;
    }
  }
  // антенны
  const ant = new THREE.Group(); ant.position.set(0.6, CY + 4.32 * SY + 0.2, 9.3); hull.add(ant);
  mesh(ant, new THREE.CylinderGeometry(0.03, 0.05, 2.2, 8), gun, 0, 1.1, 0); mesh(ant, new THREE.SphereGeometry(0.1, 10, 8), glowO, 0, 2.25, 0);
  const dish = mesh(hull, new THREE.SphereGeometry(0.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), dark, -0.8, CY + 4.32 * SY + 0.35, 8.6); dish.rotation.set(-0.6, 0.4, 0);
  mesh(hull, new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), gun, -0.8, CY + 4.32 * SY + 0.1, 8.6);
  // хвостовой киль
  const finShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(5.5, 0), new THREE.Vector2(6.6, 2.6), new THREE.Vector2(4.6, 2.7)]);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3 });
  finGeo.translate(0, 0, -0.11); finGeo.rotateY(-Math.PI / 2);
  mesh(hull, finGeo, orange, 0, CY + 4.32 * SY - 0.3, 6.2);

  // ---- крылья ----
  for (const sx of [-1, 1]) {
    const pts = [[3.4, 1.0], [10.3, 7.6], [10.9, 8.2], [10.9, 10.1], [8.6, 10.6], [3.4, 11.0]].map(([x, z]) => [x * sx, z]);
    const w = mesh(hull, ext(pts, 0.28, 0.12), paint, 0, -0.95, 0); w.rotation.z = sx * -0.06;
    const stripe = mesh(hull, ext([[6.2, 4.6], [9.3, 7.5], [9.3, 8.4], [6.2, 5.6]].map(([x, z]) => [x * sx, z]), 0.05, 0.03), orange, 0, -0.73 + (sx > 0 ? -0.0 : 0), 0); stripe.rotation.z = sx * -0.06;
    // законцовка крыла с огнём (крыло опущено к концу: y ≈ -0.95 - |x|*0.06)
    const wy = x => -0.95 - Math.abs(x) * 0.06;
    const pod = mesh(hull, new THREE.CapsuleGeometry(0.33, 2.6, 6, 14), paint, sx * 10.95, wy(10.95), 9.1); pod.rotation.x = Math.PI / 2;
    mesh(hull, new THREE.SphereGeometry(0.14, 10, 8), sx < 0 ? MAT.red : MAT.green, sx * 10.95, wy(10.95), 7.65);
    // ракеты на пилонах под крылом
    for (let k = 0; k < 2; k++) {
      const px = sx * (6.0 + k * 1.6), y0 = wy(px) - 0.35;
      mesh(hull, rb(0.22, 0.45, 1.5, 0.08), dark, px, y0, 7.6 + k * 0.6);
      const msl = mesh(hull, new THREE.CapsuleGeometry(0.17, 1.8, 6, 12), new THREE.MeshPhysicalMaterial({ color: 0xeeeeee, roughness: 0.35, clearcoat: 1 }), px, y0 - 0.38, 7.4 + k * 0.6); msl.rotation.x = Math.PI / 2;
      mesh(hull, new THREE.ConeGeometry(0.17, 0.4, 12), orange, px, y0 - 0.38, 6.25 + k * 0.6).rotation.x = -Math.PI / 2;
    }
  }

  // ---- мотогондолы (под полом, чтобы не мешать шлюзам) ----
  const nozzles = [];
  for (const sx of [-1, 1]) {
    const nx = sx * 3.45, ny = -1.75;
    const nac = lathe([[0.7, 4.3], [1.12, 4.45], [1.3, 4.9], [1.42, 6.5], [1.45, 10], [1.38, 12.6], [1.2, 13.7], [1.08, 14.2], [1.16, 14.6], [1.3, 15.4]], 40);
    mesh(hull, nac, paint, nx, ny, 0);
    const lip = mesh(hull, new THREE.TorusGeometry(1.0, 0.14, 12, 40), dark, nx, ny, 4.45);
    mesh(hull, new THREE.CircleGeometry(1.0, 32), vent, nx, ny, 4.6).rotation.y = Math.PI;
    // вентилятор во входе
    const fan = new THREE.Group(); fan.position.set(nx, ny, 4.75); hull.add(fan);
    for (let b = 0; b < 9; b++) { const bl = mesh(fan, rb(0.08, 0.85, 0.05, 0.02), gun, 0, 0, 0); bl.rotation.z = b / 9 * Math.PI * 2; bl.translateY(0.42); bl.rotation.y = 0.5; }
    mesh(fan, new THREE.SphereGeometry(0.22, 12, 8), dark);
    // полоса и кольца на гондоле
    for (const z of [7, 11]) mesh(hull, new THREE.TorusGeometry(1.46, 0.05, 8, 40), dark, nx, ny, z);
    const st = mesh(hull, rb(0.05, 0.18, 3.2, 0.02), orange, nx + sx * 1.44, ny + 0.2, 9);
    // пилон к фюзеляжу
    const py = mesh(hull, rb(0.5, 1.4, 6.5, 0.2), paint, sx * 2.6, -0.95, 9.4); py.rotation.z = sx * 0.5;
    // внутренность сопла (раскалена)
    const inner = mesh(hull, new THREE.CylinderGeometry(1.12, 0.9, 1.4, 32, 1, true), nozzleIn, nx, ny, 14.7); inner.rotation.x = Math.PI / 2;
    mesh(hull, new THREE.CircleGeometry(0.92, 32), nozzleIn, nx, ny, 14.05);
    nozzles.push({ p: V(nx, ny, 15.35), r: 1.1, mat: nozzleIn, fan });
  }
  // центральный маршевый двигатель
  {
    const n = lathe([[1.95, 12.2], [2.05, 12.6], [1.85, 13.3], [1.95, 13.8], [2.1, 14.0]], 48);
    mesh(hull, n, dark, 0, CY, 0);
    const inner = mesh(hull, new THREE.CylinderGeometry(1.9, 1.5, 1.6, 40, 1, true), nozzleIn, 0, CY, 13.2); inner.rotation.x = Math.PI / 2;
    mesh(hull, new THREE.CircleGeometry(1.52, 40), nozzleIn, 0, CY, 12.45);
    nozzles.push({ p: V(0, CY, 14.0), r: 1.85, mat: nozzleIn, main: true });
  }

  // ---- турельные обтекатели и шлюзовые воротники ----
  for (const sx of [-1, 1]) {
    const collar = mesh(hull, new THREE.TorusGeometry(1.62, 0.16, 12, 48), dark, sx * 4.7, 0.05, 1); collar.rotation.x = Math.PI / 2;
    const fair = mesh(hull, new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), paint, sx * 4.7, 0.08, 1); fair.scale.set(1.72, 0.9, 1.72);
    // воротник шлюза
    // рамка вокруг проёма шлюза (сам проём z 7.2..8.8, y 0..2.8 остаётся открытым для двери)
    mesh(hull, rb(0.5, 0.3, 2.4, 0.1), orange, sx * 4.3, 2.95, 8); mesh(hull, rb(0.5, 0.3, 2.4, 0.1), orange, sx * 4.3, -0.15, 8);
    mesh(hull, rb(0.5, 3.4, 0.25, 0.08), orange, sx * 4.3, 1.4, 7.05); mesh(hull, rb(0.5, 3.4, 0.25, 0.08), orange, sx * 4.3, 1.4, 8.95);
    // жалюзи вентиляции по бортам
    for (let k = 0; k < 5; k++) {
      const p = onHull(4.3, sx > 0 ? 0.35 : Math.PI - 0.35, -1.2 + k * 0.5, -0.02);
      const v = mesh(hull, rb(0.08, 0.5, 0.32, 0.03), vent, p.x, p.y, p.z); v.rotation.z = sx * -0.35;
    }
    // бортовые огни-полосы
    for (let k = 0; k < 6; k++) { const p = onHull(4.32, sx > 0 ? -0.15 : Math.PI + 0.15, 9.6 + k * 0.32, 0.01); mesh(hull, new THREE.SphereGeometry(0.06, 8, 6), glowT, p.x, p.y, p.z); }
  }
  // маневровые дюзы (RCS): видимые блоки + точки для струй газа
  const rcs = [];
  const addRcs = (x, y, z, nx, ny, nz) => {
    const b = mesh(hull, rb(0.42, 0.42, 0.42, 0.1), dark, x, y, z);
    const n = V(nx, ny, nz); const nzl = mesh(hull, new THREE.CylinderGeometry(0.08, 0.12, 0.18, 10), gun, x + nx * 0.25, y + ny * 0.25, z + nz * 0.25);
    nzl.quaternion.setFromUnitVectors(V(0, 1, 0), n);
    rcs.push({ p: V(x + nx * 0.35, y + ny * 0.35, z + nz * 0.35), n });
  };
  addRcs(2.15, 0.7, -9.6, 1, 0, 0); addRcs(-2.15, 0.7, -9.6, -1, 0, 0); addRcs(0, -1.05, -9.3, 0, -1, 0); addRcs(0.9, 1.25, -10.1, 0, 1, 0); addRcs(-0.9, 1.25, -10.1, 0, 1, 0);
  addRcs(3.6, 2.4, 11.2, 1, 0, 0); addRcs(-3.6, 2.4, 11.2, -1, 0, 0); addRcs(0, CY + 4.32 * SY + 0.2, 11.4, 0, 1, 0); addRcs(0, -1.3, 11.6, 0, -1, 0);
  addRcs(10.95, -1.25, 10.7, 0, 1, 0); addRcs(-10.95, -1.25, 10.7, 0, 1, 0); addRcs(10.95, -1.95, 10.7, 0, -1, 0); addRcs(-10.95, -1.95, 10.7, 0, -1, 0);

  // проблесковые огни
  const strobes = [];
  for (const [x, y, z, c] of [[-10.95, -1.6, 7.5, 0xff3b4f], [10.95, -1.6, 7.5, 0x7dffb0], [0.6, CY + 4.32 * SY + 2.45, 9.3, 0xffffff], [0, -0.3, -13.0, 0xffffff], [0, CY, 12.6, 0xffffff]]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: c, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }));
    s.position.set(x, y, z); s.scale.setScalar(2.4); hull.add(s); strobes.push(s);
  }
  hull.traverse(o => { if (o.isMesh) o.material.envMapIntensity = o.material.metalness > 0.5 ? 1.3 : 0.8; });
  return { nozzles, rcs, strobes };
}
