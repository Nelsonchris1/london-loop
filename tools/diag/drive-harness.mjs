// tools/diag/drive-harness.mjs — builds the real London city + controllers + traffic in Node (no GPU) and drives.
//   node --max-old-space-size=8000 tools/diag/drive-harness.mjs idle|nopush|notraffic [spot,spot]   15 s throttle runs
//   … route (PAIRS="a>b;c>d", LOG, WHYQ) | why [spots] | which <spot> <x,z>
//   node tools/diag/drive-harness.mjs feel [car|ride|bus] [--json]   handling / camera metrics on a flat test world
//        (no city; fast). CTRL=<path to controllers.js> CAM=<path to cameras.js> compare another build ("before").
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vendor = pathToFileURL(path.join(root, 'vendor/three')).href;
// map the importmap's bare specifiers (three, three/webgpu, three/tsl, three/addons/) onto vendor/three
const hooks = `
export async function resolve(spec, ctx, next) {
  if (spec === 'three' || spec === 'three/webgpu') return { url: '${vendor}/build/three.webgpu.js', shortCircuit: true };
  if (spec === 'three/tsl') return { url: '${vendor}/build/three.tsl.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: '${vendor}/examples/jsm/' + spec.slice(13), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const ctxProxy = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctxProxy }), addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import('three/webgpu');
if ((process.argv[2] || '') === 'feel') {
  await runFeel(THREE, process.argv.slice(3));
  process.exit(0);
}
const { GEO } = await import('../../js/ldn-geodata.js');
const { WORLD, TELEPORT_LOCATIONS } = await import('../../js/london-config.js');
const { buildLondonCity } = await import('../../js/london-city.js');
const { buildLondonLandmarks } = await import('../../js/london-landmarks.js');
const { buildLondonRoadNetwork } = await import('../../js/road-network.js');
const { createTrafficSystem } = await import('../../js/traffic.js');
const { ThirdPersonControllerManager } = await import(process.env.CTRL && process.env.CTRL !== '1' ? pathToFileURL(path.resolve(process.env.CTRL)).href : '../../js/controllers.js');
const scene = new THREE.Scene();
const lm = buildLondonLandmarks(scene, { world: WORLD });
const city = buildLondonCity(scene, { geo: GEO, world: WORLD, landmarkZones: lm.zones, details: true, trees: false });
const network = buildLondonRoadNetwork(GEO, WORLD);
const traffic = createTrafficSystem(scene, { network, geo: GEO, world: WORLD, sidewalks: city.sidewalks, towerBridge: lm.towerBridge });
const cm = new ThirdPersonControllerManager(scene, [...lm.colliders, ...city.colliders], { world: WORLD, mode: 'car' });
const cam = new THREE.PerspectiveCamera(56, 16 / 9, 0.5, 5000);
let collisions = 0; const evs = []; cm.addCollisionListener?.((ev) => { collisions++; evs.push(ev); });
const DT = 1 / 30; let t = 0;
function step(n, keys = {}) {
  Object.assign(cm.keys, { forward: false, backward: false, left: false, right: false, boost: false, up: false }, keys);
  const out = [];
  for (let i = 0; i < n; i++) {
    t += DT;
    cm.update(DT, t);
    const e = cm.getActiveEntity();
    cam.position.set(e.position.x - Math.sin(e.heading) * 8, e.position.y + 4, e.position.z - Math.cos(e.heading) * 8);
    cam.lookAt(e.position.x, e.position.y + 1, e.position.z); cam.updateMatrixWorld();
    traffic.update(DT, t, cam.position, e, cm.activeMode, cam);
    out.push({ x: e.position.x, z: e.position.z, v: e.speed });
  }
  return out;
}
const mode = process.argv[2] || 'idle'; if (mode === 'nopush' || mode === 'why' || process.env.NOPUSH) traffic.setPlayerPush(false); if (process.env.NOTRAFFIC) traffic.update = () => {}; if (mode === 'notraffic') traffic.update = () => {};
const spots = process.argv[3] ? process.argv[3].split(',') : Object.keys(TELEPORT_LOCATIONS);
if (mode !== 'why' && mode !== 'which' && mode !== 'route' && mode !== 'idlemode' && mode !== 'feel' && mode !== 'busidle') for (const id of spots) {
  const L = TELEPORT_LOCATIONS[id];
  cm.setMode('car'); cm.teleportActiveTo(L.x, L.z, L.heading); collisions = 0;
  const e = cm.getActiveEntity(); const x0 = e.position.x, z0 = e.position.z;
  step(150); // settle 5 s, no input
  const idle = Math.hypot(e.position.x - x0, e.position.z - z0);
  const tr = step(450, { forward: true }); // 15 s full throttle
  const dist = Math.hypot(e.position.x - x0, e.position.z - z0);
  const vmax = Math.max(...tr.map((p) => p.v));
  const stalls = tr.slice(60).filter((p) => Math.abs(p.v) < 1).length; // frames slower than 1 m/s after the first 2 s
  console.log(`${id.padEnd(18)} idle drift ${idle.toFixed(2)} m · 15 s throttle: ${dist.toFixed(0)} m, vmax ${vmax.toFixed(1)} m/s, stall frames ${stalls}/390, collisions ${collisions}, traffic ${traffic.vehicles}`);
}
if (mode === 'why') {
  const cols = cm.colliders;
  for (const id of spots) {
    const L = TELEPORT_LOCATIONS[id];
    cm.setMode('car'); cm.teleportActiveTo(L.x, L.z, L.heading);
    const e = cm.getActiveEntity();
    step(60);
    let reported = 0;
    for (let s = 0; s < 450 && reported < 3; s++) {
      const [p] = step(1, { forward: true });
      if (s > 60 && Math.abs(p.v) < 1) {
        const near = cols.filter((c) => p.x > c.minX - 3.5 && p.x < c.maxX + 3.5 && p.z > c.minZ - 3.5 && p.z < c.maxZ + 3.5)
          .map((c) => `${(c.maxX - c.minX).toFixed(1)}x${(c.maxZ - c.minZ).toFixed(1)} h${c.maxY?.toFixed?.(1)}${c.minY ? ' minY' + c.minY.toFixed(1) : ''}${c.obb ? ' obb ' + (2 * c.obb.hx).toFixed(1) + 'x' + (2 * c.obb.hz).toFixed(1) : ''}`);
        const road = WORLD.nearestRoad(p.x, p.z, { kinds: 'drive', maxDist: 30 });
        console.log(`${id} stalled at ${p.x.toFixed(1)},${p.z.toFixed(1)} heading ${(e.heading * 180 / Math.PI).toFixed(0)}° road ${road ? road.road.name + ' ' + road.road.kind + ' d' + road.dist.toFixed(1) + ' w' + road.road.w : '-'} · colliders near: ${near.join(' | ') || 'none'} · water ${WORLD.isWater(p.x, p.z)}`);
        reported++; step(30, { forward: true }); s += 30;
      }
    }
  }
}
if (mode === 'why') console.log('collision events:', evs.slice(0, 30).map((e) => `${e.kind}@${e.x?.toFixed(0)},${e.z?.toFixed(0)} i${e.impulse?.toFixed(1)}`).join('  '));
if (mode === 'which') {
  const [qx, qz] = process.argv[4].split(',').map(Number);
  const nLm = lm.colliders.length;
  const all = cm.colliders;
  all.forEach((c, i) => {
    if (qx < c.minX - 4 || qx > c.maxX + 4 || qz < c.minZ - 4 || qz > c.maxZ + 4) return;
    let inside = true;
    if (c.obb) { const o = c.obb, dx = qx - o.cx, dz = qz - o.cz, lx = dx * o.cs - dz * o.sn, lz = dx * o.sn + dz * o.cs; inside = Math.abs(lx) < o.hx + 4 && Math.abs(lz) < o.hz + 4; }
    if (!inside) return;
    const src = i < nLm ? 'landmark' : 'city#' + (i - nLm);
    console.log(src, JSON.stringify({ minX: +c.minX.toFixed(1), maxX: +c.maxX.toFixed(1), minZ: +c.minZ.toFixed(1), maxZ: +c.maxZ.toFixed(1), maxY: c.maxY, minY: c.minY, obb: c.obb && { cx: +c.obb.cx.toFixed(1), cz: +c.obb.cz.toFixed(1), hx: +c.obb.hx.toFixed(2), hz: +c.obb.hz.toFixed(2) }, kind: c.kind, name: c.name }));
  });
  console.log('city colliders total', city.colliders.length, 'buildings', city.stats.buildings);
}
if (mode === 'route') {
  const ids = Object.keys(TELEPORT_LOCATIONS);
  const pairs = process.env.PAIRS ? process.env.PAIRS.split(';').map((q) => q.split('>')) : [['trafalgarSquare', 'piccadillyCircus'], ['bigBen', 'trafalgarSquare'], ['stPauls', 'shard'], ['oxfordCircus', 'soho'], ['kingsCross', 'coventGarden'], ['buckinghamPalace', 'bigBen'], ['londonEye', 'boroughMarket'], ['paddington', 'oxfordCircus']];
  let ok = 0;
  for (const [a, b] of pairs) {
    const A = TELEPORT_LOCATIONS[a], B = TELEPORT_LOCATIONS[b];
    const r = network.route({ x: A.x, z: A.z }, { x: B.x, z: B.z }, { heading: A.heading });
    if (!r) { console.log(a, '→', b, 'no route'); continue; }
    cm.setMode('car'); cm.teleportActiveTo(r.points[0], r.points[1], A.heading);
    const e = cm.getActiveEntity(); collisions = 0; evs.length = 0;
    const P = r.points; let queueT = 0, maxQueue = 0; let k = 0, tSim = 0, slowT = 0, reverseT = 0, maxStop = 0, stopT = 0, done = false, dist = 0, px = e.position.x, pz = e.position.z;
    const limit = r.length / 3 + 60; let lastLog = -1;
    while (tSim < limit) {
      while (k < P.length / 2 - 1 && Math.hypot(P[2 * k] - e.position.x, P[2 * k + 1] - e.position.z) < 9) k++;
      const tx = P[2 * k], tz = P[2 * k + 1];
      const want = Math.atan2(tx - e.position.x, tz - e.position.z);
      let d = want - e.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      const sharp = Math.abs(d) > 0.6;
      let keys = { forward: !sharp || e.speed < 5, backward: sharp && e.speed > 8, left: d > 0.06, right: d < -0.06 };
      if (reverseT > 0) { keys = { backward: true, left: d < 0, right: d > 0 }; reverseT -= DT; }
      else if (slowT > 2.5) { reverseT = 1.2; slowT = 0; }
      step(1, keys); tSim += DT;
      dist += Math.hypot(e.position.x - px, e.position.z - pz); px = e.position.x; pz = e.position.z;
      const fx = Math.sin(e.heading), fz = Math.cos(e.heading);
      const queued = (traffic.cars || []).some((v) => { const dx = v.x - e.position.x, dz = v.z - e.position.z, ah = dx * fx + dz * fz; return ah > 0 && ah < 9 && Math.abs(dx * fz - dz * fx) < 2.2; });
      if (queued && Math.abs(e.speed) < 0.8) { queueT += DT; maxQueue = Math.max(maxQueue, queueT);
        if (process.env.WHYQ && Math.abs(queueT - 60) < DT / 2) {
          const chain = []; let cx = e.position.x, cz = e.position.z, hx = fx, hz = fz;
          for (let n = 0; n < 6; n++) {
            const v = (traffic.cars || []).filter((v) => { const dx = v.x - cx, dz = v.z - cz, ah = dx * hx + dz * hz; return ah > 0.5 && ah < 14 && Math.abs(dx * hz - dz * hx) < 2.5; }).sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz))[0];
            if (!v) break;
            chain.push(`${v.type} v${v.speed.toFixed(1)} wait${(v.wait || 0).toFixed(0)} why=${v.why} seg=${v.seg && v.seg.type}${v.seg && v.seg.link ? ':' + v.seg.link.name : ''} @${v.x.toFixed(0)},${v.z.toFixed(0)}`);
            cx = v.x; cz = v.z; hx = Math.sin(v.yaw); hz = Math.cos(v.yaw);
          }
          console.log(`  [${a}→${b}] queued 60 s at ${e.position.x.toFixed(0)},${e.position.z.toFixed(0)}: ` + chain.join('  ->  '));
        }
      } else queueT = 0;
      if (Math.abs(e.speed) < 0.8 && reverseT <= 0 && !queued) slowT += DT; else slowT = 0;
      if (Math.abs(e.speed) < 0.8) { stopT += DT; maxStop = Math.max(maxStop, stopT); } else stopT = 0;
      if (process.env.LOG && a === pairs[0][0] && Math.floor(tSim) !== lastLog) { lastLog = Math.floor(tSim); console.log(`  t${lastLog} pos ${e.position.x.toFixed(1)},${e.position.z.toFixed(1)} v ${e.speed.toFixed(1)} d ${(d * 57.3).toFixed(0)}° k ${k}/${P.length / 2} keys ${Object.keys(keys).filter((q) => keys[q]).join('+')}`); }
      if (Math.hypot(B.x - e.position.x, B.z - e.position.z) < 15 && k >= P.length / 2 - 2) { done = true; break; }
    }
    const maxStuck = maxStop;
    if (done) ok++;
    console.log(`${a} → ${b}: route ${r.length.toFixed(0)} m · ${done ? 'ARRIVED' : 'did not arrive'} in ${tSim.toFixed(0)} s (avg ${(dist / tSim * 2.237).toFixed(0)} mph) · collisions ${collisions} (${[...new Set(evs.map((v) => v.kind))].join(',')}) · longest stop ${maxStuck.toFixed(1)} s · longest wait behind traffic ${maxQueue.toFixed(0)} s`);
  }
  console.log(`arrived ${ok}/${pairs.length}`);
}

// ---------------------------------------------------------------------------------------------------------------
// feel: handling + chase-camera metrics on a flat test world (no city build, ~2 s). Keyboard-style (binary) inputs,
// like a player on a Mac keyboard. Prints one block per metric; --json dumps everything.
// ---------------------------------------------------------------------------------------------------------------
async function runFeel(THREE, args) {
  const json = args.includes('--json');
  const vmode = args.find((a) => !a.startsWith('--')) || 'car';
  const url = (env, rel) => (env ? pathToFileURL(path.resolve(env)).href : new URL(rel, import.meta.url).href);
  const { ThirdPersonControllerManager } = await import(url(process.env.CTRL, '../../js/controllers.js'));
  const { CameraSystem } = await import(url(process.env.CAM, '../../js/cameras.js'));
  const BIG = { minX: -20000, maxX: 20000, minZ: -20000, maxZ: 20000 };
  const flat = { waterLevel: -1.2, isWater: () => false, groundHeight: () => 0 };
  const WALL = 3000; // a long wall face at x = WALL (solid x in [WALL, WALL + 4])
  const colliders = [{ minX: WALL, maxX: WALL + 4, minZ: -4000, maxZ: 4000, maxY: 20 }];
  const scene = new THREE.Scene();
  const cm = new ThirdPersonControllerManager(scene, colliders, { world: flat, bounds: BIG, mode: vmode, spawn: { x: 0, z: 0, heading: 0 } });
  const canvas = { style: {}, addEventListener() {}, setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} };
  const cams = new CameraSystem(canvas, cm);
  cams.setCameraPreset('chase', true);
  let hits = [];
  cm.addCollisionListener((ev) => hits.push(ev));
  const NOKEYS = { forward: false, backward: false, left: false, right: false, up: false, down: false, boost: false };
  const fixed = (dt) => () => dt;
  const jitter = (seed = 7) => { // a real browser: 60 Hz with ±2 ms noise and a dropped frame now and then
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return () => { const r = rnd(); return r < 0.05 ? 2 / 60 : r < 0.08 ? 3 / 60 : 1 / 60 + (rnd() - 0.5) * 0.004; };
  };
  const camBasis = new THREE.Vector3();
  let simT = 0;
  function place(x, z, h, v = 0) {
    cm.resetInput();
    cm.teleportActiveTo(x, z, h);
    const e = cm.getActiveEntity();
    e.speed = v;
    if (cm._resetSmoothing) cm._resetSmoothing(e, v);
    cams.resetForTeleport?.();
    cams.update(1 / 60, simT);
    hits = [];
    return e;
  }
  function run(secs, keysAt, dtFn = fixed(1 / 60), rec = []) {
    const e = cm.getActiveEntity();
    let t = 0, i = 0;
    while (t < secs - 1e-9) {
      const dt = dtFn(i++);
      Object.assign(cm.keys, NOKEYS, keysAt(t + 1e-7, e) || {}); // (+eps: key switches land on the same frame at every rate)
      const h0 = e.heading;
      cm.update(dt, (simT += dt));
      cams.update(dt, simT);
      t += dt;
      const cam = cams.camera;
      cam.updateMatrixWorld();
      // where the car sits on screen (angles off the camera axis): what the eye reads as camera shake
      const d = camBasis.set(e.position.x - cam.position.x, e.position.y + 0.8 - cam.position.y, e.position.z - cam.position.z);
      const m = cam.matrixWorld.elements;
      const rx = d.x * m[0] + d.y * m[1] + d.z * m[2], uy = d.x * m[4] + d.y * m[5] + d.z * m[6], fz = -(d.x * m[8] + d.y * m[9] + d.z * m[10]);
      rec.push({ t, dt, x: e.position.x, z: e.position.z, y: e.position.y, h: e.heading, v: e.speed, vx: e.vx || 0, vz: e.vz || 0,
        yaw: Math.atan2(Math.sin(e.heading - h0), Math.cos(e.heading - h0)) / dt, steer: e.steerAngle || 0,
        roll: e.chassisPivot ? e.chassisPivot.rotation.z : 0, pitch: e.chassisPivot ? e.chassisPivot.rotation.x : 0,
        cx: cam.position.x, cy: cam.position.y, cz: cam.position.z, fov: cam.fov,
        sx: Math.atan2(rx, fz), sy: Math.atan2(uy, fz), camDist: Math.hypot(d.x, d.z),
        cyaw: Math.atan2(cams.currentLookAt.x - cam.position.x, cams.currentLookAt.z - cam.position.z) });
    }
    return rec;
  }
  const deriv = (rec, f) => rec.map((r, i) => (i === 0 ? 0 : (f(r) - f(rec[i - 1])) / r.dt));
  const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / Math.max(1, a.length));
  const maxAbs = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const firstT = (rec, pred) => { const r = rec.find(pred); return r ? r.t : NaN; };
  // high-pass: deviation from a centred ±w s moving average (removes the intended motion, keeps the shake)
  const highPass = (rec, f, w = 0.1) => rec.map((r, i) => {
    let s = 0, n = 0;
    for (let j = i; j >= 0 && r.t - rec[j].t <= w; j--) { s += f(rec[j]); n++; }
    for (let j = i + 1; j < rec.length && rec[j].t - r.t <= w; j++) { s += f(rec[j]); n++; }
    return f(r) - s / n;
  });
  const out = {};
  const S0 = { x: 0, z: -1500 };
  const ent = cm.getActiveEntity();
  const he = ent.halfExtents;

  // 1. acceleration / top speed
  place(S0.x, S0.z, 0);
  let r = run(16, () => ({ forward: true }));
  out.accel = { t30mph: firstT(r, (q) => q.v >= 13.41), t40mph: firstT(r, (q) => q.v >= 17.88), vmax16s: Math.max(...r.map((q) => q.v)) };
  place(S0.x, S0.z, 0);
  r = run(25, () => ({ forward: true, boost: true }));
  out.accel.boost_t60mph = firstT(r, (q) => q.v >= 26.82);
  out.accel.boost_vmax = Math.max(...r.map((q) => q.v));
  // 2. braking from 30 mph (S), and coasting
  place(S0.x, S0.z, 0, 13.41);
  r = run(6, () => ({ backward: true }));
  const stopI = r.findIndex((q) => q.v <= 0.05);
  out.brake = { stop_t: stopI >= 0 ? r[stopI].t : NaN, stop_dist: stopI >= 0 ? Math.hypot(r[stopI].x - S0.x, r[stopI].z - S0.z) : NaN, peakPitchDeg: maxAbs(r.map((q) => q.pitch)) * 57.3 };
  place(S0.x, S0.z, 0, 13.41);
  r = run(3, () => ({}));
  out.brake.coast3s_v = r[r.length - 1].v;
  // 3. turning circle (hold W + A from rest)
  place(S0.x, S0.z, 0);
  r = run(14, () => ({ forward: true, left: true }));
  const circ = {};
  for (const v of [4, 8, 12, 16]) {
    const i = r.findIndex((q) => q.v >= v);
    if (i < 0) continue;
    const seg = r.slice(Math.max(0, i - 6), i + 6);
    const yaw = seg.reduce((s, q) => s + q.yaw, 0) / seg.length;
    circ[`R@${v}`] = v / Math.abs(yaw);
    circ[`latG@${v}`] = (v * Math.abs(yaw)) / 9.81;
  }
  out.circle = circ;
  // 4. step steer at ~38 mph: press A for 1.2 s, release
  place(S0.x, S0.z, 0, 17);
  run(1.0, () => ({ forward: true }));
  r = run(1.2, () => ({ forward: true, left: true }));
  const n0 = r.length;
  run(2.0, () => ({ forward: true }), fixed(1 / 60), r);
  {
    const on = r.slice(0, n0), steady = on.slice(-12).reduce((s, q) => s + q.yaw, 0) / 12;
    const t10 = firstT(on, (q) => q.yaw >= 0.1 * steady), t90 = firstT(on, (q) => q.yaw >= 0.9 * steady);
    const yawAcc = deriv(r, (q) => q.yaw);
    const off = r.slice(n0);
    const settle = firstT(off, (q) => Math.abs(q.yaw) < 0.1 * Math.abs(steady));
    let rollFlips = 0;
    const rv = deriv(off, (q) => q.roll);
    for (let i = 2; i < rv.length; i++) if (Math.sign(rv[i]) !== Math.sign(rv[i - 1]) && Math.abs(off[i].roll) > 0.003) rollFlips++;
    out.stepSteer = { steadyYaw: steady, latG: (steady * 17) / 9.81, rise10_90: t90 - t10, overshoot: Math.max(...on.map((q) => q.yaw)) / steady - 1,
      maxYawAcc: maxAbs(yawAcc), maxSteerRate: maxAbs(deriv(r, (q) => q.steer)), releaseSettle: settle,
      peakRollDeg: maxAbs(r.map((q) => q.roll)) * 57.3, rollReversalsAfterRelease: rollFlips };
  }
  // 5. slalom: alternate A/D every 0.5 s at speed
  place(S0.x, S0.z, 0, 17);
  run(0.5, () => ({ forward: true }));
  r = run(6, (t) => ({ forward: true, left: Math.floor(t / 0.5) % 2 === 0, right: Math.floor(t / 0.5) % 2 === 1 }));
  {
    const ya = deriv(r, (q) => q.yaw), lat = r.map((q) => q.v * q.yaw);
    out.slalom = { rmsYawAcc: rms(ya), maxYawAcc: maxAbs(ya), rmsLatJerk: rms(deriv(r, () => 0).map((_, i) => (i ? (lat[i] - lat[i - 1]) / r[i].dt : 0))),
      peakYaw: maxAbs(r.map((q) => q.yaw)), vMin: Math.min(...r.map((q) => q.v)), vMax: Math.max(...r.map((q) => q.v)),
      peakRollDeg: maxAbs(r.map((q) => q.roll)) * 57.3, speedHF: rms(highPass(r, (q) => q.v, 0.1)) };
  }
  // 6. taps: 0.1 s taps of A at speed (lane-change feel)
  place(S0.x, S0.z, 0, 17);
  run(0.5, () => ({ forward: true }));
  const taps = [];
  for (let k = 0; k < 5; k++) {
    const h0 = ent.heading;
    run(0.1, () => ({ forward: true, left: true }));
    run(0.9, () => ({ forward: true }));
    taps.push((ent.heading - h0) * 57.3);
  }
  out.taps = { headingPerTapDeg: taps.reduce((a, b) => a + b, 0) / taps.length, spread: Math.max(...taps) - Math.min(...taps) };
  // 7. cruise at top speed, held W: speed ripple
  place(S0.x, S0.z, 0, 0);
  r = run(14, () => ({ forward: true }), jitter(3));
  const tail = r.filter((q) => q.t > 10);
  out.cruise = { vStd: Math.sqrt(tail.reduce((s, q) => s + (q.v - tail[0].v) ** 2, 0) / tail.length), speedHF: rms(highPass(tail, (q) => q.v, 0.1)) };
  // 8. frame-rate independence: one scripted drive at different frame rates
  const script = (t) => t < 3 ? { forward: true } : t < 6 ? { forward: true, left: Math.floor(t / 0.5) % 2 === 0, right: Math.floor(t / 0.5) % 2 === 1 }
    : t < 7 ? { forward: true, up: true, left: true } : t < 9 ? { backward: true } : {};
  const runs = {};
  for (const [name, fn] of [['30fps', fixed(1 / 30)], ['60fps', fixed(1 / 60)], ['120fps', fixed(1 / 120)], ['144fps', fixed(1 / 144)], ['jitter60', jitter(11)]]) {
    place(S0.x, S0.z, 0);
    runs[name] = run(10, script, fn);
  }
  const at = (rec, t) => { const i = rec.findIndex((q) => q.t >= t); if (i <= 0) return rec[Math.max(0, i)] || rec[rec.length - 1]; const a = rec[i - 1], b = rec[i], u = (t - a.t) / (b.t - a.t); return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, h: a.h + (b.h - a.h) * u }; };
  out.frameRate = {};
  for (const name of Object.keys(runs)) {
    let dev = 0;
    for (let t = 0.1; t <= 9.9; t += 0.1) { const a = at(runs[name], t), b = at(runs['120fps'], t); dev = Math.max(dev, Math.hypot(a.x - b.x, a.z - b.z)); }
    const a = runs[name][runs[name].length - 1], b = runs['120fps'][runs['120fps'].length - 1];
    out.frameRate[name] = { maxPathDev_m: dev, finalHeadingDev_deg: Math.abs(a.h - b.h) * 57.3 };
  }
  // 9. chase camera: car-on-screen shake (high-passed screen angle, mrad) & distance snapping, on the jittery run
  {
    const rr = runs['jitter60'].filter((q) => q.t > 0.5);
    const sx = highPass(rr, (q) => q.sx, 0.08), sy = highPass(rr, (q) => q.sy, 0.08);
    const dd = deriv(rr, (q) => q.camDist).slice(1);
    const r60 = runs['60fps'].filter((q) => q.t > 0.5);
    out.camera = { screenShake_mrad_jitter: 1000 * Math.hypot(rms(sx), rms(sy)),
      screenShake_mrad_60: 1000 * Math.hypot(rms(highPass(r60, (q) => q.sx, 0.08)), rms(highPass(r60, (q) => q.sy, 0.08))),
      camHeightHF_mm: 1000 * rms(highPass(rr, (q) => q.cy, 0.08)), maxDistRate: maxAbs(dd),
      viewYawAcc_rms60: rms(deriv(r60, (q) => q.cyaw).map((w, i, a) => (i > 1 ? (w - a[i - 1]) / r60[i].dt : 0)).slice(3)),
      viewYawRate_max60: maxAbs(deriv(r60, (q) => q.cyaw).slice(2)),
      distRange: [Math.min(...rr.map((q) => q.camDist)), Math.max(...rr.map((q) => q.camDist))], fovRange: [Math.min(...rr.map((q) => q.fov)), Math.max(...rr.map((q) => q.fov))] };
  }
  // 10. walls: drive into a long wall at 15 m/s (W held) at several angles; and a 3 m/s nudge
  const ext = (h) => Math.abs(Math.cos(h)) * he.hx + Math.abs(Math.sin(h)) * he.hz;
  out.wall = {};
  for (const [deg, v] of [[15, 15], [30, 15], [60, 15], [90, 15], [45, 3]]) {
    const h = (deg * Math.PI) / 180;
    const x0 = WALL - ext(h) - 0.3 - v * Math.sin(h) * 0.5;
    place(x0, 0, h, v);
    r = run(3, () => ({ forward: true }));
    const gap = (q) => WALL - (q.x + ext(q.h));
    const ci = r.findIndex((q) => gap(q) < 0.05);
    if (ci < 0) { out.wall[`${deg}deg@${v}`] = { contact: false }; continue; }
    const c = r[ci];
    let bounces = 0, inContact = true, maxGap = 0;
    for (const q of r.slice(ci)) {
      const g = gap(q);
      if (q.t - c.t < 1.5) maxGap = Math.max(maxGap, g);
      if (inContact && g > 0.25) { inContact = false; }
      else if (!inContact && g < 0.05) { inContact = true; bounces++; }
    }
    const after = r.find((q) => q.t >= c.t + 0.5) || r[r.length - 1];
    const after1 = r.find((q) => q.t >= c.t + 1.0) || r[r.length - 1];
    const along = (q) => Math.abs(Math.cos(q.h) * q.v + q.vz); // world z velocity = along the wall
    out.wall[`${deg}deg@${v}`] = { alongKept: along(after) / (v * Math.cos(h) || 1), speedAfter05: Math.hypot(Math.sin(after.h) * after.v + after.vx, Math.cos(after.h) * after.v + after.vz),
      reboundGap_m: maxGap, rebounces: bounces, headingKick_deg: ((after1.h - c.h) * 57.3), peakYaw: maxAbs(r.slice(ci).map((q) => q.yaw)),
      minSpeed: Math.min(...r.slice(ci).map((q) => q.v)), events: hits.length };
  }
  // 11. reversing towards a wall: is the chase camera inside it?
  {
    place(WALL - he.hz - 0.4, 500, -Math.PI / 2, 0);
    r = run(2.5, () => ({ backward: true }));
    const inside = r.filter((q) => q.t > 0.4 && q.cx > WALL && q.cy < 20).length;
    out.cameraInWall = { framesInside: inside, of: r.filter((q) => q.t > 0.4).length, minCamDist: Math.min(...r.map((q) => q.camDist)) };
  }
  if (json) { console.log(JSON.stringify(out, null, 1)); return; }
  const f = (v) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3)) : Array.isArray(v) ? '[' + v.map(f).join(', ') + ']' : String(v));
  console.log(`feel metrics — mode ${vmode}${process.env.CTRL ? ' CTRL=' + process.env.CTRL : ''}`);
  for (const [k, o] of Object.entries(out)) {
    const flatO = Object.entries(o).map(([a, b]) => (b && typeof b === 'object' && !Array.isArray(b) ? `${a}{ ${Object.entries(b).map(([c, d]) => `${c} ${f(d)}`).join(', ')} }` : `${a} ${f(b)}`));
    console.log(`${k.padEnd(13)} ${flatO.join(' · ')}`);
  }
}
if (mode === 'idlemode') {
  for (const m of (process.env.MODES || 'bus,car,ride').split(',')) {
    const L = TELEPORT_LOCATIONS[spots[0]];
    cm.setMode(m); cm.teleportActiveTo(L.x, L.z, L.heading);
    const e = cm.getActiveEntity(); const x0 = e.position.x, z0 = e.position.z;
    let vmax = 0;
    for (let i = 0; i < 450; i++) { step(1); vmax = Math.max(vmax, Math.abs(e.speed)); }
    console.log(`${m} idle 15 s at ${spots[0]}: moved ${Math.hypot(e.position.x - x0, e.position.z - z0).toFixed(2)} m, max speed ${vmax.toFixed(2)} m/s, final ${e.speed.toFixed(2)}`);
  }
}
if (mode === 'busidle') {
  const fs = await import('node:fs');
  const BR = JSON.parse(fs.readFileSync(new URL('../../data/ldn-bus-routes.json', import.meta.url)));
  const picks = BR.routes.slice(0, 8);
  let worst = 0;
  for (const r of picks) {
    const v = r.variants[0], s0 = v.stops[0];
    cm.setMode('bus'); cm.teleportActiveTo(s0.bx, s0.bz, s0.h);
    const e = cm.getActiveEntity(); const x0 = e.position.x, z0 = e.position.z;
    let maxD = 0;
    for (let i = 0; i < 1800; i++) { step(1); maxD = Math.max(maxD, Math.hypot(e.position.x - x0, e.position.z - z0)); }
    worst = Math.max(worst, maxD);
    console.log(`route ${r.ref} first stop ${s0.name}: bus parked 60 s with traffic, max displacement ${maxD.toFixed(2)} m, traffic ${traffic.vehicles}`);
  }
  console.log('worst displacement', worst.toFixed(2), 'm');
}
