// Digital Jungle — LED wall display
// Procedurally drawn layered jungle. Kids' drawings arrive over WebSocket
// and come to life with archetype-specific gaits, body deformation and
// a behavior state machine (sniff, sleep, greet, startle, ...).

'use strict';

const canvas = document.getElementById('jungle');
const ctx = canvas.getContext('2d');
const hintEl = document.getElementById('hint');
const statusEl = document.getElementById('status');

let W = 0, H = 0, DPR = 1;
const PARALLAX = 16; // max horizontal drift of foreground layer
const STEADY = location.hash === '#steady'; // test mode: skip spawn animations

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const TAU = Math.PI * 2;
// smooth 0→1→0 pulse over p ∈ [0,1]
const pulse = (p) => Math.sin(clamp(p, 0, 1) * Math.PI);
// asymmetric stride cycle: fast swing, slow planted stance
const skewSin = (p) => Math.sin(p + 0.45 * Math.sin(p));
const easeInOut = (p) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

// ---------- background layers (cached offscreen canvases) ----------
let skyLayer, farLayer, midLayer, groundLayer, fgLayer;

function makeLayer(extra = 0) {
  const c = document.createElement('canvas');
  c.width = (W + extra * 2) * DPR;
  c.height = H * DPR;
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  return { canvas: c, ctx: g, extra };
}

function drawCanopyBlob(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  const n = randInt(6, 9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * rand(0.7, 1.1);
    g.moveTo(x, y);
    g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.4, rr * 0.55, 0, TAU);
  }
  g.arc(x, y, r * 0.7, 0, TAU);
  g.fill();
}

function drawTree(g, x, baseY, h, trunkColor, leafColor, vineColor) {
  const trunkW = h * 0.07;
  g.strokeStyle = trunkColor;
  g.lineCap = 'round';
  g.lineWidth = trunkW;
  g.beginPath();
  const lean = rand(-h * 0.08, h * 0.08);
  g.moveTo(x, baseY);
  g.quadraticCurveTo(x + lean * 0.5, baseY - h * 0.5, x + lean, baseY - h);
  g.stroke();
  for (let i = 0; i < 2; i++) {
    const t = rand(0.55, 0.85);
    const bx = x + lean * t, by = baseY - h * t;
    g.lineWidth = trunkW * 0.5;
    g.beginPath();
    g.moveTo(bx, by);
    g.quadraticCurveTo(bx + rand(-h, h) * 0.15, by - h * 0.12, bx + rand(-h, h) * 0.25, by - h * 0.2);
    g.stroke();
  }
  drawCanopyBlob(g, x + lean, baseY - h, h * rand(0.32, 0.42), leafColor);
  if (vineColor) {
    g.strokeStyle = vineColor;
    g.lineWidth = 2;
    const vines = randInt(1, 3);
    for (let i = 0; i < vines; i++) {
      const vx = x + lean + rand(-h * 0.3, h * 0.3);
      const vy = baseY - h + rand(0, h * 0.15);
      const len = rand(h * 0.25, h * 0.55);
      g.beginPath();
      g.moveTo(vx, vy);
      g.bezierCurveTo(vx + rand(-14, 14), vy + len * 0.4, vx + rand(-14, 14), vy + len * 0.7, vx + rand(-10, 10), vy + len);
      g.stroke();
    }
  }
}

function drawBigLeaf(g, x, y, len, angle, color) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(len * 0.5, 0, len * 0.5, len * 0.18, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.95, 0);
  g.stroke();
  g.restore();
}

function buildBackground() {
  const horizon = H * 0.62;
  const groundTop = H * 0.68;

  skyLayer = makeLayer(0);
  {
    const g = skyLayer.ctx;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#07301f');
    grad.addColorStop(0.45, '#0d4a30');
    grad.addColorStop(0.62, '#7cbf95');
    grad.addColorStop(0.68, '#145238');
    grad.addColorStop(1, '#06231a');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const sx = W * 0.72, sy = H * 0.16;
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.5);
    sun.addColorStop(0, 'rgba(255,244,190,0.85)');
    sun.addColorStop(0.15, 'rgba(255,240,170,0.35)');
    sun.addColorStop(0.5, 'rgba(220,255,200,0.10)');
    sun.addColorStop(1, 'rgba(220,255,200,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
  }

  farLayer = makeLayer(6);
  {
    const g = farLayer.ctx;
    const w = W + 12;
    g.fillStyle = 'rgba(74,143,111,0.75)';
    g.beginPath();
    g.moveTo(0, horizon + 20);
    let x = 0;
    while (x < w) {
      const r = rand(30, 90);
      g.arc(x, horizon + rand(-10, 25), r, Math.PI, 0);
      x += r * rand(1.1, 1.6);
    }
    g.lineTo(w, H); g.lineTo(0, H);
    g.closePath();
    g.fill();
    for (let i = 0; i < 7; i++) {
      drawTree(g, rand(0, w), horizon + 30, rand(H * 0.12, H * 0.2),
        'rgba(58,120,92,0.8)', 'rgba(64,130,100,0.8)', null);
    }
  }

  midLayer = makeLayer(10);
  {
    const g = midLayer.ctx;
    const w = W + 20;
    for (let i = 0; i < Math.max(6, Math.round(W / 260)); i++) {
      drawTree(g, rand(0, w), groundTop + rand(0, H * 0.06), rand(H * 0.26, H * 0.44),
        '#123b2a', '#1b5e42', 'rgba(27,94,66,0.9)');
    }
  }

  groundLayer = makeLayer(0);
  {
    const g = groundLayer.ctx;
    const grad = g.createLinearGradient(0, groundTop, 0, H);
    grad.addColorStop(0, '#155c3e');
    grad.addColorStop(0.35, '#0e4530');
    grad.addColorStop(1, '#062318');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, groundTop + 14);
    for (let x = 0; x <= W; x += 60) {
      g.lineTo(x, groundTop + Math.sin(x * 0.01) * 8 + rand(-4, 4));
    }
    g.lineTo(W, H); g.lineTo(0, H);
    g.closePath();
    g.fill();
    for (let i = 0; i < Math.round(W / 14); i++) {
      const x = rand(0, W), y = rand(groundTop + 18, H - 6);
      const s = lerp(4, 14, (y - groundTop) / (H - groundTop));
      g.strokeStyle = `rgba(46,142,96,${rand(0.25, 0.55)})`;
      g.lineWidth = 1.5;
      for (let b = 0; b < 3; b++) {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + rand(-s, s) * 0.4, y - s * 0.7, x + rand(-s, s), y - s);
        g.stroke();
      }
    }
  }

  fgLayer = makeLayer(PARALLAX + 4);
  {
    const g = fgLayer.ctx;
    const w = W + (PARALLAX + 4) * 2;
    const dark = '#04180f';
    const clusters = [
      { x: 0, y: H * 0.05, dir: 1 },
      { x: 0, y: H * 0.9, dir: 1 },
      { x: w, y: H * 0.12, dir: -1 },
      { x: w, y: H * 0.95, dir: -1 },
      { x: w * 0.5, y: H + 30, dir: 1 },
    ];
    for (const c of clusters) {
      for (let i = 0; i < 7; i++) {
        drawBigLeaf(g, c.x + rand(-20, 20), c.y + rand(-40, 40),
          rand(H * 0.1, H * 0.24),
          c.dir === 1 ? rand(-0.9, 0.9) : Math.PI + rand(-0.9, 0.9),
          i % 2 ? dark : '#072a1a');
      }
    }
    const v = g.createRadialGradient(w / 2, H / 2, H * 0.45, w / 2, H / 2, H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,10,5,0.5)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, H);
  }
}

