// js/landmarks/common.js — shared helpers for the London landmark models (Workstream B)
// - LM uniforms (night factor, clock hands, sky colours) + optional link to the city's shared uniforms
// - procedural TSL materials (gothic / classical stone with lit windows & floodlighting, brick, curtain-wall glass,
//   glow, metal) — all world-space, so parts of many landmarks can share one pipeline
// - geometry helpers that build in a landmark's local frame, a per-material merger (few draw calls),
//   SPEC-format colliders (AABB + OBB) and zone polygons in world metres
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, color, uniform, positionWorld, normalWorldGeometry, normalWorld, cameraPosition,
  sin, abs, floor, fract, mix, step, smoothstep, clamp, max, min, dot, normalize, length, pow, reflect, fwidth, sqrt, atan
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2D } from '../tsl-materials.js';

// ---------------------------------------------------------------------------------------------------------------------
// Uniforms
// ---------------------------------------------------------------------------------------------------------------------
export const LM = {
  uNight: uniform(0), // 0 = day … 1 = full night (used when no city uniforms are linked)
  uClockH: uniform(0), // hour hand angle (rad, clockwise from 12)
  uClockM: uniform(0), // minute hand angle
  uSkyTop: uniform(new THREE.Color(0x3a6aa8)),
  uSkyHorizon: uniform(new THREE.Color(0xead2b4)),
  uSunDir: uniform(new THREE.Vector3(-0.6, 0.3, -0.7).normalize()),
  uSunColor: uniform(new THREE.Color(0xffd2a0))
};

let CITY = null; // the city's shared uniforms (tsl-materials.js cityUniforms) when the game passes them in
export function linkCityUniforms(u) { CITY = u && u.uInteriorGlow ? u : null; }
export function hasCityUniforms() { return !!CITY; }
/** 0 (day) … 1 (night) — follows the lighting presets' interior glow when linked */
export const nightNode = () => (CITY ? smoothstep(0.35, 1.3, CITY.uInteriorGlow) : LM.uNight);
const skyTop = () => (CITY && CITY.uSkyTopColor) || LM.uSkyTop;
const skyHorizon = () => (CITY && CITY.uSkyHorizonColor) || LM.uSkyHorizon;
const sunDir = () => (CITY && CITY.uSkySunDir) || LM.uSunDir;
const sunColor = () => (CITY && CITY.uSunColor) || LM.uSunColor;

// ---------------------------------------------------------------------------------------------------------------------
// TSL helpers
// ---------------------------------------------------------------------------------------------------------------------
export const hash2 = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));

/** horizontal facade coordinate (metres along the wall) for flat walls of any orientation */
function wallCoord() {
  const n = normalWorldGeometry;
  const hl = max(length(vec2(n.x, n.z)), 0.001);
  const u = positionWorld.x.mul(n.z.negate()).add(positionWorld.z.mul(n.x)).div(hl);
  const wall = float(1).sub(smoothstep(0.45, 0.8, abs(n.y)));
  return { u, wall, n };
}

/** anti-aliased "inside [0, edge]" for a distance-like coordinate */
const insideAA = (d, edge, coordForAA) => {
  const aa = fwidth(coordForAA).mul(0.75).add(0.01);
  return float(1).sub(smoothstep(float(edge).sub(aa), float(edge).add(aa), d));
};

// ---------------------------------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Stone (or brick) facade with a procedural window grid, optional gothic pointed heads, buttress ribs, string courses,
 * per-block colour variation, ground grime, lit windows at night and warm floodlighting.
 */
