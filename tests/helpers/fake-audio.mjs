// tests/helpers/fake-audio.mjs — a minimal WebAudio stand-in for Node tests of js/audio/*: records the graph and the
// last value each AudioParam was asked to reach, so tests can assert levels without hearing anything.
export class FakeParam {
  constructor(v = 0) { this.value = v; this.target = v; this.events = 0; this.inputs = []; }
  setValueAtTime(v) { this.value = v; this.target = v; this.events++; return this; }
  setTargetAtTime(v) { this.target = v; this.events++; return this; }
  linearRampToValueAtTime(v) { this.target = v; this.events++; return this; }
  exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exponential ramp to ' + v); this.target = v; this.events++; return this; }
  cancelScheduledValues() { return this; }
}
let ids = 0;
class FakeNode {
  constructor(ctx, kind) { this.context = ctx; this.kind = kind; this.id = ids++; this.outs = []; ctx.nodes.push(this); ctx.live++; }
  connect(n) { if (!n) throw new Error('connect(undefined) from ' + this.kind); if (n instanceof FakeParam) n.inputs.push(this); else this.outs.push(n); return n; }
  disconnect() { if (!this._dc) { this._dc = true; this.context.live--; } this.outs.length = 0; }
}
class FakeSource extends FakeNode {
  constructor(ctx, kind) { super(ctx, kind); this.started = false; this.stopped = false; this.onended = null; }
  start(t = 0) { if (this.started) throw new Error('start twice: ' + this.kind); this.started = true; this.startAt = t; }
  stop(t = 0) { if (!this.started) throw new Error('stop before start: ' + this.kind); this.stopped = true; this.stopAt = t; }
}
export class FakeAudioContext {
  constructor() { this.nodes = []; this.live = 0; this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new FakeNode(this, 'destination'); }
  createGain() { const n = new FakeNode(this, 'gain'); n.gain = new FakeParam(1); return n; }
  createOscillator() { const n = new FakeSource(this, 'osc'); n.frequency = new FakeParam(440); n.detune = new FakeParam(0); n.type = 'sine'; n.setPeriodicWave = () => {}; return n; }
  createBiquadFilter() { const n = new FakeNode(this, 'biquad'); n.frequency = new FakeParam(350); n.Q = new FakeParam(1); n.gain = new FakeParam(0); n.type = 'lowpass'; return n; }
  createBufferSource() { const n = new FakeSource(this, 'buffer'); n.playbackRate = new FakeParam(1); n.buffer = null; n.loop = false; return n; }
  createBuffer(ch, len, sr) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { length: len, sampleRate: sr, numberOfChannels: ch, getChannelData: (i) => d[i] }; }
  createStereoPanner() { const n = new FakeNode(this, 'panner'); n.pan = new FakeParam(0); return n; }
  createWaveShaper() { const n = new FakeNode(this, 'shaper'); n.curve = null; return n; }
  createDynamicsCompressor() { const n = new FakeNode(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam(0); return n; }
  createPeriodicWave() { return {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  advance(dt) { this.currentTime += dt; }
  count(kind) { return this.nodes.filter((n) => n.kind === kind && !n._dc).length; }
}
