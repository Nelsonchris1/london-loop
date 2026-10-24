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
const scene = new THREE.Scene();
const lm = buildLondonLandmarks(scene, { world: WORLD });
const city = buildLondonCity(scene, { geo: GEO, world: WORLD, landmarkZones: lm.zones, details: true, trees: false });
const { ThirdPersonControllerManager } = await import('../../js/controllers.js');
// tools/diag/road-scan.mjs — sweep a car along every lane of every drivable road and report where the game's own
// physics would stop it: static colliders (resolveHorizontalCollision moves it) or water (waterBlocked).
const cm = new ThirdPersonControllerManager(scene, [...lm.colliders, ...city.colliders], { world: WORLD, mode: 'car' });
if (city.surfaceHeight && cm.setSurfaceHeight) cm.setSurfaceHeight(city.surfaceHeight);
const ent = cm.entities.car;
const DRIVE = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential']);
const nBld = city.stats.buildingColliders ?? city.colliders.findIndex((c) => !c.obb || (c.maxX - c.minX) < 2.2);
const hits = new Map(); let samples = 0, edgeHits = 0;
const { WORLD_BOUNDS: WORLD_BOUNDS_LOCAL } = await import('../../js/geo-frame.js');
const pos = new THREE.Vector3();
for (const r of GEO.roads) {
  if (!DRIVE.has(r.kind) || r.tunnel) continue;
  if (process.env.MAJOR && !/^(motorway|trunk|primary|secondary)/.test(r.kind)) continue;
  const p = r.pts, deck = r.deck;
  const hw = Math.max(0, r.w / 2 - 1.3);
  const lanesOff = process.env.MAJOR ? [-hw, -hw / 2, 0, hw / 2, hw] : (r.oneway ? [0] : [-(r.w / 4), r.w / 4]);
  for (let i = 0; i + 3 < p.length; i += 2) {
    const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    for (let s = 0; s < L; s += 3) {
      for (const off of lanesOff) {
        const x = p[i] + ux * s + nx * off, z = p[i + 1] + uz * s + nz * off;
        let heading = Math.atan2(ux, uz); if (!r.oneway && off < 0) heading += Math.PI;
        samples++;
        const y = cm.getGroundHeight(x, z, 'car');
        ent.heading = heading; ent.speed = 0; ent.vx = 0; ent.vz = 0;
        ent.position.set(x, y, z);
        pos.set(x, y, z);
        let why = '';
        if (cm.waterBlocked('car', x, z, heading, y)) why = 'water';
        else {
          const hit = cm.resolveHorizontalCollision(pos, 1.35, y + 1.0, ent);
          if (hit && Math.hypot(pos.x - x, pos.z - z) > 0.05) why = 'collider';
        }
        const B = WORLD_BOUNDS_LOCAL;
        const nearEdge = x < B.minX + 40 || x > B.maxX - 40 || z < B.minZ + 40 || z > B.maxZ - 40;
        if (why && nearEdge) { edgeHits++; continue; }
        if (why) {
          const k = (r.name || r.ref || r.kind) + '|' + why;
          let what = '';
          if (why === 'collider') {
            const nLm = lm.colliders.length;
            for (const c of cm.nearColliders(x, z, 4)) { if (x > c.minX - 2.5 && x < c.maxX + 2.5 && z > c.minZ - 2.5 && z < c.maxZ + 2.5) { const i = cm.colliders.indexOf(c); what = (i < nLm ? 'landmark' : i < nLm + nBld ? 'building' : 'prop/roadend') + ' ' + (c.maxX - c.minX).toFixed(1) + 'x' + (c.maxZ - c.minZ).toFixed(1) + ' h' + (c.maxY ?? 0).toFixed(1) + (c.minY ? ' minY' + c.minY.toFixed(1) : ''); break; } }
          }
          const e = hits.get(k) || { n: 0, x, z, kind: r.kind, bridge: r.bridge, layer: r.layer, what };
          e.n++; hits.set(k, e);
        }
      }
    }
  }
}
const list = [...hits.entries()].sort((a, b) => b[1].n - a[1].n);
console.log('edge-of-map hits', edgeHits); console.log('samples', samples, 'blocked samples', list.reduce((s, [, e]) => s + e.n, 0));
for (const [k, e] of list.slice(0, 60)) console.log(k.padEnd(48), String(e.n).padStart(5), e.kind, 'bridge=' + e.bridge, 'layer=' + e.layer, `@${e.x.toFixed(0)},${e.z.toFixed(0)}`, e.what || '');
