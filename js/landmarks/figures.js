// js/landmarks/figures.js — stylised statuary from primitives (all facing local +z, feet at y = 0):
// standing figures (Nelson, Napier, Havelock), Eros the archer, winged Victory, a seated Queen, Landseer lions and an
// equestrian statue. Every part goes into the landmark's static group, so a whole statue costs no extra draw call.
import * as THREE from 'three/webgpu';

function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
const sph = (r, sx = 1, sy = 1, sz = 1, seg = 10) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)); g.scale(sx, sy, sz); return g; };
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** returns a Group (to be placed, then added to a static group) */
export function standingFigure(mat, h = 1.8, { coat = true, hat = null, sword = false, armUp = false } = {}) {
  const G = new THREE.Group();
  const k = h / 1.8;
  for (const s of [-1, 1]) part(G, cyl(0.075 * k, 0.09 * k, 0.86 * k), mat, s * 0.1 * k, 0.43 * k, 0);
  if (coat) part(G, cyl(0.2 * k, 0.29 * k, 0.75 * k, 10), mat, 0, 0.78 * k, -0.02 * k);
  part(G, cyl(0.19 * k, 0.22 * k, 0.55 * k, 10), mat, 0, 1.2 * k, 0);
  part(G, sph(0.11 * k), mat, 0, 1.62 * k, 0.01 * k);
  part(G, cyl(0.06 * k, 0.07 * k, 0.12 * k), mat, 0, 1.5 * k, 0);
  // arms
  part(G, cyl(0.055 * k, 0.06 * k, 0.6 * k), mat, -0.27 * k, 1.17 * k, 0.02 * k, 0, 0, 0.12);
  if (armUp) part(G, cyl(0.055 * k, 0.06 * k, 0.6 * k), mat, 0.32 * k, 1.42 * k, 0.12 * k, -0.9, 0, -0.5);
  else part(G, cyl(0.055 * k, 0.06 * k, 0.6 * k), mat, 0.27 * k, 1.17 * k, 0.02 * k, 0, 0, -0.12);
  if (hat === 'bicorne') part(G, box(0.5 * k, 0.12 * k, 0.16 * k), mat, 0, 1.74 * k, 0, 0, 0, 0);
  if (hat === 'cap') part(G, cyl(0.11 * k, 0.12 * k, 0.1 * k), mat, 0, 1.72 * k, 0);
  if (sword) part(G, cyl(0.02 * k, 0.025 * k, 0.9 * k, 5), mat, -0.32 * k, 0.6 * k, 0.12 * k, 0.25, 0, 0.05);
  return G;
}

/** Eros (Anteros): winged archer poised on one foot, bow drawn */
export function erosFigure(mat, h = 2.4) {
  const G = new THREE.Group();
  const k = h / 1.8;
  part(G, cyl(0.07 * k, 0.085 * k, 0.9 * k), mat, 0.03 * k, 0.45 * k, 0); // standing leg
  part(G, cyl(0.07 * k, 0.085 * k, 0.85 * k), mat, -0.05 * k, 0.78 * k, -0.35 * k, 1.05, 0, 0); // raised leg behind
  part(G, cyl(0.15 * k, 0.17 * k, 0.6 * k, 10), mat, 0, 1.2 * k, 0.04 * k, 0.15, 0, 0);
  part(G, sph(0.1 * k), mat, 0, 1.6 * k, 0.1 * k);
  // wings
  for (const s of [-1, 1]) part(G, sph(0.5 * k, 0.12, 1.25, 0.55), mat, s * 0.32 * k, 1.55 * k, -0.25 * k, -0.5, 0, s * 0.55);
  // arms + bow
  part(G, cyl(0.045 * k, 0.05 * k, 0.6 * k), mat, -0.18 * k, 1.38 * k, 0.32 * k, 1.35, 0, 0.4);
  part(G, cyl(0.045 * k, 0.05 * k, 0.55 * k), mat, 0.16 * k, 1.38 * k, 0.12 * k, 1.5, 0, -0.3);
  const bow = new THREE.TorusGeometry(0.42 * k, 0.02 * k, 4, 16, Math.PI * 0.9);
  part(G, bow, mat, -0.3 * k, 1.35 * k, 0.55 * k, 0, Math.PI / 2, Math.PI * 0.55);
  return G;
}

