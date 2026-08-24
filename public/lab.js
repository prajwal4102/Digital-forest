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
const SUN_DIR = new THREE.Vector3(0.42, 0.38, -0.78).normalize(); // clearly up in the open sky
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
        c = mix(c, vec3(0.38, 0.485, 0.44), smoothstep(-0.002, -0.16, h)); // cool neutral haze below the horizon
        float s = pow(max(dot(d, sunDir), 0.0), 4.0);
        c = mix(c, warm, s * 0.5 * smoothstep(-0.05, 0.4, h + 0.15) * smoothstep(-0.05, 0.02, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(220, 32, 20), skyMat));
}

// gentle atmosphere for the (future) mid/foreground; painted layers opt out
scene.fog = new THREE.FogExp2(0xbcd9c2, 0.009);

// ---- lighting (soft, warm, storybook daylight) ----
scene.add(new THREE.HemisphereLight(0xcfe6f2, 0x55795a, 1.2));
scene.add(new THREE.AmbientLight(0x86b088, 0.55));
const sun = new THREE.DirectionalLight(0xfff0c2, 1.6);
sun.position.copy(SUN_DIR).multiplyScalar(40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0015;
scene.add(sun);
// soft fill from behind the camera so camera-facing foliage never goes murky
const fill = new THREE.DirectionalLight(0xd8f2dc, 0.9);
fill.position.set(-6, 9, 22);
scene.add(fill);

// ---- painterly distance layers (painted canvases on soft billboards) ----
// Each layer is hand-painted with organic, non-repeating silhouettes and a
// canvas blur so far things melt into the haze. Scene fog is disabled on
// them — their haze is painted in, mixed toward the horizon color.

const HAZE = new THREE.Color(0xe9efc6); // what "far away" fades into
const proceduralBG = []; // hidden when hand-painted plates are provided

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
    for (let b = 0; b < 8; b++) {
      g.beginPath();
      g.arc(cx + rand(-r, r) * 0.8, cy + rand(-r * 0.45, r * 0.4), r * rand(0.32, 0.58), 0, TAU);
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
      if (tall && Math.random() < 0.6) {
        g.beginPath();
        g.moveTo(x - 5, baseY + 20);
        g.lineTo(x + 5, baseY + 20);
        g.lineTo(x + 1.5, cy);
        g.lineTo(x - 1.5, cy);
        g.closePath();
        g.fill();
      }
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
        const cy = baseY - rand(26, 72);
        const lean2 = rand(-12, 12);
        const tw = rand(7, 11);
        g.fillStyle = css(dark);
        g.beginPath();
        g.moveTo(cx - tw, baseY + 16);
        g.lineTo(cx + tw, baseY + 16);
        g.lineTo(cx + lean2 + tw * 0.35, cy + r * 0.25);
        g.lineTo(cx + lean2 - tw * 0.35, cy + r * 0.25);
        g.closePath();
        g.fill();
        g.fillStyle = '#' + clumpCol.getHexString();
        crown(cx + lean2 * 0.6, cy, r);
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
  // fade to transparent toward the canvas bottom - no opaque slab below the horizon
  out.globalCompositeOperation = 'destination-out';
  const fade = out.createLinearGradient(0, h * 0.72, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  out.fillStyle = fade;
  out.fillRect(0, h * 0.72, w, h * 0.28);
  out.globalCompositeOperation = 'source-over';
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
proceduralBG.push(
  distanceLayer({ kind: 'hills', blur: 6, color: 0x7aa89b, haze: 0.32 }, -120, 320, 34, -4),
  distanceLayer({ kind: 'hills', blur: 5, color: 0x649472, haze: 0.2 }, -100, 270, 26, -3.5),
  distanceLayer({ kind: 'treeline', blur: 3, color: 0x487e58, haze: 0.08 }, -80, 220, 18, -2.5),
  distanceLayer({ kind: 'clusters', blur: 1.5, color: 0x2f6a44, haze: 0 }, -62, 170, 15, -1.8),
);

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
    proceduralBG.push(m);
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
  grad.addColorStop(0, 'rgba(222,236,218,0)');
  grad.addColorStop(0.5, 'rgba(222,236,218,0.85)');
  grad.addColorStop(1, 'rgba(222,236,218,0)');
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
    proceduralBG.push(m);
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
  proceduralBG.push(halo);
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
  proceduralBG.push(disc);
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
// (intentionally no ground here — the real terrain arrives as its own layer)

// ============================================================
// LAYER 2 — MID-DISTANCE TREES (true 3D)
// Volumetric trees: curved tapering trunk tubes, branches growing in all
// directions (toward and away from the camera too), canopies sculpted from
// noise-displaced leaf blobs merged per tree. Lit by the real sun, faded
// by real fog — the depth is physical, not painted.
// ============================================================

const WIND = { time: { value: 0 }, gust: { value: 1 } };
function addWind(mat, strength, heightK) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWTime = WIND.time;
    sh.uniforms.uWGust = WIND.gust;
    sh.uniforms.uWStr = { value: strength };
    sh.uniforms.uWHk = { value: heightK };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform float uWTime; uniform float uWGust; uniform float uWStr; uniform float uWHk;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wpos = modelMatrix * vec4(transformed, 1.0);
          float wh = clamp(wpos.y * uWHk, 0.0, 1.4);
          float sway = sin(uWTime * 1.1 + wpos.x * 0.35 + wpos.z * 0.5)
                     + 0.6 * sin(uWTime * 1.9 + wpos.x * 0.9 + wpos.y * 0.5);
          float flut = sin(uWTime * 4.6 + wpos.x * 2.8 + wpos.y * 2.1 + wpos.z * 1.9);
          float flut2 = sin(uWTime * 6.4 + wpos.x * 7.3 + wpos.y * 5.9 + wpos.z * 6.1);
          float k = uWStr * uWGust * wh;
          transformed.x += (sway * 0.06 + flut * 0.018 + flut2 * 0.012) * k;
          transformed.z += (sway * 0.04 + flut * 0.014 + flut2 * 0.01) * k;
          transformed.y += (flut * 0.016 + flut2 * 0.012) * k;
        }
      `);
  };
}

// bark and leaf-surface micro textures (procedural)
const barkTexture = (() => {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#57493b';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 240; i++) {
    g.strokeStyle = `rgba(${randInt(24, 74)},${randInt(20, 62)},${randInt(14, 44)},${rand(0.16, 0.4)})`;
    g.lineWidth = rand(1, 3.4);
    const x = rand(0, 128);
    g.beginPath();
    g.moveTo(x, -8);
    g.bezierCurveTo(x + rand(-9, 9), 64, x + rand(-9, 9), 176, x + rand(-11, 11), 264);
    g.stroke();
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(${randInt(70, 100)},${randInt(105, 135)},${randInt(70, 95)},${rand(0.08, 0.2)})`;
    g.beginPath();
    g.ellipse(rand(0, 128), rand(0, 256), rand(2, 8), rand(4, 13), 0, 0, TAU);
    g.fill();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

// 2x2 atlas of leaf sprigs — a twig with individual veined leaves
const leafAtlasTexture = (() => {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');
  const PAIRS = [['#2a6e3f', '#7fae4e'], ['#1f5c38', '#5f9a4a'], ['#35804c', '#a3c464'], ['#2a6444', '#6fa055']];
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 256, oy = (v > 1 ? 1 : 0) * 256;
    g.save();
    g.beginPath();
    g.rect(ox + 6, oy + 6, 244, 244);
    g.clip();
    g.translate(ox + 128, oy + 128);
    g.strokeStyle = '#3d3226';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-92, 62);
    g.quadraticCurveTo(0, 12, 94, -42);
    g.stroke();
    const [c0, c1] = PAIRS[v];
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const bx = lerp(-88, 88, t);
      const by = lerp(58, -38, t) - Math.sin(t * 3) * 6;
      const ang = rand(-2.6, -0.5) + (i % 2 ? 1.9 : 0);
      const L = rand(52, 88), W2 = rand(22, 35);
      g.save();
      g.translate(bx, by);
      g.rotate(ang);
      const grad = g.createLinearGradient(0, 0, L, 0);
      grad.addColorStop(0, c0);
      grad.addColorStop(1, c1);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(L * 0.3, -W2, L * 0.75, -W2 * 0.6, L, 0);
      g.bezierCurveTo(L * 0.75, W2 * 0.6, L * 0.3, W2, 0, 0);
      g.fill();
      g.strokeStyle = 'rgba(255,255,230,0.14)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(4, 0);
      g.lineTo(L - 6, 0);
      g.stroke();
      g.restore();
    }
    g.restore();
  }
  return canvasTex(c);
})();