// ---------- ambient life ----------
let fireflies = [];
let fallingLeaves = [];
let puffs = []; // dust kicked up by heavy footfalls / landings

function initAmbient() {
  fireflies = [];
  const n = Math.round(W / 70);
  for (let i = 0; i < n; i++) {
    fireflies.push({
      x: rand(0, W), y: rand(H * 0.2, H * 0.9),
      p1: rand(0, TAU), p2: rand(0, TAU), p3: rand(0, TAU),
      s1: rand(0.15, 0.45), s2: rand(0.1, 0.35),
      blink: rand(0.5, 1.6),
    });
  }
  fallingLeaves = [];
  puffs = [];
}

function spawnLeaf() {
  fallingLeaves.push({
    x: rand(0, W), y: -20,
    vy: rand(18, 40), sway: rand(20, 60), swaySpeed: rand(0.6, 1.4),
    phase: rand(0, TAU), rot: rand(0, TAU), rotSpeed: rand(-1.2, 1.2),
    size: rand(6, 14), alpha: 1,
    color: `hsl(${rand(70, 130)}, ${rand(40, 60)}%, ${rand(28, 45)}%)`,
  });
}

function spawnPuff(x, y, size) {
  for (let i = 0; i < 5; i++) {
    puffs.push({
      x: x + rand(-size, size) * 0.4, y: y + rand(-3, 3),
      vx: rand(-25, 25), vy: rand(-30, -8),
      r: rand(3, 7) * (size / 40 + 0.5), alpha: rand(0.25, 0.45), t: 0, life: rand(0.5, 0.9),
    });
  }
}

// ---------- creatures ----------
const creatures = new Map(); // id -> Creature
const SKY = { top: 0.12, bottom: 0.55 };
const GROUND = { top: 0.72, bottom: 0.93 };

// old clients / stored creatures may still use the original two kinds
const KIND_MAP = { walker: 'prowler', flyer: 'butterfly' };
const GROUND_KINDS = new Set(['prowler', 'stomper', 'hopper', 'slitherer', 'plant']);

// gait parameters per quadruped archetype
const QUAD_PARAMS = {
  prowler: {
    strideFreq: 7, speedMul: 1, bobAmp: 0.035, shearAmp: 0.24, roll: 0.03,
    footDust: false,
    next: [['walk', 3], ['idle', 2], ['sniff', 2], ['look', 1.5], ['excited', 0.7], ['sleep', 0.5]],
  },
  stomper: {
    strideFreq: 3.2, speedMul: 0.55, bobAmp: 0.02, shearAmp: 0.13, roll: 0.055,
    footDust: true,
    next: [['walk', 3], ['idle', 2], ['trumpet', 1.2], ['look', 1.2], ['sleep', 0.4]],
  },
};

// ---------- drawing → body-part rig ----------
// Analyses the drawing's silhouette and cuts it into torso, legs, ears and
// tail so each part can move on its own bone. Pure alpha-mask heuristics —
// kid drawings are blobby, so anything not found degrades gracefully to
// whole-body motion.

const GLOW_M = 24; // margin baked around the drawing by makeGlowSprite

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

function analyzeParts(raw) {
  // work on a small alpha grid
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

  // row runs (bridging tiny gaps) + overall bounds
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

  // flood-fill connected components inside a region predicate
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

  // legs: trace each ground-contact run UPWARD until it merges into the body.
  // Each leg gets its own hip height, so legs joined to a big belly still
  // rig correctly (the elephant case) instead of merging into one blob.
  const legLimit = bottomY - Math.round(span * 0.6);
  let legs = [];
  {
    const claimed = new Uint8Array(gw * gh);
    // feet = runs on the lowest occupied rows
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
        // stop where another leg already claimed this area (converging legs)
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
        if (next.length !== 1) break; // vanished or split
        const nr = next[0];
        const nw = nr[1] - nr[0] + 1;
        // widening sharply = we reached the body
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

  // ears: separate narrow shapes at the very top of the silhouette
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

  // tail / trunk: a thin extension sticking out of either side of the torso band
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
    const attachX = x; // first thick column — the torso side of the joint
    const comp = components((cx, cy) =>
      cy >= bandTop && cy < bandBot && (side === 1 ? cx > attachX : cx < attachX))
      .filter(cp => (side === 1 ? cp.x1 >= bandMaxX - 1 : cp.x0 <= bandMinX + 1))
      .sort((p, q) => q.cells.length - p.cells.length)[0];
    if (comp && comp.cells.length >= 6) tails.push({ comp, side, attachX });
  }

  return { k, gw, gh, span, legs, earsBottom, ears, tails };
}