/** winged Victory (gilded), arms raised */
export function wingedVictory(mat, h = 5) {
  const G = standingFigure(mat, h, { coat: true, armUp: true });
  const k = h / 1.8;
  for (const s of [-1, 1]) part(G, sph(0.55 * k, 0.1, 1.3, 0.6), mat, s * 0.35 * k, 1.55 * k, -0.25 * k, -0.35, 0, s * 0.45);
  return G;
}

/** seated, robed figure on a throne (Queen Victoria) */
export function seatedFigure(mat, h = 4.2) {
  const G = new THREE.Group();
  const k = h / 1.8;
  part(G, box(0.9 * k, 0.75 * k, 0.8 * k), mat, 0, 0.38 * k, -0.15 * k); // throne
  part(G, box(0.9 * k, 0.6 * k, 0.12 * k), mat, 0, 1.0 * k, -0.52 * k);
  part(G, cyl(0.28 * k, 0.42 * k, 0.7 * k, 12), mat, 0, 0.35 * k, 0.12 * k); // robe
  part(G, cyl(0.2 * k, 0.26 * k, 0.6 * k, 10), mat, 0, 1.05 * k, -0.05 * k);
  part(G, sph(0.12 * k), mat, 0, 1.45 * k, 0);
  part(G, cyl(0.08 * k, 0.11 * k, 0.12 * k, 8), mat, 0, 1.6 * k, 0); // crown
  part(G, cyl(0.02 * k, 0.02 * k, 0.6 * k, 5), mat, 0.32 * k, 1.0 * k, 0.25 * k, 0.3, 0, 0); // sceptre
  return G;
}

/** recumbent Landseer lion, ~7 m long, facing +z */
export function lion(mat) {
  const G = new THREE.Group();
  part(G, sph(1, 1.1, 0.95, 2.4, 12), mat, 0, 1.45, -0.4);
  part(G, sph(1, 1.2, 1.1, 1.3, 10), mat, 0, 1.25, -2.1);
  part(G, sph(1, 1.3, 1.45, 1.2, 12), mat, 0, 2.15, 1.5);
  part(G, sph(0.75, 0.95, 1.0, 1.05, 10), mat, 0, 2.6, 2.5);
  part(G, box(0.75, 0.55, 0.65), mat, 0, 2.3, 3.2);
  part(G, box(0.5, 0.25, 0.3), mat, 0, 2.62, 3.4); // nose ridge
  for (const s of [-1, 1]) {
    part(G, box(0.55, 0.5, 2.7), mat, s * 0.55, 0.25, 2.7);
    part(G, box(0.68, 0.42, 0.7), mat, s * 0.55, 0.21, 4.05);
    part(G, box(0.55, 0.5, 1.9), mat, s * 1.0, 0.25, -1.5);
    part(G, sph(0.38, 1, 0.8, 1), mat, s * 0.58, 3.05, 2.15); // ears / mane tufts
  }
  part(G, cyl(0.11, 0.15, 2.0), mat, 0.6, 0.35, -3.5, Math.PI / 2, 0, 0);
  part(G, cyl(0.1, 0.11, 1.4), mat, 1.3, 0.3, -4.2, Math.PI / 2, -0.9, 0);
  return G;
}

/** equestrian statue (horse + rider), ~4.5 m tall, facing +z */
export function equestrian(mat) {
  const G = new THREE.Group();
  part(G, sph(1, 0.55, 0.65, 1.35, 10), mat, 0, 1.75, 0);
  part(G, cyl(0.28, 0.4, 1.2), mat, 0, 2.45, 1.2, 0.7, 0, 0);
  part(G, box(0.34, 0.4, 0.85), mat, 0, 2.85, 1.75, 0.5, 0, 0);
  for (const [x, z] of [[-0.3, 0.9], [0.3, 0.9], [-0.3, -0.9], [0.3, -0.9]]) part(G, cyl(0.08, 0.1, 1.3), mat, x, 0.65, z);
  part(G, cyl(0.06, 0.12, 1.1), mat, 0, 1.6, -1.35, -0.6, 0, 0);
  const rider = standingFigure(mat, 1.9, { coat: false });
  rider.scale.set(1, 0.62, 1);
  rider.position.set(0, 1.85, -0.1);
  G.add(rider);
  return G;
}

/** add a figure group to a static group at (x, y, z), yaw ry */
export function place(parent, fig, x, y, z, ry = 0, s = 1) {
  fig.position.set(x, y, z);
  fig.rotation.y = ry;
  fig.scale.multiplyScalar(s);
  parent.add(fig);
  return fig;
}
