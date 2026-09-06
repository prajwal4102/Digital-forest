// THE LOGICAL FOREST
// ------------------
// The visual forest and the navigable forest are deliberately separate. The
// animals never look at pixels; they read this grid. It is built from the
// real world positions of the trees, rocks and bushes that the scene already
// records, so the map can never drift out of sync with what is on screen.
//
//   BLOCKED  — a trunk, a rock, a bush, or outside the frame
//   OPEN     — walkable clearing
//   INTEREST — walkable, and worth going to look at

import * as THREE from './vendor/three.module.js';

export const BLOCKED = 0;
export const OPEN = 1;
export const INTEREST = 2;

// A tiny binary heap so pathfinding never hitches on a busy frame.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, f) {
    this.a.push({ node, f });
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p].f <= this.a[i].f) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  pop() {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.a.length && this.a[l].f < this.a[m].f) m = l;
        if (r < this.a.length && this.a[r].f < this.a[m].f) m = r;
        if (m === i) break;
        [this.a[m], this.a[i]] = [this.a[i], this.a[m]];
        i = m;
      }
    }
    return top.node;
  }
}

export class ForestMap {
  constructor({
    cellSize = 0.4,
    zMin = -9,        // back edge of the VISIBLE stage
    zMax = 8,
    xCap = 10,        // widest the visible stage gets
    halfWidth,        // (z) => half the frame width in world units at that depth
    groundHeight,     // (x, z) => terrain height
    edgeMargin = 0.88, // keep this far inside the frame edge
    worldRadius = 0,  // > 0: the jungle is a circle this big, and the screen
    worldCz = -4,     //      shows only a chord of it (centre at x=0, z=worldCz)
  }) {
    this.cell = cellSize;
    this.stageZMin = zMin;
    this.zMax = zMax;
    this.xCap = xCap;
    this.halfWidth = halfWidth;
    this.groundHeight = groundHeight;
    this.edgeMargin = edgeMargin;
    this.worldRadius = worldRadius;
    this.worldCz = worldCz;
    // the grid covers the whole world; without a world circle it covers the stage
    this.zMin = worldRadius > 0 ? Math.min(zMin, worldCz - worldRadius) : zMin;
    this.xSpan = worldRadius > 0 ? Math.max(xCap, worldRadius) : xCap;
    this.nx = Math.ceil((this.xSpan * 2) / cellSize);
    this.nz = Math.ceil((zMax - this.zMin) / cellSize);
    this.grid = new Uint8Array(this.nx * this.nz);
    this.interests = [];
  }

  // ---------- coordinates ----------
  at(ix, iz) { return this.grid[iz * this.nx + ix]; }
  set(ix, iz, v) { this.grid[iz * this.nx + ix] = v; }
  inBounds(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz; }
  cellX(ix) { return -this.xSpan + (ix + 0.5) * this.cell; }
  cellZ(iz) { return this.zMin + (iz + 0.5) * this.cell; }
  toCell(x, z) {
    return [
      Math.floor((x + this.xSpan) / this.cell),
      Math.floor((z - this.zMin) / this.cell),
    ];
  }

  // ---------- stage vs. the hidden jungle ----------
  // The audience sees a chord of the circle: this trapezoid. Everything else
  // is real, walkable forest that just happens to be out of shot.
  stageLim(z) { return Math.min(this.xCap, this.halfWidth(z) * this.edgeMargin); }
  onStage(x, z, margin = 0) {
    return z >= this.stageZMin - margin && z <= this.zMax
      && Math.abs(x) <= this.stageLim(z) + margin;
  }

  // a random walkable spot the camera cannot see; `side` (+1/-1) prefers the
  // wing on that x side (the deep back counts for either side)
  randomHidden(side = 0) {
    for (let tries = 0; tries < 80; tries++) {
      const ix = Math.floor(Math.random() * this.nx);
      const iz = Math.floor(Math.random() * this.nz);
      if (this.at(ix, iz) === BLOCKED) continue;
      const x = this.cellX(ix), z = this.cellZ(iz);
      if (this.onStage(x, z, 1.2)) continue; // fully out of shot, with margin
      if (side && !(x * side > 1.5 || z < this.stageZMin - 3)) continue;
      return { x, z };
    }
    return null;
  }