// Cut only the moving parts out of the raw drawing (masked to their exact
// connected pixels), glow each part separately, and punch matching holes in
// the torso. Everything that isn't a detected appendage stays on the torso.
function buildRig(raw) {
  const P = analyzeParts(raw);
  if (!P || (!P.legs.length && !P.ears.length && !P.tails.length)) return null;
  const { k, gw, gh } = P;
  const S = 1 / k;
  const RW = raw.width, RH = raw.height;
  const PART_M = 16; // glow margin baked around each part

  // a gw×gh stamp of a component's cells (optionally filtered)
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

  // cut a component out of the raw drawing: raw pixels ∩ (slightly dilated
  // component mask), then bake a glow around just that piece
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

    // dilated, feathered mask (bilinear upscale + small offsets)
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
      ox: bx0 - PART_M, oy: by0 - PART_M,   // raw-space canvas origin
      px: pivotGX * S, py: pivotGY * S,     // raw-space pivot
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
    // keep a couple of rows at the hip on the torso so the joint never gaps
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

class Creature {
  constructor(data) {
    this.id = data.id;
    this.kind = KIND_MAP[data.kind] || data.kind;
    if (!['prowler', 'stomper', 'hopper', 'slitherer', 'bird', 'butterfly', 'plant'].includes(this.kind)) {
      this.kind = 'prowler';
    }
    this.name = data.name;
    this.ready = false;
    this.dead = false;
    this.fade = STEADY ? 1 : 0;
    this.dying = 0;
    this.age = rand(0, 10);
    // personality — no two creatures move alike
    this.tempo = rand(0.8, 1.35);
    this.zest = Math.random();

    this.depth = Math.random();          // 0 far .. 1 near (ground lane)
    this.xr = rand(0.08, 0.92);          // relative x
    this.yr = rand(SKY.top, SKY.bottom); // relative y (flying kinds)
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.facing = this.dir;              // eased visual flip
    this.speed = rand(30, 55);

    // pose written by behaviors, read by draw
    this.bob = 0; this.rot = 0; this.sqX = 1; this.sqY = 1;
    this.legShear = 0; this.waveAmp = 0; this.wavePhase = rand(0, TAU);
    this.headLift = 0; this.fold = 0; this.bank = 0;

    // body-part rig state (filled once the drawing is segmented)
    this.rig = null;
    this.legRots = []; this.legLifts = []; this.legOffs = [];
    this.legDrive = 0; this.legPose = 0;
    this.earRot = 0; this.tailRot = 0; this.prevBob = 0; this.wagAmpCur = 0.15;
    this.wagFreq = rand(1.2, 2.4);
    this.bobMul = rand(0.75, 1.3);

    this.stridePhase = rand(0, TAU);
    this.lastStrideSin = 0;
    this.emotes = [];
    this.emoted = false;
    this.greetCd = rand(4, 12);
    this.sparkles = [];
    this.labelT = 6;

    this.initKind();

    const img = new Image();
    img.onload = () => {
      this.img = this.makeGlowSprite(img);
      if (this.kind === 'bird' || this.kind === 'butterfly') this.makeHalves(this.img);
      if (['prowler', 'stomper', 'hopper'].includes(this.kind)) {
        try { this.rig = buildRig(img); } catch { this.rig = null; }
        if (this.rig) {
          this.legOffs = this.rig.legs.map((_, i) => (i % 2) * Math.PI + rand(-0.25, 0.25));
          this.legRots = this.rig.legs.map(() => 0);
          this.legLifts = this.rig.legs.map(() => 0);
        }
      }
      this.ready = true;
      if (!STEADY) this.spawnSparkles();
    };
    img.src = data.img;
  }

  initKind() {
    switch (this.kind) {
      case 'prowler':
      case 'stomper':
        this.strideFreq = (this.kind === 'prowler' ? rand(5.5, 8) : rand(2.3, 3.3)) * this.tempo;
        this.setState('walk', rand(2, 6));
        break;
      case 'hopper':
        this.setState('hopSeq', 0);
        this.hopsLeft = randInt(2, 5);
        this.hopT = 0;
        this.hopStage = 'rest';
        this.hopStageT = rand(0.2, 0.6);
        break;
      case 'slitherer':
        this.setState('slither', rand(4, 9));
        this.speed *= 0.8;
        break;
      case 'bird':
        this.mode = 'fly';
        this.modeT = rand(6, 16);
        this.flapBurst = 0.7;
        this.glideT = 0;
        this.flapFreq = rand(9, 12);
        this.pickFlyTarget();
        break;
      case 'butterfly':
        this.mode = 'fly';
        this.modeT = rand(8, 20);
        this.flapFreq = rand(6, 9);
        this.vx = 0; this.vy = 0;
        this.pickFlyTarget();
        break;
      case 'plant':
        this.shiverT = rand(6, 18);
        break;
    }
  }

  setState(s, dur) {
    this.state = s;
    this.stateDur = dur;
    this.stateT = dur;
    this.emoted = false;
  }

  emote(ch) {
    if (this.emotes.length < 3) this.emotes.push({ ch, t: 0, life: 1.7 });
  }

  pickFlyTarget() {
    this.tx = rand(0.06, 0.94);
    this.ty = rand(SKY.top, SKY.bottom);
    this.targetT = rand(3, 8);
    if (this.vx === undefined) { this.vx = 0; this.vy = 0; }
  }

  // Bake a warm glow halo around the drawing so it pops against the dark jungle.
  makeGlowSprite(img) {
    return glowBake(img, GLOW_M);
  }

  makeHalves(img) {
    const hw = Math.ceil(img.width / 2);
    for (const side of ['left', 'right']) {
      const c = document.createElement('canvas');
      c.width = hw; c.height = img.height;
      const g = c.getContext('2d');
      if (side === 'left') g.drawImage(img, 0, 0);
      else g.drawImage(img, -hw, 0);
      this[side] = c;
    }
  }

  spawnSparkles() {
    for (let i = 0; i < 22; i++) {
      const a = rand(0, TAU);
      this.sparkles.push({
        a, speed: rand(60, 220), life: rand(0.5, 1.1), t: 0, size: rand(2, 5),
      });
    }
  }

  groundY() { return lerp(GROUND.top, GROUND.bottom, this.depth) * H; }

  isAirborne() {
    if (this.kind === 'bird') return this.mode !== 'ground';
    if (this.kind === 'butterfly') return this.mode !== 'rest';
    return false;
  }

  // where the feet / base sit right now (for shadows and depth sorting)
  footY() {
    if (this.kind === 'butterfly' || this.kind === 'bird') {
      const s = this.targetScale();
      return this.isAirborne() ? this.yr * H : this.yr * H + this.img.height * s * 0.5;
    }
    return this.groundY();
  }

  targetScale() {
    if (!this.img) return 1;
    let targetH;
    if (this.kind === 'butterfly') targetH = H * 0.15;
    else if (this.kind === 'bird') targetH = H * 0.14;
    else targetH = H * lerp(0.14, 0.25, this.depth);
    let s = targetH / this.img.height;
    if (this.img.width * s > W * 0.26) s = (W * 0.26) / this.img.width;
    return s;
  }

  // ------------------------------------------------ update
  update(dt) {
    this.age += dt;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 1.6);
    if (this.dead) {
      this.dying = Math.min(1, this.dying + dt);
      return;
    }
    if (this.labelT > 0) this.labelT -= dt;
    if (this.greetCd > 0) this.greetCd -= dt;

    for (const s of this.sparkles) s.t += dt;
    this.sparkles = this.sparkles.filter(s => s.t < s.life);
    for (const e of this.emotes) e.t += dt;
    this.emotes = this.emotes.filter(e => e.t < e.life);

    // reset pose; behaviors write into it
    this.bob = 0; this.rot = 0; this.sqX = 1; this.sqY = 1;
    this.legShear = 0; this.headLift = 0; this.bank = 0;
    this.legDrive = 0; this.legPose = 0;

    switch (this.kind) {
      case 'prowler': this.updateQuad(dt, QUAD_PARAMS.prowler); break;
      case 'stomper': this.updateQuad(dt, QUAD_PARAMS.stomper); break;
      case 'hopper': this.updateHopper(dt); break;
      case 'slitherer': this.updateSlitherer(dt); break;
      case 'bird': this.updateBird(dt); break;
      case 'butterfly': this.updateButterfly(dt); break;
      case 'plant': this.updatePlant(dt); break;
    }

    this.updateRigMotion(dt);

    // eased turn-around: the flip passes through a skinny "turning" pose
    const flying = this.kind === 'bird' || this.kind === 'butterfly';
    this.facing += (this.dir - this.facing) * Math.min(1, dt * (flying ? 9 : 5));
    const af = Math.abs(this.facing);
    if (af < 1 && !flying) this.sqY *= 1 - (1 - af) * 0.12; // slight crouch while turning
  }

  progress() { return this.stateDur > 0 ? 1 - this.stateT / this.stateDur : 1; }

  // drives the segmented body parts each frame: legs follow the stride,
  // ears flop against body motion like springs, the tail wags with mood
  updateRigMotion(dt) {
    const R = this.rig;
    if (!R || !this.img || dt <= 0) return;

    for (let i = 0; i < R.legs.length; i++) {
      let target = this.legPose, lift = 0;
      if (this.legDrive) {
        const p = this.stridePhase + this.legOffs[i];
        target = this.legDrive * skewSin(p);
        lift = Math.max(0, Math.cos(p)) * this.legDrive * R.legLen * 0.22;
      }
      this.legRots[i] += (target - this.legRots[i]) * Math.min(1, dt * 14);
      this.legLifts[i] += (lift - this.legLifts[i]) * Math.min(1, dt * 14);
    }

    if (R.ears.length) {
      const ihs = this.img.height * this.targetScale();
      const bobVel = (this.bob - this.prevBob) / dt;
      const target = clamp((-bobVel / Math.max(1, ihs)) * 0.9, -0.45, 0.45)
        + Math.sin(this.age * 1.4) * 0.035;
      this.earRot += (target - this.earRot) * Math.min(1, dt * 10);
    }
    this.prevBob = this.bob;

    if (R.tails.length) {
      let amp = 0.15, f = this.wagFreq;
      if (this.state === 'excited' || this.state === 'greet') { amp = 0.5; f *= 2.4; }
      else if (this.state === 'sleep') amp = 0.04;
      else if (this.state === 'idle') amp = 0.24;
      this.wagAmpCur += (amp - this.wagAmpCur) * Math.min(1, dt * 3);
      this.tailRot = Math.sin(this.age * f * 2) * this.wagAmpCur;
    }
  }

  // shared idle-ish poses used by several archetypes
  applySpecialPose(dt) {
    const p = this.progress();
    switch (this.state) {
      case 'idle':
        this.sqY = 1 + Math.sin(this.age * 2.4 * this.tempo) * 0.022;
        this.sqX = 2 - this.sqY;
        break;
      case 'sniff': // lean nose-down toward the ground, two little bounces
        this.rot = 0.17 * pulse(p) * (1 + 0.25 * Math.sin(p * 14));
        this.bob = -Math.abs(Math.sin(p * 14)) * 1.5;
        break;
      case 'look': // sit up tall and glance about
        this.rot = -0.09 * pulse(p);
        this.sqY = 1 + 0.04 * pulse(p);
        if (!this.emoted && p > 0.25 && Math.random() < 0.4) { this.emote('❓'); this.emoted = true; }
        break;
      case 'sleep':
        this.sqY = 1 + Math.sin(this.age * 1.1) * 0.045;
        this.sqX = 2 - this.sqY;
        this.rot = 0.06;
        this.zzT = (this.zzT || 0) - dt;
        if (this.zzT <= 0) { this.emote('💤'); this.zzT = 1.8; }
        break;
      case 'excited': { // two happy bounces
        const b = Math.abs(Math.sin((p + this.zest * 0.3) * Math.PI * 2));
        this.bob = b * this.img.height * this.targetScale() * 0.14;
        this.sqY = 1 + b * 0.1;
        this.sqX = 2 - this.sqY;
        if (!this.emoted) { this.emote(pick(['✨', '🎵', '⭐'])); this.emoted = true; }
        break;
      }
      case 'trumpet': // rear back and call out
        this.rot = -0.14 * pulse(p);
        this.sqY = 1 + 0.08 * pulse(p);
        if (!this.emoted && p > 0.3) { this.emote('🎵'); this.emoted = true; }
        break;
      case 'greet': {
        const b = Math.abs(Math.sin((p + this.zest * 0.4) * Math.PI * 3));
        this.bob = b * this.img.height * this.targetScale() * 0.05;
        if (!this.emoted && p > 0.2) { this.emote(pick(['❤️', '🎵'])); this.emoted = true; }
        break;
      }
    }
  }

  pickNextQuad(P) {
    const pool = P.next.filter(([s]) => !(s === 'sleep' && this.zest > 0.45))
      .filter(([s]) => !(s === 'excited' && this.zest < 0.4));
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = Math.random() * total;
    for (const [s, w] of pool) {
      r -= w;
      if (r <= 0) {
        const dur = { walk: rand(3, 8), idle: rand(1.2, 3), sniff: rand(1.4, 2.2), look: rand(1.2, 2), sleep: rand(5, 9), excited: 0.9, trumpet: 1.3 }[s];
        this.setState(s, dur);
        if (s === 'walk' && Math.random() < 0.45) this.dir *= -1;
        return;
      }
    }
    this.setState('walk', rand(3, 8));
  }

  updateQuad(dt, P) {
    this.stateT -= dt;
    if (this.stateT <= 0 && this.state !== 'greet') this.pickNextQuad(P);
    if (this.stateT <= 0 && this.state === 'greet') this.setState('walk', rand(3, 7));

    if (this.state === 'walk') {
      this.stridePhase += dt * this.strideFreq;
      const strideSin = Math.sin(this.stridePhase);
      // speed pulses with the stride — steps, not gliding
      const v = this.speed * P.speedMul * this.tempo * (0.3 + 0.7 * Math.abs(strideSin));
      this.xr += (this.dir * v * dt) / W;
      if (this.xr < 0.05) { this.xr = 0.05; this.dir = 1; }
      if (this.xr > 0.95) { this.xr = 0.95; this.dir = -1; }

      const s = this.targetScale();
      const ihs = this.img ? this.img.height * s : 40;
      this.bob = Math.abs(strideSin) * ihs * P.bobAmp * this.bobMul;
      this.legShear = strideSin * P.shearAmp; // fallback when no rig was found
      if (this.rig && this.rig.legs.length) {
        // swing amplitude matched to ground speed so the feet don't skate
        const legLenS = Math.max(10, this.rig.legLen * s);
        const vAvg = this.speed * P.speedMul * this.tempo * 0.65;
        this.legDrive = clamp((vAvg / (legLenS * this.strideFreq)) * 2.2, 0.15, 0.55);
      }
      this.rot = Math.sin(this.stridePhase * 0.5) * P.roll;
      this.sqY = 1 + Math.sin(this.stridePhase * 2) * 0.03;
      this.sqX = 2 - this.sqY;

      // heavy footfall: dust puff when a foot strikes
      if (P.footDust && this.img && this.lastStrideSin > 0 && strideSin <= 0) {
        const s = this.targetScale();
        spawnPuff(this.xr * W + this.dir * this.img.width * s * 0.2, this.groundY(), this.img.width * s * 0.5);
        this.sqY *= 0.95;
      }
      this.lastStrideSin = strideSin;
    } else {
      this.applySpecialPose(dt);
    }
  }

  updateHopper(dt) {
    if (this.state === 'hopSeq') {
      this.hopStageT -= dt;
      const s = this.img ? this.targetScale() : 1;
      const ihs = this.img ? this.img.height * s : 40;

      if (this.hopStage === 'rest' && this.hopStageT <= 0) {
        this.hopStage = 'crouch'; this.hopStageT = 0.16;
      } else if (this.hopStage === 'crouch') {
        this.sqY = lerp(1, 0.82, 1 - this.hopStageT / 0.16); // anticipation
        this.sqX = 2 - this.sqY;
        this.legPose = -0.12; // legs gather under the body
        if (this.hopStageT <= 0) {
          this.hopStage = 'air';
          this.hopDur = rand(0.4, 0.55) / this.tempo;
          this.hopStageT = this.hopDur;
          this.hopDist = rand(0.5, 0.9) * ihs * (0.8 + this.zest * 0.6);
          if (this.xr < 0.08) this.dir = 1;
          if (this.xr > 0.92) this.dir = -1;
        }
      } else if (this.hopStage === 'air') {
        const u = 1 - this.hopStageT / this.hopDur;
        this.xr += (this.dir * this.hopDist * dt / this.hopDur) / W;
        this.bob = 4 * ihs * 0.32 * u * (1 - u);       // parabolic arc
        this.rot = -0.22 * Math.cos(u * Math.PI);      // nose up, then nose down
        this.sqY = 1.1; this.sqX = 0.93;               // stretch in flight
        this.legPose = 0.45;                           // legs trail in the air
        if (this.hopStageT <= 0) {
          this.hopStage = 'land'; this.hopStageT = 0.13;
          spawnPuff(this.xr * W, this.groundY(), this.img ? this.img.width * s * 0.3 : 20);
        }
      } else if (this.hopStage === 'land') {
        this.sqY = lerp(0.8, 1, 1 - this.hopStageT / 0.13); // impact squash
        this.sqX = 2 - this.sqY;
        if (this.hopStageT <= 0) {
          this.hopsLeft--;
          if (this.hopsLeft <= 0) {
            const r = Math.random();
            if (r < 0.35) this.setState('idle', rand(1.5, 3.5));
            else if (r < 0.55) this.setState('look', rand(1.2, 2));
            else if (r < 0.7 && this.zest > 0.4) this.setState('excited', 0.9);
            else if (r < 0.78 && this.zest < 0.45) this.setState('sleep', rand(4, 7));
            else { this.hopsLeft = randInt(2, 6); if (Math.random() < 0.4) this.dir *= -1; }
          }
          this.hopStage = 'rest';
          this.hopStageT = rand(0.15, 0.7);
        }
      }
      if (this.state === 'hopSeq' && this.hopStage === 'rest') {
        // alert little twitches between hops
        this.sqY = 1 + Math.sin(this.age * 18) * 0.008;
      }
    } else {
      this.stateT -= dt;
      this.applySpecialPose(dt);
      if (this.stateT <= 0) {
        this.setState('hopSeq', 0);
        this.hopsLeft = randInt(2, 6);
        this.hopStage = 'rest';
        this.hopStageT = rand(0.2, 0.5);
        if (Math.random() < 0.5) this.dir *= -1;
      }
    }
  }

  updateSlitherer(dt) {
    this.stateT -= dt;
    if (this.stateT <= 0) {
      if (this.state === 'slither') {
        const r = Math.random();
        if (r < 0.5) { this.setState('headUp', rand(1.4, 2.4)); }
        else { this.setState('pause', rand(1, 2.5)); }
      } else {
        this.setState('slither', rand(4, 10));
        if (Math.random() < 0.4) this.dir *= -1;
      }
    }

    if (this.state === 'slither') {
      this.wavePhase += dt * 6.5 * this.tempo;
      this.waveAmp = this.img ? this.img.height * 0.09 : 4;
      const v = this.speed * this.tempo * (0.85 + 0.15 * Math.sin(this.wavePhase));
      this.xr += (this.dir * v * dt) / W;
      if (this.xr < 0.05) { this.xr = 0.05; this.dir = 1; }
      if (this.xr > 0.95) { this.xr = 0.95; this.dir = -1; }
    } else if (this.state === 'headUp') {
      this.wavePhase += dt * 1.5;
      this.waveAmp = this.img ? this.img.height * 0.03 : 2;
      this.headLift = pulse(this.progress()) * (this.img ? this.img.height * this.targetScale() * 0.18 : 8);
      if (!this.emoted && this.progress() > 0.3 && Math.random() < 0.35) { this.emote('❓'); this.emoted = true; }
    } else { // pause
      this.wavePhase += dt * 1.2;
      this.waveAmp = this.img ? this.img.height * 0.025 : 2;
    }
  }

  updateBird(dt) {
    const s = this.img ? this.targetScale() : 1;
    const ihs = this.img ? this.img.height * s : 30;
    this.modeT -= dt;

    if (this.mode === 'fly') {
      // flap in bursts, then glide — like a real bird
      this.flapBurst -= dt;
      if (this.flapBurst <= 0 && this.glideT <= 0) this.glideT = rand(0.4, 1.3);
      if (this.glideT > 0) {
        this.glideT -= dt;
        this.fold += (0.08 - this.fold) * Math.min(1, dt * 10); // wings held out
        this.vy += dt * 0.02;                                    // gentle sink
        if (this.glideT <= 0) this.flapBurst = rand(0.5, 1);
      } else {
        this.stridePhase += dt * this.flapFreq;
        this.fold = (Math.sin(this.stridePhase * TAU / 2) + 1) / 2 * 0.8;
        this.vy -= dt * 0.03; // climbing while flapping
        this.bob = Math.sin(this.stridePhase * TAU / 2) * ihs * 0.05;
      }
      this.steer(dt, 0.5, 0.085);
      this.bank = clamp(this.vx * 5, -0.3, 0.3);
      if (this.modeT <= 0) {
        this.mode = 'descend';
        this.depth = Math.random();
        this.tx = clamp(this.xr + rand(-0.15, 0.15), 0.08, 0.92);
      }
    } else if (this.mode === 'descend') {
      const targetYr = (this.groundY() - ihs * 0.5) / H;
      this.stridePhase += dt * this.flapFreq * 0.8;
      this.fold = (Math.sin(this.stridePhase * TAU / 2) + 1) / 2 * 0.6;
      this.yr += (targetYr - this.yr) * Math.min(1, dt * 1.6);
      this.xr += (this.tx - this.xr) * Math.min(1, dt * 1.5);
      this.rot = -0.12; // flare for landing
      if (Math.abs(this.yr - targetYr) < 0.008) {
        this.yr = targetYr;
        this.mode = 'ground';
        this.modeT = rand(4, 9);
        this.setState('groundHop', rand(1, 2));
        spawnPuff(this.xr * W, this.groundY(), ihs * 0.3);
      }
    } else if (this.mode === 'ground') {
      this.yr = (this.groundY() - ihs * 0.5) / H;
      this.fold = 0.85 + Math.sin(this.age * 3) * 0.03; // wings tucked
      this.stateT -= dt;
      if (this.stateT <= 0) {
        const r = Math.random();
        if (r < 0.45) { this.setState('groundHop', rand(0.8, 1.6)); if (Math.random() < 0.5) this.dir *= -1; }
        else if (r < 0.8) this.setState('peck', rand(0.9, 1.4));
        else this.setState('look', rand(1, 1.8));
      }
      if (this.state === 'groundHop') {
        const hp = (this.age * 5 * this.tempo) % 1;
        this.bob = 4 * ihs * 0.12 * hp * (1 - hp);
        this.xr += (this.dir * this.speed * 0.5 * dt) / W;
        if (this.xr < 0.06) { this.xr = 0.06; this.dir = 1; }
        if (this.xr > 0.94) { this.xr = 0.94; this.dir = -1; }
      } else if (this.state === 'peck') {
        this.rot = Math.max(0, Math.sin(this.progress() * Math.PI * 4)) * 0.35; // head bobs to the ground
      } else {
        this.applySpecialPose(dt);
      }
      this.modeT -= dt;
      if (this.modeT <= 0) {
        this.mode = 'takeoff';
        this.modeT = 1.2;
        this.emote('✨');
      }
    } else if (this.mode === 'takeoff') {
      this.stridePhase += dt * this.flapFreq * 1.3;
      this.fold = (Math.sin(this.stridePhase * TAU / 2) + 1) / 2 * 0.9;
      this.yr -= dt * 0.25;
      this.rot = -0.15;
      this.modeT -= dt;
      if (this.yr < SKY.bottom || this.modeT <= 0) {
        this.mode = 'fly';
        this.modeT = rand(7, 18);
        this.vx = this.dir * 0.03; this.vy = -0.02;
        this.pickFlyTarget();
      }
    }
  }

  updateButterfly(dt) {
    const s = this.img ? this.targetScale() : 1;
    const ihs = this.img ? this.img.height * s : 30;
    this.modeT -= dt;

    if (this.mode === 'fly') {
      this.stridePhase += dt * this.flapFreq;
      this.fold = (Math.sin(this.stridePhase * TAU / 2) + 1) / 2;
      this.steer(dt, 0.35, 0.06);
      // fluttery jitter on top of the steering — butterflies never fly straight
      this.bob = Math.sin(this.stridePhase * TAU / 2) * ihs * 0.06
        + Math.sin(this.age * 0.7) * ihs * 0.1
        + Math.sin(this.age * 5.3) * ihs * 0.025;
      this.bank = clamp(this.vx * 6, -0.28, 0.28);
      if (this.modeT <= 0 && Math.random() < 0.6) {
        this.mode = 'descend';
        this.depth = Math.random();
        this.tx = clamp(this.xr + rand(-0.1, 0.1), 0.08, 0.92);
      } else if (this.modeT <= 0) {
        this.modeT = rand(6, 14);
      }
    } else if (this.mode === 'descend') {
      const targetYr = (this.groundY() - ihs * 0.35) / H;
      this.stridePhase += dt * this.flapFreq * 0.7;
      this.fold = (Math.sin(this.stridePhase * TAU / 2) + 1) / 2 * 0.8;
      this.yr += (targetYr - this.yr) * Math.min(1, dt * 1.2);
      this.xr += (this.tx - this.xr) * Math.min(1, dt * 1.2);
      if (Math.abs(this.yr - targetYr) < 0.006) {
        this.yr = targetYr;
        this.mode = 'rest';
        this.modeT = rand(2.5, 6);
      }
    } else { // rest — perched, wings slowly opening and closing
      this.fold = 0.45 + Math.sin(this.age * 2.1) * 0.35;
      if (this.modeT <= 0) {
        this.mode = 'fly';
        this.modeT = rand(8, 18);
        this.vy = -0.03;
        this.pickFlyTarget();
      }
    }
  }

  steer(dt, accel, maxV) {
    this.targetT -= dt;
    const dx = this.tx - this.xr, dy = this.ty - this.yr;
    if (this.targetT <= 0 || (Math.abs(dx) < 0.03 && Math.abs(dy) < 0.03)) this.pickFlyTarget();
    this.vx += dx * dt * accel;
    this.vy += dy * dt * accel;
    this.vx = clamp(this.vx, -maxV, maxV);
    this.vy = clamp(this.vy, -maxV, maxV);
    this.vx *= (1 - dt * 0.4);
    this.vy *= (1 - dt * 0.4);
    this.xr = clamp(this.xr + this.vx * dt * 3, 0.03, 0.97);
    this.yr = clamp(this.yr + this.vy * dt * 3, SKY.top, SKY.bottom);
    // hysteresis: only flip on a decisive velocity, so hovering never
    // strands the sprite mid-turn as a paper-thin sliver
    if (Math.abs(this.vx) > 0.012) this.dir = this.vx > 0 ? 1 : -1;
  }

  updatePlant(dt) {
    this.rot = Math.sin(this.age * 0.9) * 0.05 + Math.sin(this.age * 2.3 + 1) * 0.015;
    this.shiverT -= dt;
    if (this.shiverT <= -0.5) {
      this.shiverT = rand(8, 22);
      if (Math.random() < 0.3) this.emote('✨');
    } else if (this.shiverT <= 0) {
      this.rot += Math.sin(this.age * 40) * 0.03; // brief shiver
    }
    this.sqY = 1 + Math.sin(this.age * 1.3) * 0.015;
  }

  // ------------------------------------------------ draw
  easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  draw(g) {
    if (!this.ready) return;
    const s0 = this.targetScale();
    const pop = this.fade < 1 ? this.easeOutBack(this.fade) : 1;
    const alpha = this.fade * (1 - this.dying);
    const s = s0 * pop * (1 - this.dying * 0.6);
    const iw = this.img.width, ih = this.img.height;
    const flying = this.kind === 'bird' || this.kind === 'butterfly';
    const x = this.xr * W;
    const y = flying ? this.yr * H : this.groundY();

    // shadow
    if (!this.isAirborne()) {
      const fy = flying ? y + ih * s * 0.5 : y;
      g.save();
      g.globalAlpha = 0.28 * alpha * (1 - this.bob / (ih * s * 0.5 + 1) * 0.5);
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(x, fy + 4, iw * s * 0.36, ih * s * 0.08, 0, 0, TAU);
      g.fill();
      g.restore();
    }

    // clamp facing so the turn flip never collapses to zero width
    const fxMin = flying ? 0.45 : 0.22;
    let fx = this.facing;
    if (Math.abs(fx) < fxMin) fx = (fx >= 0 ? 1 : -1) * fxMin;

    g.save();
    g.globalAlpha = alpha;

    if (flying) {
      g.translate(x, y - this.bob);
      g.rotate(this.bank + this.rot * (this.facing >= 0 ? 1 : -1));
      g.scale(fx, 1);
      const wingScale = 1 - this.fold * 0.55;
      const hw = iw / 2;
      g.save();
      g.scale(wingScale * s, s);
      g.drawImage(this.left, -hw, -ih / 2);
      g.drawImage(this.right, 0, -ih / 2);
      g.restore();
    } else {
      g.translate(x, y - this.bob);
      g.scale(fx * s * this.sqX, s * this.sqY);
      g.rotate(this.rot);

      if (this.kind === 'slitherer') {
        this.drawWaveStrips(g, iw, ih);
      } else if (this.rig) {
        this.drawRig(g, iw, ih);
      } else if (this.kind === 'prowler' || this.kind === 'stomper') {
        this.drawQuad(g, iw, ih);
      } else {
        // hopper, plant — whole body (motion comes from squash/rot/arc)
        g.drawImage(this.img, -iw / 2, -ih);
      }
    }
    g.restore();

    this.drawFx(g, x, y, ih, s, alpha);
  }

  // segmented body: tail chain + ears + legs behind, torso on top hides joints
  drawRig(g, iw, ih) {
    const R = this.rig;
    for (const t of R.tails) this.drawTailChain(g, t, this.tailRot, iw, ih);
    R.ears.forEach((e, i) =>
      this.drawPivotPart(g, e, this.earRot * (i % 2 ? 0.8 : 1.15), 0, iw, ih));
    R.legs.forEach((L, i) =>
      this.drawPivotPart(g, L, this.legRots[i] || 0, this.legLifts[i] || 0, iw, ih));
    g.drawImage(R.torso, -iw / 2, -ih);
  }

  // parts live in raw-drawing coordinates; the torso sprite adds GLOW_M margin
  drawPivotPart(g, P, rot, lift, iw, ih) {
    g.save();
    g.translate(GLOW_M + P.px - iw / 2, GLOW_M + P.py - ih - lift);
    g.rotate(rot);
    g.drawImage(P.cv, P.ox - P.px, P.oy - P.py);
    g.restore();
  }

  // the tail is a 4-segment chain — each segment rotates a bit more than the
  // one before it, so the wag curls like a whip instead of a stiff paddle
  drawTailChain(g, T, rot, iw, ih) {
    const w = T.cv.width, h = T.cv.height;
    const hor = T.axis === 'h';
    const attach = hor ? clamp(T.px - T.ox, 0, w) : clamp(T.py - T.oy, 0, h);
    const total = hor ? (T.dirOut === 1 ? w - attach : attach) : h - attach;
    const n = 4;
    const step = Math.max(2, total / n);
    for (let j = 0; j < n; j++) {
      const a = rot * Math.pow((j + 1) / n, 1.3);
      let s0, s1;
      if (hor && T.dirOut === 1) {
        s0 = attach + step * j; s1 = Math.min(w, s0 + step + 1);
        if (j === 0) s0 = 0;
      } else if (hor) {
        s1 = attach - step * j; s0 = Math.max(0, s1 - step - 1);
        if (j === 0) s1 = w;
      } else {
        s0 = attach + step * j; s1 = Math.min(h, s0 + step + 1);
        if (j === 0) s0 = 0;
      }
      if (s1 - s0 < 1) continue;
      const jx = hor ? T.px + T.dirOut * step * j : T.px;
      const jy = hor ? T.py : T.py + step * j;
      g.save();
      g.translate(GLOW_M + jx - iw / 2, GLOW_M + jy - ih);
      g.rotate(a);
      if (hor) g.drawImage(T.cv, s0, 0, s1 - s0, h, T.ox + s0 - jx, T.oy - jy, s1 - s0, h);
      else g.drawImage(T.cv, 0, s0, w, s1 - s0, T.ox - jx, T.oy + s0 - jy, w, s1 - s0);
      g.restore();
    }
  }

  // legs scissor in a diagonal gait under a steady body
  drawQuad(g, iw, ih) {
    const legsH = Math.round(ih * 0.34);
    const bodyH = ih - legsH;
    const hw = Math.floor(iw / 2);
    for (let k = 0; k < 2; k++) {
      const shear = (k === 0 ? 1 : -1) * this.legShear;
      g.save();
      g.translate(0, -legsH);
      g.transform(1, 0, shear, 1, 0, 0);
      g.drawImage(this.img, k * hw, bodyH, hw, legsH, -hw + k * hw, 0, hw, legsH);
      g.restore();
    }
    // body drawn last so it hides the leg seam
    g.drawImage(this.img, 0, 0, iw, bodyH + 3, -iw / 2, -ih, iw, bodyH + 3);
  }

  // a traveling wave ripples down the body, tail swinging widest
  drawWaveStrips(g, iw, ih) {
    const N = 16;
    const sw = iw / N;
    for (let i = 0; i < N; i++) {
      const dHead = 1 - (i + 0.5) / N; // 0 at head (front), 1 at tail
      let dy = -Math.sin(this.wavePhase - dHead * 5.5) * this.waveAmp * (0.25 + 0.75 * dHead);
      if (this.headLift > 0 && dHead < 0.28) {
        dy -= this.headLift * (1 - dHead / 0.28);
      }
      g.drawImage(this.img, i * sw, 0, sw + 1, ih, -iw / 2 + i * sw, -ih + dy, sw + 1, ih);
    }
  }

  drawFx(g, x, y, ih, s, alpha) {
    const flying = this.kind === 'bird' || this.kind === 'butterfly';
    const topY = flying ? y - ih * s * 0.55 : y - ih * s;

    // spawn sparkles
    if (this.sparkles.length) {
      g.save();
      for (const sp of this.sparkles) {
        const p = sp.t / sp.life;
        const d = sp.speed * sp.t;
        g.globalAlpha = (1 - p) * 0.9;
        g.fillStyle = p < 0.5 ? '#fff7c8' : '#9dffce';
        g.beginPath();
        const cy = flying ? y : y - ih * s * 0.5;
        g.arc(x + Math.cos(sp.a) * d, cy + Math.sin(sp.a) * d, sp.size * (1 - p), 0, TAU);
        g.fill();
      }
      g.restore();
    }

    // emote bubbles
    for (const e of this.emotes) {
      const p = e.t / e.life;
      g.save();
      g.globalAlpha = (1 - p) * alpha;
      const sc = Math.min(1, p * 6);
      g.font = `${Math.round(H * 0.034 * sc)}px 'Segoe UI Emoji', 'Segoe UI', sans-serif`;
      g.textAlign = 'center';
      g.fillText(e.ch, x + this.facing * 10, topY - 14 - p * H * 0.05);
      g.restore();
    }

    // name label
    if (this.name && this.labelT > 0) {
      const la = clamp(this.labelT, 0, 1) * alpha;
      g.save();
      g.globalAlpha = la;
      g.font = `600 ${Math.round(H * 0.022)}px 'Segoe UI', sans-serif`;
      g.textAlign = 'center';
      const ly = topY - 12;
      g.fillStyle = 'rgba(0,20,10,0.55)';
      const tw = g.measureText(this.name).width;
      g.beginPath();
      g.roundRect(x - tw / 2 - 12, ly - H * 0.024, tw + 24, H * 0.034, 10);
      g.fill();
      g.fillStyle = '#eafff4';
      g.fillText(this.name, x, ly);
      g.restore();
    }
  }
}

