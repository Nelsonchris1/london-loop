// js/landmarks/st-pauls.js — St Paul's Cathedral: west front with two baroque towers and a two-storey portico, nave,
// transepts with semicircular porches, choir with apse, and the dome (drum peristyle of 32 columns, Stone Gallery,
// attic, lead dome with ribs, Golden Gallery, lantern, golden ball & cross at 111 m). Portland stone, floodlit at night.
// Local frame: origin = centre of the OSM outline (way 369161987), +x = east along the cathedral axis (16° north of
// due east), +z = south. The dome stands over the crossing at x = 6.
import * as THREE from 'three/webgpu';
import { color, positionLocal, atan, fract, abs, min, smoothstep, float, mix, length, vec2 } from 'three/tsl';
import { LandmarkBuilder, stoneMaterial, plainMaterial, goldMaterial, glowMaterial, nightNode, thetaForLocalX } from './common.js';

const ORIGIN = { x: 2054.6, z: -671.2 };
const THETA = thetaForLocalX(0.961, -0.276);
const DOME_X = 6;

export function buildStPauls() {
  const L = new LandmarkBuilder('stPauls', { x: ORIGIN.x, z: ORIGIN.z, theta: THETA });
  const night = nightNode();
  const stone = stoneMaterial({ base: 0xdcd5c6, bay: 5.6, floorH: 12.5, sill: 3.4, winW: 2.4, winH: 6.0, arch: 1.3, y0: 1.5, yMax: 27, litProb: 0.25, warm: 0xffc880, flood: 0.85, floodColor: 0xfff0dc, ribs: 0.14, courses: 0.22, seed: 31, floodFalloff: 110, var: 0.05 });
  const ashlar = plainMaterial(0xd9d2c2, { rough: 0.85, flood: 0.85, floodColor: 0xfff0dc });
  const shade = plainMaterial(0x9d978a, { rough: 0.9, flood: 0.5, floodColor: 0xfff0dc });
  const lead = new THREE.MeshStandardNodeMaterial({ color: 0x6f777c, roughness: 0.55, metalness: 0.35 });
  {
    // lead dome ribs drawn in the shader (32 ribs around the dome axis)
    const p = positionLocal;
    const a = fract(atan(p.z, p.x.sub(DOME_X)).div(Math.PI * 2).mul(32));
    const rib = float(1).sub(smoothstep(0.04, 0.09, min(a, float(1).sub(a))));
    const domeK = smoothstep(60, 62, p.y).mul(float(1).sub(smoothstep(17, 18, length(vec2(p.x.sub(DOME_X), p.z)))));
    lead.colorNode = mix(color(0x6f777c), color(0x8d969b), rib.mul(domeK));
    lead.emissiveNode = color(0x9aa4b0).mul(night).mul(mix(float(0.32), float(0.55), rib.mul(domeK)));
  }
  const gold = goldMaterial(0xe0b04a, 0.7);
  const dark = plainMaterial(0x24262a, { rough: 0.9 });
  const S = L.static;

  // ------------------------------------------------------------------ body: nave, crossing, choir, apse, transepts
  const H = 26.5;
  L.box(stone, 52, H, 37, -37, 0, 0, 0, S); // nave x −63 … −11
  L.box(stone, 34, H, 37, DOME_X, 0, 0, 0, S); // crossing
  L.box(stone, 43, H, 37, 44.5, 0, 0, 0, S); // choir 23 … 66
  L.cyl(stone, 12.5, 12.5, H - 4, 66, 0, 0, 24, S); // apse (half buried in the choir)
  for (const sz of [-1, 1]) {
    L.box(stone, 30, H, 18, DOME_X, 0, sz * 27.5, 0, S); // transept arms
    // semicircular porch (colonnade + half dome)
    const pz = sz * 36.5;
    L.cyl(shade, 6.2, 6.2, 15, DOME_X, 0, pz, 16, S);
    for (let k = 0; k < 6; k++) {
      const a = (k / 5) * Math.PI;
      L.cyl(ashlar, 0.55, 0.6, 14, DOME_X + Math.cos(a) * 7.0, 0.8, pz + sz * Math.sin(a) * 7.0, 10, S);
    }
    const hd = new THREE.SphereGeometry(7.4, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    L.mesh(hd, lead, DOME_X, 15, pz);
    L.box(ashlar, 18, 1.4, 1.2, DOME_X, 15, pz, 0, S);
    // transept pediment
    L.gable(ashlar, 24, 1.5, 6.5, DOME_X, H, sz * 36.3, 0, S);
  }
  // cornice + balustrade lines
  L.box(ashlar, 132, 1.3, 38.6, 1.5, H - 1.3, 0, 0, S);
  L.box(ashlar, 31.6, 1.3, 75.5, DOME_X, H - 1.3, 0, 0, S);
  // aisle-level string course
  L.box(ashlar, 132.4, 0.8, 37.8, 1.5, 12.6, 0, 0, S);
  // lead roofs
  L.gable(lead, 25, 52, 7.5, -37, H, 0, Math.PI / 2, S);
  L.gable(lead, 25, 43, 7.5, 44.5, H, 0, Math.PI / 2, S);
  for (const sz of [-1, 1]) L.gable(lead, 25, 18.5, 7.5, DOME_X, H, sz * 27.2, 0, S);
  L.mesh(new THREE.SphereGeometry(12.5, 16, 6, -Math.PI / 2, Math.PI, 0, Math.PI / 2), lead, 66, H - 4, 0);

  // ------------------------------------------------------------------ west front: towers + portico + steps
  L.box(ashlar, 12, 3.2, 40, -73.5, 0, 0, 0, S); // steps
  L.box(stone, 10, 30, 56, -66, 0, 0, 0, S); // west front block (towers' bases)
  for (const sz of [-1, 1]) {
    const tz = sz * 21.5;
    L.box(stone, 12, 36, 12.5, -67, 0, tz, 0, S);
    L.box(ashlar, 12.8, 1.4, 13.3, -67, 36, tz, 0, S);
    // circular colonnaded belfry stage
    L.cyl(shade, 4.4, 4.4, 13, -67, 37.4, tz, 16, S);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      L.cyl(ashlar, 0.42, 0.48, 11.5, -67 + Math.cos(a) * 5.4, 37.6, tz + Math.sin(a) * 5.4, 8, S);
    }
    for (const [sx, sz2] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) L.box(ashlar, 2.4, 13, 2.4, -67 + sx * 5.2, 37.4, tz + sz2 * 5.2, 0, S);
    L.cyl(ashlar, 6.6, 6.6, 1.6, -67, 50.4, tz, 16, S);
    L.cyl(stone, 3.8, 4.6, 5.5, -67, 52, tz, 16, S);
    // ogee cap + gilded pineapple finial
    {
      const og = [[4.0, 0], [3.9, 1.2], [3.4, 2.4], [2.4, 3.4], [1.5, 4.2], [1.1, 5.2], [1.25, 6.0], [0.7, 6.6], [0.35, 7.6], [0.01, 8.2]];
      L.mesh(new THREE.LatheGeometry(og.map(([r, y]) => new THREE.Vector2(r, y)), 16), lead, -67, 57.5, tz);
    }
    L.mesh(new THREE.SphereGeometry(0.9, 10, 8), gold, -67, 66.4, tz);
    L.collider(-67, tz, 6.2, 6.4, 67);
    // clock faces on the south-west tower, plain roundels elsewhere
    L.cyl(sz > 0 ? glowMaterial(0xf4ead2, 0.55, 1.6) : dark, 2.2, 2.2, 0.3, -73.15, 29, tz, 24, S).rotation.z = Math.PI / 2;
  }
  // two-storey portico (12 lower / 8 upper paired columns) + pediment
  const pcX = -72.2;
  L.box(shade, 3.5, 26, 27, pcX + 2.6, 3.2, 0, 0, S);
  for (let i = 0; i < 12; i++) {
    const z = -12.2 + Math.floor(i / 2) * 4.8 + (i % 2) * 1.6 - 0.8 + 0.8;
    L.cyl(ashlar, 0.62, 0.7, 10.8, pcX, 3.2, z - 0.8, 12, S);
  }
  L.box(ashlar, 3.2, 1.8, 28, pcX + 0.6, 14, 0, 0, S);
  for (let i = 0; i < 8; i++) {
    const z = -8.6 + Math.floor(i / 2) * 5.6 + (i % 2) * 1.5;
    L.cyl(ashlar, 0.55, 0.62, 9.6, pcX, 15.8, z, 12, S);
  }
  L.box(ashlar, 3.2, 1.8, 24, pcX + 0.6, 25.4, 0, 0, S);
  L.gable(ashlar, 24, 3.4, 7.2, pcX + 1.1, 27.2, 0, Math.PI / 2, S);
  L.gable(shade, 21, 3.5, 6.0, pcX + 1.3, 27.6, 0, Math.PI / 2, S);
  L.mesh(new THREE.SphereGeometry(0.8, 8, 6), ashlar, pcX + 1, 35, 0); // St Paul figure on the apex (stylised)
  L.box(ashlar, 1.2, 3.0, 1.2, pcX + 1, 34, 0, 0, S);
  L.box(glowMaterial(0xffd590, 0.0, 1.3), 0.3, 6.5, 4.6, pcX + 0.6 + 1.1, 3.4, 0, 0, S); // great west door glow

  // ------------------------------------------------------------------ dome
  const dx = DOME_X;
  L.cyl(stone, 19.5, 19.5, 6.5, dx, H, 0, 32, S); // drum podium
  L.cyl(shade, 15.6, 15.6, 16.5, dx, H + 6.5, 0, 32, S); // inner drum wall
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    if (k % 8 === 4) { // solid buttress bays every eighth intercolumniation
      L.box(ashlar, 2.6, 14, 2.6, dx + Math.cos(a) * 17.2, H + 6.5, Math.sin(a) * 17.2, -a, S);
    }
    L.cyl(ashlar, 0.55, 0.62, 13.6, dx + Math.cos(a) * 17.6, H + 6.5, Math.sin(a) * 17.6, 8, S);
  }
  L.cyl(ashlar, 18.6, 18.6, 2.2, dx, H + 20.1, 0, 32, S); // entablature
  L.cyl(ashlar, 18.0, 18.0, 1.2, dx, H + 22.3, 0, 32, S); // Stone Gallery balustrade
  L.cyl(stone, 15.4, 15.4, 9.5, dx, H + 22.3, 0, 32, S); // attic
  L.cyl(ashlar, 16.0, 16.0, 1.0, dx, H + 31.8, 0, 32, S);
  {
    const dg = new THREE.SphereGeometry(15.8, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    dg.scale(1, 1.42, 1);
    L.mesh(dg, lead, dx, H + 32.6, 0);
  }
  const domeTop = H + 32.6 + 15.8 * 1.42 - 0.8; // ≈ 80.8
  L.cyl(ashlar, 4.8, 5.2, 1.2, dx, domeTop - 0.4, 0, 16, S); // Golden Gallery
  L.cyl(ashlar, 3.3, 3.5, 9.5, dx, domeTop + 0.8, 0, 16, S); // lantern
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    L.box(ashlar, 1.1, 9.5, 1.1, dx + Math.cos(a) * 3.8, domeTop + 0.8, Math.sin(a) * 3.8, -a, S);
  }
  L.cyl(ashlar, 4.2, 4.2, 1.0, dx, domeTop + 10.3, 0, 16, S);
  {
    const cg = new THREE.SphereGeometry(3.4, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cg.scale(1, 1.25, 1);
    L.mesh(cg, lead, dx, domeTop + 11.3, 0);
  }
  L.cyl(ashlar, 0.55, 1.4, 6.8, dx, domeTop + 15, 0, 12, S);
  L.mesh(new THREE.SphereGeometry(1.45, 16, 12), gold, dx, domeTop + 23.3, 0);
  L.box(gold, 0.35, 5.0, 0.35, dx, domeTop + 24.6, 0, 0, S);
  L.box(gold, 0.35, 0.35, 2.4, dx, domeTop + 27.6, 0, 0, S);

  // colliders + zone
  L.collider(-37, 0, 26.5, 18.5, H + 7);
  L.collider(44.5, 0, 21.5, 18.5, H + 7);
  L.collider(dx, 0, 15, 37, H + 7);
  L.collider(dx, 0, 19.5, 19.5, 111);
  L.collider(-72, 0, 6, 20, 35);
  L.collider(66, 0, 12.5, 12.5, H);
  L.zone([[-79.5, -28], [-61, -28], [-61, -19], [-9, -19], [-9, -44], [21, -44], [21, -19], [78.6, -19], [78.6, 19], [21, 19], [21, 44], [-9, 44], [-9, 19], [-61, 19], [-61, 28], [-79.5, 28]]);
  L.finish();
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame };
}
