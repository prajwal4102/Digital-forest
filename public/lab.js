// Digital Jungle — layer-by-layer rebuild
// LAYER 1 — DEEP BACKGROUND: soft sky, distant rolling hills, far tree-line
// silhouettes, hazier tree clusters, mist between layers, gentle sun glow,
// sparse floating pollen. Warm enchanted-storybook forest, painterly & calm.
// Center horizon stays open — everything else arrives in later layers.

import * as THREE from './vendor/three.module.js';

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const TAU = Math.PI * 2;

window.addEventListener('error', (e) => {
  document.getElementById('tag').textContent = '⚠ ' + e.message;
});

// ---------- renderer / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// child's eye level, gazing gently into the distance
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
camera.position.set(0, 1.7, 12.5);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---------- canvas helpers ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function radialTex(size, stops) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return canvasTex(c);
}

// ============================================================
// LAYER 1 — DEEP BACKGROUND
// ============================================================

// ---- sky: luminous near the horizon, deeper green-blue above ----
const SUN_DIR = new THREE.Vector3(0.42, 0.3, -0.82).normalize(); // clearly up in the open sky
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f8ecb) },   // soft storybook blue
      mid: { value: new THREE.Color(0x9fd0e8) },   // pale blue
      hor: { value: new THREE.Color(0xf6eec6) },   // warm cream at the horizon
      warm: { value: new THREE.Color(0xfff3c4) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: `
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 warm;
      uniform vec3 sunDir;
      varying vec3 vP;
      void main() {
        vec3 d = normalize(vP);
        float h = d.y;
        vec3 c = h > 0.3 ? mix(mid, top, smoothstep(0.3, 0.9, h))
                         : mix(hor, mid, smoothstep(-0.05, 0.3, h));
        float s = pow(max(dot(d, sunDir), 0.0), 4.0);
        c = mix(c, warm, s * 0.5 * smoothstep(-0.05, 0.4, h + 0.15));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(220, 32, 20), skyMat));
}

// gentle atmosphere for the (future) mid/foreground; painted layers opt out
scene.fog = new THREE.FogExp2(0xbcd9c2, 0.009);

// ---- lighting (soft, warm, storybook daylight) ----
scene.add(new THREE.HemisphereLight(0xcfe6f2, 0x4a6b4e, 1.05));
scene.add(new THREE.AmbientLight(0x7fa87f, 0.35));
const sun = new THREE.DirectionalLight(0xfff0c2, 1.6);
sun.position.copy(SUN_DIR).multiplyScalar(40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0015;
scene.add(sun);

// ---- painterly distance layers (painted canvases on soft billboards) ----
// Each layer is hand-painted with organic, non-repeating silhouettes and a
// canvas blur so far things melt into the haze. Scene fog is disabled on
// them — their haze is painted in, mixed toward the horizon color.

const HAZE = new THREE.Color(0xe9efc6); // what "far away" fades into

function paintSilhouette({ w = 4096, h = 400, blur, color, haze, kind }) {
  // draw sharp shapes first; blur ONCE at the end (per-draw blur is way too slow)
  const sharp = makeCanvas(w, h);
  const g = sharp.getContext('2d');
  const base = new THREE.Color(color).lerp(HAZE, haze);
  const lite = base.clone().lerp(new THREE.Color(0xd6ecb8), 0.22); // sun-kissed side (light green, not beige)
  const dark = base.clone().lerp(new THREE.Color(0x16332a), 0.26); // shaded side
  const css = (col) => '#' + col.getHexString();
  g.fillStyle = css(base);

  // natural crown: irregular blob mass, ragged leafy edge, a shaded underside
  // and sunlight catching the upper-right — texture instead of a flat shape
  const crown = (cx, cy, r) => {
    g.fillStyle = css(base);
    for (let b = 0; b < 6; b++) {
      g.beginPath();
      g.arc(cx + rand(-r, r) * 0.6, cy + rand(-r * 0.5, r * 0.4), r * rand(0.35, 0.6), 0, TAU);
      g.fill();
    }
    for (let s2 = 0; s2 < 14; s2++) { // ragged leafy edge
      const a = rand(-Math.PI, 0);
      g.beginPath();
      g.arc(cx + Math.cos(a) * r * rand(0.7, 1.08), cy + Math.sin(a) * r * rand(0.5, 0.85), r * rand(0.07, 0.16), 0, TAU);
      g.fill();
    }
    // shading and sunlight are painted ONLY onto existing foliage pixels
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.3;
    g.fillStyle = css(dark); // shaded mass, lower left
    for (let s2 = 0; s2 < 4; s2++) {
      g.beginPath();
      g.arc(cx - r * rand(0.05, 0.45), cy + r * rand(0.1, 0.42), r * rand(0.2, 0.38), 0, TAU);
      g.fill();
    }
    g.fillStyle = css(lite); // sunlight on the upper right
    for (let s2 = 0; s2 < 4; s2++) {
      g.beginPath();
      g.arc(cx + r * rand(0.15, 0.5), cy - r * rand(0.05, 0.4), r * rand(0.14, 0.3), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = css(base);
  };

  // dappled tonal noise across everything drawn so far — foliage shimmer
  const dapple = (count, rMin, rMax) => {
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < count; i++) {
      g.fillStyle = Math.random() < 0.72 ? css(dark) : css(lite);
      g.globalAlpha = rand(0.04, 0.1);
      g.beginPath();
      g.arc(rand(0, w), rand(0, h), rand(rMin, rMax), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };

  if (kind === 'hills') {
    // broad, overlapping rolls with real rise and fall
    let x = -w * 0.05;
    while (x < w * 1.05) {
      const rw = rand(w * 0.16, w * 0.36);
      const rh = rand(h * 0.16, h * 0.38);
      const cy = h * rand(0.48, 0.62);
      g.beginPath();
      g.ellipse(x, cy, rw, rh, 0, Math.PI, 0);
      g.lineTo(x + rw, h); g.lineTo(x - rw, h);
      g.closePath();
      g.fill();
      x += rw * rand(0.5, 1.0);
    }
  } else if (kind === 'treeline') {
    // a mostly continuous canopy ridge, irregular, with occasional dips
    let x = -60;
    const baseY = h * 0.58;
    while (x < w + 60) {
      const r = rand(30, 85);
      const tall = Math.random() < 0.12;
      const cy = baseY - (tall ? rand(70, 130) : rand(-10, 45));
      crown(x, cy, r);
      // fill down to the bottom under the crown, shoulders rounded off
      g.fillRect(x - r * 0.55, cy + r * 0.15, r * 1.1, h - cy);
      g.beginPath();
      g.arc(x - r * 0.55, cy + r * 0.45, r * 0.35, 0, TAU);
      g.arc(x + r * 0.55, cy + r * 0.45, r * 0.35, 0, TAU);
      g.fill();
      if (tall && Math.random() < 0.7) g.fillRect(x - 3, cy, 6, baseY - cy + 24);
      x += r * rand(0.55, Math.random() < 0.12 ? 2.6 : 1.15); // rare dips of sky
    }
    // continuous understory hedge so no gaps open below the crowns
    g.fillStyle = css(base);
    g.fillRect(0, baseY + 8, w, h - baseY - 8);
  } else { // 'clusters' — clumps of indistinct trees with clear gaps between
    const baseY = h * 0.68;
    let x = rand(0, 160);
    while (x < w) {
      const clump = randInt(2, 5);
      const clumpCol = base.clone().offsetHSL(rand(-0.02, 0.02), rand(-0.05, 0.05), rand(-0.04, 0.03));
      g.fillStyle = '#' + clumpCol.getHexString();
      let cx = x;
      for (let i = 0; i < clump; i++) {
        const r = rand(55, 95);
        const cy = baseY - rand(40, 100);
        crown(cx, cy, r);
        g.fillStyle = css(dark);
        g.fillRect(cx - rand(4, 6), cy + r * 0.2, rand(8, 12), baseY - cy + 18);
        cx += r * rand(0.7, 1.1);
      }
      x = cx + rand(180, 460); // clear gap before the next clump
    }
  }

  dapple(kind === 'hills' ? 1600 : 2200, 3, kind === 'clusters' ? 9 : 13);

  // single blur pass, then a faint light kissing the top of the far canopy
  const c = makeCanvas(w, h);
  const out = c.getContext('2d');
  out.filter = `blur(${blur}px)`;
  out.drawImage(sharp, 0, 0);
  out.filter = 'none';
  out.globalCompositeOperation = 'source-atop';
  const glow = out.createLinearGradient(0, h * 0.35, 0, h);
  glow.addColorStop(0, 'rgba(255,246,205,0.28)');
  glow.addColorStop(0.5, 'rgba(255,246,205,0.05)');
  glow.addColorStop(1, 'rgba(25,50,34,0.15)');
  out.fillStyle = glow;
  out.fillRect(0, 0, w, h);
  return c;
}

function distanceLayer(opts, z, worldW, worldH, yBottom) {
  const cv = paintSilhouette(opts);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(worldW, worldH),
    new THREE.MeshBasicMaterial({
      map: canvasTex(cv), transparent: true, depthWrite: false, fog: false,
    }),
  );
  m.position.set(0, yBottom + worldH / 2, z);
  scene.add(m);
  return m;
}

// farthest → nearest: soft blue-green far away, rich green up close —
// every band clearly readable, haze kept light so nothing gets buried
distanceLayer({ kind: 'hills', blur: 6, color: 0x7aa89b, haze: 0.32 }, -120, 320, 34, -4);
distanceLayer({ kind: 'hills', blur: 5, color: 0x649472, haze: 0.2 }, -100, 270, 26, -3.5);
distanceLayer({ kind: 'treeline', blur: 3, color: 0x487e58, haze: 0.08 }, -80, 220, 18, -2.5);
distanceLayer({ kind: 'clusters', blur: 1.5, color: 0x2f6a44, haze: 0 }, -62, 170, 15, -1.8);

// ---- soft clouds drifting across the sky ----
const clouds = [];
{
  const makeCloudPlane = (z, y, w2, o) => {
    const cw = 2048, ch = 512;
    const sharp = makeCanvas(cw, ch);
    const g = sharp.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const cx = rand(cw * 0.08, cw * 0.92), cy = rand(ch * 0.3, ch * 0.7), s = rand(60, 140);
      for (let b = 0; b < 14; b++) {
        g.fillStyle = `rgba(255,252,244,${rand(0.4, 0.85)})`;
        g.beginPath();
        g.ellipse(
          cx + rand(-s * 2.6, s * 2.6), cy + rand(-s * 0.45, s * 0.45),
          rand(s * 0.5, s * 1.3), rand(s * 0.18, s * 0.42), 0, 0, TAU);
        g.fill();
      }
    }
    const c = makeCanvas(cw, ch);
    const out = c.getContext('2d');
    out.filter = 'blur(16px)';
    out.drawImage(sharp, 0, 0);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w2, w2 * (ch / cw) * 0.55),
      new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, opacity: o, depthWrite: false, fog: false }),
    );
    m.position.set(rand(-25, 25), y, z);
    m.userData.speed = rand(0.12, 0.28);
    clouds.push(m);
    scene.add(m);
  };
  makeCloudPlane(-150, 48, 420, 0.5);
  makeCloudPlane(-140, 30, 340, 0.38);
}

// ---- mist drifting between the layers ----
const mists = [];
{
  const mistCv = makeCanvas(512, 128);
  const g = mistCv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(232,244,206,0)');
  grad.addColorStop(0.5, 'rgba(232,244,206,0.85)');
  grad.addColorStop(1, 'rgba(232,244,206,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 128);
  // soften the strip's ends so it never shows a hard edge
  const side = g.createLinearGradient(0, 0, 512, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.2, 'rgba(0,0,0,0)');
  side.addColorStop(0.8, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 512, 128);
  const tex = canvasTex(mistCv);
  for (const [z, y, w2, o] of [[-90, 2.5, 190, 0.16], [-70, 2.2, 150, 0.1]]) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w2, w2 * 0.09),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: o, depthWrite: false, fog: false }),
    );
    m.position.set(rand(-10, 10), y, z);
    m.userData = { baseX: m.position.x, speed: rand(0.008, 0.02), phase: rand(0, TAU) };
    mists.push(m);
    scene.add(m);
  }
}

// ---- the sun: a clearly visible warm disc with a soft halo ----
{
  const sunAnchor = SUN_DIR.clone().multiplyScalar(150);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTex(256, [[0, 'rgba(255,246,200,0.55)'], [0.35, 'rgba(255,240,185,0.18)'], [1, 'rgba(255,240,185,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.setScalar(70);
  halo.position.copy(sunAnchor);
  scene.add(halo);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTex(256, [
      [0, 'rgba(255,252,238,1)'], [0.42, 'rgba(255,248,215,1)'],
      [0.5, 'rgba(255,242,190,0.5)'], [0.7, 'rgba(255,240,185,0.12)'], [1, 'rgba(255,240,185,0)'],
    ]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  disc.scale.setScalar(22);
  disc.position.copy(sunAnchor);
  scene.add(disc);
}

// ---- sparse floating pollen / dust ----
let pollen;
{
  const n = 36;
  const pts = new Float32Array(n * 3);
  const base = [];
  for (let i = 0; i < n; i++) {
    const b = { x: rand(-16, 16), y: rand(0.6, 7), z: rand(-20, 8), p: rand(0, TAU), s: rand(0.05, 0.16) };
    base.push(b);
    pts.set([b.x, b.y, b.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  pollen = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.09, map: radialTex(64, [[0, 'rgba(255,250,220,0.9)'], [1, 'rgba(255,250,220,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    color: 0xfff6d8, sizeAttenuation: true, opacity: 0.55,
  }));
  pollen.userData.base = base;
  scene.add(pollen);
}

// ---- placeholder stage floor, melting into the horizon haze ----
{
  const geo = new THREE.PlaneGeometry(300, 160, 1, 48);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -30);
  const pos = geo.attributes.position;
  const near = new THREE.Color(0x4c7048), far = new THREE.Color(0xcfe4ac);
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = clamp((10 - z) / 75, 0, 1); // fades to haze into the distance
    const c = near.clone().lerp(far, t);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1,
  }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ============================================================
// LAYER 2 — MID-DISTANCE TREES
// Individually painted trees on transparent billboards, standing in real
// 3D space (z −40 … −11). Three depth tiers inside the layer: far trees
// lighter/softer, near trees darker with stronger silhouettes. The center
// stays open — trees frame the future clearing from the sides.
// ============================================================

const cssCol = (c) => '#' + c.getHexString();

function paintTree(tier) { // 0 = far, 1 = middle, 2 = nearer
  const W = 680, H = 768;
  const sharp = makeCanvas(W, H);
  const g = sharp.getContext('2d');

  const GREENS2 = [0x1e4d33, 0x2f6b46, 0x2e7553, 0x55703c, 0x6f9652, 0x24593c];
  const hazeMix = [0.32, 0.15, 0.04][tier];
  const mainGreen = new THREE.Color(pick(GREENS2)).lerp(HAZE, hazeMix);
  const altGreen = mainGreen.clone().offsetHSL(rand(-0.02, 0.02), rand(-0.06, 0.06), rand(-0.05, 0.05));
  const dark = mainGreen.clone().lerp(new THREE.Color(0x102b1f), 0.38);
  const lite = mainGreen.clone().lerp(new THREE.Color(0xd8ecb0), 0.3);
  const trunkC = new THREE.Color(pick([0x4a3c30, 0x554738, 0x4a443a])).lerp(HAZE, hazeMix * 0.7);
  const trunkLite = trunkC.clone().lerp(new THREE.Color(0xd8b884), 0.4);

  // ---- trunk: a gently curved, tapering polygon (never a straight pole)
  const baseX = W / 2 + rand(-24, 24);
  const baseY = H - 12;
  const trunkH = H * rand(0.42, 0.56);
  const leanPx = rand(-60, 60);
  const ctrlX = baseX + leanPx * rand(0.15, 0.7);
  const topX = baseX + leanPx;
  const topY = baseY - trunkH;
  const w0 = H * rand(0.026, 0.048) * (tier === 2 ? 1.2 : 1);
  const w1 = w0 * rand(0.32, 0.5);
  const PT = (t) => [
    (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * ctrlX + t * t * topX,
    (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * (baseY - trunkH * 0.55) + t * t * topY,
  ];
  g.fillStyle = cssCol(trunkC);
  g.beginPath();
  const NSEG = 8;
  for (let i = 0; i <= NSEG; i++) {
    const t = i / NSEG;
    const [x, y] = PT(t);
    const hw = lerp(w0, w1, t) / 2;
    if (i === 0) g.moveTo(x - hw, y); else g.lineTo(x - hw, y);
  }
  for (let i = NSEG; i >= 0; i--) {
    const t = i / NSEG;
    const [x, y] = PT(t);
    g.lineTo(x + lerp(w0, w1, t) / 2, y);
  }
  g.closePath();
  g.fill();
  // root flare
  g.beginPath();
  g.moveTo(baseX - w0 * 1.5, baseY);
  g.quadraticCurveTo(baseX - w0 * 0.55, baseY - w0 * 0.9, baseX - w0 * 0.4, baseY - w0 * 1.4);
  g.lineTo(baseX + w0 * 0.4, baseY - w0 * 1.4);
  g.quadraticCurveTo(baseX + w0 * 0.55, baseY - w0 * 0.9, baseX + w0 * 1.5, baseY);
  g.closePath();
  g.fill();
  // warm light on the sun side of the trunk
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.4;
  g.fillStyle = cssCol(trunkLite);
  for (let i = 0; i < NSEG; i++) {
    const t = i / NSEG;
    const [x, y] = PT(t);
    const hw = lerp(w0, w1, t) / 2;
    g.fillRect(x + hw * 0.25, y - trunkH / NSEG - 2, hw * 0.55, trunkH / NSEG + 4);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  // ---- branches reaching out of the upper trunk; their tips seed foliage
  const anchors = [[topX, topY]];
  const branches = randInt(2, 4);
  const forked = Math.random() < 0.35;
  for (let b = 0; b < branches + (forked ? 1 : 0); b++) {
    const t0 = forked && b === 0 ? rand(0.5, 0.65) : rand(0.7, 0.98);
    const [sx, sy] = PT(t0);
    const ang = rand(-2.5, -0.6) * (Math.random() < 0.5 ? 1 : -1) * 0.55 - Math.PI / 2 * 0.2;
    const len = trunkH * rand(0.22, forked && b === 0 ? 0.5 : 0.38);
    const dir = pick([-1, 1]);
    const ex = sx + Math.cos(ang) * len * dir;
    const ey = sy - Math.abs(Math.sin(ang)) * len * rand(0.5, 1);
    g.strokeStyle = cssCol(trunkC);
    g.lineCap = 'round';
    let px = sx, py = sy;
    for (let s2 = 1; s2 <= 3; s2++) {
      const tt = s2 / 3;
      const nx = lerp(sx, ex, tt) + rand(-6, 6);
      const ny = lerp(sy, ey, tt) + rand(-4, 4);
      g.lineWidth = lerp(w1 * 0.9, w1 * 0.25, tt);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(nx, ny);
      g.stroke();
      px = nx; py = ny;
    }
    anchors.push([ex, ey]);
  }

  // ---- canopy: several irregular leaf masses around the anchors
  const canopyR = H * rand(0.11, 0.16);
  const wide = Math.random() < 0.5; // wide crown vs tall crown
  const masses = randInt(5, 8);
  const leafMass = (cx, cy, r, col) => {
    g.fillStyle = cssCol(col);
    for (let b = 0; b < 6; b++) {
      g.beginPath();
      g.arc(cx + rand(-r, r) * 0.55, cy + rand(-r * 0.45, r * 0.4), r * rand(0.35, 0.6), 0, TAU);
      g.fill();
    }
    for (let s2 = 0; s2 < 16; s2++) { // leafy ragged edge
      const a = rand(0, TAU);
      g.beginPath();
      g.arc(cx + Math.cos(a) * r * rand(0.65, 1.05), cy + Math.sin(a) * r * rand(0.5, 0.9) * 0.8, r * rand(0.06, 0.14), 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.26;
    g.fillStyle = cssCol(dark);
    for (let s2 = 0; s2 < 3; s2++) {
      g.beginPath();
      g.arc(cx - r * rand(0, 0.4), cy + r * rand(0.05, 0.4), r * rand(0.25, 0.45), 0, TAU);
      g.fill();
    }
    g.fillStyle = cssCol(lite);
    for (let s2 = 0; s2 < 2; s2++) {
      g.beginPath();
      g.arc(cx + r * rand(0.1, 0.4), cy - r * rand(0, 0.35), r * rand(0.22, 0.38), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };
  for (let m = 0; m < masses; m++) {
    const [ax, ay] = pick(anchors);
    const spreadX = canopyR * (wide ? rand(0.4, 2.0) : rand(0.3, 1.1));
    const spreadY = canopyR * (wide ? rand(0.25, 0.9) : rand(0.5, 1.6));
    leafMass(
      clamp(ax + rand(-spreadX, spreadX), canopyR * 1.25, W - canopyR * 1.25),
      clamp(ay - rand(0, spreadY), canopyR * 1.2, H),
      canopyR * rand(0.7, 1.05),
      Math.random() < 0.5 ? mainGreen : altGreen);
  }
  // small light gaps in the canopy (skip the far tier — too soft to matter)
  if (tier > 0) {
    g.globalCompositeOperation = 'destination-out';
    for (let hole = 0; hole < randInt(2, 4); hole++) {
      g.globalAlpha = rand(0.5, 0.9);
      g.beginPath();
      g.arc(topX + rand(-canopyR * 1.4, canopyR * 1.4), topY - rand(0, canopyR * 1.2), rand(5, 13), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ---- tiny grass tuft at the base (sometimes)
  if (Math.random() < 0.6) {
    g.strokeStyle = cssCol(dark);
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let s2 = 0; s2 < randInt(4, 9); s2++) {
      const gx = baseX + rand(-w0 * 2.2, w0 * 2.2);
      g.beginPath();
      g.moveTo(gx, baseY + 6);
      g.quadraticCurveTo(gx + rand(-6, 6), baseY - rand(6, 16), gx + rand(-12, 12), baseY - rand(14, 26));
      g.stroke();
    }
  }

  // far trees melt slightly into the atmosphere
  if (tier === 0) {
    const c = makeCanvas(W, H);
    const out = c.getContext('2d');
    out.filter = 'blur(1.4px)';
    out.drawImage(sharp, 0, 0);
    return c;
  }
  return sharp;
}

const midTrees = [];
{
  // organic clusters framing the center; the clearing itself stays open
  const clusters = [
    { x: -18, n: randInt(2, 3) }, { x: -12, n: randInt(2, 4) }, { x: -7, n: randInt(1, 2) },
    { x: 6.5, n: randInt(1, 2) }, { x: 11.5, n: randInt(2, 4) }, { x: 17, n: randInt(2, 3) },
    { x: rand(-4, 4), n: randInt(1, 2), farOnly: true }, // small distant trees peeking through the middle
    // guaranteed strong framing trees so no random roll leaves the sides bare
    { x: -rand(9.5, 13), n: 1, nearOnly: true },
    { x: rand(9.5, 13), n: 1, nearOnly: true },
  ];
  for (const cl of clusters) {
    for (let i = 0; i < cl.n; i++) {
      const tier = cl.farOnly ? 0 : cl.nearOnly ? 2 : (Math.random() < 0.35 ? 0 : Math.random() < 0.6 ? 1 : 2);
      const z = [rand(-40, -28), rand(-26, -18), rand(-16, -11)][tier];
      const worldH = [rand(6.5, 9), rand(9, 12.5), rand(12, 15.5)][tier];
      let x = cl.x + rand(-2.4, 2.4);
      // keep the central stage clear of near/mid trunks
      const minX = [2.2, 4.5, 7.5][tier];
      if (Math.abs(x) < minX) x = Math.sign(x || 1) * (minX + rand(0, 1.5));
      const cv = paintTree(tier);
      const mat = new THREE.MeshBasicMaterial({
        map: canvasTex(cv), transparent: true, depthWrite: false, fog: false,
      });
      const geo = new THREE.PlaneGeometry(worldH * (680 / 768), worldH);
      geo.translate(0, worldH / 2, 0); // pivot at the roots
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0.02, z);
      if (Math.random() < 0.5) m.scale.x = -1; // free variation
      m.userData = { swayAmp: rand(0.004, 0.011), swaySpeed: rand(0.35, 0.7), phase: rand(0, TAU) };
      midTrees.push(m);
      scene.add(m);
    }
  }
}

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const t = clock.elapsedTime;
  const dt = Math.min(0.05, clock.getDelta());

  // slow, gentle camera breathing
  camera.position.x = Math.sin(t * 0.04) * 0.4;
  camera.position.y = 1.7 + Math.sin(t * 0.07) * 0.08;
  camera.lookAt(0, 2.6, -20);

  // mist drifts sideways, barely
  for (const m of mists) {
    m.position.x = m.userData.baseX + Math.sin(t * m.userData.speed * 10 + m.userData.phase) * 4;
  }

  // clouds cross the sky very slowly, wrapping around
  for (const cl of clouds) {
    cl.position.x += cl.userData.speed * dt;
    if (cl.position.x > 90) cl.position.x = -90;
  }

  // mid-distance trees breathe in the breeze
  for (const tr of midTrees) {
    tr.rotation.z = Math.sin(t * tr.userData.swaySpeed + tr.userData.phase) * tr.userData.swayAmp;
  }

  // pollen floats and twinkles
  if (pollen) {
    const pos = pollen.geometry.attributes.position;
    const base = pollen.userData.base;
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      pos.setXYZ(i,
        b.x + Math.sin(t * b.s + b.p) * 1.4,
        b.y + Math.sin(t * b.s * 1.7 + b.p * 2) * 0.5,
        b.z + Math.cos(t * b.s * 0.8 + b.p) * 0.8);
    }
    pos.needsUpdate = true;
    pollen.material.opacity = 0.45 + Math.sin(t * 0.5) * 0.12;
  }

  renderer.render(scene, camera);
}
frame();