const woodMat = new THREE.MeshStandardMaterial({ map: barkTexture, roughness: 1 });
const coreMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 1, map: leafAtlasTexture,
  alphaTest: 0.35, side: THREE.DoubleSide,
  emissive: 0x1a4526, emissiveIntensity: 0.35,
});
addWind(leafMat, 0.9, 0.12);
addWind(coreMat, 0.45, 0.12);
addWind(woodMat, 0.1, 0.08);

const LEAF_GREENS = [0x3f8a57, 0x52a069, 0x3a7c50, 0x6a9850, 0x7fae63, 0x479366];

function geoArrays() { return { pos: [], norm: [], uv: [], col: [], idx: [] }; }
function buildGeo(A) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(A.norm, 3));
  if (A.uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
  if (A.col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
  geo.setIndex(A.idx);
  return geo;
}

// one leaf-sprig card: mostly tangent to the clump surface, lit outward
function cardInto(A, center, size, outward, color, variant) {
  const n = outward.clone().multiplyScalar(0.55)
    .add(new THREE.Vector3(0, 0.85, 0))
    .add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.2, 0.2), rand(-0.3, 0.3)))
    .normalize();
  const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(n, ref).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1);
  const rot = rand(-0.7, 0.7);
  const c1 = t1.clone().multiplyScalar(Math.cos(rot)).addScaledVector(t2, Math.sin(rot));
  const c2 = new THREE.Vector3().crossVectors(n, c1);
  const h = size / 2;
  const start = A.pos.length / 3;
  const u0 = (variant % 2) * 0.5, v0 = (variant > 1 ? 0.5 : 0);
  const corners = [[-h, -h, u0, v0], [h, -h, u0 + 0.5, v0], [-h, h, u0, v0 + 0.5], [h, h, u0 + 0.5, v0 + 0.5]];
  for (const [a2, b2, uu, vv] of corners) {
    A.pos.push(
      center.x + c1.x * a2 + c2.x * b2,
      center.y + c1.y * a2 + c2.y * b2,
      center.z + c1.z * a2 + c2.z * b2);
    A.norm.push(outward.x, outward.y, outward.z);
    A.uv.push(uu, vv);
    A.col.push(color.r, color.g, color.b);
  }
  A.idx.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
}

