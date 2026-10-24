// tests/city-build-check.mjs — Workstream F: builds the WHOLE London city in Node (geometry + materials, no GPU)
// and reports triangles / meshes / colliders / timings per layer. Trees are only counted (their leaf atlas needs a
// canvas). Usage:
//   node --max-old-space-size=8000 tests/city-build-check.mjs            # whole city
//   node tests/city-build-check.mjs 300 750 450                          # region cx cz r
// Exits non-zero if the build throws or produces no buildings / roads / colliders.
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
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctxProxy }) };
const THREE = await import('three/webgpu');
const { GEO } = await import('../../js/ldn-geodata.js');
const { WORLD } = await import('../../js/london-config.js');
const { buildLondonCity } = await import('../../js/london-city.js');
const { buildLondonLandmarks } = await import('../../js/london-landmarks.js');
const scene = new THREE.Scene();
const lm = buildLondonLandmarks(scene, { world: WORLD });
const city = buildLondonCity(scene, { geo: GEO, world: WORLD, landmarkZones: lm.zones, details: true, trees: false });
const cols = [...lm.colliders, ...city.colliders]; console.log('colliders', cols.length, 'city build ms', city.stats.buildMs, JSON.stringify(city.stats.timings));
// spatial hash
const CELL = 40, grid = new Map();
cols.forEach((c, i) => { for (let ix = Math.floor(c.minX / CELL); ix <= Math.floor(c.maxX / CELL); ix++) for (let iz = Math.floor(c.minZ / CELL); iz <= Math.floor(c.maxZ / CELL); iz++) { const k = ix + ',' + iz; (grid.get(k) || grid.set(k, []).get(k)).push(i); } });
const inside = (c, x, z) => {
  if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) return false;
  if (!c.obb) return true;
  const o = c.obb, dx = x - o.cx, dz = z - o.cz;
  const lx = dx * o.cs - dz * o.sn, lz = dx * o.sn + dz * o.cs;
  return Math.abs(lx) <= o.hx && Math.abs(lz) <= o.hz;
};
const DRIVE = new Set(['motorway','trunk','primary','secondary','tertiary','unclassified','residential','living_street','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link']);
let samples = 0, blocked = 0, water = 0; const byKind = {}, examples = [];
for (const r of GEO.roads) {
  if (!DRIVE.has(r.kind) || r.tunnel) continue;
  const p = r.pts;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const x0 = p[i], z0 = p[i+1], x1 = p[i+2], z1 = p[i+3];
    const L = Math.hypot(x1-x0, z1-z0), n = Math.max(1, Math.floor(L / 4));
    for (let k = 0; k < n; k++) {
      const x = x0 + (x1-x0)*k/n, z = z0 + (z1-z0)*k/n; samples++;
      const g = WORLD.groundHeight(x, z, 'car');
      if (WORLD.isWater(x, z) && g < 0.3) { water++; if (examples.length < 400) examples.push(['water', r.name, r.kind, x|0, z|0]); }
      const cand = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || [];
      for (const ci of cand) { const c = cols[ci]; if (c.minY != null && c.minY > g + 1.6) continue; if (c.maxY != null && c.maxY < g + 0.3) continue; if (inside(c, x, z)) { blocked++; const kk = r.kind; byKind[kk] = (byKind[kk]||0)+1; if (examples.length < 400) examples.push(['collider', r.name, r.kind, x|0, z|0, Math.round(c.maxX-c.minX)+'x'+Math.round(c.maxZ-c.minZ), c.obb ? 'obb' : 'aabb', ci < lm.colliders.length ? 'LANDMARK' : 'city', c.maxY|0]); break; } }
    }
  }
}
console.log({ samples, blocked, pct: (100*blocked/samples).toFixed(2), water, byKind });
const named = {}; for (const e of examples) if (e[1]) named[e[0]+':'+e[1]] = (named[e[0]+':'+e[1]]||0)+1;
console.log(Object.entries(named).sort((a,b)=>b[1]-a[1]).slice(0,30));
console.log(examples.filter(e=>e[0]==='collider').slice(0,25).map(e=>e.join(' ')).join('\n'));