  // ---------- construction ----------
  // obstacles / interests: [{ x, z, r }]. agentRadius fattens every obstacle so
  // the animal's body clears it, rather than its centre point squeaking past.
  build(obstacles, interests = [], agentRadius = 0.3) {
    this.grid.fill(OPEN);
    this.interests = [];

    if (this.worldRadius > 0) {
      // The jungle is a circle; the screen shows a chord of it. Walkable is
      // everything inside the circle up to the front chord (zMax) — an animal
      // is free to stroll out of shot through the side trees and come back in
      // from the other wing.
      const R = this.worldRadius - agentRadius;
      const R2 = R * R;
      for (let iz = 0; iz < this.nz; iz++) {
        const z = this.cellZ(iz);
        const dz = z - this.worldCz;
        for (let ix = 0; ix < this.nx; ix++) {
          const x = this.cellX(ix);
          if (x * x + dz * dz > R2) this.set(ix, iz, BLOCKED);
        }
      }
    } else {
      // No world circle: anything outside the visible frame is not walkable.
      // Pull the limit in by the agent's own radius too — the frame narrows
      // toward the camera, and an animal hugging that diagonal would otherwise
      // be forever half outside it.
      for (let iz = 0; iz < this.nz; iz++) {
        const z = this.cellZ(iz);
        const lim = this.stageLim(z) - agentRadius;
        for (let ix = 0; ix < this.nx; ix++) {
          if (Math.abs(this.cellX(ix)) > lim) this.set(ix, iz, BLOCKED);
        }
      }
    }

    for (const o of obstacles) this.stamp(o.x, o.z, (o.r || 0.5) + agentRadius, BLOCKED);

    // Interest points hang off things that are themselves solid — a bush, a
    // rock — so the centre cell is blocked by design. Mark the walkable ground
    // around it, and anchor the visit to the nearest cell we can stand on.
    for (const p of interests) {
      const anchor = this.nearestOpen(p.x, p.z, 8);
      if (!anchor) continue;
      // an interest the camera cannot see would lure animals out of shot on
      // ordinary errands; only excursions go there, and on purpose
      if (this.worldRadius > 0 && !this.onStage(anchor.x, anchor.z, -0.2)) continue;
      this.stamp(p.x, p.z, p.r || 0.6, INTEREST, true);
      this.interests.push({ x: anchor.x, z: anchor.z, kind: p.kind || 'spot' });
    }
    return this;
  }

  stamp(x, z, r, value, onlyOpen = false) {
    const [cx, cz] = this.toCell(x, z);
    const rc = Math.ceil(r / this.cell);
    const r2 = r * r;
    for (let iz = cz - rc; iz <= cz + rc; iz++) {
      for (let ix = cx - rc; ix <= cx + rc; ix++) {
        if (!this.inBounds(ix, iz)) continue;
        if (onlyOpen && this.at(ix, iz) !== OPEN) continue;
        const dx = this.cellX(ix) - x, dz = this.cellZ(iz) - z;
        if (dx * dx + dz * dz <= r2) this.set(ix, iz, value);
      }
    }
  }

  // ---------- queries ----------
  isOpen(x, z) {
    const [ix, iz] = this.toCell(x, z);
    return this.inBounds(ix, iz) && this.at(ix, iz) !== BLOCKED;
  }

