// js/city/road-index.js — a compact spatial index over road centreline segments for the city builders: nearest road
// (street-facing walls, ridge directions, furniture placement) and "is this point on another road's carriageway?"
// (cutting pavements and kerb-side markings at junction mouths). Allocation-free queries.

export class RoadIndex {
  /**
   * @param roads GEO.roads subset (array of road objects; ids are their GEO index `id`)
   * @param cell hash cell size (m)
   */
  constructor(roads, cell = 24) {
    this.roads = roads;
    let n = 0;
    for (const r of roads) n += r.pts.length / 2 - 1;
    const segR = new Uint32Array(n), segI = new Uint32Array(n);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, s = 0;
    roads.forEach((r, ri) => {
      const p = r.pts;
      for (let i = 0; i + 3 < p.length; i += 2, s++) { segR[s] = ri; segI[s] = i; }
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
      }
    });
    if (!n) { x0 = z0 = 0; x1 = z1 = 1; }
    this.minX = x0 - cell; this.minZ = z0 - cell;
    this.W = Math.ceil((x1 - x0) / cell) + 3; this.H = Math.ceil((z1 - z0) / cell) + 3;
    this.cell = cell;
    this.segR = segR; this.segI = segI; this.n = n;
    const W = this.W, H = this.H;
    const counts = new Uint32Array(W * H + 1);
    // every segment goes in the cells its bbox (grown by half its road's width + 1 m) covers
    const each = (fn) => {
      for (let k = 0; k < n; k++) {
        const r = roads[segR[k]], p = r.pts, i = segI[k], pad = r.w / 2 + 1;
        const a = Math.max(0, Math.floor((Math.min(p[i], p[i + 2]) - pad - this.minX) / cell));
        const b = Math.min(W - 1, Math.floor((Math.max(p[i], p[i + 2]) + pad - this.minX) / cell));
        const c = Math.max(0, Math.floor((Math.min(p[i + 1], p[i + 3]) - pad - this.minZ) / cell));
        const d = Math.min(H - 1, Math.floor((Math.max(p[i + 1], p[i + 3]) + pad - this.minZ) / cell));
        for (let cz = c; cz <= d; cz++) for (let cx = a; cx <= b; cx++) fn(cz * W + cx, k);
      }
    };
    each((c) => counts[c + 1]++);
    for (let i = 1; i <= W * H; i++) counts[i] += counts[i - 1];
    const items = new Uint32Array(counts[W * H]);
    const fill = counts.slice(0, W * H);
    each((c, k) => { items[fill[c]++] = k; });
    this.start = counts; this.items = items;
    this.hit = { road: null, ri: -1, seg: -1, x: 0, z: 0, dist: 0, dx: 0, dz: 0, t: 0 };
    this._stamp = new Uint32Array(n);
    this._gen = 0;
  }

  /**
   * nearest centreline point within maxDist (optionally `skip(road, ri)` -> true to ignore). Returns the shared
   * `this.hit` object (copy what you need) or null. dx/dz = unit direction of the segment.
   */
  nearest(x, z, maxDist, skip = null) {
    const cell = this.cell, W = this.W, H = this.H;
    const c0x = Math.floor((x - this.minX) / cell), c0z = Math.floor((z - this.minZ) / cell);
    const rr = Math.ceil(maxDist / cell);
    let bd2 = maxDist * maxDist, best = -1, bt = 0;
    const gen = ++this._gen;
    if (gen === 0xffffffff) { this._stamp.fill(0); this._gen = 1; }
    for (let cz = Math.max(0, c0z - rr); cz <= Math.min(H - 1, c0z + rr); cz++) {
      for (let cx = Math.max(0, c0x - rr); cx <= Math.min(W - 1, c0x + rr); cx++) {
        const c = cz * W + cx;
        for (let k = this.start[c], e = this.start[c + 1]; k < e; k++) {
          const s = this.items[k];
          if (this._stamp[s] === this._gen) continue;
          this._stamp[s] = this._gen;
          const ri = this.segR[s], r = this.roads[ri];
          if (skip && skip(r, ri)) continue;
          const p = r.pts, i = this.segI[s];
          const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az;
          const L2 = dx * dx + dz * dz;
          let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t - x, qz = az + dz * t - z, d2 = qx * qx + qz * qz;
          if (d2 < bd2) { bd2 = d2; best = s; bt = t; }
        }
      }
    }
    if (best < 0) return null;
    const ri = this.segR[best], r = this.roads[ri], p = r.pts, i = this.segI[best];
    const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz) || 1;
    const h = this.hit;
    h.road = r; h.ri = ri; h.seg = best; h.t = bt;
    h.x = p[i] + dx * bt; h.z = p[i + 1] + dz * bt; h.dist = Math.sqrt(bd2); h.dx = dx / L; h.dz = dz / L;
    return h;
  }

  /**
   * is (x, z) on the carriageway of some road (within road.w/2 + margin of its centreline), other than `exclude`
   * (a road object)? Returns that road or null.
   */
  onCarriageway(x, z, exclude = null, margin = 0) {
    const cell = this.cell;
    const cx = Math.floor((x - this.minX) / cell), cz = Math.floor((z - this.minZ) / cell);
    if (cx < 0 || cz < 0 || cx >= this.W || cz >= this.H) return null;
    const c = cz * this.W + cx;
    for (let k = this.start[c], e = this.start[c + 1]; k < e; k++) {
      const s = this.items[k];
      const r = this.roads[this.segR[s]];
      if (r === exclude) continue;
      const p = r.pts, i = this.segI[s];
      const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x, qz = az + dz * t - z;
      const hw = r.w / 2 + margin;
      if (qx * qx + qz * qz < hw * hw) return r;
    }
    return null;
  }
}
