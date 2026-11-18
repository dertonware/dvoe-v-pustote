// Синтезированный звук — без файлов
let ctx = null, master, sfxG, musG, noiseBuf, engine = null, hiss = null, musicOn = false, intensity = 0;
const st = { vol: 0.7, mus: 0.4 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = st.vol;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  sfxG = ctx.createGain(); sfxG.connect(master);
  musG = ctx.createGain(); musG.gain.value = st.mus; musG.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startEngine(); startHiss(); startMusic();
}
export function setVolume(v, m) { st.vol = v; st.mus = m; if (ctx) { master.gain.value = v; musG.gain.value = m; } }

function env(g, t, a, peak, dcy) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); }
function osc(type, f, t, dur, peak, f2, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(g, t, 0.005, peak, dur); o.connect(g); g.connect(dest || sfxG); o.start(t); o.stop(t + dur + 0.05);
}
function noise(t, dur, peak, freq, q, type, dest, f2) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
  if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); env(g, t, 0.005, peak, dur);
  s.connect(f); f.connect(g); g.connect(dest || sfxG); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const ok = () => ctx && ctx.state === 'running';

export const sfx = {
  laser(p = 1) { if (!ok()) return; const t = ctx.currentTime; osc('square', 900 * p, t, 0.12, 0.09, 180 * p); osc('sine', 1800 * p, t, 0.06, 0.05, 400); },
  turret() { if (!ok()) return; const t = ctx.currentTime; osc('sawtooth', 620 + Math.random() * 80, t, 0.07, 0.06, 140); noise(t, 0.05, 0.05, 3000, 1, 'bandpass'); },
  rocket() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.6, 0.25, 600, 1, 'lowpass', null, 3000); osc('sawtooth', 120, t, 0.5, 0.08, 400); },
  boom(size = 1, distF = 1) {
    if (!ok()) return; const t = ctx.currentTime, v = Math.min(1, 0.25 * size) * distF; if (v < 0.01) return;
    noise(t, 0.4 + size * 0.15, v, 1800, 0.7, 'lowpass', null, 80); osc('sine', 110, t, 0.5 + size * 0.1, v * 0.9, 30);
  },
  hit(big) { if (!ok()) return; const t = ctx.currentTime; noise(t, big ? 0.5 : 0.25, big ? 0.6 : 0.35, 900, 0.8, 'lowpass', null, 60); osc('triangle', 180, t, 0.3, 0.25, 60); osc('square', 2300, t, 0.15, 0.04, 1200); },
  shieldHit() { if (!ok()) return; const t = ctx.currentTime; osc('sine', 1200, t, 0.25, 0.12, 300); noise(t, 0.2, 0.08, 4000, 3, 'bandpass'); },
  coin(v) { if (!ok()) return; const t = ctx.currentTime; osc('sine', 1300 + Math.random() * 300, t, 0.09, 0.06); osc('sine', 2100, t + 0.04, 0.08, 0.04); },
  click() { if (!ok()) return; const t = ctx.currentTime; osc('sine', 700, t, 0.05, 0.12, 1100); },
  hover() { if (!ok()) return; const t = ctx.currentTime; osc('sine', 1500, t, 0.03, 0.03); },
  buy() { if (!ok()) return; const t = ctx.currentTime; [660, 880, 1320].forEach((f, i) => osc('triangle', f, t + i * 0.07, 0.18, 0.12)); },
  alarm() { if (!ok()) return; const t = ctx.currentTime; osc('square', 880, t, 0.22, 0.07); osc('square', 660, t + 0.25, 0.22, 0.07); },
  roar(big, distF = 1) { if (!ok()) return; const t = ctx.currentTime; const v = (big ? 0.5 : 0.2) * distF; if (v < 0.01) return; osc('sawtooth', big ? 70 : 140, t, big ? 1.4 : 0.7, v, big ? 35 : 60); noise(t, big ? 1.2 : 0.6, v * 0.6, 500, 4, 'bandpass', null, 200); },
  step() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.06, 0.08, 400, 1, 'lowpass'); },
  jump() { if (!ok()) return; const t = ctx.currentTime; osc('sine', 300, t, 0.15, 0.06, 500); },
  dock() { if (!ok()) return; const t = ctx.currentTime; osc('triangle', 90, t, 0.8, 0.4, 50); noise(t + 0.1, 0.9, 0.3, 300, 1, 'lowpass'); [523, 659, 784].forEach((f, i) => osc('sine', f, t + 0.9 + i * 0.12, 0.3, 0.08)); },
  fixed() { if (!ok()) return; const t = ctx.currentTime; [700, 1050].forEach((f, i) => osc('sine', f, t + i * 0.08, 0.15, 0.1)); },
  down() { if (!ok()) return; const t = ctx.currentTime; osc('sine', 400, t, 1.2, 0.2, 60); },
  revive() { if (!ok()) return; const t = ctx.currentTime; [392, 523, 659, 784].forEach((f, i) => osc('triangle', f, t + i * 0.09, 0.25, 0.12)); },
  done() { if (!ok()) return; const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => osc('square', f, t + i * 0.12, 0.3, 0.06)); },
};

function startEngine() {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 45;
  const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 160;
  const g = ctx.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g); o.connect(of); of.connect(g); g.connect(sfxG); s.start(); o.start();
  engine = { f, o, g, of };
}
export function setEngine(thr, boost, on) {
  if (!engine) return; const t = ctx.currentTime;
  engine.g.gain.setTargetAtTime(on ? 0.06 + thr * 0.12 + (boost ? 0.1 : 0) : 0.02, t, 0.2);
  engine.f.frequency.setTargetAtTime(150 + thr * 500 + (boost ? 700 : 0), t, 0.2);
  engine.o.frequency.setTargetAtTime(40 + thr * 30 + (boost ? 25 : 0), t, 0.2);
}
function startHiss() {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
  const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(sfxG); s.start();
  hiss = g;
}
export function setHiss(on) { if (hiss) hiss.gain.setTargetAtTime(on ? 0.12 : 0, ctx.currentTime, 0.05); }
export function setIntensity(v) { intensity = v; }

function startMusic() {
  if (musicOn) return; musicOn = true;
  // дрон
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 3; lp.connect(musG);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06; const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  [55, 55.4, 82.4].forEach(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(lp); o.start(); });
  // арпеджио
  const delay = ctx.createDelay(); delay.delayTime.value = 0.375; const fb = ctx.createGain(); fb.gain.value = 0.35; delay.connect(fb); fb.connect(delay); delay.connect(musG);
  const scale = [0, 3, 5, 7, 10, 12, 15];
  let step = 0;
  const tick = () => {
    if (ctx.state === 'running') {
      const t = ctx.currentTime;
      const busy = intensity > 0.5;
      if (busy || step % 2 === 0) {
        const n = scale[(step * 3 + (step >> 3)) % scale.length] + (step % 16 > 11 ? 12 : 0);
        const f = 220 * Math.pow(2, n / 12);
        const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
        o.type = busy ? 'square' : 'triangle'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = busy ? 2400 : 1200;
        env(g, t, 0.01, busy ? 0.05 : 0.07, 0.35); o.connect(fl); fl.connect(g); g.connect(musG); g.connect(delay); o.start(t); o.stop(t + 0.5);
      }
      if (busy && step % 4 === 0) { osc('sine', 60, t, 0.25, 0.25, 35, musG); }
      if (busy && step % 4 === 2) noise(t, 0.08, 0.06, 6000, 1, 'highpass', musG);
    }
    step++;
    setTimeout(tick, intensity > 0.5 ? 170 : 280);
  };
  tick();
}
