// js/landmarks/piccadilly.js — Piccadilly Circus: the curved LED screen wrapped round the corner building on the
// north-west side (OSM way 153661809, the facade facing the circus) showing rotating invented ads, and the
// Shaftesbury Memorial Fountain with "Eros" (OSM way 583928480).
// Built in world coordinates (theta 0, origin at the fountain) because the screen follows the real facade polyline.
import * as THREE from 'three/webgpu';
import { Fn, color, float, vec2, uv, time, texture, floor, fract, mod, sin, abs, mix, smoothstep, step, clamp, max, min } from 'three/tsl';
import { LandmarkBuilder, plainMaterial, goldMaterial, glowMaterial, nightNode, canvasTexture } from './common.js';
import { erosFigure, place } from './figures.js';

const FOUNTAIN = { x: -448.2, z: -240.9 };
// facade of the corner building facing the circus (world x, z), east end → west end
const FACADE = [[-437.3, -300.3], [-442.9, -287.9], [-444.7, -284.1], [-447.0, -281.2], [-449.6, -280.0], [-452.7, -279.4], [-456.3, -279.5], [-459.5, -280.5], [-470.8, -285.4], [-480.3, -289.4]];
// full outline of that building (for sandboxes / debugging; the city renderer draws the building itself)
export const SCREEN_BUILDING = [[-437.3, -300.3], [-442.9, -287.9], [-444.7, -284.1], [-447, -281.2], [-449.6, -280], [-452.7, -279.4], [-456.3, -279.5], [-459.5, -280.5], [-470.8, -285.4], [-480.3, -289.4], [-478.3, -303.7], [-483, -304.2], [-482.3, -313.6], [-449.1, -318.1], [-449.4, -324.4], [-443.5, -324.9], [-445.3, -303.8]];
const SCREEN_Y0 = 6.2, SCREEN_Y1 = 19.5, SCREEN_OUT = 0.7;

// invented brands only
const ADS = [
  { bg: ['#e3122d', '#7a0618'], title: 'NOVA', sub: 'COLA', tag: 'taste the fizz', fg: '#ffffff', shape: 'bottle' },
  { bg: ['#0b1d4f', '#2e6cf6'], title: 'RideLDN', sub: '', tag: 'your ride in 3 min', fg: '#ffffff', shape: 'pin' },
  { bg: ['#ffd200', '#ff8a00'], title: 'KITE', sub: 'PHONE 9', tag: 'fly higher', fg: '#151515', shape: 'phone' },
  { bg: ['#101010', '#3a3a3a'], title: 'ZEPHYR', sub: 'RUNNERS', tag: 'run the city', fg: '#c8ff00', shape: 'swoosh' },
  { bg: ['#00a37a', '#00543e'], title: 'BRIXTON', sub: 'BEANS', tag: 'coffee since 1999', fg: '#fff6e0', shape: 'cup' },
  { bg: ['#6a1b9a', '#e040fb'], title: 'Lumen', sub: 'AIR', tag: 'fly to 200 cities', fg: '#ffffff', shape: 'plane' },
  { bg: ['#f5f5f5', '#c9d6df'], title: 'TEAPOT', sub: 'TEA', tag: 'a proper cuppa', fg: '#1d3557', shape: 'cup' },
  { bg: ['#ff4f81', '#ffb3c6'], title: 'FIZZBERRY', sub: '', tag: 'pop it', fg: '#ffffff', shape: 'bottle' }
];
const CELL_W = 256, CELL_H = 352;

