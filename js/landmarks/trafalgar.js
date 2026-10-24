// js/landmarks/trafalgar.js — Trafalgar Square: Nelson's Column (51.6 m: stepped granite base, pedestal with bronze
// reliefs, fluted granite column, bronze Corinthian capital, Nelson), Landseer's four lions, the two Lutyens fountains
// (animated jets & ripples) and the four plinths (Napier, Havelock, George IV and the Fourth Plinth with a commission).
// The National Gallery and the north terrace are left to the city renderer.
// Local frame: origin = Nelson's Column (OSM way 150920358, 7 m east / 3 m north of the geo-frame origin),
// +x = east along the square's axis (15° north of east), +z = south (towards Whitehall).
import * as THREE from 'three/webgpu';
import { Fn, color, float, vec2, uv, time, sin, fract, abs, mix, smoothstep, step, length, positionWorld, positionLocal, max, min } from 'three/tsl';
import { LandmarkBuilder, plainMaterial, goldMaterial, glowMaterial, nightNode, thetaForLocalX, hash2 } from './common.js';
import { lion, standingFigure, equestrian, place } from './figures.js';

const ORIGIN = { x: 7.0, z: -3.0 };
const THETA = thetaForLocalX(0.966, -0.257);

function fountainWaterMaterial(c1, c2) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.25 });
  const night = nightNode();
  const p = positionWorld;
  const r1 = length(vec2(p.x.sub(c1.x), p.z.sub(c1.z)));
  const r2 = length(vec2(p.x.sub(c2.x), p.z.sub(c2.z)));
  const r = min(r1, r2);
  const ring = sin(r.mul(3.2).sub(time.mul(3.0))).mul(0.5).add(0.5);
  const sparkle = step(0.985, hash2(vec2(p.x, p.z).mul(3.0).floor().add(time.mul(4).floor())));
  mat.colorNode = mix(color(0x2c5560), color(0x5e9aa8), ring.mul(0.4)).add(sparkle.mul(0.25));
  mat.emissiveNode = color(0x7cd2ff).mul(night).mul(mix(float(0.35), float(0.6), ring));
  return mat;
}

function jetMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const v = uv();
  const streak = fract(v.y.mul(3.0).sub(time.mul(1.6)).add(sin(v.x.mul(40.0)).mul(0.08)));
  const flicker = smoothstep(0.0, 0.5, streak).mul(float(1).sub(smoothstep(0.5, 1.0, streak)));
  const night = nightNode();
  mat.colorNode = mix(color(0xe8f4ff), color(0xbfe6ff).mul(1.6), night);
  mat.opacityNode = flicker.mul(0.45).add(0.18).mul(smoothstep(0.0, 0.15, v.y));
  return mat;
}

