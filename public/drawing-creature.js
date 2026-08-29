// THE CHILD'S DRAWING, ALIVE
// --------------------------
// No 3D template, no UV mapping: the drawing itself becomes the animal, the
// way teamLab's Sketch Aquarium does it. The picture is cut into its moving
// parts — legs, ears, tail — and each part becomes its own hinged plane, so
// the child's own lines are what walk around the forest.
//
// The segmentation and rigging below are lifted unchanged from wall.js, where
// they were built and debugged against real children's drawings.
//
// This module exposes DrawingBody, which plugs into animals.js wherever
// ProxyBody did. It knows nothing about navigation; the Animal drives it.

import * as THREE from './vendor/three.module.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const skewSin = (p) => Math.sin(p + 0.45 * Math.sin(p));

const GLOW_M = 24;

function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Cut-outs need alpha-tested shadows, and three's shared depth material does
// not know about our map — so every part carries its own.
function partMaterial(cv) {
  const tex = canvasTex(cv);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.35,
    side: THREE.DoubleSide, depthWrite: true,
  });
  mat.userData.depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.35,
  });
  return mat;
}

function partMesh(cv, u) {
  const mat = partMaterial(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width * u, cv.height * u), mat);
  m.castShadow = true;
  m.customDepthMaterial = mat.userData.depth;
  return m;
}

// ============================================================
// Lifted from wall.js — do not diverge from the original.
// ============================================================

function stripBackground(img) {
  const w = img.width, h = img.height;
  if (w < 4 || h < 4) return img;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  let id;
  try { id = g.getImageData(0, 0, w, h); } catch { return img; }
  const d = id.data;
  const px = (x, y) => {
    const o = (y * w + x) * 4;
    return [d[o], d[o + 1], d[o + 2], d[o + 3]];
  };
  const border = [
    px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1),
    px(w >> 1, 0), px(w >> 1, h - 1), px(0, h >> 1), px(w - 1, h >> 1),
  ].filter(s => s[3] > 240);
  if (border.length < 7) return img;
  const [br, bgc, bb] = border[0];
  if (!border.every(s => Math.abs(s[0] - br) + Math.abs(s[1] - bgc) + Math.abs(s[2] - bb) < 60)) return img;
  let cleared = 0;
  const total = w * h;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (d[o + 3] > 0 && Math.abs(d[o] - br) + Math.abs(d[o + 1] - bgc) + Math.abs(d[o + 2] - bb) < 48) {
      d[o + 3] = 0;
      cleared++;
    }
  }
  if (total - cleared < total * 0.02) return img;
  g.putImageData(id, 0, 0);
  return c;
}

function glowBake(img, M) {
  const c = document.createElement('canvas');
  c.width = img.width + M * 2;
  c.height = img.height + M * 2;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(255,252,220,0.85)';
  g.shadowBlur = Math.min(18, Math.max(6, M - 2));
  g.drawImage(img, M, M);
  g.drawImage(img, M, M);
  g.shadowBlur = 0;
  g.drawImage(img, M, M);
  return c;
}

