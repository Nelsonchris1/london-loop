// js/audio/audio-core.js — Workstream L: the WebAudio context, master chain, noise buffers and small DSP helpers.
// Everything is synthesised (oscillators + a few seconds of generated noise): no downloads, no samples.
// No DOM / three.js imports, so Node tests can drive it with a fake AudioContext (tests/audio.test.mjs).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (x) => x * x * (3 - 2 * x);

/** deterministic PRNG (mulberry32) */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The audio engine core. ctxFactory() → AudioContext (default: window.AudioContext); the context is only created on
 * the first user gesture (`unlock()`), as browsers require.
 *   core.out.{engine, sfx, amb, world, ui}  — GainNodes feeding the master (created on unlock)
 */
export class AudioCore {
  constructor({ ctxFactory = null, volume = 0.8, muted = false } = {}) {
    this.ctxFactory = ctxFactory || (() => {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      return C ? new C({ latencyHint: 'interactive' }) : null;
    });
    this.ctx = null;
    this.volume = volume;
    this.muted = muted;
    this.hidden = false;
    this.out = null;
    this.noise = null;
    this._listeners = new Set();
  }

  get ready() { return !!(this.ctx && this.out); }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** create / resume the context (call from a user gesture). Returns true once audio runs. */
  unlock() {
    if (!this.ctx) {
      try { this.ctx = this.ctxFactory(); } catch (e) { console.warn('[audio] no AudioContext', e); this.ctx = null; }
      if (!this.ctx) return false;
      this._build();
      for (const fn of this._listeners) fn(this);
      this._applyMaster(); // muted from a previous visit: suspend straight away
    }
    if (this.ctx.state === 'suspended' && !this.hidden && !this.muted) this.ctx.resume?.().catch?.(() => {});
    return true;
  }
  onReady(fn) { this._listeners.add(fn); if (this.ready) fn(this); }

  _build() {
    const c = this.ctx;
    const master = c.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    master.connect(comp);
    comp.connect(c.destination);
    const bus = (v) => { const g = c.createGain(); g.gain.value = v; g.connect(master); return g; };
    // ambience goes through a "cabin" low-pass (opened fully outside; closed a bit in a cab's POV)
    const cabin = c.createBiquadFilter();
    cabin.type = 'lowpass'; cabin.frequency.value = 18000; cabin.Q.value = 0.5;
    cabin.connect(master);
    const ambIn = c.createGain(); ambIn.gain.value = 0.9; ambIn.connect(cabin);
    const worldIn = c.createGain(); worldIn.gain.value = 1; worldIn.connect(cabin);
    this.out = { master, comp, cabin, engine: bus(0.85), sfx: bus(1), amb: ambIn, world: worldIn, ui: bus(0.7) };
    this.noise = {
      white: this._noiseBuffer('white', 2.5),
      pink: this._noiseBuffer('pink', 3.1),
      brown: this._noiseBuffer('brown', 3.7)
    };
  }

  _noiseBuffer(kind, seconds) {
    const c = this.ctx, sr = c.sampleRate || 44100, n = Math.floor(sr * seconds);
    const buf = c.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const r = rng(kind === 'white' ? 11 : kind === 'pink' ? 23 : 37);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        // Paul Kellet's refined pink filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    // crossfade the loop seam
    const f = Math.min(2048, n >> 3);
    for (let i = 0; i < f; i++) { const t = i / f; d[i] = d[i] * t + d[n - f + i] * (1 - t); }
    return buf;
  }

  /** a looping noise source (started) */
  noiseSource(kind = 'white', rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise[kind] || this.noise.white;
    s.loop = true;
    s.playbackRate.value = rate;
    // random start offset so loops don't phase together
    s.start(this.now, Math.random() * 2);
    return s;
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    this._applyMaster();
  }
  setMuted(m) {
    this.muted = !!m;
    this._applyMaster();
  }
  setHidden(h) {
    this.hidden = !!h;
    this._applyMaster();
  }
  _applyMaster() {
    if (!this.ready) return;
    const g = this.muted || this.hidden ? 0 : this.volume;
    const p = this.out.master.gain;
    p.cancelScheduledValues(this.now);
    p.setTargetAtTime(g, this.now, 0.05);
    // a silent context still costs CPU: suspend it once faded out, resume when needed
    clearTimeout(this._suspendTimer);
    if (g === 0) {
      this._suspendTimer = setTimeout(() => { if ((this.muted || this.hidden) && this.ctx.state === 'running') this.ctx.suspend?.().catch?.(() => {}); }, 400);
      if (this._suspendTimer && this._suspendTimer.unref) this._suspendTimer.unref();
    } else if (this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
  }
}

/** set an AudioParam smoothly (no zipper noise); tau in seconds */
export function ramp(param, value, now, tau = 0.06) {
  if (!param) return;
  if (!Number.isFinite(value)) return;
  param.setTargetAtTime(value, now, tau);
}

/** soft-clip waveshaper curve */
export function driveCurve(amount = 2, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  return c;
}

/** equal-power-ish pan + distance gain of a world point for a listener {x, y, z, rx, rz (right vector)} */
export function spatial(L, x, y, z, ref = 8, roll = 1) {
  const dx = x - L.x, dy = y - L.y, dz = z - L.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const pan = d > 0.01 ? clamp((dx * L.rx + dz * L.rz) / Math.max(d, 1), -1, 1) * 0.85 : 0;
  const gain = 1 / (1 + Math.pow(Math.max(0, d) / ref, 2 * roll) );
  return { d, pan, gain };
}