export function buildTrafalgarSquare() {
  const L = new LandmarkBuilder('trafalgarSquare', { x: ORIGIN.x, z: ORIGIN.z, theta: THETA });
  const night = nightNode();
  const granite = plainMaterial(0xb7b1a5, { rough: 0.85, flood: 0.6, floodColor: 0xfff0dc });
  const graniteDark = plainMaterial(0x8e8a82, { rough: 0.85, flood: 0.5, floodColor: 0xfff0dc });
  const bronze = new THREE.MeshStandardNodeMaterial({ color: 0x4a4130, roughness: 0.45, metalness: 0.75 });
  bronze.emissiveNode = color(0x6b5a3c).mul(night).mul(0.35);
  const verdigris = plainMaterial(0x44564a, { rough: 0.5, metal: 0.6, flood: 0.4 });
  const stoneStatue = plainMaterial(0xa7a39b, { rough: 0.7, flood: 0.6 });
  const water = fountainWaterMaterial(L.toWorld(-25.3, -34), L.toWorld(25.3, -34));
  const jet = jetMaterial();
  const S = L.static;

  // ------------------------------------------------------------------ Nelson's Column
  L.box(granite, 25.3, 0.6, 25.3, 0, 0, 0, 0, S);
  L.box(granite, 22.5, 0.6, 22.5, 0, 0.6, 0, 0, S);
  L.box(granite, 19.6, 0.5, 19.6, 0, 1.2, 0, 0, S);
  // lion plinths at the four corners (lions facing north & south)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    L.box(granite, 4.0, 2.0, 8.6, sx * 7.6, 1.7, sz * 5.6, 0, S);
    place(S, lion(bronze), sx * 7.6, 3.7, sz * 5.4 - sz * 0.6, sz > 0 ? 0 : Math.PI, 0.92);
  }
  // pedestal: plinth, die with bronze relief panels, cornice
  L.box(granite, 11.6, 1.6, 11.6, 0, 1.7, 0, 0, S);
  L.box(granite, 10.2, 8.4, 10.2, 0, 3.3, 0, 0, S);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    L.box(bronze, 6.4, 5.0, 0.3, Math.sin(a) * 5.15, 4.6, Math.cos(a) * 5.15, a, S);
  }
  L.box(granite, 11.0, 1.0, 11.0, 0, 11.7, 0, 0, S);
  L.box(granite, 7.4, 1.8, 7.4, 0, 12.7, 0, 0, S);
  L.cyl(granite, 2.3, 2.6, 1.0, 0, 14.5, 0, 16, S); // column base torus
  // fluted shaft (fluting via 24-sided cylinder alternate radii)
  {
    const h = 30.0, seg = 48;
    const g = new THREE.CylinderGeometry(1.5, 1.72, h, seg, 6, false);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = Math.abs(Math.cos(a * 12)) > 0.7 ? 0.95 : 1.0;
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    L.mesh(g, granite, 0, 15.5 + h / 2, 0);
  }
  // bronze Corinthian capital: bell + acanthus + abacus
  L.cyl(verdigris, 2.3, 1.6, 2.4, 0, 45.5, 0, 16, S);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    L.mesh(new THREE.SphereGeometry(0.55, 6, 5), verdigris, Math.cos(a) * 1.9, 46.2, Math.sin(a) * 1.9);
  }
  L.box(verdigris, 4.8, 0.6, 4.8, 0, 47.9, 0, 0, S);
  L.cyl(granite, 1.3, 1.45, 0.8, 0, 48.5, 0, 16, S); // drum
  // Nelson (5.5 m): bicorne hat, sword, facing south down Whitehall towards the Admiralty & the fleet
  place(S, standingFigure(stoneStatue, 5.2, { coat: true, hat: 'bicorne', sword: true }), 0, 49.3, 0, 0);
  L.collider(0, 0, 12.6, 12.6, 3.7);
  L.collider(0, 0, 5.6, 5.6, 51.6);

  // ------------------------------------------------------------------ fountains (Lutyens basins, animated)
  for (const sx of [-1, 1]) {
    const fx = sx * 25.3, fz = -34;
    // stadium-shaped basin: long axis along x
    const shape = new THREE.Shape();
    const hw = 10.5, hd = 6.0;
    shape.moveTo(-hw + hd, -hd);
    shape.lineTo(hw - hd, -hd);
    shape.absarc(hw - hd, 0, hd, -Math.PI / 2, Math.PI / 2, false);
    shape.lineTo(-hw + hd, hd);
    shape.absarc(-hw + hd, 0, hd, Math.PI / 2, (Math.PI * 3) / 2, false);
    const inner = new THREE.Path();
    const iw = hw - 0.8, id = hd - 0.8;
    inner.moveTo(-iw + id, -id);
    inner.lineTo(iw - id, -id);
    inner.absarc(iw - id, 0, id, -Math.PI / 2, Math.PI / 2, false);
    inner.lineTo(-iw + id, id);
    inner.absarc(-iw + id, 0, id, Math.PI / 2, (Math.PI * 3) / 2, false);
    shape.holes.push(inner);
    const rim = new THREE.ExtrudeGeometry(shape, { depth: 0.75, bevelEnabled: false, curveSegments: 10 });
    rim.rotateX(-Math.PI / 2);
    L.mesh(rim, granite, fx, 0, fz);
    const wshape = new THREE.Shape(inner.getPoints(16));
    const wg = new THREE.ShapeGeometry(wshape, 10);
    wg.rotateX(-Math.PI / 2);
    L.mesh(wg, water, fx, 0.45, fz);
    // central pedestal with two bowls
    L.cyl(granite, 0.9, 1.3, 1.6, fx, 0.2, fz, 16, S);
    L.cyl(granite, 3.2, 1.0, 0.7, fx, 1.8, fz, 24, S);
    L.cyl(granite, 0.45, 0.7, 1.7, fx, 2.5, fz, 12, S);
    L.cyl(granite, 1.5, 0.5, 0.45, fx, 4.2, fz, 20, S);
    // water in the bowls
    const bw = new THREE.CircleGeometry(2.95, 24); bw.rotateX(-Math.PI / 2); L.mesh(bw, water, fx, 2.45, fz);
    // mermaid / dolphin groups (stylised bronze) at the basin ends
    for (const ex of [-1, 1]) {
      L.mesh(new THREE.SphereGeometry(0.9, 8, 6), bronze, fx + ex * 7.2, 1.1, fz);
      L.cyl(bronze, 0.25, 0.45, 1.4, fx + ex * 7.2, 1.4, fz, 8, S);
    }
    // jets: central plume + fan of side jets (animated streak shader, not merged into the opaque buckets)
    const plume = new THREE.CylinderGeometry(0.12, 0.55, 7.5, 12, 1, true);
    const mm = new THREE.Mesh(plume, jet); mm.position.set(fx, 4.6 + 3.75, fz); S.add(mm);
    const fall = new THREE.CylinderGeometry(1.6, 2.9, 2.3, 20, 1, true);
    const mf = new THREE.Mesh(fall, jet); mf.position.set(fx, 3.4, fz); S.add(mf);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(0.05, 0.25, 3.4, 6, 1, true);
      const m = new THREE.Mesh(g, jet);
      m.position.set(fx + Math.cos(a) * 4.8, 0.45 + 1.5, fz + Math.sin(a) * 3.0);
      m.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      S.add(m);
    }
    L.collider(fx, fz, hw, hd, 0.8);
    L.zone([[fx - hw, fz - hd], [fx + hw, fz - hd], [fx + hw, fz + hd], [fx - hw, fz + hd]], 'trafalgarSquare');
  }

  // ------------------------------------------------------------------ plinths
  const plinths = [
    { x: -40.2, z: -10.7, name: 'Napier', fig: () => standingFigure(bronze, 3.4, { coat: true, sword: true }) },
    { x: 40.4, z: -10.7, name: 'Havelock', fig: () => standingFigure(bronze, 3.4, { coat: true, sword: true }) },
    { x: 40.4, z: -59.2, name: 'George IV', fig: () => equestrian(bronze), tall: true },
    { x: -40.2, z: -59.2, name: 'Fourth Plinth', fig: null, tall: true }
  ];
  for (const p of plinths) {
    const h = p.tall ? 6.0 : 3.6;
    L.box(graniteDark, p.tall ? 5.6 : 4.2, 0.6, p.tall ? 9.0 : 4.2, p.x, 0, p.z, 0, S);
    L.box(granite, p.tall ? 4.6 : 3.2, h, p.tall ? 8.0 : 3.2, p.x, 0.6, p.z, 0, S);
    L.box(granite, p.tall ? 5.0 : 3.6, 0.6, p.tall ? 8.4 : 3.6, p.x, 0.6 + h, p.z, 0, S);
    const top = 1.2 + h;
    if (p.fig) place(S, p.fig(), p.x, top, p.z, p.name === 'George IV' ? -Math.PI / 2 : 0, p.name === 'George IV' ? 1.0 : 1);
    else {
      // Fourth Plinth commission (invented): a stack of tilted, brightly glazed cubes
      const cols = [0xd7263d, 0xf4a259, 0x1b998b, 0x2e86ab, 0xf9e900];
      cols.forEach((c, i) => {
        const m = L.box(plainMaterial(c, { rough: 0.35, metal: 0.1, flood: 0.6 }), 2.4 - i * 0.3, 1.2, 2.4 - i * 0.3, p.x, top + i * 1.15, p.z, i * 0.4, S);
        m.rotation.z = (i % 2 ? 0.12 : -0.1);
      });
    }
    L.collider(p.x, p.z, p.tall ? 2.8 : 2.1, p.tall ? 4.5 : 2.1, top + 4);
  }
  // square floodlights on tall lamp standards at the column corners
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    L.cyl(plainMaterial(0x1e2226, { rough: 0.5, metal: 0.6 }), 0.1, 0.16, 6, sx * 13.5, 0, sz * 13.5, 8, S);
    L.mesh(new THREE.SphereGeometry(0.35, 10, 8), glowMaterial(0xfff0d0, 0.3, 2.4), sx * 13.5, 6.2, sz * 13.5);
  }

  L.zoneRect(-12.8, -12.8, 12.8, 12.8, 'nelsonsColumn');
  L.finish();
  L.group.traverse((o) => { if (o.isMesh && o.material === jet) { o.castShadow = false; o.renderOrder = 2; } });
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame };
}