// sweep a tapering tube along points (parallel-transport frames) — trunks & branches
function tubeInto(A, pts, r0, r1, radial, flare = 0) {
  const tan = new THREE.Vector3();
  const nrm = new THREE.Vector3(1, 0, 0);
  const bin = new THREE.Vector3();
  let prevRing = -1;
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    tan.copy(pts[Math.min(i + 1, pts.length - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
    nrm.addScaledVector(tan, -nrm.dot(tan));
    if (nrm.lengthSq() < 0.01) nrm.set(tan.y, tan.z, tan.x).addScaledVector(tan, -tan.dot(new THREE.Vector3(tan.y, tan.z, tan.x)));
    nrm.normalize();
    bin.crossVectors(tan, nrm);
    const r = lerp(r0, r1, t) + flare * Math.pow(1 - t, 5);
    const ring = A.pos.length / 3;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const dx = Math.cos(a), dy = Math.sin(a);
      const wob = 1 + Math.sin(a * 3 + i * 1.7) * 0.06;
      A.pos.push(
        pts[i].x + (nrm.x * dx + bin.x * dy) * r * wob,
        pts[i].y + (nrm.y * dx + bin.y * dy) * r * wob,
        pts[i].z + (nrm.z * dx + bin.z * dy) * r * wob);
      A.norm.push(nrm.x * dx + bin.x * dy, nrm.y * dx + bin.y * dy, nrm.z * dx + bin.z * dy);
      A.uv.push(j / radial, t * 6);
    }
    if (prevRing >= 0) {
      for (let j = 0; j < radial; j++) {
        const a2 = prevRing + j, b2 = a2 + 1, c2 = ring + j, d2 = c2 + 1;
        A.idx.push(a2, c2, b2, b2, c2, d2);
      }
    }
    prevRing = ring;
  }
}

// a noise-displaced leaf blob with baked top-light, appended with vertex color
const _m4 = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
function blobInto(A, center, r, scaleV, color) {
  const geo = new THREE.SphereGeometry(r, 10, 8);
  const p = geo.attributes.position;
  const seed = rand(0, 100);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const n = 0.74
      + 0.24 * Math.sin(v.x * 3.1 / r + seed) * Math.sin(v.y * 2.6 / r + seed * 2)
      + 0.16 * Math.sin(v.z * 3.7 / r + seed * 3)
      + 0.09 * Math.sin((v.x + v.y) * 6.3 / r + seed * 5);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  _m4.makeScale(scaleV.x, scaleV.y, scaleV.z);
  _m4.setPosition(center.x, center.y, center.z);
  _nm.getNormalMatrix(_m4);
  const nAttr = geo.attributes.normal;
  const start = A.pos.length / 3;
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const shade = clamp(0.9 + 0.22 * (v.y / r), 0.74, 1.12); // lit tops, shaded undersides
    v.applyMatrix4(_m4);
    A.pos.push(v.x, v.y, v.z);
    v.set(nAttr.getX(i), nAttr.getY(i), nAttr.getZ(i)).applyMatrix3(_nm).normalize();
    A.norm.push(v.x, v.y, v.z);
    A.col.push(color.r * shade, color.g * shade, color.b * shade);
  }
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i++) A.idx.push(start + idx[i]);
  geo.dispose();
}