export function stoneMaterial(o = {}) {
  const {
    base = 0xd8cdb4, glass = 0x28313a, warm = 0xffc370, floodColor = 0xffd7a0,
    bay = 4, floorH = 5, sill = 1.3, winW = 1.6, winH = 2.8, arch = 0, y0 = 2.5, yMax = 1e5,
    litProb = 0.45, flood = 0.45, rough = 0.86, seed = 1, ribs = 0.1, courses = 0.16, windows = true,
    mullion = true, grime = 0.14, brick = false, var: variation = 0.07, floodFalloff = 60
  } = o;
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: rough, metalness: 0 });
  const { u, wall } = wallCoord();
  const v = positionWorld.y;
  const night = nightNode();
  const cell = vec2(u.div(bay), v.sub(y0).div(floorH));
  const id = floor(cell);
  const f = fract(cell);
  const wx = abs(f.x.sub(0.5)).mul(bay);
  const wy = f.y.mul(floorH);
  const top = sill + winH;
  let hw = float(winW * 0.5);
  if (arch > 0) hw = hw.mul(sqrt(clamp(float(top).sub(wy).div(arch), 0, 1)));
  let win = float(0);
  if (windows) {
    win = insideAA(wx, hw, u)
      .mul(smoothstep(sill - 0.05, sill + 0.05, wy)).mul(float(1).sub(smoothstep(top - 0.05, top + 0.05, wy)))
      .mul(step(y0, v)).mul(step(v, yMax)).mul(wall);
    if (mullion && winW > 1.1) win = win.mul(float(1).sub(insideAA(wx, 0.07, u)));
  }
  // masonry
  const blk = hash2(floor(vec2(u.div(brick ? 0.9 : 1.6), v.div(brick ? 0.3 : 0.7))).add(seed));
  let stone = color(base).mul(float(1 - variation).add(blk.mul(variation * 2)));
  const dEdge = min(f.x, float(1).sub(f.x)).mul(bay);
  const rib = insideAA(dEdge, 0.22, u).mul(wall);
  const dF = min(f.y, float(1).sub(f.y)).mul(floorH);
  const course = insideAA(dF, 0.14, v).mul(wall).mul(step(y0, v));
  stone = stone.mul(float(1).add(rib.mul(ribs))).mul(float(1).sub(course.mul(courses)));
  stone = stone.mul(mix(float(1 - grime), float(1), smoothstep(0, 14, v)));
  // weathering: broad cleaning / soiling patches and vertical soot & rain streaks washing down the stone, darker
  // under the string courses (London stone is never one clean flat colour)
  const fadeFine = float(1).sub(smoothstep(0.4, 1.5, fwidth(u.mul(0.8))));
  const patchN = noise2D(vec2(u.mul(0.045), v.mul(0.06)).add(seed * 3.7));
  const streakN = noise2D(vec2(u.mul(0.8), v.mul(0.03)).add(seed * 1.3));
  const soot = smoothstep(0.5, 0.85, streakN).mul(fadeFine).mul(0.22).add(smoothstep(0.55, 0.8, patchN).mul(0.12));
  const underCourse = smoothstep(0.14, 0.6, dF).mul(float(1).sub(smoothstep(0.6, 1.4, dF))).mul(step(f.y, 0.5)).mul(wall).mul(0.08);
  stone = stone.mul(mix(float(0.94), float(1.05), patchN)).mul(float(1).sub(soot.mul(wall))).mul(float(1).sub(underCourse.mul(step(y0, v))));
  if (brick) {
    const row = fract(v.div(0.075));
    const mortar = smoothstep(0.75, 0.95, row).mul(wall);
    stone = mix(stone, stone.mul(1.25), mortar.mul(0.5));
  }
  const glassCol = mix(color(glass), skyHorizon(), 0.18);
  mat.colorNode = mix(stone, glassCol, win);
  mat.roughnessNode = mix(float(rough), float(0.2), win);
  const lit = step(hash2(id.add(seed * 7.13)), litProb);
  const warmth = mix(float(0.75), float(1.25), hash2(id.add(seed * 3.1 + 17)));
  const winGlow = color(warm).mul(win).mul(lit).mul(warmth).mul(night).mul(1.7);
  const floodAmt = mix(float(1), float(0.55), smoothstep(0, floodFalloff, v));
  const floodGlow = stone.mul(color(floodColor)).mul(float(1).sub(win)).mul(night).mul(flood).mul(floodAmt);
  mat.emissiveNode = winGlow.add(floodGlow);
  return mat;
}