  // straight line between two points with nothing blocked along it
  lineOfSight(ax, az, bx, bz) {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isOpen(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  // nearest walkable cell to a point, for recovering from a bad spawn
  nearestOpen(x, z, maxRings = 24) {
    if (this.isOpen(x, z)) return { x, z };
    const [cx, cz] = this.toCell(x, z);
    for (let r = 1; r <= maxRings; r++) {
      for (let iz = cz - r; iz <= cz + r; iz++) {
        for (let ix = cx - r; ix <= cx + r; ix++) {
          if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== r) continue;
          if (this.inBounds(ix, iz) && this.at(ix, iz) !== BLOCKED) {
            return { x: this.cellX(ix), z: this.cellZ(iz) };
          }
        }
      }
    }
    return null;
  }

  // A random walkable spot ON STAGE — everyday wandering keeps the animals
  // where the audience is. `bias` nudges the pick toward a preferred depth
  // band so they spend their time where they read well on screen.
  randomOpen(bias) {
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 80; tries++) {
      const ix = Math.floor(Math.random() * this.nx);
      const iz = Math.floor(Math.random() * this.nz);
      if (this.at(ix, iz) === BLOCKED) continue;
      const x = this.cellX(ix), z = this.cellZ(iz);
      if (!this.onStage(x, z, -0.3)) continue;
      if (!bias) return { x, z };
      const score = -Math.abs(z - bias.z) / bias.spread + Math.random() * 0.4;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best;
  }

  randomInterest() {
    if (!this.interests.length) return null;
    return this.interests[Math.floor(Math.random() * this.interests.length)];
  }

  // ---------- A* ----------
  findPath(from, to) {
    const [sx, sz] = this.toCell(from.x, from.z);
    const [gx, gz] = this.toCell(to.x, to.z);
    if (!this.inBounds(sx, sz) || !this.inBounds(gx, gz)) return null;
    if (this.at(gx, gz) === BLOCKED) return null;

    const n = this.nx * this.nz;
    const start = sz * this.nx + sx, goal = gz * this.nx + gx;
    const gScore = new Float32Array(n).fill(Infinity);
    const from_ = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const h = (i) => {
      const dx = (i % this.nx) - gx, dz = ((i / this.nx) | 0) - gz;
      return Math.hypot(dx, dz);
    };

    const open = new Heap();
    gScore[start] = 0;
    open.push(start, h(start));

    while (open.size) {
      const cur = open.pop();
      if (cur === goal) return this.smooth(this.trace(from_, cur));
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % this.nx, cz = (cur / this.nx) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx2 = cx + dx, nz2 = cz + dz;
          if (!this.inBounds(nx2, nz2)) continue;
          if (this.at(nx2, nz2) === BLOCKED) continue;
          // no cutting diagonally through the corner of an obstacle
          if (dx && dz && (this.at(cx + dx, cz) === BLOCKED || this.at(cx, cz + dz) === BLOCKED)) continue;
          const ni = nz2 * this.nx + nx2;
          if (closed[ni]) continue;
          const step = dx && dz ? 1.41421 : 1;
          const g2 = gScore[cur] + step;
          if (g2 < gScore[ni]) {
            gScore[ni] = g2;
            from_[ni] = cur;
            open.push(ni, g2 + h(ni));
          }
        }
      }
    }
    return null;
  }

  trace(from_, end) {
    const out = [];
    for (let i = end; i !== -1; i = from_[i]) {
      out.push({ x: this.cellX(i % this.nx), z: this.cellZ((i / this.nx) | 0) });
    }
    return out.reverse();
  }

  // string-pulling: drop every waypoint we can see straight past, so the walk
  // reads as a smooth curve instead of a staircase
  smooth(path) {
    if (!path || path.length < 3) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      for (; j > i + 1; j--) {
        if (this.lineOfSight(path[i].x, path[i].z, path[j].x, path[j].z)) break;
      }
      out.push(path[j]);
      i = j;
    }
    return out;
  }

  // ---------- debug view ----------
  debugMesh() {
    const group = new THREE.Group();
    const colors = {
      [BLOCKED]: new THREE.Color(0xd8443a),
      [OPEN]: new THREE.Color(0x4fd06a),
      [INTEREST]: new THREE.Color(0xf2d24a),
    };
    const counts = { [BLOCKED]: 0, [OPEN]: 0, [INTEREST]: 0 };
    for (let i = 0; i < this.grid.length; i++) counts[this.grid[i]]++;

    for (const type of [BLOCKED, OPEN, INTEREST]) {
      if (!counts[type]) continue;
      const geo = new THREE.PlaneGeometry(this.cell * 0.8, this.cell * 0.8);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[type], transparent: true, opacity: 0.45,
        depthWrite: false, fog: false,
      });
      const inst = new THREE.InstancedMesh(geo, mat, counts[type]);
      const m = new THREE.Matrix4();
      let k = 0;
      for (let iz = 0; iz < this.nz; iz++) {
        for (let ix = 0; ix < this.nx; ix++) {
          if (this.at(ix, iz) !== type) continue;
          const x = this.cellX(ix), z = this.cellZ(iz);
          m.makeTranslation(x, this.groundHeight(x, z) + 0.04, z);
          inst.setMatrixAt(k++, m);
        }
      }
      inst.renderOrder = 9;
      group.add(inst);
    }
    return group;
  }
}
