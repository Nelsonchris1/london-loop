// js/landmarks/battersea.js — Battersea Power Station: art-deco brick cathedral of power (≈160 × 170 m), the central
// boiler house flanked by the two turbine halls with stepped corner piers, and four white fluted chimneys (103 m) at
// the corners of the boiler house (OSM ways 223254725, 223255111, 223255300, 223255478).
// Local frame: origin = centre of the OSM outline (way 4965216), +z = along the long axis towards the south (the
// river is to the north, −z), +x = east.
import * as THREE from 'three/webgpu';
import { color, positionLocal, atan, fract, abs, min, smoothstep, float, mix, length, vec2, positionWorld } from 'three/tsl';
import { LandmarkBuilder, stoneMaterial, plainMaterial, glowMaterial, nightNode, thetaForLocalZ } from './common.js';

const ORIGIN = { x: -1148.9, z: 2886.8 };
const THETA = thetaForLocalZ(-0.223, 0.975);
const CHIMNEYS = [[-24.6, -78.3], [24.8, -78.8], [-23.8, 77.8], [24.7, 78.2]];

function chimneyMaterial() {
  // white concrete, fluted (24 flutes around each chimney), soot at the rim, uplit at night
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
  const night = nightNode();
  const p = positionLocal;
  // nearest chimney axis (local coords)
  let best = null;
  for (const [cx, cz] of CHIMNEYS) {
    const d = length(vec2(p.x.sub(cx), p.z.sub(cz)));
    const ang = atan(p.z.sub(cz), p.x.sub(cx));
    const item = { d, ang };
    best = best ? { d: min(best.d, d), ang: mix(best.ang, ang, smoothstep(0.0, 0.001, best.d.sub(d))) } : item;
  }
  const f = fract(best.ang.div(Math.PI * 2).mul(24));
  const flute = smoothstep(0.0, 0.5, abs(f.sub(0.5)));
  const soot = smoothstep(98, 102.5, p.y);
  const band = smoothstep(0.0, 0.3, abs(fract(p.y.div(101)).sub(0.5)));
  const base = mix(color(0xf3f1ea), color(0xd7d4cc), flute.mul(0.6));
  mat.colorNode = mix(base, color(0x8d8a86), soot.mul(0.7)).mul(mix(float(1), float(0.97), band));
  mat.emissiveNode = base.mul(color(0xfff0e0)).mul(night).mul(mix(float(0.75), float(0.45), smoothstep(50, 100, p.y)));
  return mat;
}

export function buildBattersea() {
  const L = new LandmarkBuilder('battersea', { x: ORIGIN.x, z: ORIGIN.z, theta: THETA });
  const brick = stoneMaterial({ base: 0x96604a, bay: 4.2, floorH: 32, sill: 6, winW: 1.25, winH: 20, arch: 0, y0: 2, yMax: 34, litProb: 0.75, warm: 0xffd29a, flood: 0.55, floodColor: 0xffcf9a, ribs: 0.22, courses: 0.0, seed: 61, floodFalloff: 60, brick: true, var: 0.08, mullion: false });
  const brickPlain = stoneMaterial({ base: 0x8f5a44, bay: 3.0, floorH: 50, windows: false, flood: 0.5, floodColor: 0xffcf9a, ribs: 0.28, courses: 0, seed: 62, brick: true, var: 0.08, floodFalloff: 80 });
  const roof = plainMaterial(0x3a3c3f, { rough: 0.7, metal: 0.3 });
  const glassRoof = plainMaterial(0x6a7d88, { rough: 0.2, metal: 0.6 });
  const chim = chimneyMaterial();
  const trim = plainMaterial(0xcfc6b5, { rough: 0.8, flood: 0.5 });
  const S = L.static;

  // ------------------------------------------------------------------ boiler house (centre) 54 × 156, 50 m
  L.box(brickPlain, 54, 50, 152, 0, 0, 0, 0, S);
  L.box(brick, 55, 34, 153, 0, 0, 0, 0, S); // lower windowed band (proud by 0.5)
  L.box(roof, 52, 0.8, 150, 0, 50, 0, 0, S);
  // stepped ends of the boiler house (north river front and south): fluted pilasters, glazed slot
  for (const sz of [-1, 1]) {
    L.box(brickPlain, 32, 46, 4, 0, 0, sz * 77.5, 0, S);
    L.box(glowMaterial(0xffd8a0, 0.05, 1.3), 6, 30, 0.3, 0, 8, sz * 79.6, 0, S);
    for (const x of [-12, -6, 6, 12]) L.box(brickPlain, 1.6, 44, 1.4, x, 0, sz * 79.8, 0, S);
  }
  // chimney bases (stepped square plinths) + chimneys 56 → 103 m
  for (const [cx, cz] of CHIMNEYS) {
    L.box(brickPlain, 13, 52, 13, cx, 0, cz, 0, S);
    L.box(brickPlain, 11.5, 3, 11.5, cx, 52, cz, 0, S);
    L.box(trim, 10.2, 1.6, 10.2, cx, 55, cz, 0, S);
    const g = new THREE.CylinderGeometry(3.35, 4.45, 46.4, 48, 6);
    L.mesh(g, chim, cx, 56.6 + 23.2, cz);
    L.cyl(chim, 3.5, 3.5, 0.8, cx, 101.4, cz, 48, S);
    L.cyl(plainMaterial(0x202124, { rough: 0.9 }), 3.0, 3.0, 0.2, cx, 102.1, cz, 24, S); // soot-dark mouth
    L.colliderRound(cx, cz, 4.6, 103);
  }

  // ------------------------------------------------------------------ turbine halls A (west) & B (east)
  for (const sx of [-1, 1]) {
    const hx = sx * 53.5, h = sx < 0 ? 35 : 33;
    L.box(brick, 53, h, 160, hx, 0, 0, 0, S);
    L.box(roof, 51, 0.8, 156, hx, h, 0, 0, S);
    L.box(glassRoof, 30, 2.2, 140, hx, h + 0.8, 0, 0, S);
    // stepped corner piers (art-deco ziggurats)
    for (const sz of [-1, 1]) {
      const px = sx * 76, pz = sz * 76;
      L.box(brickPlain, 10, h + 3, 10, px, 0, pz, 0, S);
      L.box(brickPlain, 7.5, 3, 7.5, px, h + 3, pz, 0, S);
      L.box(brickPlain, 5, 2.5, 5, px, h + 6, pz, 0, S);
      L.box(trim, 10.4, 0.6, 10.4, px, h + 2.6, pz, 0, S);
    }
    // the long fluted parapet on the outer side
    L.box(brickPlain, 1.2, 4, 150, sx * 80.2, h - 1, 0, 0, S);
    L.collider(hx, 0, 26.5, 77, h + 2);
  }
  L.collider(0, 0, 27.5, 77, 50);
  // jetty wall / river frontage plinth
  L.box(trim, 170, 1.0, 6, 0, -0.4, -84, 0, S);

  L.zoneRect(-82, -86, 82, 86, 'batterseaPowerStation');
  L.finish();
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame };
}
