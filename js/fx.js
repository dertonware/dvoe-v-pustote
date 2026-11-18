// Визуальные улучшения: пост-обработка, процедурные текстуры, окружение, обломки, вспышки
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const cv = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- финальный проход: хроматическая аберрация, радиальное размытие, виньетка, зерно ----------
export const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0.0015 }, uSpeed: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.035 }, uHurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uCA, uSpeed, uVig, uGrain, uHurt; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r = length(c);
      float ca = uCA * (0.4 + r * 2.0) + uSpeed * 0.004 + uHurt * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + c * ca).b;
      if (uSpeed > 0.01) { // радиальное размытие на форсаже
        vec3 acc = col; float wsum = 1.0;
        for (int i = 1; i < 7; i++) { float k = float(i) / 7.0 * uSpeed * 0.06 * r; acc += texture2D(tDiffuse, vUv - c * k).rgb; wsum += 1.0; }
        col = mix(col, acc / wsum, smoothstep(0.1, 0.5, r));
      }
      col *= 1.0 - uVig * smoothstep(0.35, 0.85, r);
      col = mix(col, col * vec3(1.4, 0.35, 0.35), uHurt * smoothstep(0.25, 0.75, r));
      col += (h(vUv * 1000.0 + uTime) - 0.5) * uGrain * (0.6 + 0.4 * (1.0 - dot(col, vec3(0.33))));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// ---------- окружение для отражений (туманность + звёзды) ----------
export function makeSpaceEnv(renderer) {
  const c = cv(1024, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b0820'); g.addColorStop(0.5, '#140c26'); g.addColorStop(1, '#06040e'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const blobs = [['#7a3cff', 0.18, 0.4, 260], ['#ff4f9a', 0.42, 0.55, 200], ['#2fd6ff', 0.7, 0.35, 240], ['#ff8a3d', 0.88, 0.6, 160], ['#30ffc0', 0.55, 0.25, 130]];
    for (const [col, u, v, rr] of blobs) { const gr = x.createRadialGradient(u * w, v * h, 0, u * w, v * h, rr); gr.addColorStop(0, col + 'aa'); gr.addColorStop(1, col + '00'); x.fillStyle = gr; x.fillRect(0, 0, w, h); }
    const sg = x.createRadialGradient(0.78 * w, 0.32 * h, 0, 0.78 * w, 0.32 * h, 60); sg.addColorStop(0, '#fffaf0'); sg.addColorStop(0.2, '#ffe2b0'); sg.addColorStop(1, 'rgba(255,220,180,0)'); x.fillStyle = sg; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; x.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  });
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose();
  return env;
}

