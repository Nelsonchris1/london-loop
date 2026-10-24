// js/landmarks/westminster.js — Elizabeth Tower (Big Ben) + the Palace of Westminster river front
// Local frame: origin = Elizabeth Tower centre (OSM way 123557148), +x = east (towards the Thames), +z = south along
// the river front (which runs 6.7° west of due south). The river facade is at x ≈ 64.6 from z ≈ 15 to z ≈ 282,
// Victoria Tower stands at (−23.3, 268.9), the Central Tower at (6.7, 146.5), Westminster Hall at (−44.8, 96.1).
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, color, uv, atan, length, abs, mix, smoothstep, step, clamp, max, min, sin, cos, fract, floor } from 'three/tsl';
import { LM, LandmarkBuilder, stoneMaterial, plainMaterial, goldMaterial, glowMaterial, nightNode, thetaForLocalZ, unionFlagTexture, mergeByMaterial } from './common.js';

const ORIGIN = { x: 240.0, z: 782.0 };
const THETA = thetaForLocalZ(-0.117, 0.993);

/** Opal-glass clock dial with iron tracery, gilded chapter ring and hands driven by LM.uClockH / uClockM */
function clockFaceMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(2.0);
    const r = length(p);
    const ang = atan(p.x, p.y); // clockwise from 12 (−π … π)
    const a01 = fract(ang.div(Math.PI * 2).add(1.0));
    const night = nightNode();
    const dial = mix(color(0xd9d4c2).mul(0.95), color(0xfff0c4).mul(2.2), night);
    // iron tracery in the glass: radial glazing bars + concentric rings
    const seg = fract(a01.mul(60));
    const radial = smoothstep(0.08, 0.0, min(seg, float(1).sub(seg)).mul(r).mul(4)).mul(step(0.28, r)).mul(step(r, 0.74));
    const ring = smoothstep(0.012, 0.0, abs(r.sub(0.5))).add(smoothstep(0.012, 0.0, abs(r.sub(0.28))));
    let col = mix(dial, color(0x2a2620), clamp(radial.mul(0.55).add(ring.mul(0.8)), 0, 1));
    // chapter ring (black band with gilded numeral blocks)
    const band = step(0.76, r).mul(step(r, 0.93));
    const hr = fract(a01.mul(12));
    const numeral = smoothstep(0.16, 0.1, min(hr, float(1).sub(hr))).mul(step(0.79, r)).mul(step(r, 0.9));
    const mins = fract(a01.mul(60));
    const minuteTick = smoothstep(0.2, 0.1, min(mins, float(1).sub(mins))).mul(step(0.905, r)).mul(step(r, 0.925));
    const gold = color(0xd9ac48).mul(mix(float(1.0), float(1.6), night));
    col = mix(col, color(0x14181a), band);
    col = mix(col, gold, max(numeral, minuteTick).mul(band.add(minuteTick).min(1)));
    // gilded outer rim
    col = mix(col, gold, step(0.93, r));
    // hands
    const hand = (angle, len, w) => {
      const d = vec2(sin(angle), cos(angle));
      const along = p.x.mul(d.x).add(p.y.mul(d.y));
      const perp = abs(p.x.mul(d.y).sub(p.y.mul(d.x)));
      const wTaper = mix(float(w), float(w * 0.35), clamp(along.div(len), 0, 1));
      return step(-0.08, along).mul(step(along, len)).mul(step(perp, wTaper));
    };
    const handsMask = max(hand(LM.uClockH, 0.55, 0.055), hand(LM.uClockM, 0.86, 0.035));
    const hub = step(r, 0.06);
    col = mix(col, color(0x1a2222), max(handsMask, hub));
    return col;
  })();
  return mat;
}

