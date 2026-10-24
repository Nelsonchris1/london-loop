// js/landmarks/buckingham.js — Buckingham Palace (Aston Webb's 108 m east front: rusticated ground floor, giant
// pilasters, central portico with the balcony, end pavilions, Union Flag on the roof), the quadrangle ranges behind,
// the forecourt with its black-and-gilt railings & gates, and the Victoria Memorial (marble pedestal, seated Queen,
// gilded Winged Victory, curved fountain basins).
// Local frame: origin = centre of the east front's facade line, +z = out of the front towards the Mall (ENE),
// +x = along the front (towards the south wing). The Victoria Memorial stands at (0, 96.9).
import * as THREE from 'three/webgpu';
import { color, float, fract, abs, min, max, step, smoothstep, mix, positionWorld, normalWorldGeometry, vec2, length, sin, time, fwidth } from 'three/tsl';
import { LandmarkBuilder, stoneMaterial, plainMaterial, goldMaterial, glowMaterial, nightNode, thetaForLocalZ, unionFlagTexture } from './common.js';
import { wingedVictory, seatedFigure, standingFigure, place } from './figures.js';

const ORIGIN = { x: -953.1, z: 708.3 };
const THETA = thetaForLocalZ(0.8387, -0.5446);

/** cast-iron railing drawn with alpha-test bars (world-space, so any straight run works) */
export function railingMaterial({ h = 3.0, pitch = 0.15, gilt = 0.12, y0 = 0 } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide });
  const n = normalWorldGeometry;
  const hl = max(length(vec2(n.x, n.z)), 0.001);
  const u = positionWorld.x.mul(n.z.negate()).add(positionWorld.z.mul(n.x)).div(hl);
  const v = positionWorld.y.sub(y0).div(h);
  const f = fract(u.div(pitch));
  const tip = smoothstep(0.93, 1.0, v); // spear heads taper the bars
  const barHalf = mix(float(0.14), float(0.02), tip);
  const bar = step(abs(f.sub(0.5)), barHalf);
  const rail = max(step(abs(v.sub(0.1)), 0.025), step(abs(v.sub(0.84)), 0.022));
  const far = smoothstep(0.25, 0.8, fwidth(u.div(pitch)));
  const mask = max(bar.mul(float(1).sub(far)), rail).mul(step(v, 1.0)).mul(step(0.0, v));
  const giltBand = step(1.0 - gilt, v).add(step(abs(v.sub(0.84)), 0.022)).min(1).mul(float(1).sub(far.mul(0.8)));
  mat.colorNode = mix(color(0x15181a), color(0xd9ad4a), giltBand);
  mat.metalnessNode = mix(float(0.4), float(0.9), giltBand);
  mat.emissiveNode = color(0xd9ad4a).mul(giltBand).mul(nightNode().mul(0.6).add(0.05));
  mat.opacityNode = mask;
  mat.alphaTest = 0.5;
  return mat;
}

