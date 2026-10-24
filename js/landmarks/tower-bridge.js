// js/landmarks/tower-bridge.js — Tower Bridge: two 65 m gothic towers on boat-shaped piers, high-level walkways,
// suspension chains to the abutment towers, the full road deck and two bascule leaves (down by default;
// api.raise() / api.lower()).
// Local frame: origin = midpoint between the two tower piers (OSM ways 367652787 / 367652791) = world
// (3656.5, 246.3); +z = along the bridge towards the south (Surrey) bank = world (−0.391, 0.920); +x = across.
// Towers at z = ±41.2, bascule hinges at ±35.2, abutment (shore) towers at ±136.
//
// Deck height contract (matches Workstream A): the road surface is y = deckProfile(z). With `world.groundHeight`
// it is sampled along the centreline (so it is exactly the geodata's bridge height); without it, A's formula is used:
// raised cosine over the GEO.bridges 'Tower Bridge' axis (3596.5, 391.8) → (3717.8, 94.8), deckY = 8.0 m mid-span,
// 0 at both ends. The deck we draw covers the whole OSM 'Tower Bridge' road, z = −163.3 … +157.4.
import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import { LandmarkBuilder, stoneMaterial, plainMaterial, goldMaterial, glowMaterial, nightNode, thetaForLocalZ, beamGeo, mergeByMaterial } from './common.js';

export const TOWER_BRIDGE = {
  centre: { x: 3656.5, z: 246.3 },
  axis: { x: -0.391, z: 0.92 }, // unit vector north → south along the deck
  geoAxis: [3596.5, 391.8, 3717.8, 94.8], // GEO.bridges 'Tower Bridge'.axis
  geoDeckY: 8.0,
  deckFrom: -163.3, deckTo: 157.4, // OSM 'Tower Bridge' road extent (local z)
  abutZ: 136,
  towerZ: 41.2,
  hingeZ: 35.2,
  roadHalfWidth: 6.2,
  deckHalfWidth: 8.4
};
const THETA = thetaForLocalZ(TOWER_BRIDGE.axis.x, TOWER_BRIDGE.axis.z);
const MAX_ANGLE = (86 * Math.PI) / 180;
const RAISE_TIME = 22; // s

/** A's raised-cosine profile (london-world.js bridgeDeckAt) */
function geoProfile(x, z) {
  const a = TOWER_BRIDGE.geoAxis;
  const dx = a[2] - a[0], dz = a[3] - a[1], L = Math.hypot(dx, dz);
  const t = ((x - a[0]) * dx + (z - a[1]) * dz) / L;
  if (t <= 0 || t >= L) return 0;
  return TOWER_BRIDGE.geoDeckY * 0.5 * (1 - Math.cos((2 * Math.PI * t) / L));
}