function makeTree3D(tier) {
  const g2 = new THREE.Group();
  const H = [rand(4.8, 7), rand(8, 11), rand(10.5, 13.5)][tier];
  const R0 = H * 0.022 * rand(0.8, 1.3) + 0.05;
  const wood = geoArrays();
  const core = geoArrays();
  const cards = geoArrays();

  // trunk: curved, tapering, leaning its own way
  const leanA = rand(0, TAU);
  const leanM = rand(0, 0.16) * H;
  const bendM = rand(-0.14, 0.14) * H;
  const trunkTopY = H * rand(0.46, 0.58);
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const bow = Math.sin(t * Math.PI) * bendM;
    pts.push(new THREE.Vector3(
      Math.cos(leanA) * (leanM * t * t) + Math.cos(leanA + 1.7) * bow,
      t * trunkTopY,
      Math.sin(leanA) * (leanM * t * t) + Math.sin(leanA + 1.7) * bow));
  }
  tubeInto(wood, pts, R0, R0 * 0.42, 10, R0 * 0.8);

  const trunkPoint = (t) => {
    const i = t * 6;
    const i0 = Math.floor(i), i1 = Math.min(6, i0 + 1);
    return pts[i0].clone().lerp(pts[i1], i - i0);
  };

  // branches: real 3D directions — some toward the camera, some away
  const anchors = [pts[6].clone()];
  const nBranch = randInt(3, 5) + (Math.random() < 0.35 ? 1 : 0);
  for (let b = 0; b < nBranch; b++) {
    const t0 = b === 0 && Math.random() < 0.35 ? rand(0.4, 0.55) : rand(0.5, 0.95);
    const start = trunkPoint(t0);
    const az = rand(0, TAU);
    const len = H * rand(0.2, 0.4) * (b === 0 ? 1.25 : 1);
    const upness = rand(0.35, 0.95);
    const bpts = [start];
    let dir = new THREE.Vector3(Math.cos(az) * (1 - upness), upness, Math.sin(az) * (1 - upness)).normalize();
    let p2 = start.clone();
    for (let s2 = 1; s2 <= 3; s2++) {
      p2 = p2.clone().addScaledVector(dir, len / 3);
      dir = dir.clone();
      dir.y += rand(0.05, 0.25); // branches lift toward the light
      dir.x += rand(-0.2, 0.2);
      dir.z += rand(-0.2, 0.2);
      dir.normalize();
      bpts.push(p2);
    }
    tubeInto(wood, bpts, R0 * lerp(0.55, 0.3, t0), 0.015, 6);
    anchors.push(bpts[2]);
  }

  // a bare twig or two poking above the crown
  for (let k = 0; k < randInt(1, 2); k++) {
    const s0 = pts[6].clone();
    tubeInto(wood, [s0, s0.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(0.7, 1.3), rand(-0.5, 0.5)))], R0 * 0.2, 0.012, 5);
  }

  // canopy: leaf blobs at branch tips plus filler around the crown centre
  const hazeMix = [0.42, 0.18, 0.0][tier];
  const crownC = new THREE.Vector3();
  for (const a of anchors) crownC.add(a);
  crownC.divideScalar(anchors.length);
  crownC.y += H * 0.1;
  const clumps = [];
  for (const a of anchors) {
    if (Math.random() < 0.12) continue; // some branches stay barer — gaps in the crown
    clumps.push(a.clone().add(new THREE.Vector3(rand(-0.25, 0.25), rand(0, 0.35), rand(-0.25, 0.25))));
  }
  for (let i = 0; i < 3; i++) {
    clumps.push(crownC.clone().add(new THREE.Vector3(rand(-0.2, 0.2) * H, rand(-0.06, 0.12) * H, rand(-0.2, 0.2) * H)));
  }
  const cardsPerClump = [28, 50, 70][tier];
  for (const cc of clumps) {
    const clumpCol = new THREE.Color(pick(LEAF_GREENS))
      .offsetHSL(rand(-0.015, 0.015), rand(-0.04, 0.04), rand(-0.015, 0.045))
      .lerp(HAZE, hazeMix);
    const cr = H * rand(0.07, 0.12);
    // dark shadowed heart of the clump
    blobInto(core, cc, cr * 0.85,
      new THREE.Vector3(rand(0.9, 1.3), rand(0.6, 0.9), rand(0.9, 1.3)),
      clumpCol.clone().lerp(new THREE.Color(0x1d4a2e), 0.22));
    // individual leaf sprigs on the shell — every one flutters on its own
    const nCards = Math.round(cardsPerClump * rand(0.8, 1.25));
    for (let i2 = 0; i2 < nCards; i2++) {
      const dir = new THREE.Vector3().randomDirection();
      dir.y *= 0.75;
      dir.normalize();
      const pos = cc.clone().addScaledVector(dir, cr * rand(0.55, 1.05));
      const shade2 = clamp(0.94 + dir.y * 0.14 + rand(-0.04, 0.04), 0.8, 1.1);
      cardInto(cards, pos, cr * rand(0.85, 1.35), dir,
        clumpCol.clone().multiplyScalar(shade2), randInt(0, 3));
    }
  }

  const woodMesh = new THREE.Mesh(buildGeo(wood), woodMat);
  woodMesh.castShadow = false; // shadows return with the real ground layer
  g2.add(woodMesh);
  g2.add(new THREE.Mesh(buildGeo(core), coreMat));
  g2.add(new THREE.Mesh(buildGeo(cards), leafMat));
  return g2;
}