function addCreature(data) {
  if (creatures.has(data.id)) return;
  creatures.set(data.id, new Creature(data));
}

function removeCreature(id) {
  const c = creatures.get(id);
  if (c) c.dead = true;
}

// ---------- social encounters ----------
const SOCIAL_KINDS = new Set(['prowler', 'stomper', 'hopper']);
let socialTimer = 0;

function socialPass(dt) {
  socialTimer -= dt;
  if (socialTimer > 0) return;
  socialTimer = 0.5;
  const list = [...creatures.values()].filter(c =>
    c.ready && !c.dead && SOCIAL_KINDS.has(c.kind) &&
    c.greetCd <= 0 && c.state !== 'greet' && c.state !== 'sleep');
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(a.depth - b.depth) > 0.22) continue;
      if (Math.abs(a.xr - b.xr) * W > H * 0.13) continue;
      // meet: both stop, face each other, say hello
      a.setState('greet', 2.4); b.setState('greet', 2.4);
      a.dir = b.xr > a.xr ? 1 : -1;
      b.dir = -a.dir;
      a.greetCd = rand(20, 35); b.greetCd = rand(20, 35);
      return; // one meeting per pass is plenty
    }
  }
}

// ---------- websocket ----------
let ws = null;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    statusEl.classList.add('on');
    ws.send(JSON.stringify({ type: 'hello', role: 'wall' }));
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'init') {
      creatures.clear();
      for (const c of msg.creatures) addCreature(c);
    } else if (msg.type === 'creature') {
      addCreature(msg.creature);
    } else if (msg.type === 'remove') {
      removeCreature(msg.id);
    } else if (msg.type === 'clear') {
      for (const c of creatures.values()) c.dead = true;
    }
  };
  ws.onclose = () => {
    statusEl.classList.remove('on');
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

// ---------- main loop ----------
let lastT = performance.now();
let leafTimer = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const t = now / 1000;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  ctx.drawImage(skyLayer.canvas, 0, 0, W, H);

  // god rays
  const sx = W * 0.72, sy = H * 0.16;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const baseA = 1.9 + i * 0.28 + Math.sin(t * 0.07 + i * 2) * 0.05;
    const wA = 0.05 + Math.sin(t * 0.11 + i) * 0.012;
    const len = H * 1.35;
    const p = 0.045 + Math.sin(t * 0.4 + i * 1.7) * 0.02;
    ctx.fillStyle = `rgba(255,246,190,${Math.max(0.012, p)})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(baseA - wA) * len, sy + Math.sin(baseA - wA) * len);
    ctx.lineTo(sx + Math.cos(baseA + wA) * len, sy + Math.sin(baseA + wA) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // parallax layers
  const farX = Math.sin(t * 0.05) * 5;
  const midX = Math.sin(t * 0.05 + 1) * 9;
  const fgX = Math.sin(t * 0.05 + 2) * PARALLAX;
  ctx.drawImage(farLayer.canvas, -farLayer.extra + farX, 0, W + farLayer.extra * 2, H);
  ctx.drawImage(midLayer.canvas, -midLayer.extra + midX, 0, W + midLayer.extra * 2, H);
  ctx.drawImage(groundLayer.canvas, 0, 0, W, H);

  // creatures
  const list = [...creatures.values()];
  for (const c of list) {
    c.update(dt);
    if (c.dead && c.dying >= 1) creatures.delete(c.id);
  }
  socialPass(dt);

  // dust puffs (under the creatures' feet)
  for (const p of puffs) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 20 * dt;
    const u = p.t / p.life;
    ctx.save();
    ctx.globalAlpha = p.alpha * (1 - u);
    ctx.fillStyle = '#9db89a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 + u * 1.5), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  puffs = puffs.filter(p => p.t < p.life);

  const grounded = list.filter(c => c.ready && !c.isAirborne()).sort((a, b) => a.footY() - b.footY());
  for (const c of grounded) c.draw(ctx);
  for (const c of list.filter(c => c.ready && c.isAirborne())) c.draw(ctx);

  // foreground foliage
  ctx.drawImage(fgLayer.canvas, -fgLayer.extra + fgX, 0, W + fgLayer.extra * 2, H);

  // falling leaves
  leafTimer -= dt;
  if (leafTimer <= 0 && fallingLeaves.length < 12) {
    spawnLeaf();
    leafTimer = rand(1.5, 4);
  }
  for (const lf of fallingLeaves) {
    lf.y += lf.vy * dt;
    lf.phase += lf.swaySpeed * dt;
    lf.rot += lf.rotSpeed * dt;
    const lx = lf.x + Math.sin(lf.phase) * lf.sway;
    if (lf.y > H * 0.85) lf.alpha -= dt * 1.2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, lf.alpha) * 0.8;
    ctx.translate(lx, lf.y);
    ctx.rotate(lf.rot);
    ctx.fillStyle = lf.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, lf.size, lf.size * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  fallingLeaves = fallingLeaves.filter(lf => lf.alpha > 0);

  // fireflies
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of fireflies) {
    const fx = f.x + Math.sin(t * f.s1 + f.p1) * 60 + Math.sin(t * f.s2 + f.p3) * 25;
    const fy = f.y + Math.cos(t * f.s2 + f.p2) * 40;
    const glow = (Math.sin(t * f.blink + f.p1) + 1) / 2;
    if (glow < 0.15) continue;
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 10);
    grad.addColorStop(0, `rgba(240,255,170,${0.85 * glow})`);
    grad.addColorStop(0.3, `rgba(200,255,140,${0.35 * glow})`);
    grad.addColorStop(1, 'rgba(200,255,140,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, 10, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // empty-jungle invitation
  if (creatures.size === 0) {
    const a = (Math.sin(t * 1.2) + 1) / 2 * 0.35 + 0.45;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eafff4';
    ctx.font = `700 ${Math.round(H * 0.055)}px 'Segoe UI', sans-serif`;
    ctx.fillText('🌿 The Digital Jungle 🌿', W / 2, H * 0.4);
    ctx.font = `400 ${Math.round(H * 0.028)}px 'Segoe UI', sans-serif`;
    ctx.fillText('Draw a creature to bring the jungle to life!', W / 2, H * 0.48);
    ctx.restore();
  }

  requestAnimationFrame(frame);
}

// ---------- setup ----------
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  buildBackground();
  initAmbient();
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  } else if (e.key === 'h' || e.key === 'H') {
    hintEl.style.opacity = hintEl.style.opacity === '0' ? '1' : '0';
  } else if (e.key === 'c' || e.key === 'C') {
    if (confirm('Clear the whole jungle?') && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'clear' }));
    }
  }
});

fetch('/info').then(r => r.json()).then(info => {
  hintEl.textContent = `🎨 Draw at  http://${info.ip}:${info.port}/draw   ·   F fullscreen · C clear · H hide`;
}).catch(() => { hintEl.textContent = ''; });

resize();
connect();
requestAnimationFrame(frame);