function drawAd(g, ad, x0) {
  const w = CELL_W, h = CELL_H;
  const gr = g.createLinearGradient(x0, 0, x0 + w, h);
  gr.addColorStop(0, ad.bg[0]); gr.addColorStop(1, ad.bg[1]);
  g.fillStyle = gr; g.fillRect(x0, 0, w, h);
  g.save(); g.translate(x0 + w / 2, h * 0.36);
  g.fillStyle = ad.fg; g.strokeStyle = ad.fg; g.lineWidth = 8; g.globalAlpha = 0.9;
  if (ad.shape === 'bottle') { g.fillRect(-26, -40, 52, 110); g.fillRect(-12, -80, 24, 44); g.beginPath(); g.arc(0, -40, 26, Math.PI, 0); g.fill(); }
  if (ad.shape === 'pin') { g.beginPath(); g.arc(0, -10, 42, Math.PI, 0); g.lineTo(0, 70); g.closePath(); g.fill(); g.fillStyle = ad.bg[0]; g.beginPath(); g.arc(0, -10, 16, 0, Math.PI * 2); g.fill(); }
  if (ad.shape === 'phone') { g.strokeRect(-36, -70, 72, 140); g.fillRect(-26, -58, 52, 104); }
  if (ad.shape === 'swoosh') { g.beginPath(); g.moveTo(-80, 30); g.quadraticCurveTo(0, 60, 90, -50); g.quadraticCurveTo(-10, 20, -80, 30); g.fill(); }
  if (ad.shape === 'cup') { g.fillRect(-40, -30, 80, 80); g.beginPath(); g.arc(44, 10, 22, -Math.PI / 2, Math.PI / 2); g.stroke(); g.fillRect(-60, 52, 120, 10); }
  if (ad.shape === 'plane') { g.beginPath(); g.moveTo(-90, 10); g.lineTo(90, -10); g.lineTo(-10, 40); g.lineTo(-30, 80); g.lineTo(-40, 30); g.closePath(); g.fill(); }
  g.restore();
  g.globalAlpha = 1;
  g.fillStyle = ad.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${ad.title.length > 7 ? 44 : 60}px Arial, sans-serif`; g.fillText(ad.title, x0 + w / 2, h * 0.7);
  if (ad.sub) { g.font = '800 34px Arial, sans-serif'; g.fillText(ad.sub, x0 + w / 2, h * 0.81); }
  g.font = 'italic 600 20px Arial, sans-serif'; g.fillText(ad.tag, x0 + w / 2, h * 0.92);
}

function screenMaterial() {
  const tex = canvasTexture(CELL_W * ADS.length, CELL_H, (g) => ADS.forEach((ad, i) => drawAd(g, ad, i * CELL_W)));
  tex.generateMipmaps = true;
  const mat = new THREE.MeshBasicNodeMaterial();
  const night = nightNode();
  mat.colorNode = Fn(() => {
    const p = uv();
    const ZONES = 6.0;
    const zf = p.x.mul(ZONES);
    const zone = floor(zf);
    const lx = fract(zf);
    // every zone flips to the next ad on its own beat, with a vertical wipe
    const period = float(7.0);
    const tz = time.add(zone.mul(1.7));
    const slot = floor(tz.div(period));
    const phase = fract(tz.div(period));
    const wipe = step(p.y, smoothstep(0.0, 0.08, phase));
    const adA = mod(zone.mul(3.0).add(slot), ADS.length);
    const adB = mod(zone.mul(3.0).add(slot).sub(1.0), ADS.length);
    const ad = mix(adB, adA, wipe);
    const st = vec2(ad.add(lx.mul(0.96).add(0.02)).div(ADS.length), p.y);
    let c = texture(tex, st).rgb;
    // LED pixel grid + zone bezels + gentle scan shimmer
    const px = abs(sin(p.x.mul(1800.0))).mul(0.12).add(0.88);
    const py = abs(sin(p.y.mul(420.0))).mul(0.12).add(0.88);
    const bezel = smoothstep(0.0, 0.012, lx).mul(smoothstep(1.0, 0.988, lx));
    const shimmer = sin(p.x.mul(30.0).sub(time.mul(2.0))).mul(0.04).add(1.0);
    c = c.mul(px).mul(py).mul(bezel).mul(shimmer);
    return c.mul(mix(float(1.05), float(1.55), night));
  })();
  return mat;
}

/** smooth the facade polyline and push it outward (towards the circus) */
function screenPath() {
  const pts = FACADE.map(([x, z]) => new THREE.Vector2(x, z));
  const curve = new THREE.SplineCurve(pts);
  const N = 64;
  const raw = curve.getSpacedPoints(N);
  const out = [];
  for (let i = 0; i <= N; i++) {
    const a = raw[Math.max(0, i - 1)], b = raw[Math.min(N, i + 1)];
    const t = new THREE.Vector2().subVectors(b, a).normalize();
    let n = new THREE.Vector2(-t.y, t.x);
    const toF = new THREE.Vector2(FOUNTAIN.x - raw[i].x, FOUNTAIN.z - raw[i].y);
    if (n.dot(toF) < 0) n.negate();
    out.push({ p: raw[i].clone().addScaledVector(n, SCREEN_OUT), n });
  }
  return out;
}

export function buildPiccadillyCircus() {
  const L = new LandmarkBuilder('piccadillyCircus', { x: FOUNTAIN.x, z: FOUNTAIN.z, theta: 0 });
  const S = L.static;
  // ------------------------------------------------------------------ the curved screen (local = world − fountain)
  {
    const path = screenPath();
    let total = 0;
    const acc = [0];
    for (let i = 1; i < path.length; i++) { total += path[i].p.distanceTo(path[i - 1].p); acc.push(total); }
    const pos = [], nor = [], uvs = [], idx = [];
    const back = [], bnor = [], bidx = [];
    path.forEach(({ p, n }, i) => {
      const x = p.x - FOUNTAIN.x, z = p.y - FOUNTAIN.z;
      const u = 1 - acc[i] / total; // the path runs east → west; seen from the circus u must grow to the right
      pos.push(x, SCREEN_Y0, z, x, SCREEN_Y1, z);
      nor.push(n.x, 0, n.y, n.x, 0, n.y);
      uvs.push(u, 0, u, 1);
      back.push(x - n.x * 0.5, SCREEN_Y0 - 0.6, z - n.y * 0.5, x - n.x * 0.5, SCREEN_Y1 + 0.6, z - n.y * 0.5, x + n.x * 0.15, SCREEN_Y0 - 0.6, z + n.y * 0.15, x + n.x * 0.15, SCREEN_Y1 + 0.6, z + n.y * 0.15);
      bnor.push(n.x, 0, n.y, n.x, 0, n.y, n.x, 0, n.y, n.x, 0, n.y);
      if (i > 0) {
        const a = (i - 1) * 2, b = i * 2;
        // winding so the front faces the circus
        idx.push(a, b, a + 1, b, b + 1, a + 1);
        const A = (i - 1) * 4, B = i * 4;
        bidx.push(A + 2, B + 2, A + 3, B + 2, B + 3, A + 3); // bezel frame front (slightly proud, covered by screen)
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    // fix winding against the normal of the first quad
    {
      const p0 = new THREE.Vector3(pos[0], pos[1], pos[2]), p1 = new THREE.Vector3(pos[6], pos[7], pos[8]), p2 = new THREE.Vector3(pos[3], pos[4], pos[5]);
      const fn = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
      if (fn.x * nor[0] + fn.z * nor[2] < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); }
    }
    const screen = new THREE.Mesh(g, screenMaterial());
    screen.name = 'PiccadillyLights';
    screen.userData.keep = true; screen.userData.noShadow = true;
    L.group.add(screen);
    // dark cabinet behind the screen + top/bottom trims
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(back, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(bnor, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(back.length / 3 * 2), 2));
    const bi = [];
    for (let i = 1; i < path.length; i++) { const A = (i - 1) * 4, B = i * 4; bi.push(A, B, A + 1, B, B + 1, A + 1, A + 1, B + 1, A + 3, B + 1, B + 3, A + 3, A, A + 2, B, B, A + 2, B + 2); }
    bg.setIndex(bi);
    const cab = new THREE.Mesh(bg, plainMaterial(0x111316, { rough: 0.6, metal: 0.4, side: THREE.DoubleSide }));
    S.add(cab);
  }

  // ------------------------------------------------------------------ Shaftesbury Memorial Fountain + Eros
  {
    const bronze = new THREE.MeshStandardNodeMaterial({ color: 0x4d4634, roughness: 0.42, metalness: 0.8 });
    bronze.emissiveNode = color(0x6b5a3c).mul(nightNode()).mul(0.4);
    const alu = new THREE.MeshStandardNodeMaterial({ color: 0x8e9396, roughness: 0.35, metalness: 0.85 });
    alu.emissiveNode = color(0xb0b8c0).mul(nightNode()).mul(0.35);
    const step1 = plainMaterial(0x8a8478, { rough: 0.9, flood: 0.4 });
    const waterMat = new THREE.MeshStandardNodeMaterial({ color: 0x3b6772, roughness: 0.05, metalness: 0.3 });
    for (const [r, y, h] of [[3.9, 0, 0.3], [3.5, 0.3, 0.3], [3.1, 0.6, 0.3]]) L.cyl(step1, r, r, h, 0, y, 0, 8, S);
    L.cyl(bronze, 2.6, 2.2, 0.7, 0, 0.9, 0, 8, S); // octagonal basin
    const w = new THREE.CircleGeometry(2.4, 8); w.rotateX(-Math.PI / 2); L.mesh(w, waterMat, 0, 1.55, 0);
    L.cyl(bronze, 0.9, 1.25, 1.6, 0, 1.4, 0, 8, S);
    L.cyl(bronze, 1.5, 0.8, 0.5, 0, 3.0, 0, 8, S); // upper bowl
    L.cyl(bronze, 0.45, 0.7, 2.2, 0, 3.5, 0, 8, S);
    L.mesh(new THREE.SphereGeometry(0.7, 10, 8), bronze, 0, 6.0, 0);
    L.cyl(bronze, 0.32, 0.5, 0.6, 0, 6.4, 0, 8, S);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      L.mesh(new THREE.SphereGeometry(0.28, 6, 5), bronze, Math.cos(a) * 1.25, 2.9, Math.sin(a) * 1.25);
    }
    place(S, erosFigure(alu, 2.5), 0, 7.0, 0, Math.PI * 0.8);
    L.colliderRound(0, 0, 3.9, 9.5);
    L.zoneCircle(0, 0, 5, 12, 'piccadillyCircus');
  }
  L.finish();
  return { group: L.group, colliders: L.colliders, zones: L.zones, frame: L.frame };
}