/** Plain material with optional night floodlight (emissive = colour × flood × night) */
export function plainMaterial(base, { rough = 0.8, metal = 0, flood = 0, floodColor = 0xffd7a0, side } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ color: base, roughness: rough, metalness: metal });
  if (side !== undefined) mat.side = side;
  // slate, lead & stone parts weather in patches (gilt and polished metal stay clean)
  if (rough >= 0.45 && metal <= 0.4) {
    const n = noise2D(positionWorld.xz.mul(0.35).add(positionWorld.y.mul(0.21)));
    const n2 = noise2D(vec2(positionWorld.x.add(positionWorld.z).mul(0.9), positionWorld.y.mul(0.08)));
    mat.colorNode = color(base).mul(mix(float(0.86), float(1.08), n)).mul(float(1).sub(smoothstep(0.6, 0.9, n2).mul(0.1)));
  }
  if (flood > 0) mat.emissiveNode = color(base).mul(color(floodColor)).mul(nightNode()).mul(flood);
  return mat;
}

/** Gilded metal (keeps a little warm glow at night so it reads under floodlights) */
export function goldMaterial(base = 0xd8a840, flood = 0.35) {
  const mat = new THREE.MeshStandardNodeMaterial({ color: base, roughness: 0.32, metalness: 0.85 });
  mat.emissiveNode = color(base).mul(nightNode().mul(flood).add(0.06));
  return mat;
}

/** Unlit glow: colour × mix(day, night) — lamps, LED strips, lit interiors */
export function glowMaterial(base, day = 0.2, nightI = 1.6, { transparent = false, opacity = 1, side } = {}) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent, opacity, depthWrite: !transparent });
  if (side !== undefined) mat.side = side;
  mat.colorNode = color(base).mul(mix(float(day), float(nightI), nightNode()));
  return mat;
}

/** Reflective curtain-wall glass with floor slabs, mullions and lit floors at night (fake sky reflection) */
export function glassMaterial(o = {}) {
  const {
    tint = 0x22303c, frame = 0x8a949c, floorH = 4, colW = 1.5, litProb = 0.55, warm = 0xfff0d8,
    reflectivity = 0.85, seed = 3, cylCenter = null, interiorDay = 0.0, spandrel = 0.9, nightGain = 1.0, unlit = 0.12
  } = o;
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.4, color: tint });
  const night = nightNode();
  const n = normalWorld;
  let u;
  if (cylCenter) {
    // angular coordinate around a vertical axis (curved towers)
    const dx = positionWorld.x.sub(cylCenter[0]);
    const dz = positionWorld.z.sub(cylCenter[1]);
    const r = length(vec2(dx, dz));
    u = r.mul(atan(dz, dx).add(Math.PI)); // approximate arc length
  } else {
    u = wallCoord().u;
  }
  const v = positionWorld.y;
  const fy = fract(v.div(floorH));
  const slab = insideAA(min(fy, float(1).sub(fy)).mul(floorH), 0.35 * spandrel, v);
  const fx = fract(u.div(colW));
  const mull = insideAA(min(fx, float(1).sub(fx)).mul(colW), 0.07, u);
  const frameMask = max(slab, mull);
  const view = normalize(positionWorld.sub(cameraPosition));
  const r = reflect(view, n);
  const sky = mix(skyHorizon(), skyTop(), clamp(r.y.mul(1.6).add(0.05), 0, 1));
  const groundRefl = mix(color(0x3a3d40), skyHorizon(), 0.25);
  const env = mix(groundRefl, sky, smoothstep(-0.15, 0.05, r.y));
  const fres = float(0.35).add(pow(float(1).sub(abs(dot(view, n))), 3).mul(0.65));
  const spec = pow(max(dot(r, sunDir()), 0), 120).mul(3.0);
  const dayK = float(1).sub(night.mul(0.82));
  const reflCol = env.mul(fres).mul(reflectivity).add(sunColor().mul(spec)).mul(dayK);
  const cellId = vec2(floor(u.div(colW * 3)), floor(v.div(floorH)));
  const lit = mix(float(unlit), float(1), step(hash2(cellId.add(seed)), litProb));
  const interior = color(warm).mul(lit).mul(mix(float(0.6), float(1.1), hash2(cellId.add(seed + 9.1))));
  const glassEmit = reflCol.add(interior.mul(night.mul(nightGain).add(interiorDay)));
  mat.colorNode = mix(color(tint), color(frame), frameMask);
  mat.emissiveNode = mix(glassEmit, color(frame).mul(night.mul(0.12)), frameMask);
  mat.roughnessNode = mix(float(0.1), float(0.5), frameMask);
  return mat;
}

