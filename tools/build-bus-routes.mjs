// tools/build-bus-routes.mjs — bakes data/ldn-bus-routes.json: real London bus routes (OSM route=bus relations)
// clipped to the play area, with ordered stops and a drivable path on the game's road network (js/road-network.js).
//
//   node --max-old-space-size=12000 tools/build-bus-routes.mjs            (≈1–2 min; caches the OSM pass)
//   ALL=1 node tools/build-bus-routes.mjs        → also prints every candidate route (ref, in-area km, stops)
//   FRESH=1 …                                    → ignore tools/out/bus-relations.json and re-read osm_central.json
//
// Phase 1 (osm_central.json, 180 MB): every type=route route=bus relation → ordered stop list (PTv2 platform/stop nodes)
//   + the chained way geometry (the real path the bus takes). Cached in tools/out/bus-relations.json.
// Phase 2 (GEO + road network): keep the longest run of stops inside the play area, then route stop → stop along the
//   game's left-hand kerb lanes (network.route with the OSM heading at each stop). Where the shortest legal route
//   strays from the real one (> 25 % longer, or misses the OSM path), it's re-routed through via-points sampled from
//   the OSM path. The result is the polyline the player drives and the GPS ribbon shows.
// Output shape: see INTEGRATION.md "Round 2 — B".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toWorld, WORLD_BOUNDS } from '../js/geo-frame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OSM = path.join(ROOT, 'tools/data/osm_central.json');
const CACHE = path.join(ROOT, 'tools/out/bus-relations.json');
const OUT = path.join(ROOT, 'data/ldn-bus-routes.json');
const log = (...a) => console.log('[bus-routes]', ...a);

// Curated well-known routes, in picker order. Only those found in the data with enough length in the area are baked.
const CURATED = ['9', '11', '12', '15', '24', '38', '73', '88', '139', '159', '453', '23', '25', '390', '14', '19', '22', '36', '148', '211', '3', '87', '26', '76'];
const MAX_ROUTES = 16;
const MIN_LEN = 2500;      // m of path inside the area (per direction)
const MIN_STOPS = 8;
const INSET = 120;         // stops must be this far inside WORLD_BOUNDS

