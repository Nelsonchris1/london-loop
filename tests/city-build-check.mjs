// tests/city-build-check.mjs — Workstream F: builds the WHOLE London city in Node (geometry + materials, no GPU)
// and reports triangles / meshes / colliders / timings per layer. Trees are only counted (their leaf atlas needs a
// canvas). Usage:
//   node --max-old-space-size=8000 tests/city-build-check.mjs            # whole city
//   node tests/city-build-check.mjs 300 750 450                          # region cx cz r
// Exits non-zero if the build throws or produces no buildings / roads / colliders.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const THREE = await import('three/webgpu');
const { GEO } = await import('../js/ldn-geodata.js');
const { WORLD } = await import('../js/london-config.js');
const { buildLondonCity } = await import('../js/london-city.js');

const a = process.argv.slice(2).map(Number);
const region = a.length >= 3 ? { cx: a[0], cz: a[1], r: a[2] } : null;
const scene = new THREE.Scene();
const cpu0 = process.cpuUsage();
const t0 = performance.now();
const city = buildLondonCity(scene, { geo: GEO, world: WORLD, region });
const wall = performance.now() - t0, cpu = process.cpuUsage(cpu0).user / 1000;

const per = new Map();
let total = 0, meshes = 0;
city.root.traverse((o) => {
  if (!o.isMesh) return;
  const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  const t = o.isInstancedMesh ? n * o.count : n;
  const k = o.name.replace(/_(far)?-?\d+,-?\d+$/, '');
  const e = per.get(k) || { meshes: 0, tris: 0, inst: 0 };
  e.meshes++; e.tris += t; if (o.isInstancedMesh) e.inst += o.count;
  per.set(k, e);
  total += t; meshes++;
});
console.log(`buildLondonCity ${region ? JSON.stringify(region) : '(whole city)'}: wall ${Math.round(wall)} ms, cpu ${Math.round(cpu)} ms`);
console.log('timings (ms):', JSON.stringify(city.stats.timings));
console.log('layer'.padEnd(22), 'meshes'.padStart(7), 'triangles'.padStart(11), 'instances'.padStart(10));
for (const [k, e] of per) console.log(k.padEnd(22), String(e.meshes).padStart(7), String(Math.round(e.tris)).padStart(11), e.inst ? String(e.inst).padStart(10) : '');
const st = city.stats;
const instanced = [...per.values()].filter((e) => e.inst).reduce((s, e) => s + e.tris, 0);
console.log(`TOTAL ${meshes} meshes, ${(total / 1e6).toFixed(2)}M triangles (${((total - instanced) / 1e6).toFixed(2)}M static merged + ${(instanced / 1e6).toFixed(2)}M instanced props, distance-culled), ` +
  `${st.buildings} buildings + ${st.fillerBlocks} filler blocks in ${st.tiles} tiles, ${city.colliders.length} colliders, ${city.sidewalks.strips.length} pavement strips, ` +
  `${city.footprints.length} footprints, ${city.signalHeads.length} signal heads, ${st.detailStats.trees} trees (counted)`);
if (!st.buildings || !st.roadStats.carriage || !city.colliders.length) { console.error('FAIL: empty city'); process.exit(1); }