// ---------------------------------------------------------------------------------------------------------------------
// Frames, geometry helpers, merging, colliders, zones
// ---------------------------------------------------------------------------------------------------------------------
/**
 * A landmark's local frame: origin (x, z) in world metres and a yaw theta (THREE rotation.y convention):
 * local +x → world (cos θ, −sin θ), local +z → world (sin θ, cos θ).
 * thetaFromAxes(dirX, dirZ) gives the θ whose local +z points along world (dirX, dirZ).
 */
export function thetaForLocalZ(dx, dz) { return Math.atan2(dx, dz); }
export function thetaForLocalX(dx, dz) { return Math.atan2(-dz, dx); }

export class LandmarkBuilder {
  constructor(id, frame, { y = 0 } = {}) {
    this.id = id;
    this.frame = { x: frame.x, z: frame.z, theta: frame.theta || 0, y };
    this.group = new THREE.Group();
    this.group.name = 'Landmark_' + id;
    this.group.position.set(frame.x, y, frame.z);
    this.group.rotation.y = this.frame.theta;
    this.static = new THREE.Group(); // merged at finish()
    this.group.add(this.static);
    this.colliders = [];
    this.zones = [];
    this.cs = Math.cos(this.frame.theta);
    this.sn = Math.sin(this.frame.theta);
  }
  toWorld(lx, lz) {
    return { x: this.frame.x + lx * this.cs + lz * this.sn, z: this.frame.z - lx * this.sn + lz * this.cs };
  }
  add(mesh, parent = this.static) { parent.add(mesh); return mesh; }
  /** box with its BOTTOM at y */
  box(mat, w, h, d, x, y, z, ry = 0, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    return this.add(m, parent);
  }
  /** cylinder / frustum with its bottom at y */
  cyl(mat, rTop, rBot, h, x, y, z, seg = 16, parent, open = false) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat);
    m.position.set(x, y + h / 2, z);
    return this.add(m, parent);
  }
  /** square pyramid w × d, height h, bottom at y */
  pyramid(mat, w, d, h, x, y, z, ry = 0, parent) {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    g.scale(w, h, d);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    return this.add(m, parent);
  }
  /** gabled roof: width w across x, ridge along z (length d), rise h, eaves at y */
  gable(mat, w, d, h, x, y, z, ry = 0, parent) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    return this.add(m, parent);
  }
  /** gothic pinnacle: square shaft + pyramid spirelet */
  pinnacle(shaftMat, capMat, s, h, x, y, z, parent) {
    this.box(shaftMat, s, h * 0.45, s, x, y, z, 0, parent);
    this.pyramid(capMat || shaftMat, s * 1.05, s * 1.05, h * 0.55, x, y + h * 0.45, z, 0, parent);
  }
  mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return this.add(m, parent);
  }
  /** OBB collider in local coords (centre lx, lz, half extents hx, hz, local yaw r) */
  collider(lx, lz, hx, hz, maxY, r = 0) {
    const c = this.toWorld(lx, lz);
    const th = this.frame.theta + r;
    const cs = Math.cos(th), sn = Math.sin(th);
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz;
    const ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    this.colliders.push({ minX: c.x - ex, maxX: c.x + ex, minZ: c.z - ez, maxZ: c.z + ez, maxY: maxY + this.frame.y, obb: { cx: c.x, cz: c.z, hx, hz, cs, sn } });
  }
  /** cylinder collider approximated by an octagon-ish square OBB pair */
  colliderRound(lx, lz, r, maxY) {
    this.collider(lx, lz, r * 0.92, r * 0.92, maxY, 0);
    this.collider(lx, lz, r * 0.92, r * 0.92, maxY, Math.PI / 4);
  }
  /** zone polygon given as local [[lx, lz], …] */
  zone(pts, id = this.id) {
    const w = pts.map(([lx, lz]) => this.toWorld(lx, lz));
    // GEO convention: CCW seen from above = negative shoelace sum over (x, z)
    let s = 0;
    for (let i = 0; i < w.length; i++) { const p = w[i], q = w[(i + 1) % w.length]; s += p.x * q.z - q.x * p.z; }
    if (s > 0) w.reverse();
    const a = new Float32Array(w.length * 2);
    w.forEach((p, i) => { a[i * 2] = p.x; a[i * 2 + 1] = p.z; });
    this.zones.push({ id, pts: a });
  }
  zoneRect(x0, z0, x1, z1, id) { this.zone([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], id); }
  zoneCircle(cx, cz, r, n = 16, id) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    this.zone(pts, id);
  }
  finish() {
    mergeByMaterial(this.static);
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = true; } });
    return this;
  }
}