export function analyzeParts(raw) {
  const k = Math.min(1, 200 / raw.width, 200 / raw.height);
  const gw = Math.max(2, Math.round(raw.width * k));
  const gh = Math.max(2, Math.round(raw.height * k));
  const c = document.createElement('canvas');
  c.width = gw; c.height = gh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(raw, 0, 0, gw, gh);
  const a = g.getImageData(0, 0, gw, gh).data;
  const solid = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) solid[i] = a[i * 4 + 3] > 40 ? 1 : 0;
  const at = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && solid[y * gw + x];

  const runsAt = [];
  let topY = -1, bottomY = -1, maxRowW = 0;
  for (let y = 0; y < gh; y++) {
    const runs = [];
    let start = -1;
    for (let x = 0; x <= gw; x++) {
      if (x < gw && at(x, y)) { if (start < 0) start = x; }
      else if (start >= 0) {
        const prev = runs[runs.length - 1];
        if (prev && start - prev[1] <= 2) prev[1] = x - 1;
        else runs.push([start, x - 1]);
        start = -1;
      }
    }
    const filtered = runs.filter(r => r[1] - r[0] >= 1);
    runsAt.push(filtered);
    if (filtered.length) {
      if (topY < 0) topY = y;
      bottomY = y;
      const w = filtered[filtered.length - 1][1] - filtered[0][0];
      if (w > maxRowW) maxRowW = w;
    }
  }
  if (topY < 0 || bottomY - topY < 10) return null;
  const span = bottomY - topY;

  function components(region) {
    const seen = new Uint8Array(gw * gh);
    const comps = [];
    for (let i = 0; i < gw * gh; i++) {
      if (seen[i] || !solid[i]) continue;
      const sx = i % gw, sy = (i / gw) | 0;
      if (!region(sx, sy)) continue;
      const cells = [];
      const stack = [i];
      seen[i] = 1;
      let x0 = gw, x1 = 0, y0 = gh, y1 = 0, sumX = 0;
      while (stack.length) {
        const ci = stack.pop();
        const cx = ci % gw, cy = (ci / gw) | 0;
        cells.push(ci);
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        sumX += cx;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (seen[ni] || !solid[ni] || !region(nx, ny)) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      comps.push({ cells, x0, x1, y0, y1, cx: sumX / cells.length });
    }
    return comps;
  }

  // legs: trace each ground-contact run upward until it merges into the body
  const legLimit = bottomY - Math.round(span * 0.6);
  let legs = [];
  {
    const claimed = new Uint8Array(gw * gh);
    const feet = [];
    for (let y = bottomY; y >= Math.max(0, bottomY - 2); y--) {
      for (const r of runsAt[y]) {
        if (!feet.some(f => r[0] <= f.run[1] + 1 && r[1] >= f.run[0] - 1)) {
          feet.push({ run: r, y });
        }
      }
    }
    feet.sort((a, b) => a.run[0] - b.run[0]);
    for (const foot of feet.slice(0, 6)) {
      const cells = [];
      let cur = foot.run;
      let x0 = cur[0], x1 = cur[1], top = foot.y, sumX = 0, n = 0;
      let widths = 0, rows = 0;
      let y = foot.y;
      while (y >= legLimit) {
        let hit = false;
        for (let x = cur[0]; x <= cur[1] && !hit; x++) hit = !!claimed[y * gw + x];
        if (hit) break;
        for (let x = cur[0]; x <= cur[1]; x++) {
          const idx = y * gw + x;
          if (!solid[idx]) continue;
          claimed[idx] = 1;
          cells.push(idx);
          sumX += x; n++;
        }
        if (cur[0] < x0) x0 = cur[0];
        if (cur[1] > x1) x1 = cur[1];
        top = y;
        widths += cur[1] - cur[0] + 1; rows++;
        const next = (runsAt[y - 1] || []).filter(r => r[0] <= cur[1] + 1 && r[1] >= cur[0] - 1);
        if (next.length !== 1) break;
        const nr = next[0];
        const nw = nr[1] - nr[0] + 1;
        if (nw > Math.max((cur[1] - cur[0] + 1) * 1.8, 4) || nw > 0.35 * maxRowW) break;
        cur = nr;
        y--;
      }
      const height = foot.y - top + 1;
      const avgW = widths / Math.max(1, rows);
      if (n >= 4 && height >= Math.max(3, span * 0.08) && avgW <= 0.3 * maxRowW) {
        legs.push({ cells, x0, x1, y0: top, y1: foot.y, cx: sumX / n, top });
      }
    }
    if (legs.length < 2) legs = [];
  }
  const minLegTop = legs.length ? Math.min(...legs.map(l => l.top)) : bottomY + 1;

  // ears
  let earsBottom = topY, ears = [];
  const earLimit = topY + Math.round(span * 0.42);
  for (let y = topY; y <= earLimit; y++) {
    const runs = runsAt[y];
    if (runs.length >= 2 && runs.every(r => r[1] - r[0] < 0.32 * maxRowW)) earsBottom = y + 1;
    else if (y > topY + 2) break;
  }
  if (earsBottom - topY >= Math.max(3, span * 0.08)) {
    ears = components((x, y) => y < earsBottom)
      .filter(cp => cp.y0 <= topY + 2 && cp.x1 - cp.x0 <= 0.35 * maxRowW && cp.cells.length >= 4)
      .sort((p, q) => p.x0 - q.x0)
      .slice(0, 4);
    if (ears.length < 2) ears = [];
  }
  if (!ears.length) earsBottom = topY;

  // tail / trunk
  const bandTop = earsBottom, bandBot = minLegTop;
  const bandH = Math.max(1, bandBot - bandTop);
  const colCount = new Array(gw).fill(0);
  let bandMinX = gw, bandMaxX = -1;
  for (let x = 0; x < gw; x++) {
    let n = 0;
    for (let y = bandTop; y < bandBot; y++) if (at(x, y)) n++;
    colCount[x] = n;
    if (n) { if (x < bandMinX) bandMinX = x; if (x > bandMaxX) bandMaxX = x; }
  }
  const tails = [];
  const thinLimit = 0.38 * bandH;
  for (const side of [-1, 1]) {
    let x = side === 1 ? bandMaxX : bandMinX;
    let ext = 0;
    while (x >= 0 && x < gw && colCount[x] > 0 && colCount[x] < thinLimit) { ext++; x -= side; }
    if (ext < Math.max(4, gw * 0.12)) continue;
    const attachX = x;
    const comp = components((cx, cy) =>
      cy >= bandTop && cy < bandBot && (side === 1 ? cx > attachX : cx < attachX))
      .filter(cp => (side === 1 ? cp.x1 >= bandMaxX - 1 : cp.x0 <= bandMinX + 1))
      .sort((p, q) => q.cells.length - p.cells.length)[0];
    if (comp && comp.cells.length >= 6) tails.push({ comp, side, attachX });
  }

  return { k, gw, gh, span, legs, earsBottom, ears, tails };
}