const midTrees = [];
{
  const clusters = [
    { x: -18, n: randInt(2, 3) }, { x: -12, n: randInt(2, 4) }, { x: -7, n: randInt(1, 2) },
    { x: 6.5, n: randInt(1, 2) }, { x: 11.5, n: randInt(2, 4) }, { x: 17, n: randInt(2, 3) },
    // guaranteed framing trees so no random roll leaves the sides bare
    { x: -rand(9.5, 13), n: 1, nearOnly: true },
    { x: rand(9.5, 13), n: 1, nearOnly: true },
  ];
  for (const cl of clusters) {
    for (let i = 0; i < cl.n; i++) {
      const tier = cl.farOnly ? 0 : cl.nearOnly ? 2 : (Math.random() < 0.35 ? 0 : Math.random() < 0.6 ? 1 : 2);
      const z = [rand(-40, -28), rand(-26, -18), rand(-16, -11)][tier];
      let x = cl.x + rand(-1.5, 1.5);
      if (i > 0 && Math.random() < 0.55) x = cl.x + pick([-1, 1]) * rand(0.4, 1.3); // huddle close — overlap
      const minX = [2.2, 4.5, 7.5][tier]; // keep the central stage open
      if (Math.abs(x) < minX) x = Math.sign(x || 1) * (minX + rand(0, 1.5));
      const tree = makeTree3D(tier);
      tree.position.set(x, 0, z);
      tree.rotation.y = rand(0, TAU);
      tree.userData = { swayAmp: rand(0.003, 0.008), swaySpeed: rand(0.3, 0.6), phase: rand(0, TAU) };
      midTrees.push(tree);
      scene.add(tree);
    }
  }
}