export function buildTowerBridge(ctx = {}) {
  const T = TOWER_BRIDGE;
  const L = new LandmarkBuilder('towerBridge', { x: T.centre.x, z: T.centre.z, theta: THETA });
  const world = ctx.world;
  const opts = ctx.opts || {};

  // ------------------------------------------------------------------ deck profile (local z → road surface y)
  let sample = (z) => { const w = L.toWorld(0, z); return geoProfile(w.x, w.z); };
  if (typeof opts.towerBridgeDeckY === 'number') {
    const k = opts.towerBridgeDeckY / T.geoDeckY;
    const base = sample;
    sample = (z) => base(z) * k;
  } else if (world && typeof world.groundHeight === 'function') {
    sample = (z) => { const w = L.toWorld(0, z); const h = world.groundHeight(w.x, w.z, 'drive'); return Number.isFinite(h) ? h : 0; };
  }
  const STEP = 2;
  const zs0 = Math.floor(T.deckFrom / STEP) * STEP;
  const table = [];
  for (let z = zs0; z <= T.deckTo + STEP; z += STEP) table.push(Math.max(0, sample(z)));
  // the geodata's tower-portal segments carry no deck strip; smooth over any dropouts with the A formula shape
  const profile = (z) => {
    const f = (Math.max(zs0, Math.min(T.deckTo + STEP, z)) - zs0) / STEP;
    const i = Math.min(table.length - 2, Math.floor(f));
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  };
  const D = profile(0);

  // ------------------------------------------------------------------ materials
  const night = nightNode();
  const stone = stoneMaterial({ base: 0xd6cdb8, bay: 2.6, floorH: 5.2, sill: 1.2, winW: 1.0, winH: 2.8, arch: 0.6, y0: 14, litProb: 0.3, flood: 0.8, ribs: 0.18, courses: 0.2, seed: 41, floodFalloff: 80 });
  const granite = plainMaterial(0x8b877f, { rough: 0.9, flood: 0.3 });
  const blue = new THREE.MeshStandardNodeMaterial({ color: 0x7fb4d8, roughness: 0.5, metalness: 0.3 });
  blue.emissiveNode = color(0x7fb4d8).mul(night).mul(0.55);
  const white = plainMaterial(0xeef1f2, { rough: 0.5, metal: 0.2, flood: 0.5 });
  const slate = plainMaterial(0x4d565d, { rough: 0.7, metal: 0.3, flood: 0.15 });
  const gold = goldMaterial(0xd0a548, 0.5);
  const asphalt = plainMaterial(0x34363a, { rough: 0.92 });
  const paving = plainMaterial(0x8e8a82, { rough: 0.9 });
  const paint = plainMaterial(0xe8e6dc, { rough: 0.8 });
  const rail = plainMaterial(0x2d4250, { rough: 0.6, metal: 0.5 });
  const lamp = glowMaterial(0xffe0a8, 0.25, 2.4);
  const walkGlow = glowMaterial(0xcfe6ff, 0.05, 1.6);
  const towerWindows = glowMaterial(0xffd28a, 0.0, 0.9);
  const dark = plainMaterial(0x16191c, { rough: 0.9 });
  const S = L.static;

  /**
   * Road deck from z0 to z1 (local) following profile(), built into `parent` whose origin sits at (0, yRef, zRef)
   * in landmark coords. girders: blue plate girders + soffit under the deck.
   */
  const deckRun = (parent, z0, z1, { zRef = 0, yRef = 0, girders = true, lamps = true, n } = {}) => {
    const segs = n || Math.max(1, Math.ceil(Math.abs(z1 - z0) / 6));
    for (let i = 0; i < segs; i++) {
      const za = z0 + ((z1 - z0) * i) / segs, zb = z0 + ((z1 - z0) * (i + 1)) / segs;
      const ya = profile(za) - yRef, yb = profile(zb) - yRef;
      const zm = (za + zb) / 2 - zRef, ym = (ya + yb) / 2;
      const len = Math.hypot(zb - za, yb - ya) + 0.04;
      const pitch = Math.atan2(yb - ya, zb - za);
      const seg = (mat, w, h, x, dy) => {
        const g = new THREE.BoxGeometry(w, h, len);
        g.translate(0, dy, 0);
        g.rotateX(-pitch);
        g.translate(x, ym, zm);
        parent.add(new THREE.Mesh(g, mat));
      };
      seg(asphalt, T.roadHalfWidth * 2, 0.5, 0, -0.25);
      for (const sx of [-1, 1]) {
        const pw = T.deckHalfWidth - T.roadHalfWidth;
        seg(paving, pw, 0.68, sx * (T.roadHalfWidth + pw / 2), -0.2);
        seg(rail, 0.18, 1.15, sx * T.deckHalfWidth, 0.6);
        if (girders) seg(blue, 0.5, 2.2, sx * (T.deckHalfWidth - 0.3), -1.6);
      }
      if (girders) seg(blue, T.deckHalfWidth * 2 - 1, 0.4, 0, -1.2);
      if (i % 2 === 0) seg(paint, 0.15, 0.03, 0, 0.0);
      if (lamps && i % 3 === 1) {
        for (const sx of [-1, 1]) {
          const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 4.2, 6), rail);
          lp.position.set(sx * T.deckHalfWidth, ym + 2.4, zm);
          parent.add(lp);
          const lh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.45), lamp);
          lh.position.set(sx * T.deckHalfWidth, ym + 4.8, zm);
          parent.add(lh);
        }
      }
    }
  };

  // ------------------------------------------------------------------ piers + towers
  for (const sz of [-1, 1]) {
    const zc = sz * T.towerZ;
    const roadY = profile(zc);
    const pierTop = Math.min(profile(zc - 10), profile(zc + 10)) - 1.6;
    L.box(granite, 35.4, pierTop + 9, 21.3, 0, -9, zc, 0, S);
    for (const sx of [-1, 1]) L.cyl(granite, 10.65, 10.65, pierTop + 9, sx * 17.7, -9, zc, 20, S);
    L.box(paving, 56.6, 0.4, 21.6, 0, pierTop, zc, 0, S);
    // tower legs either side of the roadway, portal arch, upper body
    const archTop = roadY + 11;
    for (const sx of [-1, 1]) L.box(stone, 3.9, archTop - pierTop, 12, sx * 8.35, pierTop, zc, 0, S);
    L.box(dark, 12.6, 1.0, 11.6, 0, archTop - 2.5, zc, 0, S); // arch soffit
    for (const sx of [-1, 1]) L.box(stone, 3.2, 3.5, 12, sx * 4.9, archTop - 2.6, zc, 0, S); // pointed-arch haunches
    L.box(stone, 20.5, 49 - (archTop + 1), 12, 0, archTop + 1, zc, 0, S);
    L.box(stone, 20.5, 1.6, 12, 0, archTop - 0.6, zc, 0, S);
    L.box(white, 21.2, 0.8, 12.7, 0, 49, zc, 0, S);
    // upper stage with gables and the central pyramid roof
    L.box(stone, 16, 6.5, 9.5, 0, 49.8, zc, 0, S);
    for (const fz of [-1, 1]) L.gable(stone, 7.5, 0.8, 4.0, 0, 56.3, zc + fz * 4.8, 0, S);
    for (const fx of [-1, 1]) L.gable(stone, 5.0, 0.8, 3.4, fx * 8.0, 56.3, zc, Math.PI / 2, S);
    L.pyramid(slate, 13.5, 8.6, 8.2, 0, 56.3, zc, 0, S);
    L.cyl(gold, 0.04, 0.35, 3.2, 0, 64.5, zc, 6, S);
    for (const sx of [-1, 1]) for (const tz of [-1, 1]) {
      const x = sx * 9.75, z = zc + tz * 5.0;
      L.cyl(stone, 1.45, 1.55, 58 - pierTop, x, pierTop, z, 8, S);
      L.cyl(white, 1.75, 1.75, 0.7, x, 49, z, 8, S);
      L.cyl(slate, 0.1, 1.65, 6.0, x, 58, z, 8, S);
      L.cyl(gold, 0.02, 0.18, 1.4, x, 64, z, 4, S);
    }
    for (const fz of [-1, 1]) L.box(towerWindows, 6, 2.5, 0.2, 0, 51.5, zc + fz * 4.85, 0, S);
    // deck through the tower portal (hinge → tower's land face)
    deckRun(S, sz * T.hingeZ, sz * (T.towerZ + 6.2), { girders: false, lamps: false, n: 3 });
    // colliders: tower legs (both sides of the road) + pier
    for (const sx of [-1, 1]) L.collider(sx * 8.4, zc, 2.1, 6.1, 64);
    L.collider(0, zc, 28.3, 10.6, pierTop);
  }

  // ------------------------------------------------------------------ high-level walkways (two, 14.8 m apart)
  {
    const z0 = -T.towerZ + 6, z1 = T.towerZ - 6, yb = 40, yt = 45;
    for (const sx of [-1, 1]) {
      const x = sx * 7.4;
      L.box(blue, 4.2, 0.6, z1 - z0, x, yb, 0, 0, S);
      L.box(blue, 4.4, 0.6, z1 - z0, x, yt - 0.6, 0, 0, S);
      L.box(walkGlow, 3.6, 3.6, z1 - z0, x, yb + 0.6, 0, 0, S);
      for (const ex of [-2.1, 2.1]) {
        L.box(white, 0.35, 0.5, z1 - z0, x + ex, yb + 0.55, 0, 0, S);
        L.box(white, 0.35, 0.5, z1 - z0, x + ex, yt - 1.05, 0, 0, S);
        const n = 16;
        for (let i = 0; i <= n; i++) {
          const z = z0 + ((z1 - z0) * i) / n;
          S.add(new THREE.Mesh(beamGeo(new THREE.Vector3(x + ex, yb + 0.6, z), new THREE.Vector3(x + ex, yt - 0.6, z), 0.3), blue));
          if (i < n) {
            const zn = z0 + ((z1 - z0) * (i + 1)) / n;
            const up = i % 2 === 0;
            S.add(new THREE.Mesh(beamGeo(new THREE.Vector3(x + ex, up ? yb + 0.6 : yt - 0.6, z), new THREE.Vector3(x + ex, up ? yt - 0.6 : yb + 0.6, zn), 0.25), blue));
          }
        }
      }
    }
    for (let z = z0 + 5; z < z1; z += 10) {
      S.add(new THREE.Mesh(beamGeo(new THREE.Vector3(-5.2, yb + 0.3, z), new THREE.Vector3(5.2, yb + 0.3, z), 0.35), blue));
      S.add(new THREE.Mesh(beamGeo(new THREE.Vector3(-5.2, yt - 0.3, z - 5), new THREE.Vector3(5.2, yt - 0.3, z + 5), 0.25), blue));
    }
  }

  // ------------------------------------------------------------------ side spans: chains, hangers, deck, shore towers
  for (const sz of [-1, 1]) {
    const zA = sz * (T.towerZ + 6.2), zB = sz * T.abutZ;
    for (const sx of [-1, 1]) {
      const x = sx * (T.deckHalfWidth + 0.4);
      const n = 14;
      const up = [], lo = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const z = zA + (zB - zA) * t;
        const deck = profile(z);
        const yLow = deck + 2.6 + (38 - deck - 2.6) * (1 - t) * (1 - t);
        const depth = 2.6 - 1.4 * t;
        lo.push(new THREE.Vector3(x, yLow, z));
        up.push(new THREE.Vector3(x, yLow + depth, z));
      }
      for (let i = 0; i < n; i++) {
        S.add(new THREE.Mesh(beamGeo(up[i], up[i + 1], 0.9, 0.7), blue));
        S.add(new THREE.Mesh(beamGeo(lo[i], lo[i + 1], 0.9, 0.7), blue));
        S.add(new THREE.Mesh(beamGeo(lo[i], up[i + 1], 0.35), white));
        S.add(new THREE.Mesh(beamGeo(lo[i], up[i], 0.4), white));
        const z = lo[i].z;
        if (i > 0) S.add(new THREE.Mesh(beamGeo(lo[i], new THREE.Vector3(x, profile(z) + 0.6, z), 0.22), blue));
      }
    }
    for (const sx of [-1, 1]) {
      const x = sx * 10.5, z = sz * T.abutZ, base = profile(z) - 1.2;
      L.box(stone, 5.6, 15.5, 5.6, x, base, z, 0, S);
      L.pyramid(slate, 5.2, 5.2, 5.0, x, base + 15.5, z, 0, S);
      L.cyl(gold, 0.03, 0.2, 1.4, x, base + 20.5, z, 4, S);
      L.collider(x, z, 2.9, 2.9, base + 20);
    }
    // deck over the side span (girders) and on over the abutment to the end of the OSM bridge way (no girders)
    deckRun(S, zA, zB, {});
    deckRun(S, zB, sz < 0 ? T.deckFrom : T.deckTo, { girders: false });
    // granite abutment block under the land end
    L.box(granite, 23, 6, 14, 0, profile(zB) - 6.5, zB + sz * 2, 0, S);
    // parapet colliders along the side span edges (keep traffic on the deck)
    for (const sx of [-1, 1]) L.collider(sx * (T.deckHalfWidth + 0.2), (zA + zB) / 2, 0.25, Math.abs(zB - zA) / 2, profile((zA + zB) / 2) + 1.2);
  }

  // ------------------------------------------------------------------ bascule leaves
  const leaves = [];
  for (const sz of [-1, 1]) {
    const hingeZ = sz * T.hingeZ;
    const hingeY = profile(hingeZ);
    const pivot = new THREE.Group();
    pivot.name = sz < 0 ? 'BasculeNorth' : 'BasculeSouth';
    pivot.position.set(0, hingeY, hingeZ);
    L.group.add(pivot);
    const P = new THREE.Group();
    pivot.add(P);
    const tip = -sz * 0.03; // leaves meet at the centre with a 6 cm joint
    deckRun(P, hingeZ, tip, { zRef: hingeZ, yRef: hingeY, girders: false, lamps: false, n: 6 });
    // main girders: deep at the hinge, shallow at the tip (segments following the deck camber)
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const za = hingeZ + ((tip - hingeZ) * i) / segs, zb = hingeZ + ((tip - hingeZ) * (i + 1)) / segs;
      const ya = profile(za) - hingeY, yb = profile(zb) - hingeY;
      const da = 1.6 + 3.2 * (1 - i / segs), db = 1.6 + 3.2 * (1 - (i + 1) / segs);
      for (const sx of [-1, 1]) {
        const g = new THREE.BufferGeometry();
        const x0 = sx * (T.deckHalfWidth - 0.95), x1 = sx * (T.deckHalfWidth - 0.25);
        const a = za - hingeZ, b = zb - hingeZ;
        const v = [
          [x0, ya - 0.4, a], [x0, yb - 0.4, b], [x0, yb - 0.4 - db, b], [x0, ya - 0.4 - da, a],
          [x1, ya - 0.4, a], [x1, yb - 0.4, b], [x1, yb - 0.4 - db, b], [x1, ya - 0.4 - da, a]
        ];
        const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 5, 1, 0], [3, 2, 6, 7]];
        const pos = [];
        const cen = v.reduce((acc, p) => [acc[0] + p[0] / 8, acc[1] + p[1] / 8, acc[2] + p[2] / 8], [0, 0, 0]);
        const tri = (A, B, C) => {
          // orient every triangle outwards (the girder segment is convex)
          const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
          const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          const c = [(A[0] + B[0] + C[0]) / 3 - cen[0], (A[1] + B[1] + C[1]) / 3 - cen[1], (A[2] + B[2] + C[2]) / 3 - cen[2]];
          if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) pos.push(...A, ...C, ...B); else pos.push(...A, ...B, ...C);
        };
        for (const [p, q, r, s] of faces) { tri(v[p], v[q], v[r]); tri(v[p], v[r], v[s]); }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        P.add(new THREE.Mesh(g, blue));
      }
    }
    const len = T.hingeZ;
    const soffit = new THREE.Mesh(new THREE.BoxGeometry(T.deckHalfWidth * 2 - 1.6, 0.5, len), blue);
    soffit.position.set(0, -1.3 + (profile(hingeZ / 2) - hingeY), -sz * len / 2);
    P.add(soffit);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(T.deckHalfWidth * 2, 6, 8), dark); // counterweight tail inside the pier
    cw.position.set(0, -4, sz * 4);
    P.add(cw);
    for (let k = 1; k < 4; k++) {
      for (const sx of [-1, 1]) {
        const z = -sz * k * 9;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lamp);
        m.position.set(sx * T.deckHalfWidth, profile(hingeZ + z) - hingeY + 1.3, z);
        P.add(m);
      }
    }
    mergeByMaterial(P);
    leaves.push({ pivot, sz });
  }

  L.zoneRect(-30, T.deckFrom - 2, 30, T.deckTo + 2);
  L.finish();

  // ------------------------------------------------------------------ bascule animation API
  let open = 0, target = 0;
  const apply = () => {
    const e = open * open * (3 - 2 * open);
    for (const { pivot, sz } of leaves) pivot.rotation.x = sz < 0 ? -e * MAX_ANGLE : e * MAX_ANGLE;
  };
  apply();
  const api = {
    deckY: D,
    /** road surface height at local z (−163.3 … 157.4); local z of a world point = (p − centre) · axis */
    deckProfile: profile,
    deckAtWorld: (x, z) => profile((x - T.centre.x) * T.axis.x + (z - T.centre.z) * T.axis.z),
    get open() { return open; },
    get moving() { return open !== target; },
    isPassable: () => open < 0.001 && target === 0,
    raise() { target = 1; },
    lower() { target = 0; },
    toggle() { target = target > 0.5 ? 0 : 1; },
    setOpen(t) { open = target = Math.max(0, Math.min(1, t)); apply(); },
    centre: { ...T.centre }, axis: { ...T.axis },
    /** the opening span in local z (traffic must stop before ±(towerZ + 6.2) when not passable) */
    gap: { from: -T.hingeZ, to: T.hingeZ }, stopLines: [-(T.towerZ + 8), T.towerZ + 8]
  };
  const update = (dt) => {
    if (open !== target) {
      const step = dt / RAISE_TIME;
      open = target > open ? Math.min(target, open + step) : Math.max(target, open - step);
      apply();
    }
  };
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame, update, api, deckY: D };
}