export function buildBuckinghamPalace() {
  const L = new LandmarkBuilder('buckinghamPalace', { x: ORIGIN.x, z: ORIGIN.z, theta: THETA });
  const night = nightNode();
  const stone = stoneMaterial({ base: 0xd9d3c3, bay: 4.4, floorH: 6.0, sill: 1.4, winW: 1.7, winH: 3.4, arch: 0, y0: 1.2, yMax: 21.5, litProb: 0.35, warm: 0xffd08a, flood: 0.75, floodColor: 0xfff0dc, ribs: 0.12, courses: 0.25, seed: 51, floodFalloff: 40, var: 0.04 });
  const ashlar = plainMaterial(0xd6d0c0, { rough: 0.85, flood: 0.75, floodColor: 0xfff0dc });
  const rustic = plainMaterial(0xc3bcad, { rough: 0.9, flood: 0.6, floodColor: 0xfff0dc });
  const lead = plainMaterial(0x5e666b, { rough: 0.6, metal: 0.3, flood: 0.1 });
  const gold = goldMaterial(0xdcae4c, 0.6);
  const marble = plainMaterial(0xece9e2, { rough: 0.55, flood: 0.85, floodColor: 0xfff4e6 });
  const gravel = plainMaterial(0xc4b293, { rough: 0.95 });
  const red = plainMaterial(0x8e1b1b, { rough: 0.7 });
  const dark = plainMaterial(0x1b1d20, { rough: 0.9 });
  const S = L.static;

  // ------------------------------------------------------------------ east front
  const W = 108, D = 20, H = 22.5;
  L.box(stone, W, H, D, 0, 0, -D / 2, 0, S);
  L.box(rustic, W + 0.6, 6.4, D + 0.6, 0, 0, -D / 2, 0, S); // rusticated ground floor
  L.box(ashlar, W + 1.2, 1.0, D + 1.2, 0, 6.4, -D / 2, 0, S); // string course
  L.box(ashlar, W + 1.4, 1.4, D + 1.4, 0, H - 1.4, -D / 2, 0, S); // cornice
  L.box(ashlar, W, 1.3, 0.5, 0, H, 0.2, 0, S); // balustrade
  L.box(lead, W - 2, 2.2, D - 3, 0, H - 1, -D / 2, 0, S);
  // giant pilasters on the upper floors
  for (let x = -50; x <= 50.1; x += 4.4) L.box(ashlar, 0.9, H - 8.4, 0.5, x, 7.4, 0.15, 0, S);
  // end pavilions with pediments
  for (const sx of [-1, 1]) {
    const px = sx * 48.5;
    L.box(stone, 11, H + 2.0, D + 2.4, px, 0, -D / 2 + 1.2, 0, S);
    L.box(ashlar, 11.8, 1.4, D + 3.2, px, H + 0.6, -D / 2 + 1.2, 0, S);
    L.gable(ashlar, 11.6, 1.2, 3.0, px, H + 2.0, 1.8, 0, S);
    for (const cx of [-3.6, -1.2, 1.2, 3.6]) L.cyl(ashlar, 0.42, 0.45, H - 8.4, px + cx, 7.4, 2.75, 10, S);
  }
  // central portico: four pairs of giant columns, pediment, balcony with red drapery
  {
    L.box(stone, 26, H + 3, 2.4, 0, 0, 1.2, 0, S);
    for (const cx of [-10.6, -9.2, -3.6, -2.2, 2.2, 3.6, 9.2, 10.6]) L.cyl(ashlar, 0.5, 0.55, H - 8.4, cx, 7.4, 3.0, 12, S);
    L.box(ashlar, 26.8, 1.6, 3.2, 0, H + 1.4, 1.6, 0, S);
    L.gable(ashlar, 26.4, 1.6, 4.2, 0, H + 3.0, 1.8, 0, S);
    L.box(ashlar, 4.0, 2.4, 1.0, 0, H + 3.2, 2.5, 0, S); // royal arms block
    L.box(gold, 2.4, 1.6, 0.3, 0, H + 3.5, 3.05, 0, S);
    // balcony
    L.box(ashlar, 20, 0.7, 3.4, 0, 7.4, 4.0, 0, S);
    L.box(ashlar, 20, 1.1, 0.35, 0, 8.1, 5.55, 0, S);
    L.box(red, 18, 1.0, 0.1, 0, 8.15, 5.76, 0, S);
    for (const cx of [-6.6, 0, 6.6]) L.box(glowMaterial(0xffd9a0, 0.15, 1.7), 2.0, 4.0, 0.15, cx, 8.2, 2.48, 0, S);
    // central arch to the quadrangle
    L.box(dark, 4.6, 5.6, 0.3, 0, 0, 2.45, 0, S);
  }
  // roof flagpole + Union Flag
  L.cyl(plainMaterial(0xf0f0f0, { rough: 0.5, flood: 0.4 }), 0.12, 0.2, 14, 0, H, -6, 8, S);
  const flagMat = new THREE.MeshStandardNodeMaterial({ map: unionFlagTexture(), roughness: 0.9, side: THREE.DoubleSide });
  flagMat.emissiveNode = color(0xffffff).mul(night).mul(0.3);
  const fg = new THREE.PlaneGeometry(7, 3.5, 10, 3);
  fg.translate(3.5, 0, 0);
  const flag = new THREE.Mesh(fg, flagMat);
  flag.position.set(0.2, H + 12.2, -6);
  flag.rotation.y = 0.3;
  flag.userData.keep = true; flag.userData.noShadow = true;
  L.group.add(flag);

  // ------------------------------------------------------------------ quadrangle ranges behind
  for (const sx of [-1, 1]) L.box(stone, 16, 21, 92, sx * 46, 0, -66, 0, S);
  L.box(stone, 196, 22, 26, 0, 0, -131, 0, S); // west (garden) range
  L.box(lead, 194, 2, 24, 0, 21, -131, 0, S);
  for (const sx of [-1, 1]) L.box(lead, 14, 2, 90, sx * 46, 20, -66, 0, S);
  L.box(stone, 30, 22, 20, 0, 0, -118, 0, S); // bow room projection (garden side)
  L.cyl(stone, 12, 12, 23, 0, 0, -146, 24, S);
  L.box(stone, 26, 16, 40, 108, 0, -120, 0, S); // north wing extension
  L.box(stone, 30, 16, 36, -112, 0, -118, 0, S); // south (Queen's Gallery / kitchens)

  // ------------------------------------------------------------------ forecourt, railings & gates
  L.box(gravel, 136, 0.12, 46, 0, 0, 23, 0, S);
  const railMat = railingMaterial({ h: 3.0, pitch: 0.16 });
  const run = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(len, 3.0);
    const m = new THREE.Mesh(g, railMat);
    m.position.set((x0 + x1) / 2, 1.5, (z0 + z1) / 2);
    m.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    S.add(m);
  };
  const RZ = 46;
  // front run with gaps for 3 gates (centre + two side gates) and stone piers with gilded lamps
  const gates = [[-40, 3.5], [0, 4.5], [40, 3.5]];
  let x = -68;
  for (const [gx, gw] of gates) { run(x, RZ, gx - gw - 0.9, RZ); x = gx + gw + 0.9; }
  run(x, RZ, 68, RZ);
  for (const sx of [-1, 1]) run(sx * 68, RZ, sx * 68, 2);
  for (const [gx, gw] of gates) {
    for (const s of [-1, 1]) {
      const px = gx + s * (gw + 0.45);
      L.box(ashlar, 1.6, 4.6, 1.6, px, 0, RZ, 0, S);
      L.box(ashlar, 2.0, 0.5, 2.0, px, 4.6, RZ, 0, S);
      L.mesh(new THREE.SphereGeometry(0.5, 10, 8), gold, px, 5.6, RZ);
    }
    // gilded gate leaves (closed), slightly taller
    const gm = railingMaterial({ h: 3.8, pitch: 0.1, gilt: 0.3 });
    const g = new THREE.PlaneGeometry(gw * 2, 3.8);
    const m = new THREE.Mesh(g, gm);
    m.position.set(gx, 1.9, RZ);
    S.add(m);
    L.box(gold, gw * 2, 0.6, 0.12, gx, 3.6, RZ, 0, S);
  }
  // sentry boxes
  for (const sx of [-1, 1]) {
    L.box(plainMaterial(0x2a2e33, { rough: 0.7 }), 1.3, 2.6, 1.3, sx * 20, 0, 8, 0, S);
    L.pyramid(plainMaterial(0x2a2e33, { rough: 0.7 }), 1.5, 1.5, 0.7, sx * 20, 2.6, 8, 0, S);
  }

  // ------------------------------------------------------------------ Victoria Memorial (0, 96.9)
  {
    const mz = 96.9;
    // stepped platform (rings, so the curved basins sit in it), low marble balustrade
    for (const [r0, r1, y] of [[29.5, 32, 0], [27.5, 29.5, 0.3], [18.6, 27.5, 0.6]]) {
      const g = new THREE.RingGeometry(r0, r1, 40); g.rotateX(-Math.PI / 2); L.mesh(g, ashlar, 0, y + 0.3, mz);
      L.cyl(ashlar, r1, r1, y + 0.3, 0, 0, mz, 40, S, true);
    }
    L.cyl(marble, 25.6, 25.6, 1.1, 0, 0.9, mz, 40, S, true);
    {
      const g = new THREE.CircleGeometry(10.6, 32); g.rotateX(-Math.PI / 2); L.mesh(g, ashlar, 0, 0.9, mz);
      L.cyl(marble, 10.6, 10.6, 0.9, 0, 0, mz, 32, S, true);
    }
    // curved fountain basins either side (north / south), animated water
    const water = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.2 });
    {
      const r = length(vec2(positionWorld.x, positionWorld.z));
      const ripple = sin(r.mul(2.4).sub(time.mul(2.2))).mul(0.5).add(0.5);
      water.colorNode = mix(color(0x2f5965), color(0x4f8592), ripple.mul(0.35));
      water.emissiveNode = color(0x6fb6d0).mul(night).mul(0.35);
    }
    const basinFloor = plainMaterial(0x9aa39f, { rough: 0.8 });
    for (const sx of [-1, 1]) {
      const span = (Math.PI * 2) / 3, a0 = -Math.PI / 3 + (sx < 0 ? Math.PI : 0);
      const wg = new THREE.RingGeometry(10.6, 18.6, 24, 1, a0, span); wg.rotateX(-Math.PI / 2); L.mesh(wg, water, 0, 0.55, mz);
      // the rest of the ring (between the basins) is paving
      const pg = new THREE.RingGeometry(10.6, 18.6, 12, 1, a0 + span, Math.PI - span); pg.rotateX(-Math.PI / 2); L.mesh(pg, ashlar, 0, 0.9, mz);
      L.mesh(new THREE.CylinderGeometry(18.6, 18.6, 0.9, 24, 1, true, Math.PI / 2 + a0, span), basinFloor, 0, 0.45, mz);
    }
    // pedestal
    L.box(marble, 17, 3.6, 17, 0, 0.9, mz, 0, S);
    L.box(marble, 12.5, 6, 12.5, 0, 4.5, mz, 0, S);
    L.box(marble, 9.5, 4.5, 9.5, 0, 10.5, mz, 0, S);
    L.box(marble, 7.0, 4.2, 7.0, 0, 15.0, mz, 0, S);
    L.cyl(marble, 2.6, 3.2, 2.4, 0, 19.2, mz, 16, S);
    L.mesh(new THREE.SphereGeometry(2.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold, 0, 21.4, mz);
    place(S, wingedVictory(gold, 4.6), 0, 22.6, mz, 0);
    // seated Queen facing the Mall (+z), allegorical groups on the other three faces
    place(S, seatedFigure(marble, 4.6), 0, 4.5, mz + 6.6, 0);
    place(S, standingFigure(marble, 3.6, { coat: true }), 0, 4.5, mz - 6.8, Math.PI);
    place(S, standingFigure(marble, 3.6, { coat: true }), 6.8, 4.5, mz, Math.PI / 2);
    place(S, standingFigure(marble, 3.6, { coat: true }), -6.8, 4.5, mz, -Math.PI / 2);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) place(S, seatedFigure(gold, 2.6), sx * 5.0, 15.0, mz + sz * 2.2, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    L.colliderRound(0, mz, 9, 25);
    L.zoneCircle(0, mz, 32, 20, 'buckinghamPalace');
  }

  // colliders + zone
  L.collider(0, -D / 2 + 1, W / 2 + 1, D / 2 + 3, 26);
  for (const sx of [-1, 1]) L.collider(sx * 46, -66, 8, 46, 22);
  L.collider(0, -131, 98, 13, 22);
  L.collider(0, -140, 12, 12, 23);
  L.collider(108, -120, 13, 20, 16);
  L.collider(-112, -118, 15, 18, 16);
  L.collider(0, RZ, 68, 0.3, 3, 0);
  for (const sx of [-1, 1]) L.collider(sx * 68, RZ / 2 + 1, 0.3, RZ / 2 - 1, 3);
  L.zone([[-127, -150], [123, -150], [123, -100], [70, -100], [70, 47], [-70, 47], [-70, -100], [-127, -100]]);
  L.finish();

  const pos = flag.geometry.attributes.position;
  const base = Float32Array.from(pos.array);
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (let i = 0; i < pos.count; i++) {
      const xx = base[i * 3], k = xx / 7;
      pos.array[i * 3 + 2] = Math.sin(xx * 0.9 - t * 3.4) * 0.35 * k;
    }
    pos.needsUpdate = true;
  };
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame, update };
}