/** Merge every non-instanced mesh below root into one mesh per material (coordinates relative to root). */
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep) return;
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(o);
  });
  const rel = new THREE.Matrix4();
  for (const [mat, meshes] of buckets) {
    const geos = [];
    for (const m of meshes) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      rel.multiplyMatrices(inv, m.matrixWorld);
      g.applyMatrix4(rel);
      geos.push(g);
      m.removeFromParent();
      m.geometry.dispose();
    }
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  // drop now-empty helper groups
  const empties = [];
  root.traverse((o) => { if (o !== root && !o.isMesh && o.children.length === 0) empties.push(o); });
  for (const e of empties) e.removeFromParent();
}

/** Tube along a polyline of THREE.Vector3 (local coords) */
export function tubeAlong(points, radius, radialSeg = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.0);
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 2), radius, radialSeg, closed);
}

/** A straight thin beam between two local points (box cross-section w × h) */
export function beamGeo(a, b, w, h = w) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.BoxGeometry(w, h, len);
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d, Math.abs(d.y) > 0.99 * len ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(m);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Canvas texture helper */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Union Flag canvas (2:1) */
export function unionFlagTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#012169'; g.fillRect(0, 0, w, h);
    g.lineCap = 'butt';
    g.strokeStyle = '#ffffff'; g.lineWidth = h * 0.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.strokeStyle = '#c8102e'; g.lineWidth = h * 0.066;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(w / 2 - h / 6, 0, h / 3, h); g.fillRect(0, h / 3, w, h / 3);
    g.fillStyle = '#c8102e'; g.fillRect(w / 2 - h / 10, 0, h / 5, h); g.fillRect(0, h * 0.4, w, h * 0.2);
  });
}

/** Waving flag material (vertex wave along local +x from the hoist) */
export function flagMaterial(tex, width = 6) {
  const mat = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
  return mat;
}

/** London time → clock hand angles */
const fmt = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }) : null;
export function londonTime(date = new Date()) {
  if (!fmt) return { h: date.getHours(), m: date.getMinutes(), s: date.getSeconds() };
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = +part.value;
  return { h: (p.hour || 0) % 24, m: p.minute || 0, s: p.second || 0 };
}
