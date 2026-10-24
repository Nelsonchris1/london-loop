// js/landmarks/shard.js — The Shard (310 m): eight leaning glass shards around a tapering core, with fissures where
// the shards overlap and an open, splintered steel-framed top that glows at night.
// Local frame: origin = tower centre (OSM way 31110737), axes aligned with the footprint (127° rectangle).
import * as THREE from 'three/webgpu';
import { color, mix, float, positionWorld, smoothstep } from 'three/tsl';
import { LandmarkBuilder, glassMaterial, plainMaterial, glowMaterial, nightNode, thetaForLocalX, beamGeo } from './common.js';

const ORIGIN = { x: 2890.0, z: 366.0 };
const THETA = thetaForLocalX(-0.602, 0.799);
const APEX = 330; // virtual apex of the shard planes
const D0 = 28; // half-width of the base square
const TOP = 309.6;

export function buildShard() {
  const L = new LandmarkBuilder('shard', { x: ORIGIN.x, z: ORIGIN.z, theta: THETA });
  const night = nightNode();
  const glass = glassMaterial({ tint: 0x3a5266, frame: 0xa9b4bb, floorH: 3.7, colW: 1.5, litProb: 0.5, warm: 0xe6ecf2, reflectivity: 1.1, seed: 7, nightGain: 0.65, unlit: 0.18 });
  glass.side = THREE.DoubleSide;
  const core = glassMaterial({ tint: 0x1d2730, frame: 0x6b757c, floorH: 3.7, colW: 1.5, litProb: 0.45, warm: 0xe0e4ea, reflectivity: 0.6, seed: 13, nightGain: 0.5, unlit: 0.15 });
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x9aa3aa, roughness: 0.4, metalness: 0.7 });
  steel.emissiveNode = color(0xe8f0ff).mul(night).mul(smoothstep(230, 300, positionWorld.y)).mul(1.4);
  const crownGlow = glowMaterial(0xdfe9ff, 0.05, 1.8);
  const podium = plainMaterial(0x6a7076, { rough: 0.6, metal: 0.3 });

  // shard planes: [face 0..3, s0, s1 (lateral, × D0), outward offset (m), top-left h, top-right h]
  const SHARDS = [
    [0, -1.0, 0.18, 0.0, 306, 276], [0, -0.12, 1.0, 1.9, 262, 296],
    [1, -1.0, 0.1, 1.8, 288, 258], [1, -0.2, 1.0, 0.0, 298, 309],
    [2, -1.0, 0.22, 0.0, 268, 302], [2, -0.08, 1.0, 2.0, 292, 264],
    [3, -1.0, 0.05, 1.9, 258, 284], [3, -0.25, 1.0, 0.0, 309.6, 288]
  ];
  const pos = [], nor = [], uvs = [];
  const faceAxes = (k) => {
    const a = (k * Math.PI) / 2;
    return { n: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), t: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)) };
  };
  const at = (k, s, off, y) => {
    const { n, t } = faceAxes(k);
    const f = 1 - y / APEX;
    return new THREE.Vector3().addScaledVector(n, (D0 + off) * f).addScaledVector(t, s * D0 * f).setY(y);
  };
  for (const [k, s0, s1, off, hl, hr] of SHARDS) {
    // split the shard into horizontal bands so the window grid stays planar & the top edge can be jagged
    const bands = 8;
    for (let b = 0; b < bands; b++) {
      const y0 = (b / bands), y1 = ((b + 1) / bands);
      const p00 = at(k, s0, off, y0 * hl), p10 = at(k, s1, off, y0 * hr);
      const p01 = at(k, s0, off, y1 * hl), p11 = at(k, s1, off, y1 * hr);
      const nrm = new THREE.Vector3().subVectors(p10, p00).cross(new THREE.Vector3().subVectors(p01, p00)).normalize();
      if (nrm.dot(faceAxes(k).n) < 0) nrm.negate();
      const quad = [p00, p10, p11, p00, p11, p01];
      const want = new THREE.Vector3().subVectors(p10, p00).cross(new THREE.Vector3().subVectors(p11, p00));
      const order = want.dot(nrm) > 0 ? quad : [p00, p11, p10, p00, p01, p11];
      for (const p of order) { pos.push(p.x, p.y, p.z); nor.push(nrm.x, nrm.y, nrm.z); uvs.push(0, 0); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  L.mesh(g, glass);

  // tapering core inside the shards (closed up to 245 m) + a glowing crown frame above it
  {
    const h = 238;
    const r0 = (D0 - 1.4) * Math.SQRT2, r1 = (D0 - 1.4) * (1 - h / APEX) * Math.SQRT2;
    const cg = new THREE.CylinderGeometry(r1, r0, h, 4, 6, false);
    cg.rotateY(Math.PI / 4);
    L.mesh(cg.toNonIndexed(), core, 0, h / 2, 0).geometry.computeVertexNormals();
    L.box(crownGlow, (D0 - 2) * 2 * (1 - h / APEX), 1.2, (D0 - 2) * 2 * (1 - h / APEX), 0, h, 0);
  }
  // splintered steel top: radiating ribs and rings
  {
    const S = L.static;
    for (let i = 0; i < 16; i++) {
      const k = i % 4, s = ((i >> 2) / 3) * 1.6 - 0.8;
      const a = at(k, s, -0.6, 244), b = at(k, s * 0.6, -0.6, 300 + (i % 3) * 3);
      S.add(new THREE.Mesh(beamGeo(a, b, 0.45), steel));
    }
    for (const y of [252, 262, 272, 282, 292]) {
      for (let k = 0; k < 4; k++) S.add(new THREE.Mesh(beamGeo(at(k, -0.95, -0.8, y), at(k, 0.95, -0.8, y), 0.35), steel));
    }
    S.add(new THREE.Mesh(beamGeo(new THREE.Vector3(0, 246, 0), new THREE.Vector3(0, 305, 0), 0.6), steel));
  }
  // podium / base canopy
  L.box(podium, D0 * 2 + 8, 0.9, D0 * 2 + 8, 0, 4.2, 0);
  L.box(glowMaterial(0xffe8c8, 0.1, 1.4), D0 * 2 + 0.4, 4.2, D0 * 2 + 0.4, 0, 0, 0);

  L.collider(0, 0, D0, D0, 200);
  L.collider(0, 0, D0 * 0.4, D0 * 0.4, TOP);
  L.zoneRect(-31, -31, 31, 31);
  L.finish();
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame };
}