function buildRig(raw) {
  const P = analyzeParts(raw);
  if (!P || (!P.legs.length && !P.ears.length && !P.tails.length)) return null;
  const { k, gw, gh } = P;
  const S = 1 / k;
  const RW = raw.width, RH = raw.height;
  const PART_M = 16;

  function tinyMask(comp, filter) {
    const t = document.createElement('canvas');
    t.width = gw; t.height = gh;
    const tg = t.getContext('2d');
    const id = tg.createImageData(gw, gh);
    for (const ci of comp.cells) {
      const x = ci % gw, y = (ci / gw) | 0;
      if (filter && !filter(x, y)) continue;
      const o = ci * 4;
      id.data[o] = id.data[o + 1] = id.data[o + 2] = id.data[o + 3] = 255;
    }
    tg.putImageData(id, 0, 0);
    return t;
  }

  function makePart(comp, pivotGX, pivotGY) {
    const pad = Math.ceil(4 + 2 * S);
    const bx0 = Math.max(0, Math.floor(comp.x0 * S) - pad);
    const by0 = Math.max(0, Math.floor(comp.y0 * S) - pad);
    const bx1 = Math.min(RW, Math.ceil((comp.x1 + 1) * S) + pad);
    const by1 = Math.min(RH, Math.ceil((comp.y1 + 1) * S) + pad);
    const bw = bx1 - bx0, bh = by1 - by0;
    if (bw < 3 || bh < 3) return null;
    const cutC = document.createElement('canvas');
    cutC.width = bw; cutC.height = bh;
    const cg = cutC.getContext('2d');
    cg.drawImage(raw, bx0, by0, bw, bh, 0, 0, bw, bh);
    const mk = document.createElement('canvas');
    mk.width = bw; mk.height = bh;
    const mg = mk.getContext('2d');
    const tiny = tinyMask(comp, null);
    for (const [dx, dy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      mg.drawImage(tiny, 0, 0, gw, gh, -bx0 + dx, -by0 + dy, RW, RH);
    }
    cg.globalCompositeOperation = 'destination-in';
    cg.drawImage(mk, 0, 0);
    return {
      cv: glowBake(cutC, PART_M),
      ox: bx0 - PART_M, oy: by0 - PART_M,
      px: pivotGX * S, py: pivotGY * S,
    };
  }

  const rig = { legs: [], ears: [], tails: [], legLen: 0 };
  const torsoRaw = document.createElement('canvas');
  torsoRaw.width = RW; torsoRaw.height = RH;
  const tg = torsoRaw.getContext('2d');
  tg.drawImage(raw, 0, 0);
  tg.globalCompositeOperation = 'destination-out';
  const punch = (comp, filter) => tg.drawImage(tinyMask(comp, filter), 0, 0, gw, gh, 0, 0, RW, RH);

  for (const cp of P.legs) {
    const part = makePart(cp, cp.cx, cp.top);
    if (!part) continue;
    rig.legs.push(part);
    punch(cp, (x, y) => y >= cp.top + 2);
  }
  if (rig.legs.length) {
    rig.legLen = (P.legs.reduce((s, cp) => s + (cp.y1 - cp.top + 1), 0) / P.legs.length) * S;
  }
  for (const cp of P.ears) {
    const part = makePart(cp, cp.cx, P.earsBottom);
    if (!part) continue;
    rig.ears.push(part);
    punch(cp, (x, y) => y <= P.earsBottom - 3);
  }
  for (const t of P.tails) {
    const cp = t.comp;
    const axis = (cp.x1 - cp.x0) >= (cp.y1 - cp.y0) ? 'h' : 'v';
    const part = makePart(cp,
      axis === 'h' ? t.attachX : cp.cx,
      axis === 'h' ? (cp.y0 + cp.y1) / 2 : cp.y0);
    if (!part) continue;
    rig.tails.push({ ...part, axis, dirOut: t.side });
    punch(cp, (x, y) => (t.side === 1 ? x >= t.attachX + 2 : x <= t.attachX - 2));
  }

  if (!rig.legs.length && !rig.ears.length && !rig.tails.length) return null;
  rig.torso = glowBake(torsoRaw, GLOW_M);
  return rig;
}

function labelTexture(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = '600 40px "Segoe UI", sans-serif';
  const tw = g.measureText(text).width;
  c.width = Math.ceil(tw + 56);
  c.height = 72;
  const g2 = c.getContext('2d');
  g2.fillStyle = 'rgba(0,20,10,0.6)';
  g2.beginPath();
  g2.roundRect(2, 4, c.width - 4, 64, 20);
  g2.fill();
  g2.font = '600 40px "Segoe UI", sans-serif';
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillStyle = '#eafff4';
  g2.fillText(text, c.width / 2, 38);
  return { tex: canvasTex(c), aspect: c.width / c.height };
}

// ============================================================
// THE BODY
// ============================================================

export class DrawingBody {
  // image: the child's PNG, already decoded. species: an entry from SPECIES.
  constructor(species, image, name) {
    this.species = species;
    this.mats = [];
    this.object3D = new THREE.Group();
    this.inner = new THREE.Group();   // carries the left/right flip
    this.object3D.add(this.inner);

    const src = stripBackground(image);
    const RW = src.width, RH = src.height;
    this.RW = RW; this.RH = RH;

    // Scale so every drawing arrives at a comparable, readable size however
    // the child filled the page.
    let u = species.height / RH;
    if (RW * u > species.maxWidth) u = species.maxWidth / RW;
    this.u = u;
    this.wW = RW * u;
    this.wH = RH * u;

    // feet on the ground: y is measured up from the bottom of the drawing
    const localPos = (ox, oy, cw, ch) => [
      (ox + cw / 2 - RW / 2) * u,
      (RH - (oy + ch / 2)) * u,
    ];
    const planeFor = (cv, ox, oy, zOff) => {
      const m = partMesh(cv, u);
      this.mats.push(m.material);
      const [lx, ly] = localPos(ox, oy, cv.width, cv.height);
      m.position.set(lx, ly, zOff);
      return m;
    };

    let rig = null;
    if (species.rigged) { try { rig = buildRig(src); } catch { rig = null; } }

    this.legPivots = []; this.earPivots = []; this.tailChains = [];
    this.legRots = []; this.legLifts = []; this.legOffs = [];

    if (rig) {
      this.rig = rig;
      this.legLenW = rig.legLen * u;
      this.inner.add(planeFor(rig.torso, -GLOW_M, -GLOW_M, 0.01));

      rig.legs.forEach((L, i) => {
        const pg = new THREE.Group();
        pg.position.set((L.px - RW / 2) * u, (RH - L.py) * u, -0.02 - i * 0.002);
        pg.userData.baseY = pg.position.y;
        const mesh = partMesh(L.cv, u);
        this.mats.push(mesh.material);
        mesh.position.set(
          (L.ox + L.cv.width / 2 - L.px) * u,
          (L.py - (L.oy + L.cv.height / 2)) * u, 0);
        pg.add(mesh);
        this.legPivots.push(pg);
        this.inner.add(pg);
        this.legRots.push(0);
        this.legLifts.push(0);
        this.legOffs.push((i % 2) * Math.PI + rand(-0.25, 0.25));
      });

      for (const E of rig.ears) {
        const pg = new THREE.Group();
        pg.position.set((E.px - RW / 2) * u, (RH - E.py) * u, -0.02);
        const mesh = partMesh(E.cv, u);
        this.mats.push(mesh.material);
        mesh.position.set(
          (E.ox + E.cv.width / 2 - E.px) * u,
          (E.py - (E.oy + E.cv.height / 2)) * u, 0);
        pg.add(mesh);
        this.earPivots.push(pg);
        this.inner.add(pg);
      }

      // tails and trunks as nested chains, so they whip rather than swing
      for (const T of rig.tails) {
        const hor = T.axis === 'h';
        const cw = T.cv.width, ch = T.cv.height;
        const attach = hor ? clamp(T.px - T.ox, 0, cw) : clamp(T.py - T.oy, 0, ch);
        const total = hor ? (T.dirOut === 1 ? cw - attach : attach) : ch - attach;
        const n = 4;
        const step = Math.max(2, total / n);
        const root = new THREE.Group();
        root.position.set((T.px - RW / 2) * u, (RH - T.py) * u, -0.03);
        let parent = root;
        const groups = [];
        for (let j = 0; j < n; j++) {
          let s0, s1;
          if (hor && T.dirOut === 1) { s0 = attach + step * j; s1 = Math.min(cw, s0 + step + 1); if (j === 0) s0 = 0; }
          else if (hor) { s1 = attach - step * j; s0 = Math.max(0, s1 - step - 1); if (j === 0) s1 = cw; }
          else { s0 = attach + step * j; s1 = Math.min(ch, s0 + step + 1); if (j === 0) s0 = 0; }
          if (s1 - s0 < 1) continue;
          const slice = document.createElement('canvas');
          if (hor) { slice.width = s1 - s0; slice.height = ch; slice.getContext('2d').drawImage(T.cv, -s0, 0); }
          else { slice.width = cw; slice.height = s1 - s0; slice.getContext('2d').drawImage(T.cv, 0, -s0); }
          const g2 = new THREE.Group();
          g2.position.set(
            j === 0 ? 0 : (hor ? T.dirOut * step * u : 0),
            j === 0 ? 0 : (hor ? 0 : -step * u), 0);
          const mesh = partMesh(slice, u);
          this.mats.push(mesh.material);
          const jointX = hor ? T.px + T.dirOut * step * j : T.px;
          const jointY = hor ? T.py : T.py + step * j;
          const sliceCx = hor ? T.ox + s0 + (s1 - s0) / 2 : T.ox + cw / 2;
          const sliceCy = hor ? T.oy + ch / 2 : T.oy + s0 + (s1 - s0) / 2;
          mesh.position.set((sliceCx - jointX) * u, (jointY - sliceCy) * u, j * 0.001);
          g2.add(mesh);
          parent.add(g2);
          parent = g2;
          groups.push(g2);
        }
        this.tailChains.push(groups);
        this.inner.add(root);
      }
    } else {
      // no separable parts: the whole drawing moves as one
      this.inner.add(planeFor(glowBake(src, GLOW_M), -GLOW_M, -GLOW_M, 0));
    }

    // the child's name, riding just above their animal
    if (name) {
      const { tex, aspect } = labelTexture(name);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
      }));
      const lh = 0.32;
      s.scale.set(lh * aspect, lh, 1);
      s.position.set(0, this.wH + 0.34, 0);
      this.label = s;
      this.object3D.add(s);
    }

    // The Animal must not yaw this body: a flat cut-out seen edge-on vanishes,
    // so facing is handled here by flipping instead.
    this.ownsFacing = true;

    // motion state
    this.age = 0;
    this.stride = 0;
    this.bob = 0; this.prevBob = 0;
    this.earRot = 0;
    this.wagAmp = 0.2;
    this.face = 1; this.faceTarget = 1;
    this.yaw = 0;
    this.fade = 0;
    for (const m of this.mats) { m.transparent = true; m.opacity = 0; }
  }

  // ctx: { state, speed, moving, groundY, t, dt, heading, camYaw }
  update(dt, ctx) {
    this.age += dt;
    const s = this.species;

    // fade in on arrival rather than popping into the clearing
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt * 1.2);
      for (const m of this.mats) m.opacity = this.fade;
      if (this.label) this.label.material.opacity = this.fade;
    }

    // ---- which way is it facing ----
    // A drawing seen edge-on is invisible, so the cut-out never turns away
    // from the camera. It flips left/right instead, and takes only a hint of
    // real yaw so a turn still reads as a turn.
    const dirX = Math.sin(ctx.heading);
    if (Math.abs(dirX) > 0.25) this.faceTarget = dirX > 0 ? 1 : -1;
    this.face += (this.faceTarget - this.face) * Math.min(1, dt * 7);
    this.inner.scale.x = Math.abs(this.face) < 0.06 ? 0.06 * Math.sign(this.face || 1) : this.face;
    const wantYaw = Math.cos(ctx.heading) * -0.42 * this.faceTarget;
    this.yaw += (wantYaw - this.yaw) * Math.min(1, dt * 5);
    this.inner.rotation.y = this.yaw;

    // ---- body bob ----
    const gaitSpeed = ctx.speed / Math.max(0.1, s.speed.walk);
    if (ctx.moving) {
      this.stride += dt * s.strideRate * (0.5 + gaitSpeed * 0.5);
      if (s.gait === 'hop') {
        const b = Math.abs(Math.sin(this.stride));
        this.bob = b * s.hopHeight;
        this.object3D.rotation.x = -Math.cos(this.stride * 2) * 0.06;
      } else {
        this.bob = Math.abs(Math.sin(this.stride * 2)) * s.bobAmp;
        this.object3D.rotation.z = Math.sin(this.stride) * s.roll * this.faceTarget;
      }
    } else {
      this.stride += dt * 0.7;
      this.bob = Math.sin(this.stride) * 0.012;
      this.object3D.rotation.x *= 0.9;
      this.object3D.rotation.z *= 0.9;
    }
    this.object3D.position.y = ctx.groundY + this.bob + (s.hover || 0);

    // ---- legs ----
    const drive = ctx.moving ? clamp(0.28 + gaitSpeed * 0.5, 0, 0.85) : 0;
    for (let i = 0; i < this.legPivots.length; i++) {
      const p = this.stride + this.legOffs[i];
      const target = drive ? drive * skewSin(p) : (ctx.state === 'rest' ? 0.35 : 0);
      const lift = drive ? Math.max(0, Math.cos(p)) * drive * this.legLenW * 0.22 : 0;
      this.legRots[i] += (target - this.legRots[i]) * Math.min(1, dt * 14);
      this.legLifts[i] += (lift - this.legLifts[i]) * Math.min(1, dt * 14);
      const pg = this.legPivots[i];
      pg.rotation.z = this.legRots[i];
      pg.position.y = pg.userData.baseY + this.legLifts[i];
    }

    // ---- ears follow the bounce, and prick up when alert ----
    if (this.earPivots.length) {
      const bobVel = (this.bob - this.prevBob) / Math.max(dt, 1e-4);
      const alert = ctx.state === 'look' || ctx.state === 'sniff' ? 1 : 0;
      const target = clamp((bobVel / Math.max(0.2, this.wH)) * 0.9, -0.45, 0.45)
        + Math.sin(this.age * 1.4) * 0.035
        + alert * Math.sin(this.age * 6.5) * 0.07;
      this.earRot += (target - this.earRot) * Math.min(1, dt * 10);
      this.earPivots.forEach((pg, i) => { pg.rotation.z = this.earRot * (i % 2 ? 0.8 : 1.15); });
    }
    this.prevBob = this.bob;

    // ---- tail ----
    if (this.tailChains.length) {
      let amp = 0.15;
      if (ctx.state === 'look' || ctx.state === 'sniff') amp = 0.34;
      else if (ctx.state === 'rest') amp = 0.05;
      else if (ctx.moving) amp = 0.26;
      this.wagAmp += (amp - this.wagAmp) * Math.min(1, dt * 3);
      const rot = Math.sin(this.age * s.wagFreq * 2) * this.wagAmp;
      for (const chain of this.tailChains) {
        const n = chain.length || 1;
        chain.forEach((g2, j) => {
          const w = Math.pow((j + 1) / n, 1.3) - Math.pow(j / n, 1.3);
          g2.rotation.z = rot * w * n;
        });
      }
    }
  }

  dispose() {
    this.object3D.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }
}
