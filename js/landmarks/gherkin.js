// js/landmarks/gherkin.js — 30 St Mary Axe (180 m): bulging lathe profile, diamond diagrid, six dark spiral bands,
// lit floors at night and the glowing lens dome on top.
// Local frame: origin = tower axis (OSM way 4959489, a 56.7 m circle).
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, color, positionLocal, positionWorld, normalWorld, cameraPosition, atan, fract, floor, abs, min, max, mix, step, smoothstep, clamp, normalize, reflect, dot, pow, fwidth } from 'three/tsl';
import { LandmarkBuilder, plainMaterial, glowMaterial, nightNode, hash2 } from './common.js';

const ORIGIN = { x: 3311.6, z: -750.5 };
const H = 180;

function gherkinMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.35 });
  const night = nightNode();
  const p = positionLocal;
  const u = atan(p.z, p.x).div(Math.PI * 2).add(0.5); // 0 … 1 around
  const v = p.y;
  // six dark spirals, half a turn over the height
  const w = fract(u.mul(6).add(v.mul(3.0 / H)));
  const aaW = min(fwidth(w), 0.05).add(0.002);
  const dark = smoothstep(float(0), aaW, w).mul(float(1).sub(smoothstep(float(0.3), aaW.add(0.3), w)));
  // diagrid (24 diagonals each way, 2 floors per node) + faint floor lines
  const N = 24, dv = 8.3;
  const a1 = fract(u.mul(N).add(v.div(dv))), a2 = fract(u.mul(N).sub(v.div(dv)));
  const lw = 0.035;
  const lineA = float(1).sub(smoothstep(float(lw), min(fwidth(a1), 0.1).mul(1.5).add(lw + 0.01), min(a1, float(1).sub(a1))));
  const lineB = float(1).sub(smoothstep(float(lw), min(fwidth(a2), 0.1).mul(1.5).add(lw + 0.01), min(a2, float(1).sub(a2))));
  const grid = max(lineA, lineB);
  const fl = fract(v.div(4.15));
  const floorLine = float(1).sub(smoothstep(float(0.04), fwidth(fl).mul(1.5).add(0.05), min(fl, float(1).sub(fl))));
  const lightGlass = color(0x4e7882), darkGlass = color(0x182630), steel = color(0xaebcbc);
  const view = normalize(positionWorld.sub(cameraPosition));
  const n = normalWorld;
  const r = reflect(view, n);
  const sky = mix(color(0xe6d2b8), color(0x46709e), clamp(r.y.mul(1.5).add(0.1), 0, 1));
  const fres = float(0.3).add(pow(float(1).sub(abs(dot(view, n))), 3).mul(0.7));
  const base = mix(lightGlass, darkGlass, dark);
  const albedo = mix(mix(base, base.mul(0.8), floorLine.mul(0.5)), steel, grid.mul(0.6));
  mat.colorNode = albedo;
  const dayK = float(1).sub(night.mul(0.85));
  const refl = sky.mul(fres).mul(mix(float(0.32), float(0.6), dark)).mul(dayK).mul(float(1).sub(grid.mul(0.7)));
  const cell = vec2(floor(u.mul(48)), floor(v.div(4.15)));
  const lit = step(hash2(cell.add(5.3)), mix(float(0.62), float(0.35), dark));
  const warm = mix(color(0xfff1d8), color(0x9ad0ff), dark);
  const dome = smoothstep(163, 168, v);
  const interior = warm.mul(lit).mul(float(1).sub(grid)).mul(1.15).add(color(0xffd9a0).mul(dome).mul(1.6));
  mat.emissiveNode = refl.add(interior.mul(night));
  mat.roughnessNode = mix(float(0.12), float(0.5), grid);
  return mat;
}

export function buildGherkin() {
  const L = new LandmarkBuilder('gherkin', { x: ORIGIN.x, z: ORIGIN.z, theta: 0 });
  const prof = [[24.4, 0], [25.6, 12], [26.9, 28], [27.9, 46], [28.3, 64], [28.1, 80], [27.3, 96], [25.8, 112], [23.6, 126], [20.8, 139], [17.5, 150], [14.2, 159], [11.2, 166], [8.0, 172], [4.6, 176.6], [1.6, 179.2], [0.01, 180]];
  const curve = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(60);
  const g = new THREE.LatheGeometry(pts, 72);
  L.mesh(g, gherkinMaterial());
  // ground-floor arcade (dark glazing + stone plinth)
  L.cyl(glowMaterial(0xffe6c0, 0.06, 1.3), 24.0, 24.0, 5.5, 0, 0, 0, 48);
  L.cyl(plainMaterial(0xbdb6aa, { rough: 0.85 }), 32, 32, 0.4, 0, -0.2, 0, 48);
  L.colliderRound(0, 0, 27.5, H);
  L.zoneCircle(0, 0, 30, 20);
  L.finish();
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame };
}
