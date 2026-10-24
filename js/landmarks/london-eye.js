// js/landmarks/london-eye.js — the London Eye (135 m, 32 capsules, rotating once every 30 minutes)
// Local frame: origin = wheel centre on the ground (OSM way 204068874), +z = along the wheel plane (parallel to the
// South Bank, 7° east of north–south), +x = east towards the bank / Jubilee Gardens where the A-frame legs stand.
// The wheel stands just off the bank (bank edge ≈ x 14) and its boarding pier lies in the river.
import * as THREE from 'three/webgpu';
import { color, mix, float } from 'three/tsl';
import { LandmarkBuilder, plainMaterial, glowMaterial, nightNode, thetaForLocalX, beamGeo, mergeByMaterial } from './common.js';

const ORIGIN = { x: 580.0, z: 488.2 };
const THETA = thetaForLocalX(0.993, 0.122);
const HUB_Y = 69;
const R_RIM = 60.5; // outer rim tube
const R_INNER = 58.0; // inner rim tubes (x = ±3.2)
const R_CAPSULE = 64.0; // capsule centres
const N_CAPS = 32;
const PERIOD = 1800; // s per revolution

export function buildLondonEye(ctx) {
  const L = new LandmarkBuilder('londonEye', { x: ORIGIN.x, z: ORIGIN.z, theta: THETA });
  const night = nightNode();
  // white steel that glows blue-violet at night (LED rim lighting)
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0xe9edf0, roughness: 0.35, metalness: 0.55 });
  steel.emissiveNode = color(0x2f6dff).mul(night).mul(1.35).add(color(0xe9edf0).mul(night.mul(0.08)));
  const cable = new THREE.MeshStandardNodeMaterial({ color: 0xc9d0d6, roughness: 0.4, metalness: 0.7 });
  cable.emissiveNode = color(0x6a8dff).mul(night).mul(0.9);
  const legMat = plainMaterial(0xf1f3f4, { rough: 0.4, metal: 0.4, flood: 0.55, floodColor: 0xc8d8ff });
  const deck = plainMaterial(0x8a9096, { rough: 0.7, metal: 0.3, flood: 0.25 });
  const hubMat = plainMaterial(0xd8dde2, { rough: 0.35, metal: 0.6, flood: 0.4 });

  // ------------------------------------------------------------------ wheel (rotates about local x through the hub)
  const wheel = new THREE.Group();
  wheel.name = 'EyeWheel';
  wheel.position.set(0, HUB_Y, 0);
  L.group.add(wheel);
  const W = new THREE.Group();
  wheel.add(W);
  const ring = (r, tube, x, mat, seg = 160) => {
    const g = new THREE.TorusGeometry(r, tube, 6, seg);
    g.rotateY(Math.PI / 2);
    g.translate(x, 0, 0);
    W.add(new THREE.Mesh(g, mat));
  };
  ring(R_RIM, 0.75, 0, steel);
  ring(R_INNER, 0.5, -3.2, steel);
  ring(R_INNER, 0.5, 3.2, steel);
  const P = (r, a, x) => new THREE.Vector3(x, Math.cos(a) * r, Math.sin(a) * r);
  const NL = 64;
  for (let i = 0; i < NL; i++) {
    const a = (i / NL) * Math.PI * 2, a2 = ((i + 0.5) / NL) * Math.PI * 2;
    // triangular rim truss: radial + diagonal struts
    for (const sx of [-1, 1]) {
      W.add(new THREE.Mesh(beamGeo(P(R_INNER, a, 3.2 * sx), P(R_RIM, a, 0), 0.32), steel));
      W.add(new THREE.Mesh(beamGeo(P(R_INNER, a, 3.2 * sx), P(R_RIM, a2, 0), 0.22), steel));
    }
    W.add(new THREE.Mesh(beamGeo(P(R_INNER, a, -3.2), P(R_INNER, a, 3.2), 0.25), steel));
    // cable spokes from the spindle ends (crossing like a bicycle wheel)
    const sx = i % 2 ? 1 : -1;
    W.add(new THREE.Mesh(beamGeo(P(1.6, a, 9.5 * sx), P(R_INNER, a, 3.2 * -sx * 0 + 3.2 * sx), 0.16), cable));
  }
  // capsule mounting rings on the rim (round, so they need not counter-rotate)
  for (let i = 0; i < N_CAPS; i++) {
    const a = (i / N_CAPS) * Math.PI * 2;
    const c = P(R_CAPSULE, a, 0);
    for (const ex of [-3.7, 3.7]) {
      const g = new THREE.TorusGeometry(2.35, 0.16, 5, 18);
      g.rotateY(Math.PI / 2);
      g.translate(ex, c.y, c.z);
      W.add(new THREE.Mesh(g, steel));
    }
    W.add(new THREE.Mesh(beamGeo(P(R_RIM, a, 0), P(R_CAPSULE - 2.2, a, 0), 0.45), steel));
  }
  // hub + spindle
  {
    const g = new THREE.CylinderGeometry(3.0, 3.0, 7, 20); g.rotateZ(Math.PI / 2); W.add(new THREE.Mesh(g, hubMat));
    const g2 = new THREE.CylinderGeometry(1.7, 1.7, 22, 14); g2.rotateZ(Math.PI / 2); W.add(new THREE.Mesh(g2, hubMat));
  }
  mergeByMaterial(W);

  // ------------------------------------------------------------------ capsules (instanced, stay level)
  const capGlass = new THREE.MeshStandardNodeMaterial({ color: 0x9fc4d6, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.78 });
  capGlass.emissiveNode = mix(color(0x2a3c48).mul(0.25), color(0xdff0ff).mul(1.1), night);
  const capBody = plainMaterial(0xf2f4f5, { rough: 0.35, metal: 0.4, flood: 0.4 });
  const gGlass = new THREE.SphereGeometry(1, 20, 12);
  gGlass.scale(4.0, 2.15, 2.15);
  const gBody = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38);
  gBody.scale(3.7, 2.25, 2.25);
  const capsG = new THREE.InstancedMesh(gGlass, capGlass, N_CAPS);
  const capsB = new THREE.InstancedMesh(gBody, capBody, N_CAPS);
  capsG.name = 'EyeCapsules';
  capsG.frustumCulled = capsB.frustumCulled = false; // instances move around a 130 m wheel; bounds updated below
  L.group.add(capsG, capsB);

  // ------------------------------------------------------------------ A-frame, backstays, spindle bearing, pier
  const S = L.static;
  const top = new THREE.Vector3(12.5, HUB_Y, 0);
  for (const sz of [-1, 1]) {
    const base = new THREE.Vector3(31, 0, 31 * sz);
    const dir = new THREE.Vector3().subVectors(top, base);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(1.05, 1.9, len, 14);
    g.translate(0, len / 2, 0);
    const m = new THREE.Mesh(g, legMat);
    m.position.copy(base);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    S.add(m);
    L.box(deck, 7, 1.6, 7, base.x, -0.2, base.z, 0, S); // foundation
    // backstay cables to the Jubilee Gardens anchor
    for (const k of [0.4, 1]) S.add(new THREE.Mesh(beamGeo(new THREE.Vector3(14, HUB_Y - 3, 0.8 * sz), new THREE.Vector3(84, 0.5, sz * 12 * k), 0.22), cable));
    L.collider(base.x, base.z, 3.5, 3.5, 12);
  }
  L.box(deck, 10, 1.2, 30, 84, -0.2, 0, 0, S); // backstay anchor block
  // bearing housing at the top of the A
  {
    const g = new THREE.CylinderGeometry(2.4, 2.4, 6, 16); g.rotateZ(Math.PI / 2); g.translate(13, HUB_Y, 0); S.add(new THREE.Mesh(g, hubMat));
    S.add(new THREE.Mesh(beamGeo(new THREE.Vector3(21, 30, -17), new THREE.Vector3(21, 30, 17), 0.9), legMat));
  }
  // boarding pier along the bottom of the wheel
  L.box(deck, 12, 1.1, 74, 0, 0.8, 0, 0, S);
  L.box(plainMaterial(0x30363b, { rough: 0.6, metal: 0.6 }), 0.12, 1.1, 74, -6, 1.9, 0, 0, S);
  L.box(plainMaterial(0x30363b, { rough: 0.6, metal: 0.6 }), 0.12, 1.1, 74, 6, 1.9, 0, 0, S);
  L.box(plainMaterial(0xb8bfc6, { rough: 0.6, flood: 1.2, floodColor: 0xcfe3ff }), 11.6, 0.15, 72, 0, 1.92, 0, 0, S);
  for (const z of [-30, -10, 10, 30]) L.box(deck, 1.2, 3, 1.2, 0, -3, z, 0, S);
  L.box(deck, 6, 1.1, 14, 10, 0.8, 0, 0, S); // gangway to the bank

  // colliders: the wheel as a thin slab, the boarding pier
  L.collider(0, 0, 4.2, R_CAPSULE + 2.5, HUB_Y + R_CAPSULE + 2.5);
  L.collider(84, 0, 5, 15, 1.2);
  L.zoneRect(-8, -38, 90, 38);

  L.finish();
  capsG.castShadow = capsB.castShadow = true;

  let angle = 0;
  const dummy = new THREE.Object3D();
  const place = () => {
    wheel.rotation.x = angle;
    for (let i = 0; i < N_CAPS; i++) {
      const a = angle + (i / N_CAPS) * Math.PI * 2;
      // wheel rotation.x = angle maps (y, z) → (y cos − z sin, y sin + z cos); capsules follow the same path
      const y0 = Math.cos((i / N_CAPS) * Math.PI * 2) * R_CAPSULE, z0 = Math.sin((i / N_CAPS) * Math.PI * 2) * R_CAPSULE;
      const y = y0 * Math.cos(angle) - z0 * Math.sin(angle), z = y0 * Math.sin(angle) + z0 * Math.cos(angle);
      dummy.position.set(0, HUB_Y + y, z);
      dummy.updateMatrix();
      capsG.setMatrixAt(i, dummy.matrix);
      capsB.setMatrixAt(i, dummy.matrix);
      void a;
    }
    capsG.instanceMatrix.needsUpdate = true;
    capsB.instanceMatrix.needsUpdate = true;
  };
  place();
  const speed = ctx && ctx.opts && ctx.opts.eyeSpeed ? ctx.opts.eyeSpeed : 1;
  const update = (dt) => {
    angle = (angle + (dt * speed * Math.PI * 2) / PERIOD) % (Math.PI * 2);
    place();
  };
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame, update, wheel };
}