// ---------------------------------------------------------------------------------------------------------------------
// Phase 1: OSM relations
function phase1() {
  if (!process.env.FRESH && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  log('reading', OSM);
  const t0 = Date.now();
  const d = JSON.parse(fs.readFileSync(OSM, 'utf8'));
  const nodes = new Map(), ways = new Map(), rels = [];
  for (const e of d.elements) {
    if (e.type === 'node') nodes.set(e.id, e);
    else if (e.type === 'way') ways.set(e.id, e);
    else if (e.tags?.type === 'route' && e.tags.route === 'bus') rels.push(e);
  }
  log(`parsed in ${Date.now() - t0} ms: ${rels.length} bus relations`);
  const out = [];
  for (const r of rels) {
    const t = r.tags;
    const stops = [];
    for (const m of r.members) {
      if (m.type !== 'node' || !/^(stop|platform)/.test(m.role || '')) continue;
      const n = nodes.get(m.ref);
      if (!n) { stops.push(null); continue; }
      const p = toWorld(n.lat, n.lon);
      stops.push({ id: n.id, role: m.role.startsWith('platform') ? 'platform' : 'stop', name: n.tags?.name || '',
        code: n.tags?.local_ref || n.tags?.['naptan:Indicator'] || '', x: +p.x.toFixed(1), z: +p.z.toFixed(1),
        hw: n.tags?.highway === 'bus_stop' ? 1 : 0 });
    }
    const wayList = [];
    for (const m of r.members) {
      if (m.type !== 'way') continue;
      const w = ways.get(m.ref);
      if (!w || (m.role && !/^(forward|backward|)$/.test(m.role))) { wayList.push(null); continue; }
      if (w.tags?.public_transport === 'platform' || w.tags?.highway === 'platform') continue;
      wayList.push((w.geometry || []).map((g) => (g ? (({ x, z }) => [+x.toFixed(1), +z.toFixed(1)])(toWorld(g.lat, g.lon)) : null)));
    }
    out.push({ id: r.id, ref: t.ref || '', name: t.name || '', from: t.from || '', to: t.to || '', via: t.via || '',
      network: t.network || '', stops, ways: wayList });
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(out));
  log(`cached ${out.length} relations → ${path.relative(ROOT, CACHE)}`);
  return out;
}

// chain way members into polylines (breaks at gaps / null geometry); returns [[x,z,…], …]
function chainWays(ways) {
  const runs = [];
  let cur = null;
  const near = (a, b) => a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 3;
  const pieces = ways.map((w) => {
    if (!w) return null;
    // split a way at null entries, keep the longest valid piece
    const segs = [];
    let s = [];
    for (const p of w) { if (p) s.push(p); else { if (s.length > 1) segs.push(s); s = []; } }
    if (s.length > 1) segs.push(s);
    return segs.length ? segs.reduce((a, b) => (b.length > a.length ? b : a)) : null;
  });
  for (let i = 0; i < pieces.length; i++) {
    let g = pieces[i];
    if (!g) { cur = null; continue; }
    if (cur) {
      const end = cur[cur.length - 1];
      if (near(end, g[0])) { /* ok */ } else if (near(end, g[g.length - 1])) g = g.slice().reverse();
      else if (cur.length === pieces[i - 1]?.length && (near(cur[0], g[0]) || near(cur[0], g[g.length - 1]))) {
        // the first way of the run was oriented wrong: flip it
        cur.reverse();
        if (near(cur[cur.length - 1], g[g.length - 1])) g = g.slice().reverse();
      } else { cur = null; }
    }
    if (!cur) { cur = g.slice(); runs.push(cur); continue; }
    for (let k = 1; k < g.length; k++) cur.push(g[k]);
  }
  // first piece of each run: orient by the next piece (handled above for 2+ pieces)
  return runs.filter((r) => r.length > 1);
}

const inside = (x, z, m = INSET) => x > WORLD_BOUNDS.minX + m && x < WORLD_BOUNDS.maxX - m && z > WORLD_BOUNDS.minZ + m && z < WORLD_BOUNDS.maxZ - m;

/** merge stop_position + platform members of the same physical stop; returns ordered [{name, code, px, pz, sx?, sz?}] */
function mergeStops(stops) {
  const out = [];
  for (const s of stops) {
    if (!s) { out.push(null); continue; }
    const last = out[out.length - 1];
    if (last && (last.name === s.name || !s.name || !last.name) && Math.hypot(last.ax - s.x, last.az - s.z) < 60 && !last[s.role]) {
      last[s.role] = s;
      if (!last.name) last.name = s.name;
      if (!last.code) last.code = s.code;
      continue;
    }
    out.push({ name: s.name, code: s.code, ax: s.x, az: s.z, [s.role]: s });
  }
  return out;
}

// polyline helpers (flat [x,z,…])
function cumLen(p) {
  const c = [0];
  for (let i = 2; i < p.length; i += 2) c.push(c[c.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  return c;
}
function project(p, cum, x, z, sMin = 0) {
  let best = { d: Infinity, s: 0, i: 0 };
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (cum[i / 2 + 1] < sMin) continue;
    const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best.d - 0.01) best = { d, s: cum[i / 2] + t * Math.sqrt(L2), i: i / 2 };
  }
  return best;
}
function pointAt(p, cum, s) {
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  const L = cum[i + 1] - cum[i] || 1, t = Math.max(0, Math.min(1, (s - cum[i]) / L));
  const dx = p[2 * i + 2] - p[2 * i], dz = p[2 * i + 3] - p[2 * i + 1];
  return { x: p[2 * i] + dx * t, z: p[2 * i + 1] + dz * t, h: Math.atan2(dx, dz) };
}

// ---------------------------------------------------------------------------------------------------------------------
async function main() {
  const rels = phase1();
  const { GEO } = await import('../js/ldn-geodata.js');
  const { createWorldQueries } = await import('../js/london-world.js');
  const { buildLondonRoadNetwork } = await import('../js/road-network.js');
  const world = createWorldQueries(GEO);
  const t0 = Date.now();
  const network = buildLondonRoadNetwork(GEO, world);
  log(`road network: ${network.links.length} links in ${Date.now() - t0} ms`);

  // GEO.busStops (the city's shelters/flags) for snapping the pavement point
  const BS = GEO.busStops;
  const nearestGeoStop = (x, z, r = 25) => {
    let b = null, bd = r;
    for (let i = 0; i < BS.length; i += 2) { const d = Math.hypot(BS[i] - x, BS[i + 1] - z); if (d < bd) { bd = d; b = { x: BS[i], z: BS[i + 1], i: i / 2 }; } }
    return b;
  };

  const candidates = [];
  for (const r of rels) {
    if (!r.ref || /^N/i.test(r.ref) || r.network && !/London Buses/i.test(r.network)) continue;
    const runs = chainWays(r.ways);
    if (!runs.length) continue;
    // OSM path: the longest chained run (flattened)
    const run = runs.reduce((a, b) => (b.length > a.length ? b : a));
    const osm = run.flat();
    const ocum = cumLen(osm);
    // stops: longest contiguous run inside the area
    const merged = mergeStops(r.stops);
    let best = [], cur = [];
    for (const s of merged) {
      const ok = s && s.name && inside(s.ax, s.az);
      if (ok) cur.push(s); else { if (cur.length > best.length) best = cur; cur = []; }
    }
    if (cur.length > best.length) best = cur;
    if (best.length < MIN_STOPS) continue;
    // order check + OSM s of each stop
    let sPrev = 0, okOrder = 0;
    for (const s of best) {
      const q = project(osm, ocum, s.stop?.x ?? s.platform.x, s.stop?.z ?? s.platform.z, Math.max(0, sPrev - 40));
      s.os = q.s; s.od = q.d;
      if (q.s >= sPrev - 5) okOrder++;
      sPrev = Math.max(sPrev, q.s);
    }
    const onPath = best.filter((s) => s.od < 40).length;
    const span = best[best.length - 1].os - best[0].os;
    candidates.push({ r, osm, ocum, stops: best, span, quality: onPath / best.length, order: okOrder / best.length });
  }
  if (process.env.ALL) {
    for (const c of candidates.sort((a, b) => a.r.ref.localeCompare(b.r.ref, 'en', { numeric: true })))
      log(`${c.r.ref.padEnd(5)} ${(c.span / 1000).toFixed(1).padStart(5)} km ${String(c.stops.length).padStart(3)} stops q=${c.quality.toFixed(2)} o=${c.order.toFixed(2)}  ${c.r.from} → ${c.r.to}`);
  }

  // choose routes: curated order first, then the longest remaining, both directions required
  const byRef = new Map();
  for (const c of candidates) {
    if (c.quality < 0.8 || c.order < 0.85 || c.span < MIN_LEN) continue;
    (byRef.get(c.r.ref) || byRef.set(c.r.ref, []).get(c.r.ref)).push(c);
  }
  const refs = [...byRef.keys()].filter((k) => byRef.get(k).length >= 2);
  const pick = CURATED.filter((k) => refs.includes(k));
  const rest = refs.filter((k) => !pick.includes(k) && /^\d+$/.test(k))
    .sort((a, b) => Math.max(...byRef.get(b).map((c) => c.span)) - Math.max(...byRef.get(a).map((c) => c.span)));
  const chosen = [...pick, ...rest].slice(0, MAX_ROUTES);
  log('chosen:', chosen.join(' '));

  const routes = [];
  for (const ref of chosen) {
    // two directions: the two longest variants that run in opposite directions
    const vs = byRef.get(ref).sort((a, b) => b.span - a.span);
    const a = vs[0];
    const b = vs.find((v) => v !== a && v.r.to !== a.r.to) || vs[1];
    const dirs = [a, b];
    const built = [];
    for (const c of dirs) {
      const res = buildVariant(c, network, nearestGeoStop);
      if (res) built.push(res);
    }
    if (built.length < 2) { log(`route ${ref}: skipped (only ${built.length} direction built)`); continue; }
    built.forEach((v, i) => { v.dir = i; });
    routes.push({ ref, variants: built });
  }

  const outJson = {
    v: 1,
    generated: new Date().toISOString().slice(0, 10),
    source: 'OpenStreetMap contributors (ODbL), route=bus relations, Geofabrik Greater London 2026-10-20',
    note: 'paths follow the game road network kerb lanes (drive on the left); stop.s = metres along path',
    routes
  };
  fs.writeFileSync(OUT, JSON.stringify(outJson));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  log(`wrote ${path.relative(ROOT, OUT)} (${kb} KB): ${routes.length} routes`);
  for (const r of routes) for (const v of r.variants)
    log(`  ${r.ref.padEnd(4)} dir${v.dir} ${v.from} → ${v.to} [${v.destination}] ${v.stops.length} stops, ${(v.length / 1000).toFixed(2)} km, detours fixed ${v._fixed}, max dev ${v._maxDev} m`);
  for (const r of routes) for (const v of r.variants) { delete v._fixed; delete v._maxDev; }
  fs.writeFileSync(OUT, JSON.stringify(outJson));
}

/** route one variant along the network; returns the baked variant or null */
function buildVariant(c, network, nearestGeoStop) {
  const { r, osm, ocum, stops } = c;
  const pts = [];                 // flat path
  const outStops = [];
  let fixed = 0, maxDev = 0;
  const push = (P, skipFirst) => { for (let i = skipFirst ? 2 : 0; i < P.length; i += 2) pts.push(+P[i].toFixed(1), +P[i + 1].toFixed(1)); };
  // the bay point (on the road) for each stop: stop_position if present, else the platform; heading from the OSM path
  const bay = stops.map((s) => {
    const x = s.stop?.x ?? s.platform.x, z = s.stop?.z ?? s.platform.z;
    const h = pointAt(osm, ocum, Math.min(s.os + 2, ocum[ocum.length - 1])).h;
    return { x, z, h };
  });
  // deviation of a candidate segment from the OSM path between s0 and s1
  const dev = (P, s0, s1) => {
    let m = 0;
    for (let i = 0; i < P.length; i += 8) {
      const q = project(osm, ocum, P[i], P[i + 1], Math.max(0, s0 - 80));
      if (q.s > s1 + 120) { m = Math.max(m, q.d); continue; }
      m = Math.max(m, q.d);
    }
    return m;
  };
  // pre-snap every bay onto the kerb lane running the bus's way (route() snaps its target without a heading, so a
  // point exactly on the right lane is what makes it pick that lane and not the opposite carriageway)
  const snap = (q) => {
    const n = network.nearestLane(q.x, q.z, { heading: q.h, maxDist: 45, filter: (ln) => ln.index === 0 });
    if (!n) return null;
    const dx = n.lane.pts, i = Math.min(Math.floor(n.s), n.lane.len - 0.1);
    void dx; void i;
    // reject lanes pointing the wrong way
    const P = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
    network.pointAt(n.lane, n.s, P);
    const dot = P.dx * Math.sin(q.h) + P.dz * Math.cos(q.h);
    if (dot < 0.3) return null;
    return { x: n.x, z: n.z, h: Math.atan2(P.dx, P.dz) };
  };
  const tryLeg = (A, k0, k1) => {
    const B = snap(bay[k1]);
    if (!B) return null;
    const osmLen = Math.max(1, stops[k1].os - stops[k0].os);
    let rt = network.route(A, B, { heading: A.h });
    let d = rt ? dev(rt.points, stops[k0].os, stops[k1].os) : Infinity;
    let usedVia = false;
    if (!rt || rt.length > osmLen * 1.25 + 80 || d > 35) {
      const n = Math.max(1, Math.round(osmLen / 150));
      const P = [];
      let from = A, okAll = true, L = 0;
      for (let j = 1; j <= n; j++) {
        const q = j === n ? B : snap(pointAt(osm, ocum, stops[k0].os + osmLen * j / n));
        if (!q) continue;
        const seg = network.route(from, q, { heading: from.h });
        if (!seg) { okAll = false; break; }
        if (P.length) for (let i = 2; i < seg.points.length; i++) P.push(seg.points[i]); else P.push(...seg.points);
        L += seg.length;
        const e = seg.points.length;
        from = { x: seg.points[e - 2], z: seg.points[e - 1], h: Math.atan2(seg.points[e - 2] - seg.points[e - 4], seg.points[e - 1] - seg.points[e - 3]) };
      }
      if (okAll && P.length >= 4) {
        const d2 = dev(P, stops[k0].os, stops[k1].os);
        if (!rt || d2 < d || (L < rt.length * 1.5 && d2 < 35)) { rt = { points: P, length: L }; d = d2; usedVia = true; }
      }
    }
    if (!rt || rt.points.length < 4) return null;
    if (rt.length > osmLen * 1.8 + 250) return null;
    return { rt, d, usedVia };
  };
  let cur = snap(bay[0]);
  if (!cur) return null;
  let k = 0;
  const kept = [0];
  let firstDone = false;
  while (k + 1 < stops.length) {
    let leg = null, k1 = k + 1;
    for (; k1 < Math.min(stops.length, k + 4); k1++) { leg = tryLeg(cur, k, k1); if (leg) break; }
    if (!leg) {
      if (outStops.length < 4) {   // a bad start (bus station stands, stops off the network): restart further on
        log(`  ${r.ref} → ${r.to}: restart after stop ${k} (${stops[k].name})`);
        pts.length = 0; outStops.length = 0; firstDone = false; k++;
        cur = snap(bay[k]);
        while (!cur && k + 1 < stops.length) cur = snap(bay[++k]);
        if (!cur) return null;
        stops.splice(0, k); bay.splice(0, k); k = 0;
        continue;
      }
      log(`  ${r.ref} → ${r.to}: no good leg after stop ${k} (${stops[k].name}) — cut`); break;
    }
    if (leg.d > 60) log(`  ${r.ref} → ${r.to}: leg ${stops[k].name} → ${stops[k1].name} dev ${leg.d | 0} m, ${leg.rt.length | 0} m vs osm ${(stops[k1].os - stops[k].os) | 0}${leg.usedVia ? ' (via)' : ''}`);
    if (k1 > k + 1) log(`  ${r.ref} → ${r.to}: skipped ${k1 - k - 1} stop(s) after ${stops[k].name}`);
    const P = leg.rt.points;
    if (leg.usedVia) fixed++;
    maxDev = Math.max(maxDev, leg.d);
    if (!firstDone) { outStops.push(makeStop(stops[0], P[0], P[1], Math.atan2(P[2] - P[0], P[3] - P[1]), 0, nearestGeoStop)); push(P, false); firstDone = true; }
    else push(P, true);
    const e = P.length;
    cur = { x: P[e - 2], z: P[e - 1], h: Math.atan2(P[e - 2] - P[e - 4], P[e - 1] - P[e - 3]) };
    outStops.push(makeStop(stops[k1], cur.x, cur.z, cur.h, 0, nearestGeoStop));
    kept.push(k1);
    k = k1;
  }
  // de-duplicate consecutive identical points
  const clean = [];
  for (let i = 0; i < pts.length; i += 2) {
    const n = clean.length;
    if (n && Math.hypot(clean[n - 2] - pts[i], clean[n - 1] - pts[i + 1]) < 0.3) continue;
    clean.push(pts[i], pts[i + 1]);
  }
  const simp = simplify(clean, 0.2);
  clean.length = 0; clean.push(...simp);
  const cum = cumLen(clean);
  // recompute stop s on the cleaned path (monotone)
  let sMin = 0;
  for (const s of outStops) {
    const q = project(clean, cum, s.bx, s.bz, sMin);
    s.s = Math.round(q.s); sMin = q.s;
    const a = pointAt(clean, cum, Math.max(0, q.s - 3)), b = pointAt(clean, cum, Math.min(cum[cum.length - 1], q.s + 3));
    const h = Math.atan2(b.x - a.x, b.z - a.z);
    s.h = +h.toFixed(3);
    const lat = (s.x - s.bx) * Math.cos(h) - (s.z - s.bz) * Math.sin(h);
    s.side = lat >= -0.5 ? 'L' : 'R';
  }
  const length = cum[cum.length - 1];
  if (length < MIN_LEN || outStops.length < MIN_STOPS) return null;
  const destination = shortDest(r.to);
  return {
    id: `${r.ref}-${r.id}`, osm: r.id, from: tidy(r.from), to: tidy(r.to), via: r.via || '', destination,
    firstStop: outStops[0].name, lastStop: outStops[outStops.length - 1].name,
    length: Math.round(length), stops: outStops, path: clean, _fixed: fixed, _maxDev: Math.round(maxDev)
  };
}

function makeStop(s, bx, bz, h, sAlong, nearestGeoStop) {
  const p = s.platform || s.stop;
  // pavement point: the platform node (it's what GEO.busStops / the city's shelter uses), else 3.5 m left of the bay
  let px = p.x, pz = p.z;
  if (!s.platform) { px = bx + Math.cos(h) * 3.5; pz = bz - Math.sin(h) * 3.5; }
  const g = nearestGeoStop(px, pz, 12);
  if (g) { px = g.x; pz = g.z; }
  const lat = (px - bx) * Math.cos(h) - (pz - bz) * Math.sin(h);   // + = left of the direction of travel
  return { name: tidy(s.name), code: s.code || '', x: +px.toFixed(1), z: +pz.toFixed(1), bx: +bx.toFixed(1), bz: +bz.toFixed(1),
    h: +h.toFixed(3), side: lat >= -0.5 ? 'L' : 'R', s: Math.round(sAlong) };
}
const tidy = (n) => (n || '').replace(/\s+/g, ' ').replace(/ Bus Station$/i, ' Bus Stn').trim();
/** destination-blind text: the part before " / " or ",", e.g. "Aldwych / Drury Lane" → "Aldwych" */
function shortDest(to) {
  let d = (to || '').split(/\s*[\/,]\s*/)[0].replace(/\s*\(.*?\)\s*/g, ' ').trim();
  d = d.replace(/ (Bus Station|Bus Garage|Interchange|Station|Garage|Roundabout)$/i, '').trim();
  while (d.length > 20 && d.includes(' ')) d = d.slice(0, d.lastIndexOf(' '));
  return d;
}
/** Douglas-Peucker on a flat [x,z,…] polyline */
function simplify(p, tol) {
  const n = p.length / 2;
  if (n < 3) return p.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = p[2 * a], az = p[2 * a + 1], dx = p[2 * b] - ax, dz = p[2 * b + 1] - az, L = Math.hypot(dx, dz) || 1e-9;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[2 * i] - ax) * dz - (p[2 * i + 1] - az) * dx) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