// ============================================================
// HAND-PAINTED PLATES (optional, highest quality)
// Drop generated layer images into public/layers/ and they replace the
// procedural stand-ins automatically:
//   layers/layer1.png (or .jpg) — full background: sky, sun, distant forest (opaque)
//   layers/layer2.png           — mid-distance trees (TRUE transparent PNG)
// The plates keep parallax, and layer2's canopy sways in the wind shader.
// ============================================================
const texLoader = new THREE.TextureLoader();
function tryPlate(url) {
  return new Promise((res) => texLoader.load(url,
    (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); },
    undefined, () => res(null)));
}
function frustumWidthAt(dist) {
  return 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * camera.aspect * dist;
}
(async () => {
  const p1 = (await tryPlate('layers/layer1.png')) || (await tryPlate('layers/layer1.jpg'));
  const p2 = await tryPlate('layers/layer2.png');
  const tag = document.getElementById('tag');
  if (p1) {
    for (const o of proceduralBG) o.visible = false;
    const dist = 100, z = 12.5 - dist;
    const w = frustumWidthAt(dist) * 1.06;
    const h = w * (p1.image.height / p1.image.width);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: p1, depthWrite: false, fog: false }),
    );
    m.position.set(0, h / 2 - 9, z); // horizon lands near eye level
    scene.add(m);
  }
  if (p2) {
    for (const tr of midTrees) tr.visible = false;
    const dist = 34, z = 12.5 - dist;
    const w = frustumWidthAt(dist) * 1.04;
    const h = w * (p2.image.height / p2.image.width);
    const mat = new THREE.MeshBasicMaterial({
      map: p2, transparent: true, alphaTest: 0.02, depthWrite: false, fog: false,
    });
    addWind(mat, 0.4, 0.12); // painted canopies breathe
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 48, 24), mat);
    m.position.set(0, h / 2 - 0.4, z); // tree bases sit at stage level
    scene.add(m);
  }
  if (p1 || p2) {
    tag.textContent = 'lab · painted plates: ' +
      (p1 ? 'L1 ✓ ' : 'L1 — ') + (p2 ? 'L2 ✓' : 'L2 —');
  }
})();

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

  // wind gusts rise and fall
  WIND.time.value = t;
  WIND.gust.value = 0.75 + Math.sin(t * 0.23) * 0.22 + Math.sin(t * 0.9) * 0.1;

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