// ---------- процедурные текстуры ----------
function tex(c, rep = 1) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; return t; }
export function hullTextures() {
  const size = 512;
  const draw = (bump) => cv(size, size, (x, w, h) => {
    x.fillStyle = bump ? '#808080' : '#efe5d3'; x.fillRect(0, 0, w, h);
    // крупные панели
    const cells = [[0, 0, 256, 192], [256, 0, 256, 192], [0, 192, 170, 320], [170, 192, 342, 160], [170, 352, 342, 160]];
    for (const [px, py, pw, ph] of cells) {
      if (!bump) { x.fillStyle = `hsl(36,${25 + Math.random() * 10}%,${86 + Math.random() * 6}%)`; x.fillRect(px + 2, py + 2, pw - 4, ph - 4); }
      x.strokeStyle = bump ? '#3a3a3a' : 'rgba(70,55,40,.55)'; x.lineWidth = 3; x.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
      for (const [rx, ry] of [[px + 10, py + 10], [px + pw - 10, py + 10], [px + 10, py + ph - 10], [px + pw - 10, py + ph - 10]]) { x.fillStyle = bump ? '#c8c8c8' : 'rgba(120,100,80,.6)'; x.beginPath(); x.arc(rx, ry, 3, 0, 7); x.fill(); }
    }
    if (!bump) { // грязь и потёртости
      for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(60,45,35,${Math.random() * 0.06})`; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, rnd(4, 40), rnd(2, 12), Math.random() * 3, 0, 7); x.fill(); }
      x.fillStyle = 'rgba(255,122,61,.9)'; x.fillRect(20, 150, 120, 14); x.fillStyle = 'rgba(40,30,30,.8)'; x.font = '700 22px sans-serif'; x.fillText('DV-07', 300, 120);
    }
  });
  return { map: Object.assign(tex(draw(false)), { colorSpace: THREE.SRGBColorSpace }), bump: tex(draw(true)) };
}
export function panelTextures(base = '#6e7590') {
  const draw = (bump) => cv(256, 256, (x, w, h) => {
    x.fillStyle = bump ? '#7a7a7a' : base; x.fillRect(0, 0, w, h);
    x.strokeStyle = bump ? '#303030' : 'rgba(0,0,0,.35)'; x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12);
    x.strokeStyle = bump ? '#b0b0b0' : 'rgba(255,255,255,.08)'; x.lineWidth = 2; x.strokeRect(12, 12, w - 24, h - 24);
    for (let i = 0; i < 5; i++) { x.fillStyle = bump ? '#505050' : 'rgba(0,0,0,.18)'; x.fillRect(40, 40 + i * 14, 70, 6); }
    if (!bump) for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; x.fillRect(Math.random() * w, Math.random() * h, rnd(2, 20), rnd(1, 4)); }
  });
  return { map: Object.assign(tex(draw(false)), { colorSpace: THREE.SRGBColorSpace }), bump: tex(draw(true)) };
}
export function floorTextures() {
  const draw = (bump) => cv(256, 256, (x, w, h) => {
    x.fillStyle = bump ? '#909090' : '#2c303d'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = bump ? '#202020' : 'rgba(0,0,0,.45)'; x.fillRect(i * 32 + 4, j * 32 + 13, 24, 6); }
    x.strokeStyle = bump ? '#404040' : 'rgba(255,200,80,.25)'; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, h - 4);
  });
  return { map: Object.assign(tex(draw(false), 2), { colorSpace: THREE.SRGBColorSpace }), bump: tex(draw(true), 2) };
}

// ---------- блик солнца ----------
export function sunFlare(pos) {
  const glow = cv(256, 256, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,240,210,.7)'); g.addColorStop(1, 'rgba(255,200,150,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  const ring = cv(128, 128, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(160,220,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  const tg = new THREE.CanvasTexture(glow), tr = new THREE.CanvasTexture(ring);
  const lf = new Lensflare();
  lf.addElement(new LensflareElement(tg, 700, 0, new THREE.Color(0xfff2dc)));
  lf.addElement(new LensflareElement(tr, 90, 0.5, new THREE.Color(0x9fd8ff)));
  lf.addElement(new LensflareElement(tr, 160, 0.75, new THREE.Color(0xffb0e0)));
  lf.addElement(new LensflareElement(tg, 50, 0.9, new THREE.Color(0x8ffcff)));
  lf.addElement(new LensflareElement(tr, 260, 1.05, new THREE.Color(0xffd0a0)));
  const l = new THREE.PointLight(0xffffff, 0, 1); l.position.copy(pos); l.add(lf);
  return l;
}

// ---------- обломки тварей (настоящие кусочки с физикой) ----------
const chunkGeo = (() => { const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(0.75 + Math.random() * 0.45); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; })();
export class Debris {
  constructor(scene, max = 160) { this.scene = scene; this.list = []; this.max = max; this.mats = new Map(); }
  mat(color) { if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2, emissive: color, emissiveIntensity: 0.15 })); return this.mats.get(color); }
  burst(p, n, color, size, speed) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) { const o = this.list.shift(); this.scene.remove(o.m); }
      const m = new THREE.Mesh(chunkGeo, this.mat(color)); const s = size * rnd(0.25, 1);
      m.scale.setScalar(s); m.position.copy(p); this.scene.add(m);
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * rnd(0.3, 1));
      this.list.push({ m, v, w: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), life: rnd(2.5, 4.5), s });
    }
  }
  update(dt, fx) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i]; o.life -= dt;
      o.v.multiplyScalar(Math.exp(-dt * 0.8)); o.m.position.addScaledVector(o.v, dt);
      o.m.rotation.x += o.w.x * dt; o.m.rotation.y += o.w.y * dt; o.m.rotation.z += o.w.z * dt;
      if (fx && Math.random() < dt * 6) fx.emit(o.m.position.x, o.m.position.y, o.m.position.z, 0, 0, 0, o.m.material.color, 0.6, o.s * 0.8, 1, 0);
      if (o.life < 0.6) o.m.scale.setScalar(o.s * Math.max(0.01, o.life / 0.6));
      if (o.life <= 0) { this.scene.remove(o.m); this.list.splice(i, 1); }
    }
  }
}

// ---------- вспышки выстрелов ----------
const flashTex = new THREE.CanvasTexture(cv(128, 128, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,230,170,.9)'); g.addColorStop(1, 'rgba(255,140,60,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
  x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,240,200,.8)'; x.lineWidth = 6; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(w / 2 - Math.cos(a) * 60, w / 2 - Math.sin(a) * 60); x.lineTo(w / 2 + Math.cos(a) * 60, w / 2 + Math.sin(a) * 60); x.stroke(); }
}));
export class Flashes {
  constructor(scene) { this.scene = scene; this.list = []; this.light = new THREE.PointLight(0xffc080, 0, 40, 1.5); scene.add(this.light); }
  add(p, color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }));
    s.position.copy(p); s.scale.setScalar(size * rnd(0.8, 1.3)); s.material.rotation = Math.random() * 6; this.scene.add(s);
    this.list.push({ s, life: 0.06, ml: 0.06 });
    this.light.position.copy(p); this.light.color.set(color); this.light.intensity = 30;
  }
  update(dt) {
    this.light.intensity *= Math.exp(-dt * 30);
    for (let i = this.list.length - 1; i >= 0; i--) { const o = this.list[i]; o.life -= dt; o.s.material.opacity = Math.max(0, o.life / o.ml); if (o.life <= 0) { this.scene.remove(o.s); o.s.material.dispose(); this.list.splice(i, 1); } }
  }
}

// ---------- всплывающие цифры урона (DOM) ----------
export class DmgNumbers {
  constructor() { this.box = document.createElement('div'); this.box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:8;overflow:hidden'; document.body.appendChild(this.box); this.list = []; }
  add(p, n, crit) {
    const d = document.createElement('div');
    d.textContent = n; d.style.cssText = `position:absolute;font-family:Unbounded,sans-serif;font-weight:900;font-size:${crit ? 26 : 18}px;color:${crit ? '#ffd05f' : '#fff'};text-shadow:0 2px 0 #000,0 0 12px rgba(255,120,60,.6);transform:translate(-50%,-50%)`;
    this.box.appendChild(d); this.list.push({ d, p: p.clone(), life: 0.9, vy: rnd(18, 30), vx: rnd(-8, 8) });
    if (this.list.length > 30) { const o = this.list.shift(); o.d.remove(); }
  }
  update(dt, camera) {
    const v = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i]; o.life -= dt; o.p.y += o.vy * dt; o.p.x += o.vx * dt;
      v.copy(o.p).project(camera);
      if (v.z > 1 || o.life <= 0) { o.d.style.display = 'none'; } else { o.d.style.display = 'block'; o.d.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; o.d.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; o.d.style.opacity = Math.min(1, o.life * 2.5); o.d.style.scale = 1 + Math.max(0, o.life - 0.7) * 2; }
      if (o.life <= 0) { o.d.remove(); this.list.splice(i, 1); }
    }
  }
}