export function buildWestminster(ctx) {
  const L = new LandmarkBuilder('westminster', { x: ORIGIN.x, z: ORIGIN.z, theta: THETA });
  // Anston limestone (honey), gothic perpendicular bays with lit windows
  const palStone = stoneMaterial({ base: 0xcdb791, bay: 3.6, floorH: 5.4, sill: 1.2, winW: 1.5, winH: 3.3, arch: 0.8, y0: 1.8, litProb: 0.42, flood: 0.55, ribs: 0.16, courses: 0.2, seed: 11, floodFalloff: 40 });
  const towerStone = stoneMaterial({ base: 0xd2bd96, bay: 2.0, floorH: 4.4, sill: 1.2, winW: 0.5, winH: 2.6, arch: 0.4, y0: 3.0, yMax: 47.0, litProb: 0.1, glass: 0x1c2026, flood: 0.75, ribs: 0.2, courses: 0.22, seed: 23, floodFalloff: 120 });
  const trim = plainMaterial(0xc9b28a, { rough: 0.85, flood: 0.6 });
  const slate = plainMaterial(0x5b656b, { rough: 0.7, metal: 0.25, flood: 0.12 });
  const iron = plainMaterial(0x2f3a3a, { rough: 0.55, metal: 0.5, flood: 0.15 });
  const gold = goldMaterial(0xcfa346, 0.45);
  const dark = plainMaterial(0x15181a, { rough: 0.9 });
  const clock = clockFaceMaterial();
  const belfryGlow = glowMaterial(0xffe2a0, 0.0, 1.4);
  const ayrton = glowMaterial(0xfff4d8, 0.15, 2.2);

  // ---------------------------------------------------------------------------- Elizabeth Tower (96 m)
  {
    const T = new THREE.Group();
    L.add(T);
    L.box(trim, 13.6, 3, 13.6, 0, 0, 0, 0, T);
    L.box(towerStone, 12.0, 46, 12.0, 0, 3, 0, 0, T);
    // corner buttresses + mid-face pilasters
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.box(trim, 1.5, 46, 1.5, sx * 5.6, 3, sz * 5.6, 0, T);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const nx = Math.sin(a), nz = Math.cos(a);
      for (const t of [-2.0, 2.0]) L.box(trim, 0.5, 44, 0.5, nx * 6.05 + nz * t, 4, nz * 6.05 - nx * t, 0, T);
    }
    L.box(trim, 13.2, 1.2, 13.2, 0, 47.6, 0, 0, T); // cornice
    // clock stage 48.8 – 60.5
    L.box(towerStone, 13.5, 11.7, 13.5, 0, 48.8, 0, 0, T);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      L.box(trim, 1.2, 11.7, 1.2, sx * 6.6, 48.8, sz * 6.6, 0, T);
      L.pinnacle(trim, gold, 1.1, 5.5, sx * 6.6, 60.5, sz * 6.6, T);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const nx = Math.sin(a), nz = Math.cos(a);
      // gilded square surround + spandrels, dial, gablet above
      const surround = new THREE.Mesh(new THREE.BoxGeometry(8.6, 8.6, 0.3), gold);
      surround.position.set(nx * 6.8, 55.0, nz * 6.8); surround.rotation.y = a; T.add(surround);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(7.9, 7.9, 0.3), dark);
      inner.position.set(nx * 6.88, 55.0, nz * 6.88); inner.rotation.y = a; T.add(inner);
      const face = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48), clock);
      face.position.set(nx * 7.06, 55.0, nz * 7.06); face.rotation.y = a; T.add(face);
      const gab = L.gable(trim, 9.0, 0.8, 3.8, nx * 6.6, 60.5, nz * 6.6, a + Math.PI / 2, T);
      gab.rotation.y = a + Math.PI / 2;
      // gable: ridge across the face → rotate so the triangle faces outwards
      gab.rotation.y = a; gab.rotation.x = 0;
      L.box(gold, 0.35, 1.6, 0.35, nx * 6.7, 64.2, nz * 6.7, 0, T);
    }
    // belfry 60.5 – 67.5 (open arcade, glowing faintly at night)
    L.box(belfryGlow, 9.6, 6.4, 9.6, 0, 60.8, 0, 0, T);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const nx = Math.sin(a), nz = Math.cos(a);
      for (const t of [-4.6, -2.3, 0, 2.3, 4.6]) {
        L.box(trim, 0.7, 6.4, 0.7, nx * 5.0 + nz * t, 60.8, nz * 5.0 - nx * t, 0, T);
      }
    }
    L.box(trim, 11.2, 0.8, 11.2, 0, 67.2, 0, 0, T);
    // iron roof with tiers of gilded dormers, lantern (Ayrton Light) and spire
    L.pyramid(iron, 10.8, 10.8, 13.5, 0, 68.0, 0, 0, T);
    for (const [y, off, s] of [[69.5, 4.2, 2.2], [73.5, 2.9, 1.6]]) {
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const nx = Math.sin(a), nz = Math.cos(a);
        for (const t of (s > 2 ? [-2.6, 0, 2.6] : [-1.3, 1.3])) {
          const px = nx * off + nz * t, pz = nz * off - nx * t;
          L.box(iron, s * 0.7, s * 1.1, s * 0.7, px, y, pz, a, T);
          L.pyramid(gold, s * 0.72, s * 0.72, s * 0.9, px, y + s * 1.1, pz, a, T);
        }
      }
    }
    L.box(iron, 5.0, 1.0, 5.0, 0, 78.0, 0, 0, T);
    L.box(ayrton, 4.2, 3.4, 4.2, 0, 79.0, 0, 0, T);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.box(gold, 0.5, 3.4, 0.5, sx * 2.2, 79.0, sz * 2.2, 0, T);
    L.pyramid(gold, 5.0, 5.0, 2.2, 0, 82.4, 0, 0, T);
    L.pyramid(iron, 2.4, 2.4, 9.5, 0, 84.0, 0, 0, T);
    L.cyl(gold, 0.08, 0.22, 2.6, 0, 92.6, 0, 6, T);
    L.box(gold, 0.18, 0.18, 1.3, 0, 94.4, 0, 0, T);
    L.box(gold, 1.3, 0.18, 0.18, 0, 94.4, 0, 0, T);
    L.colliders && L.collider(0, 0, 6.8, 6.8, 96);
  }

  // ---------------------------------------------------------------------------- the Palace
  const P = L.static;
  // river front range (265 m) — x 44 … 64.6, z 15 … 282
  L.box(palStone, 20.6, 24, 252, 54.3, 0, 148.5, 0, P);
  L.gable(slate, 20.0, 250, 6.0, 54.3, 24, 148.5, 0, P);
  L.box(trim, 0.8, 1.4, 252, 64.4, 24, 148.5, 0, P); // parapet
  // end pavilions (Speaker's House N, Lord Chancellor's S) and two mid pavilions
  const pavilions = [[13, 40, 30, 9], [256, 283, 30, 9], [96, 110, 27.5, 6], [187, 201, 27.5, 6]];
  for (const [z0, z1, h, roofH] of pavilions) {
    const d = z1 - z0, zc = (z0 + z1) / 2;
    L.box(palStone, 23.0, h, d, 54.6, 0, zc, 0, P);
    L.pyramid(slate, 22.0, d - 1, roofH, 54.6, h, zc, 0, P);
    L.box(trim, 23.6, 1.4, d + 0.6, 54.6, h - 1.4, zc, 0, P);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      // octagonal corner turrets with spirelets
      L.cyl(trim, 1.0, 1.0, h + 3, 54.6 + sx * 11.6, 0, zc + sz * (d / 2), 8, P);
      L.cyl(slate, 0.05, 1.15, 4.2, 54.6 + sx * 11.6, h + 3, zc + sz * (d / 2), 8, P);
      L.cyl(gold, 0.02, 0.12, 1.2, 54.6 + sx * 11.6, h + 7.2, zc + sz * (d / 2), 4, P);
    }
    L.box(gold, 0.3, 2.5, 0.3, 54.6, h + roofH - 0.3, zc, 0, P);
  }
  // pinnacle rhythm along the river parapet and the inner (west) eaves
  for (let z = 44; z < 254; z += 6.6) {
    if (z > 93 && z < 113) continue;
    if (z > 184 && z < 204) continue;
    L.pinnacle(trim, slate, 0.75, 5.0, 64.6, 24, z, P);
    L.pinnacle(trim, slate, 0.6, 3.6, 44.4, 24, z + 3.3, P);
  }
  // shallow buttress piers on the river face (break the long wall)
  for (let z = 18; z < 282; z += 7.2) L.box(trim, 0.9, 23.5, 0.8, 65.0, 0, z, 0, P);
  // river terrace wall + plinth
  L.box(trim, 6.0, 1.2, 270, 68.5, -1.2, 148.5, 0, P);

  // north front (Bridge Street) and the ranges behind it
  L.box(palStone, 38, 22, 35, 25, 0, 12.5, 0, P);
  L.gable(slate, 34, 36, 6.5, 25, 22, 12.5, Math.PI / 2, P);
  for (let x = 9; x <= 42; x += 5.5) L.pinnacle(trim, slate, 0.6, 3.6, x, 22, -5.0, P);
  // inner ranges (north half)
  L.box(palStone, 16, 20, 110, -4, 0, 85, 0, P);
  L.gable(slate, 16, 110, 7, -4, 20, 85, 0, P);
  L.box(palStone, 40, 18, 110, 24, 0, 85, 0, P);
  L.gable(slate, 38, 108, 6, 24, 18, 85, 0, P);
  // Commons chamber & Lords chamber roofs stand proud
  L.box(palStone, 26, 25, 40, 9, 0, 85, 0, P);
  L.gable(slate, 26, 40, 9, 9, 25, 85, 0, P);
  L.box(palStone, 26, 25, 40, 9, 0, 205, 0, P);
  L.gable(slate, 26, 40, 9, 9, 25, 205, 0, P);
  for (const zc of [85, 205]) for (const z of [-18, -9, 0, 9, 18]) for (const sx of [-1, 1]) L.pinnacle(trim, slate, 0.7, 4.2, 9 + sx * 13, 25, zc + z, P);
  // south half
  L.box(palStone, 58, 18, 116, 15, 0, 199, 0, P);
  L.gable(slate, 56, 114, 7, 15, 18, 199, 0, P);
  // Royal Gallery / west front facing Old Palace Yard
  L.box(palStone, 22, 22, 118, -25, 0, 199, 0, P);
  L.gable(slate, 22, 118, 8, -25, 22, 199, 0, P);
  for (let z = 144; z <= 254; z += 6.5) L.pinnacle(trim, slate, 0.65, 4.0, -36.2, 22, z, P);
  // St Stephen's Hall & porch
  L.box(palStone, 22, 22, 26, -21, 0, 128, 0, P);
  L.gable(slate, 22, 26, 9, -21, 22, 128, Math.PI / 2, P);
  // Westminster Hall (medieval, steep lead roof, twin north towers)
  {
    const wx = -44.8, wz = 96.1, ry = -0.06;
    L.box(palStone, 22, 14, 80, wx, 0, wz, ry, P);
    L.gable(plainMaterial(0x6b6f70, { rough: 0.6, metal: 0.3, flood: 0.12 }), 23.5, 80, 14, wx, 14, wz, ry, P);
    for (const sx of [-1, 1]) {
      L.box(trim, 6, 28, 6, wx + sx * 8.5, 0, wz - 40, 0, P);
      L.pyramid(slate, 6.2, 6.2, 4, wx + sx * 8.5, 28, wz - 40, 0, P);
    }
    L.box(trim, 2, 22, 70, wx + 12, 0, wz + 2, ry, P); // buttresses (merged slab)
    L.box(trim, 2, 22, 70, wx - 12, 0, wz + 2, ry, P);
    L.collider(wx, wz, 13, 41, 28, ry);
  }
  // Central Tower (octagonal lantern + spire, 91 m)
  {
    const cx = 6.7, cz = 146.5;
    L.box(palStone, 22, 26, 22, cx, 0, cz, 0, P);
    L.cyl(palStone, 9.2, 9.8, 32, cx, 24, cz, 8, P);
    L.cyl(belfryGlow, 8.4, 8.4, 12, cx, 40, cz, 8, P);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      L.box(trim, 1.4, 14, 1.4, cx + Math.sin(a) * 9.3, 39, cz + Math.cos(a) * 9.3, a, P);
      L.pinnacle(trim, slate, 1.2, 8, cx + Math.sin(a) * 9.3, 56, cz + Math.cos(a) * 9.3, P);
    }
    L.cyl(slate, 0.3, 7.0, 31, cx, 58, cz, 8, P);
    L.cyl(trim, 7.6, 8.8, 2, cx, 56, cz, 8, P);
    L.cyl(gold, 0.05, 0.3, 3, cx, 88.5, cz, 6, P);
  }
  // Victoria Tower (98.5 m to the flagstaff head) — SW corner
  let flag;
  {
    const vx = -23.3, vz = 268.9;
    L.box(palStone, 23, 72, 23, vx, 0, vz, 0, P);
    L.box(dark, 9, 15, 0.6, vx, 0, vz + 11.6, 0, P); // Sovereign's Entrance
    L.box(trim, 24.2, 2.0, 24.2, vx, 72, vz, 0, P);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = vx + sx * 10.2, tz = vz + sz * 10.2;
      L.cyl(trim, 2.3, 2.5, 84, tx, 0, tz, 8, P);
      L.cyl(slate, 0.15, 2.5, 6, tx, 84, tz, 8, P);
      L.cyl(gold, 0.02, 0.18, 1.6, tx, 90, tz, 4, P);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, nx = Math.sin(a), nz = Math.cos(a);
      for (const t of [-5.4, -1.8, 1.8, 5.4]) L.pinnacle(trim, slate, 0.7, 4.5, vx + nx * 11.4 + nz * t, 74, vz + nz * 11.4 - nx * t, P);
    }
    L.pyramid(iron, 18, 18, 9, vx, 74, vz, 0, P);
    L.cyl(plainMaterial(0xe8e8e8, { rough: 0.5, flood: 0.4 }), 0.18, 0.32, 16.5, vx, 82, vz, 8, P);
    const flagTex = unionFlagTexture();
    const flagMat = new THREE.MeshStandardNodeMaterial({ map: flagTex, roughness: 0.9, side: THREE.DoubleSide });
    flagMat.emissiveNode = color(0xffffff).mul(nightNode()).mul(0.25);
    const g = new THREE.PlaneGeometry(11, 5.5, 12, 4);
    g.translate(5.5, 0, 0);
    flag = new THREE.Mesh(g, flagMat);
    flag.position.set(vx + 0.3, 95.5, vz);
    flag.rotation.y = Math.PI / 2 + 0.4;
    flag.userData.keep = true;
    flag.userData.noShadow = true;
    L.group.add(flag);
    L.collider(vx, vz, 12.7, 12.7, 98);
  }

  // colliders (ranges)
  L.collider(54.6, 148.5, 11.5, 135, 30);
  L.collider(25, 12.5, 19, 17.5, 28);
  L.collider(10, 85, 22, 55, 28);
  L.collider(10, 199, 34, 58, 28);
  L.collider(-25, 199, 11, 59, 30);
  L.collider(-21, 128, 11, 13, 30);
  L.collider(6.7, 146.5, 11, 11, 91);

  // zone footprint
  L.zoneRect(-7, -7, 7, 7, 'bigBen');
  L.zone([[-7.5, -7.5], [44, -7.5], [44, 12], [67, 12], [67, 285], [-36.5, 285], [-36.5, 141], [-58.5, 140], [-58.5, 54], [-31, 54], [-12, 29], [-7.5, 29]], 'parliament');

  L.finish();
  // flag wave (cheap CPU vertex wave on a 13 × 5 grid)
  const pos = flag.geometry.attributes.position;
  const base = Float32Array.from(pos.array);
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const k = x / 11;
      pos.array[i * 3 + 2] = Math.sin(x * 0.7 - t * 3.2) * 0.45 * k + Math.sin(x * 1.3 - t * 4.7 + base[i * 3 + 1]) * 0.15 * k;
    }
    pos.needsUpdate = true;
  };
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame, update };
}
