// Digital Jungle — layer-by-layer rebuild
// LAYER 1 — DEEP BACKGROUND: soft sky, distant rolling hills, far tree-line
// silhouettes, hazier tree clusters, mist between layers, gentle sun glow,
// sparse floating pollen. Warm enchanted-storybook forest, painterly & calm.
// Center horizon stays open — everything else arrives in later layers.

import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { ForestMap } from './forest-map.js';
import { AnimalManager, resolveSpecies } from './animals.js';
import { DrawingBody } from './drawing-creature.js';
import { SculptedBody } from './creature-3d.js';
import { ModelBody, loadAnimalManifest, getAsset } from './creature-model.js';

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
if (location.hash.includes('noshadow')) renderer.shadowMap.enabled = false; // debug
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

// ---------- forest floor contour (used by every layer) ----------
// Very gentle woodland undulation; almost flat where the creatures walk.
function groundHeight(x, z) {
  const sx = x / 7.5, sz = (z - 3) / 8.5;
  const stage = clamp(1 - (sx * sx + sz * sz), 0, 1); // smooth: no crease at x=0
  const amp = lerp(0.44, 0.05, stage);
  return (
    Math.sin(x * 0.17 + 1.3) * 0.55 +
    Math.cos(z * 0.21 - 0.7) * 0.45 +
    Math.sin((x + z) * 0.33) * 0.22 +
    Math.sin(x * 0.62) * Math.cos(z * 0.55) * 0.16
  ) * amp * 0.5;
}
const treeBases = [];
// What the navigation grid will be built from. The forest places its props
// wherever it likes; we just note where they landed.
const navProps = [];
const navProp = (x, z, r, kind) => { navProps.push({ x, z, r, kind }); return { x, z }; }; // every trunk, so the floor can be tucked around them
// A/B switch: open /lab#nofocus to see the forest without the layer 9 focus
const FOCUS = !location.hash.includes('nofocus');

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
sun.position.set(0, 26, -20); // zero sideways lean: left and right lit identically
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -38;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.05;
sun.shadow.radius = 2.5; // diffuse, woodland-soft edges
scene.add(sun);
// soft fill from behind the camera so camera-facing foliage never goes murky
const fill = new THREE.DirectionalLight(0xd8f2dc, 0.9);
fill.position.set(0, 9, 24); // centered so left/right trunks get equal frontal light
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
    out.filter = 'none';
    out.globalCompositeOperation = 'destination-out';
    const edge = out.createLinearGradient(0, 0, cw, 0);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(0.12, 'rgba(0,0,0,0)');
    edge.addColorStop(0.88, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,1)');
    out.fillStyle = edge;
    out.fillRect(0, 0, cw, ch);
    out.globalCompositeOperation = 'source-over';
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

// (atmospheric particles now live in Layer 5)

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

// 2x2 atlas of SINGLE leaves â€” used by the drifting-leaf effect
const singleLeafTexture = (() => {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');
  const PAIRS = [['#3f8a57', '#8fbe5e'], ['#2f6b46', '#6a9850'],
                 ['#4a9a63', '#a3c464'], ['#357d50', '#7fae63']];
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 256, oy = (v > 1 ? 1 : 0) * 256;
    g.save();
    g.translate(ox + 128, oy + 128);
    g.rotate(rand(-0.6, 0.6));
    const L = rand(170, 205), W = rand(56, 82);
    const [c0, c1] = PAIRS[v];
    const grad = g.createLinearGradient(-L / 2, 0, L / 2, 0);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-L / 2, 0);
    g.bezierCurveTo(-L * 0.2, -W, L * 0.22, -W * 0.85, L / 2, 0);
    g.bezierCurveTo(L * 0.22, W * 0.85, -L * 0.2, W, -L / 2, 0);
    g.fill();
    g.strokeStyle = 'rgba(255,255,228,0.32)'; // midrib
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-L / 2 + 6, 0);
    g.lineTo(L / 2 - 8, 0);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,228,0.16)'; // side veins
    g.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      const x = i * (L / 9);
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, 0);
        g.quadraticCurveTo(x + L * 0.06, sgn * W * 0.3, x + L * 0.11, sgn * W * 0.52);
        g.stroke();
      }
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
  const H = [rand(4.8, 7), rand(8, 11), rand(10.5, 13.5), rand(13.5, 17.5)][tier];
  const R0 = H * 0.022 * rand(0.8, 1.3) * (tier === 3 ? 1.3 : 1) + 0.05;
  const wood = geoArrays();
  const core = geoArrays();
  const cards = geoArrays();

  // trunk: curved, tapering, leaning its own way
  const leanA = rand(0, TAU);
  // most trunks grow nearly straight; a lean is occasional, a bow is rare
  const leanM = (Math.random() < 0.6 ? rand(0, 0.04) : rand(0.04, 0.11)) * H;
  const bendM = (Math.random() < 0.75 ? rand(-0.035, 0.035) : rand(-0.1, 0.1)) * H;
  const bowF = rand(0.6, 1.3); // and when a bow happens, it peaks at varied heights
  const trunkTopY = H * rand(0.46, 0.58);
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const bow = Math.sin(t * Math.PI * bowF) * bendM;
    pts.push(new THREE.Vector3(
      Math.cos(leanA) * (leanM * t * t) + Math.cos(leanA + 1.7) * bow,
      t * trunkTopY,
      Math.sin(leanA) * (leanM * t * t) + Math.sin(leanA + 1.7) * bow));
  }
  tubeInto(wood, pts, R0, R0 * 0.42, 10, R0 * (tier === 3 ? 1.15 : 0.8));
  // (exposed roots removed — they return embedded in the real ground layer)

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
  const hazeMix = [0.42, 0.18, 0.0, 0.0][tier];
  const crownC = new THREE.Vector3();
  for (const a of anchors) crownC.add(a);
  crownC.divideScalar(anchors.length);
  crownC.y += H * 0.1;
  const clumps = [];
  for (const a of anchors) {
    if (Math.random() < 0.12) continue; // some branches stay barer — gaps in the crown
    clumps.push(a.clone().add(new THREE.Vector3(rand(-0.25, 0.25), rand(0, 0.35), rand(-0.25, 0.25))));
  }
  for (let i = 0; i < (tier === 3 ? 5 : 3); i++) {
    clumps.push(crownC.clone().add(new THREE.Vector3(rand(-0.2, 0.2) * H, rand(-0.06, 0.12) * H, rand(-0.2, 0.2) * H)));
  }
  const cardsPerClump = [36, 64, 88, 110][tier];
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
      cardInto(cards, pos, cr * rand(0.85, 1.35) * (tier === 3 ? 0.75 : 1), dir,
        clumpCol.clone().multiplyScalar(shade2), randInt(0, 3));
    }
  }

  const woodMesh = new THREE.Mesh(buildGeo(wood), woodMat);
  woodMesh.castShadow = true;
  g2.add(woodMesh);
  const coreMesh = new THREE.Mesh(buildGeo(core), coreMat);
  coreMesh.castShadow = true;
  g2.add(coreMesh);
  const leafMesh = new THREE.Mesh(buildGeo(cards), leafMat);
  leafMesh.castShadow = true;
  g2.add(leafMesh);
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
      tree.position.set(x, groundHeight(x, z), z);
      tree.rotation.y = rand(0, TAU);
      treeBases.push({ x, z, r: [0.5, 0.75, 1][tier] });
      tree.userData = { swayAmp: rand(0.003, 0.008), swaySpeed: rand(0.3, 0.6), phase: rand(0, TAU) };
      midTrees.push(tree);
      scene.add(tree);
    }
  }
}

// ============================================================
// LAYER 3 — CLOSE FRAMING FOREST
// Hero trees entering from the left/right edges with roots and ferns at
// their feet. The camera stands INSIDE the forest; the central ~40%
// stays open as the creatures' stage.
// ============================================================

function xBound(z) { return frustumWidthAt(12.5 - z) / 2; }
const heroBases = [];

function makeGroundFern(s2) {
  const cards = geoArrays();
  const col0 = new THREE.Color(pick([0x4f9a55, 0x5faa62, 0x6fae57, 0x479366]));
  // dark heart made of leaves, not a blob
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    cardInto(cards, new THREE.Vector3(Math.cos(a) * s2 * 0.12, s2 * rand(0.08, 0.18), Math.sin(a) * s2 * 0.12),
      s2 * rand(0.25, 0.35), new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)).normalize(),
      col0.clone().lerp(new THREE.Color(0x12301e), 0.5), randInt(0, 3));
  }
  const n = randInt(18, 26);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.25, 0.25);
    const rr = s2 * rand(0.2, 0.42);
    const dir = new THREE.Vector3(Math.cos(a) * 0.8, rand(0.5, 1.1), Math.sin(a) * 0.8).normalize();
    cardInto(cards,
      new THREE.Vector3(Math.cos(a) * rr, s2 * rand(0.14, 0.3), Math.sin(a) * rr),
      s2 * rand(0.45, 0.75), dir,
      col0.clone().offsetHSL(0, rand(-0.04, 0.04), rand(-0.03, 0.05)).multiplyScalar(rand(0.85, 1.05)),
      randInt(0, 3));
  }
  const g2 = new THREE.Group();
  g2.add(new THREE.Mesh(buildGeo(cards), leafMat));
  return g2;
}

{
  const place3 = (obj, x, z, amp) => {
    obj.position.set(x, groundHeight(x, z), z);
    obj.userData = { swayAmp: amp, swaySpeed: rand(0.25, 0.5), phase: rand(0, TAU) };
    midTrees.push(obj);
    scene.add(obj);
  };
  for (const side of [-1, 1]) {
    // very close edge tree — its trunk rises past the frame edge
    const zA = rand(3.5, 6.5);
    const xA = side * xBound(zA) * rand(0.85, 1.05);
    const tA = makeTree3D(3);
    tA.rotation.y = rand(0, TAU);
    tA.rotation.z = -side * rand(0.02, 0.06); // leans gently over the clearing
    place3(tA, xA, zA, rand(0.0015, 0.003));
    // medium-close hero tree
    const zB = rand(-2, 2);
    const xB = side * xBound(zB) * rand(0.62, 0.88);
    const tB = makeTree3D(3);
    tB.rotation.y = rand(0, TAU);
    place3(tB, xB, zB, rand(0.002, 0.004));
    treeBases.push({ x: xA, z: zA, r: 1.5 }, { x: xB, z: zB, r: 1.5 });
    heroBases.push({ x: xA, z: zA }, { x: xB, z: zB });
    // secondary tree tucked behind the heroes
    if (Math.random() < 0.85) {
      const zC = rand(-8, -4);
      const tC = makeTree3D(2);
      tC.rotation.y = rand(0, TAU);
      place3(tC, side * xBound(zC) * rand(0.5, 0.8), zC, rand(0.003, 0.006));
    }
    // ferns hugging the hero bases
    for (let i = 0, fc = randInt(2, 4); i < fc; i++) {
      const host = Math.random() < 0.5 ? { x: xA, z: zA } : { x: xB, z: zB };
      const a = rand(0, TAU);
      const fern = makeGroundFern(rand(0.9, 1.6));
      fern.rotation.y = rand(0, TAU);
      const fx = host.x + Math.cos(a) * rand(0.9, 2.4);
      const fz = host.z + Math.sin(a) * rand(0.6, 1.6) + 0.5;
      place3(fern, fx, fz, rand(0.004, 0.008));
      navProp(fx, fz, 0.7, 'fern');
    }
  }
}

// ============================================================
// LAYER 4 — FOREGROUND ENVIRONMENTAL DETAILS
// Ferns, wild grass, moss, small rocks, fallen branches, hanging vines and
// near-camera leaves — concentrated at the edges and around the hero-tree
// bases. The central stage stays clean and calm.
// ============================================================

const rockSpots = [];
const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
addWind(grassMat, 1.1, 1.4);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a927c, roughness: 1, flatShading: true });

function makeGrassTuft(s2) {
  const A = geoArrays();
  const col = new THREE.Color(pick([0x5f9a4a, 0x6fae57, 0x7fae63, 0x55904a]));
  const n = randInt(8, 14);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const lean = rand(0.15, 0.55);
    const dx = Math.cos(a) * lean, dz = Math.sin(a) * lean;
    const hgt = s2 * rand(0.5, 1);
    const w = s2 * rand(0.035, 0.06);
    const bx = rand(-s2, s2) * 0.25, bz = rand(-s2, s2) * 0.25;
    const px = -Math.sin(a), pz = Math.cos(a);
    const start = A.pos.length / 3;
    const c = col.clone().multiplyScalar(rand(0.85, 1.1));
    const verts = [
      [bx - px * w, 0, bz - pz * w],
      [bx + px * w, 0, bz + pz * w],
      [bx - px * w * 0.5 + dx * hgt * 0.6, hgt * 0.6, bz - pz * w * 0.5 + dz * hgt * 0.6],
      [bx + px * w * 0.5 + dx * hgt * 0.6, hgt * 0.6, bz + pz * w * 0.5 + dz * hgt * 0.6],
      [bx + dx * hgt, hgt, bz + dz * hgt],
    ];
    for (const [X, Y, Z] of verts) {
      const sh = 0.7 + (Y / hgt) * 0.4; // brighter toward the tip
      A.pos.push(X, Y, Z);
      A.norm.push(0, 0.45, 0.89);
      A.col.push(c.r * sh, c.g * sh, c.b * sh);
    }
    A.idx.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
  }
  return new THREE.Mesh(buildGeo(A), grassMat);
}

function makeRock(s2) {
  const geo = new THREE.SphereGeometry(s2, 7, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.82, 1.18), p.getY(i) * rand(0.5, 0.75), p.getZ(i) * rand(0.82, 1.18));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, rockMat);
  m.position.y = s2 * 0.32;
  m.rotation.y = rand(0, TAU);
  return m;
}

function makeFallenBranch(len) {
  const A = geoArrays();
  const pts = [];
  const bend = rand(-0.15, 0.15);
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push(new THREE.Vector3(t * len - len / 2, 0.06 + Math.sin(t * Math.PI) * bend * 0.3, Math.sin(t * 2.2) * 0.08));
  }
  tubeInto(A, pts, rand(0.07, 0.1), 0.02, 6);
  const s0 = pts[randInt(1, 3)].clone();
  tubeInto(A, [s0, s0.clone().add(new THREE.Vector3(rand(-0.2, 0.2), rand(0.15, 0.3), rand(-0.2, 0.2)))], 0.03, 0.01, 4);
  const m = new THREE.Mesh(buildGeo(A), woodMat);
  m.rotation.y = rand(0, TAU);
  return m;
}

function makeMossPatch(s2) {
  const A = geoArrays();
  const col = new THREE.Color(0x557f3d);
  for (let i = 0, n = randInt(2, 4); i < n; i++) {
    blobInto(A, new THREE.Vector3(rand(-s2, s2) * 0.5, 0.02, rand(-s2, s2) * 0.5), s2 * rand(0.22, 0.36),
      new THREE.Vector3(1.5, 0.18, 1.5), col.clone().offsetHSL(0, rand(-0.05, 0.05), rand(-0.06, 0)));
  }
  return new THREE.Mesh(buildGeo(A), coreMat);
}

// a dense, dome-shaped shrub built from the same leaf sprigs as the trees
function makeBush(s2) {
  const cards = geoArrays();
  const base = new THREE.Color(pick(LEAF_GREENS)).offsetHSL(0, rand(-0.03, 0.03), rand(-0.02, 0.03));
  // the interior is deep-shadow LEAVES, not a solid mass
  for (let i = 0, n = randInt(36, 48); i < n; i++) {
    const dir = new THREE.Vector3().randomDirection();
    dir.y = Math.abs(dir.y) * 0.7 + 0.1;
    dir.normalize();
    cardInto(cards, new THREE.Vector3(
      dir.x * s2 * rand(0.06, 0.3),
      s2 * 0.16 + dir.y * s2 * rand(0.04, 0.24),
      dir.z * s2 * rand(0.06, 0.3)),
      s2 * rand(0.2, 0.3), dir,
      base.clone().lerp(new THREE.Color(0x12301e), 0.55), randInt(0, 3));
  }
  // skirt of leaves around the base so the core never shows underneath
  for (let i = 0, n = randInt(42, 58); i < n; i++) {
    const a = rand(0, TAU);
    const dir = new THREE.Vector3(Math.cos(a), rand(0.12, 0.35), Math.sin(a)).normalize();
    cardInto(cards, new THREE.Vector3(Math.cos(a) * s2 * rand(0.34, 0.55), s2 * rand(0.05, 0.16), Math.sin(a) * s2 * rand(0.34, 0.55)),
      s2 * rand(0.18, 0.28), dir,
      base.clone().offsetHSL(0, rand(-0.03, 0.03), rand(-0.03, 0)).multiplyScalar(rand(0.8, 0.95)), randInt(0, 3));
  }
  for (let i = 0, n = randInt(150, 200); i < n; i++) {
    const dir = new THREE.Vector3().randomDirection();
    dir.y = Math.abs(dir.y) * 0.65 + 0.08; // cover the sides too, not just the top
    dir.normalize();
    const pos = new THREE.Vector3(
      dir.x * s2 * rand(0.28, 0.52),
      s2 * 0.24 + dir.y * s2 * rand(0.14, 0.36),
      dir.z * s2 * rand(0.28, 0.52));
    const shade2 = clamp(0.9 + dir.y * 0.18 + rand(-0.05, 0.05), 0.75, 1.1);
    cardInto(cards, pos, s2 * rand(0.18, 0.3), dir,
      base.clone().offsetHSL(0, rand(-0.03, 0.03), rand(-0.02, 0.02)).multiplyScalar(shade2), randInt(0, 3));
  }
  const g2 = new THREE.Group();
  g2.add(new THREE.Mesh(buildGeo(cards), leafMat));
  return g2;
}

function makeVine(len) {
  const g2 = new THREE.Group(); // pivot at the top anchor so it can swing
  const wood2 = geoArrays();
  const cards = geoArrays();
  const pts = [];
  const N = 8;
  const sway1 = rand(-0.6, 0.6), sway2 = rand(-0.5, 0.5);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector3(
      Math.sin(t * Math.PI) * sway1 + t * sway2,
      -t * len,
      Math.sin(t * Math.PI * 0.7) * 0.2));
  }
  tubeInto(wood2, pts, 0.045, 0.018, 5);
  const col = new THREE.Color(pick(LEAF_GREENS));
  for (let i = 1; i <= N; i++) {
    if (Math.random() < 0.75) {
      cardInto(cards, pts[i].clone().add(new THREE.Vector3(rand(-0.15, 0.15), 0, rand(-0.15, 0.15))),
        rand(0.35, 0.6),
        new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.6), rand(-1, 1)).normalize(),
        col.clone().offsetHSL(0, rand(-0.04, 0.04), rand(-0.03, 0.04)), randInt(0, 3));
    }
  }
  g2.add(new THREE.Mesh(buildGeo(wood2), woodMat));
  g2.add(new THREE.Mesh(buildGeo(cards), leafMat));
  return g2;
}

{
  const place4 = (obj, x, z, amp) => {
    obj.position.x = x;
    obj.position.y = groundHeight(x, z);
    obj.position.z = z;
    if (amp) {
      obj.userData = { swayAmp: amp, swaySpeed: rand(0.3, 0.7), phase: rand(0, TAU) };
      midTrees.push(obj);
    }
    scene.add(obj);
  };
  for (const side of [-1, 1]) {
    const heroes = heroBases.filter(h => Math.sign(h.x) === side);
    const anyHero = heroes[0] || { x: side * 8, z: 4 };
    // natural shrubs settling into the lower corner
    const zf = rand(7.5, 9);
    const b1x = side * xBound(zf) * rand(0.62, 0.88);
    place4(makeBush(rand(1.2, 1.8)), b1x, zf, rand(0.004, 0.007));
    navProp(b1x, zf, 1.05, 'bush');
    const b2z = zf - rand(1, 2), b2x = side * xBound(zf - 1.5) * rand(0.7, 0.95);
    place4(makeBush(rand(0.7, 1.1)), b2x, b2z, rand(0.004, 0.007));
    navProp(b2x, b2z, 0.75, 'bush');
    // and a smaller fern accent beside them
    const f4z = zf - rand(0, 1), f4x = side * xBound(zf) * rand(0.5, 0.7);
    place4(makeGroundFern(rand(0.8, 1.2)), f4x, f4z, rand(0.006, 0.01));
    navProp(f4x, f4z, 0.6, 'fern');
    // wild grass around the hero bases
    for (let i = 0, n = randInt(3, 5); i < n; i++) {
      const hb = pick(heroes) || anyHero;
      const gx = hb.x + rand(-1.8, 1.8), gz = hb.z + rand(-0.8, 1.6);
      place4(makeGrassTuft(rand(0.35, 0.6)), gx, gz, 0);
      navProp(gx, gz, 0.5, 'grass');
    }
    // a few small rocks (filled with scanned models once they load)
    for (let i = 0, n = randInt(2, 3); i < n; i++) {
      const zr = rand(2, 7.5);
      const g2 = new THREE.Group();
      place4(g2, side * xBound(zr) * rand(0.55, 0.9), zr, 0);
      rockSpots.push({ g: g2, s: rand(0.11, 0.26) });
    }
    // one modest fallen branch
    if (Math.random() < 0.8) {
      const zb = rand(4, 7.5);
      place4(makeFallenBranch(rand(1.2, 2.2)), side * xBound(zb) * rand(0.6, 0.85), zb, 0);
    }
    // moss hugging the hero roots
    for (const hb of heroes) {
      if (Math.random() < 0.8) place4(makeMossPatch(rand(0.5, 0.9)), hb.x + rand(-0.6, 0.6), hb.z + rand(0.3, 0.9), 0);
    }
    // hanging vines from the upper edges
    for (let i = 0, n = randInt(1, 2); i < n; i++) {
      const zv = rand(1, 5);
      const v = makeVine(rand(3.2, 5.5));
      place4(v, side * xBound(zv) * rand(0.5, 0.85), zv, rand(0.015, 0.035));
      v.position.y = rand(7.5, 9.5);
    }
    // big soft leaves brushing the extreme corner of the frame
    const cornerCards = geoArrays();
    const colC = new THREE.Color(pick(LEAF_GREENS)).multiplyScalar(0.9);
    for (let i = 0, n = randInt(12, 18); i < n; i++) {
      cardInto(cornerCards, new THREE.Vector3(rand(-0.8, 0.8), rand(-0.6, 0.6), rand(-0.3, 0.3)),
        rand(0.22, 0.4),
        new THREE.Vector3(rand(-0.4, 0.4), rand(0.4, 1), 1).normalize(),
        colC.clone().offsetHSL(0, rand(-0.04, 0.04), rand(-0.04, 0.04)), randInt(0, 3));
    }
    const zc = rand(8.4, 9.2);
    const cm = new THREE.Mesh(buildGeo(cornerCards), leafMat);
    place4(cm, side * xBound(zc) * rand(0.78, 0.95), zc, rand(0.008, 0.014));
    cm.position.y = Math.random() < 0.5 ? rand(0.2, 0.8) : rand(5.5, 6.5);
  }
}

// ---- real scanned rocks (Poly Haven, CC0) fill the rock spots ----
(async () => {
  const loader = new GLTFLoader();
  const urls = [
    'models/rock_moss_set_01/rock_moss_set_01.gltf',
    'models/rock_moss_set_02/rock_moss_set_02.gltf',
    'models/stone_01/stone_01.gltf',
  ];
  const rocks = [];
  await Promise.all(urls.map(async (u) => {
    try {
      const gltf = await loader.loadAsync(u);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { if (o.isMesh) rocks.push(o); });
    } catch (e) { console.warn('rock model failed:', u, e); }
  }));
  console.log('rocks: ' + rocks.length + ' meshes for ' + rockSpots.length + ' spots');
  for (const spot of rockSpots) {
    if (!rocks.length) { spot.g.add(makeRock(spot.s)); continue; }
    const src = pick(rocks);
    src.geometry.computeBoundingBox();
    const bb = src.geometry.boundingBox;
    const footprint = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    const k = (spot.s * 2) / footprint;
    const m = new THREE.Mesh(src.geometry, src.material);
    m.scale.setScalar(k);
    m.rotation.y = rand(0, TAU);
    m.position.set(
      -(bb.min.x + bb.max.x) / 2 * k,
      -bb.min.y * k - spot.s * 0.3, // settled well into the ground line
      -(bb.min.z + bb.max.z) / 2 * k);
    spot.g.add(m);
  }
})();

// ============================================================
// LAYER 6 — INTERACTIVE FOREST CLEARING
// A naturally irregular fringe around an open centre: grass tufts, low
// plants, sparse wildflowers, small mushrooms, stones and low roots
// reaching out of the hero trees. Density rises with distance from the
// stage; the middle stays clean for the children's creatures.
// ============================================================

// tiny 5-petal wildflower heads (2x2 atlas, white so vertex colour tints)
const flowerTexture = (() => {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 128 + 64, oy = (v > 1 ? 128 : 0) + 64;
    const petals = 5 + (v % 2);
    const R = rand(30, 42), pr = R * rand(0.42, 0.52);
    g.save();
    g.translate(ox, oy);
    g.rotate(rand(0, TAU));
    g.fillStyle = '#ffffff';
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU;
      g.beginPath();
      g.ellipse(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, pr, pr * rand(0.7, 0.9), a, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,236,170,0.95)'; // soft centre
    g.beginPath();
    g.arc(0, 0, R * 0.22, 0, TAU);
    g.fill();
    g.restore();
  }
  return canvasTex(c);
})();

const bigLeafMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 1, map: singleLeafTexture,
  alphaTest: 0.35, side: THREE.DoubleSide,
});
const flowerMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 1, map: flowerTexture,
  alphaTest: 0.3, side: THREE.DoubleSide,
});
const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
addWind(bigLeafMat, 0.9, 1.2);
addWind(flowerMat, 1.2, 1.6);

{
  // ---------- THE FOREST FLOOR ----------
  // procedural woodland surface: fine blades, soil mottling, moss flecks
  const floorTexture = (() => {
    const S = 1024;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#5a7647';
    g.fillRect(0, 0, S, S);
    // draw every mark wrapped across the canvas edges so the tile is seamless
    const wrapDraw = (x, y, r, draw) => {
      const xs = x < r ? [0, S] : x > S - r ? [0, -S] : [0];
      const ys = y < r ? [0, S] : y > S - r ? [0, -S] : [0];
      for (const ox of xs) for (const oy of ys) draw(x + ox, y + oy);
    };
    const blot = (n, colors, aLo, aHi, rLo, rHi) => {
      for (let i = 0; i < n; i++) {
        const x = rand(0, S), y = rand(0, S);
        const rx = rand(rLo, rHi), ry = rx * rand(0.6, 0.95), rot = rand(0, TAU);
        g.fillStyle = pick(colors);
        g.globalAlpha = rand(aLo, aHi);
        wrapDraw(x, y, rx, (px, py) => {
          g.beginPath();
          g.ellipse(px, py, rx, ry, rot, 0, TAU);
          g.fill();
        });
      }
    };
    blot(420, ['#6b8c54', '#557444', '#74965c', '#4e6b3f', '#7d9a5f', '#63834e'], 0.07, 0.15, 30, 150);
    blot(70, ['#7a6144', '#8a7150', '#6d573d', '#957d59'], 0.08, 0.18, 14, 62);
    blot(90, ['#4f7a45', '#5c8a4c', '#456b3d'], 0.07, 0.16, 16, 70);
    g.globalAlpha = 1;
    for (let i = 0; i < 6500; i++) { // blades and leaf litter
      const x = rand(0, S), y = rand(0, S);
      const warm = Math.random() < 0.12;
      g.strokeStyle = warm
        ? `rgba(${randInt(120, 165)},${randInt(95, 130)},${randInt(55, 85)},${rand(0.15, 0.4)})`
        : `rgba(${randInt(60, 130)},${randInt(95, 165)},${randInt(50, 100)},${rand(0.16, 0.45)})`;
      g.lineWidth = rand(0.8, 2.2);
      const a = rand(0, TAU), L = rand(3, 11);
      wrapDraw(x, y, L + 2, (px, py) => {
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
        g.stroke();
      });
    }
    const t = canvasTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(62, 46);
    return t;
  })();

  {
    const geo = new THREE.PlaneGeometry(240, 170, 104, 76);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -70);
    const pos = geo.attributes.position;
    const cols = [];
    const cGrass = new THREE.Color(0x6f9455);
    const cLush = new THREE.Color(0x87b167);
    const cOlive = new THREE.Color(0x6a7b45);
    const cDeep = new THREE.Color(0x3f5c37);
    const cEarth = new THREE.Color(0x8a7051);
    const cWarm = new THREE.Color(0xc9d68a);
    const cHaze = new THREE.Color(0xcfe0b0);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, groundHeight(x, z));
      const n1 = Math.sin(x * 0.13 + 2.1) * Math.cos(z * 0.11 - 1.4);
      const n2 = Math.sin(x * 0.41 - 0.6) * Math.sin(z * 0.37 + 2.2);
      const n3 = Math.sin(x * 0.07 - 1.1) * Math.cos(z * 0.063 + 0.5);
      col.copy(cGrass).lerp(cLush, clamp(0.5 + n1 * 0.6, 0, 1));
      col.lerp(cOlive, clamp(0.35 + n3 * 0.65, 0, 0.55)); // broad olive drifts
      if (n2 > 0.72) col.lerp(cEarth, clamp((n2 - 0.72) * 1.1, 0, 0.22)); // faint bare soil
      let near = 0; // shade and thicken under the trees
      for (const b of treeBases) {
        const dx = x - b.x;
        if (dx > 9 || dx < -9) continue;
        const dz = z - b.z;
        if (dz > 9 || dz < -9) continue;
        const d = Math.hypot(dx, dz) / (b.r * 4.5 + 2.5);
        if (d < 1) near = Math.max(near, 1 - d);
      }
      col.lerp(cDeep, near * 0.72);
      const sx2 = x / 7.5, sz2 = (z - 3) / 8.5;
      const stage = clamp(1 - (sx2 * sx2 + sz2 * sz2), 0, 1);
      col.lerp(cLush, stage * (FOCUS ? 0.3 : 0.22)); // the walked centre reads lighter
      if (FOCUS) col.lerp(cWarm, stage * 0.12);      // and very slightly warmer
      // ...while the outer floor settles deeper, so the eye travels inward.
      // Squared falloff: gradual everywhere, no boundary anywhere.
      const ox = x / 9.5, oz = (z - 3) / 11;
      if (FOCUS) col.lerp(cDeep, clamp((ox * ox + oz * oz - 1) * 0.24, 0, 0.24));
      col.lerp(cHaze, clamp((-z - 22) / 55, 0, 0.85)); // melt into the horizon
      cols.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: floorTexture, vertexColors: true, roughness: 1, metalness: 0,
    }));
    floor.receiveShadow = true;
    scene.add(floor);
  }

  const grassA = geoArrays();   // blades
  const plantA = geoArrays();   // broad-leaf shoots
  const flowerA = geoArrays();  // blossom cards
  const propA = geoArrays();    // mushrooms
  const rootA = geoArrays();    // low roots

  // --- blades of grass at a world spot ---
  function grassInto(A, wx, wz, s2, blades) {
    const gy = groundHeight(wx, wz);
    const col = new THREE.Color(pick([0x5f9a4a, 0x6fae57, 0x7fae63, 0x55904a, 0x86b866]));
    for (let i = 0; i < blades; i++) {
      const a = rand(0, TAU);
      const lean = rand(0.1, 0.6);
      const dx = Math.cos(a) * lean, dz = Math.sin(a) * lean;
      const hgt = s2 * rand(0.45, 1.05);
      const w = s2 * rand(0.03, 0.055);
      const bx = wx + rand(-s2, s2) * 0.3, bz = wz + rand(-s2, s2) * 0.3;
      const px = -Math.sin(a), pz = Math.cos(a);
      const start = A.pos.length / 3;
      const c = col.clone().multiplyScalar(rand(0.85, 1.12));
      const verts = [
        [bx - px * w, gy, bz - pz * w],
        [bx + px * w, gy, bz + pz * w],
        [bx - px * w * 0.5 + dx * hgt * 0.6, gy + hgt * 0.6, bz - pz * w * 0.5 + dz * hgt * 0.6],
        [bx + px * w * 0.5 + dx * hgt * 0.6, gy + hgt * 0.6, bz + pz * w * 0.5 + dz * hgt * 0.6],
        [bx + dx * hgt, gy + hgt, bz + dz * hgt],
      ];
      for (const [X, Y, Z] of verts) {
        const sh = 0.72 + ((Y - gy) / hgt) * 0.38;
        A.pos.push(X, Y, Z);
        A.norm.push(0, 0.45, 0.89);
        A.col.push(c.r * sh, c.g * sh, c.b * sh);
      }
      A.idx.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
    }
  }

  // --- low broad-leaf shoot ---
  function plantInto(A, wx, wz, s2) {
    const gy = groundHeight(wx, wz);
    const col = new THREE.Color(pick([0x4f9a55, 0x5faa62, 0x6fae57, 0x479366]));
    const n = randInt(4, 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.35, 0.35);
      const out = rand(0.25, 0.55);
      const dir = new THREE.Vector3(Math.cos(a) * out, rand(0.55, 1), Math.sin(a) * out).normalize();
      cardInto(A,
        new THREE.Vector3(wx + Math.cos(a) * s2 * rand(0.12, 0.4), gy + s2 * rand(0.2, 0.5), wz + Math.sin(a) * s2 * rand(0.12, 0.4)),
        s2 * rand(0.5, 0.85), dir,
        col.clone().offsetHSL(0, rand(-0.04, 0.04), rand(-0.04, 0.05)).multiplyScalar(rand(0.85, 1.08)),
        randInt(0, 3));
    }
  }

  // --- one wildflower: a blossom or two facing the viewer, on a blade stem ---
  const FLOWER_COLS = [0xfff2a8, 0xffffff, 0xffd9e4, 0xcfe3ff, 0xfff6cf];
  function flowerInto(A, gA, wx, wz, s2) {
    const gy = groundHeight(wx, wz);
    const col = new THREE.Color(pick(FLOWER_COLS));
    grassInto(gA, wx, wz, s2 * 1.5, randInt(2, 4)); // green stems / leaves at its foot
    for (let i = 0, n = randInt(1, 3); i < n; i++) {
      cardInto(A,
        new THREE.Vector3(wx + rand(-0.1, 0.1), gy + s2 * rand(0.6, 1.1), wz + rand(-0.1, 0.1)),
        s2 * rand(0.5, 0.8),
        new THREE.Vector3(rand(-0.35, 0.35), rand(0.35, 0.7), 1).normalize(),
        col.clone().multiplyScalar(rand(0.92, 1)), randInt(0, 3));
    }
  }

  // --- small friendly mushroom ---
  function mushroomInto(A, wx, wz, s2) {
    const gy = groundHeight(wx, wz);
    const stem = new THREE.Color(pick([0xefe4cd, 0xe6dcc2, 0xf3ead6]));
    const cap = new THREE.Color(pick([0xc98f6a, 0xb87b5c, 0xd8a679, 0xa9755a]));
    blobInto(A, new THREE.Vector3(wx, gy + s2 * 0.34, wz), s2 * 0.17,
      new THREE.Vector3(0.55, 2.1, 0.55), stem);
    blobInto(A, new THREE.Vector3(wx, gy + s2 * 0.62, wz), s2 * 0.34,
      new THREE.Vector3(1.2, 0.55, 1.2), cap);
  }

  // --- irregular, density-graded spots around the stage ---
  function clearingSpots(n) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 60) {
      const z = rand(-3.5, 9.2);
      const x = rand(-1, 1) * xBound(z);
      const d = Math.hypot(x / 4.6, (z - 3) / 6);
      if (d < 1) continue;                                     // stage stays clear
      if (Math.random() > clamp((d - 1) * 1.1, 0.06, 1)) continue; // denser further out
      out.push({ x, z, d });
    }
    return out;
  }

  // grass grows in tight clumps — a lone blade on open ground reads as a glitch
  for (const p of clearingSpots(40)) {
    if (p.d < 1.25) continue; // well clear of the stage
    for (let i = 0, n = randInt(3, 6); i < n; i++) {
      grassInto(grassA, p.x + rand(-0.4, 0.4), p.z + rand(-0.32, 0.32),
        rand(0.26, 0.5), randInt(7, 13));
    }
  }
  // every trunk gets grass and moss tucked against its base
  for (const b of treeBases) {
    const ring = Math.round(randInt(3, 6) * b.r);
    for (let i = 0; i < ring; i++) {
      const a = rand(0, TAU), rr = b.r * rand(0.7, 1.9);
      grassInto(grassA, b.x + Math.cos(a) * rr, b.z + Math.sin(a) * rr, rand(0.2, 0.42) * b.r, randInt(4, 9));
    }
    for (let i = 0, n = randInt(1, 3); i < n; i++) {
      const a = rand(0, TAU), rr = b.r * rand(0.4, 1.3);
      const mx = b.x + Math.cos(a) * rr, mz = b.z + Math.sin(a) * rr;
      blobInto(propA, new THREE.Vector3(mx, groundHeight(mx, mz) + 0.03, mz),
        b.r * rand(0.28, 0.5), new THREE.Vector3(1.5, 0.16, 1.5),
        new THREE.Color(0x557f3d).offsetHSL(0, rand(-0.05, 0.05), rand(-0.05, 0.03)));
    }
  }
  for (const p of clearingSpots(20)) { if (p.d < 1.3) continue; plantInto(plantA, p.x, p.z, rand(0.3, 0.62)); }
  for (const p of clearingSpots(14)) { if (p.d < 1.35) continue; flowerInto(flowerA, grassA, p.x, p.z, rand(0.14, 0.24)); }
  for (const p of clearingSpots(7)) { if (p.d < 1.45) continue; mushroomInto(propA, p.x, p.z, rand(0.12, 0.19)); }

  // --- a few tiny stones (scanned models fill these too) ---
  for (const p of clearingSpots(6)) {
    if (p.d < 1.4) continue;
    const g2 = new THREE.Group();
    g2.position.set(p.x, groundHeight(p.x, p.z), p.z);
    scene.add(g2);
    rockSpots.push({ g: g2, s: rand(0.07, 0.16) });
  }

  // --- low roots easing out of the hero trees toward the clearing ---
  for (const hb of heroBases) {
    for (let k = 0, n = randInt(2, 3); k < n; k++) {
      const away = Math.sign(hb.x || 1);
      const a = rand(-0.9, 0.9) + (away > 0 ? 0 : Math.PI); // never reach across the centre
      const dx = Math.cos(a), dz = Math.sin(a) * 0.8;
      const ext = rand(1.1, 2.3);
      const rp = (t2, h) => new THREE.Vector3(
        hb.x + dx * ext * t2,
        groundHeight(hb.x + dx * ext * t2, hb.z + dz * ext * t2) + h,
        hb.z + dz * ext * t2);
      tubeInto(rootA, [rp(0.07, 0.34), rp(0.4, 0.17), rp(0.75, 0.08), rp(1, 0.03)],
        rand(0.1, 0.16), 0.022, 6);
      // vegetation tucked against the root so it never reads as a bare tube
      grassInto(grassA, hb.x + dx * ext * rand(0.5, 0.95), hb.z + dz * ext * rand(0.5, 0.95), rand(0.25, 0.4), randInt(4, 8));
    }
  }

  // a handful of fallen branches, each bedded into its own grass clump
  for (const side of [-1, 1]) {
    for (let k = 0, n = randInt(1, 2); k < n; k++) {
      const z = rand(4, 9);
      const x = side * rand(0.55, 0.92) * xBound(z);
      const len = rand(1, 1.8), thick = rand(0.05, 0.08);
      const a = rand(0, TAU);
      const dx = Math.cos(a), dz = Math.sin(a) * 0.7;
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const px = x + dx * len * (t - 0.5), pz = z + dz * len * (t - 0.5);
        pts.push(new THREE.Vector3(px, groundHeight(px, pz) + thick * 0.85, pz));
      }
      tubeInto(rootA, pts, thick, thick * 0.45, 6);
      for (let i = 0; i < 5; i++) { // grass growing up around it
        const t = rand(0, 1);
        grassInto(grassA, x + dx * len * (t - 0.5) + rand(-0.3, 0.3),
          z + dz * len * (t - 0.5) + rand(-0.25, 0.25), rand(0.24, 0.42), randInt(6, 11));
      }
    }
  }

  // taller grass gathers just outside the clearing and shortens inward —
  // an irregular band, never a ring
  for (let i = 0; FOCUS && i < 20; i++) {
    const a = rand(0, TAU);
    const rr = rand(1.1, 1.75) * (0.85 + Math.sin(a * 2.3 + 1.1) * 0.25);
    const gx = Math.cos(a) * 5.4 * rr;
    const gz = 3 + Math.sin(a) * 6.4 * rr;
    if (gz > 9.4 || gz < -4.5 || Math.abs(gx) > xBound(gz) * 0.98) continue;
    for (let k = 0, n = randInt(2, 4); k < n; k++) {
      grassInto(grassA, gx + rand(-0.45, 0.45), gz + rand(-0.4, 0.4),
        rand(0.42, 0.66), randInt(8, 14));
    }
  }

  scene.add(new THREE.Mesh(buildGeo(grassA), grassMat));
  scene.add(new THREE.Mesh(buildGeo(plantA), bigLeafMat));
  scene.add(new THREE.Mesh(buildGeo(flowerA), flowerMat));
  scene.add(new THREE.Mesh(buildGeo(propA), propMat));
  scene.add(new THREE.Mesh(buildGeo(rootA), woodMat));
}

// ============================================================
// LAYER 5 — MAGICAL ATMOSPHERIC EFFECTS
// A transparent overlay of light and air: floating motes, firefly glows,
// soft sun shafts, gentle haze and a few drifting leaves. Every element
// animates independently; the central stage stays calm.
// ============================================================

const moteFields = [];
const sunBeams = [];
const hazePatches = [];
const driftLeaves = [];

// soft round sprite used by every particle field
function softDot(inner, outer) {
  return radialTex(64, [[0, inner], [0.35, outer], [1, outer.replace(/[\d.]+\)$/, '0)')]]);
}

// GPU-animated particle field: per-particle size, drift, twinkle
function makeMoteField({ count, tex, area, sizeMin, sizeMax, alphaMin, alphaMax,
                         driftX, driftY, twinkle, centerClear, spots }) {
  const pos = new Float32Array(count * 3);
  const aSize = new Float32Array(count);
  const aPhase = new Float32Array(count);
  const aAlpha = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (spots && spots.length) {
      // gather around vegetation rather than filling the air evenly
      const sp = spots[Math.floor(Math.random() * spots.length)];
      pos[i * 3] = sp.x + rand(-1.6, 1.6);
      pos[i * 3 + 1] = rand(area.y0, area.y1);
      pos[i * 3 + 2] = sp.z + rand(-1.2, 1.2);
    } else {
      // bias particles away from the middle of the stage
      let x = rand(-area.x, area.x);
      if (centerClear && Math.abs(x) < centerClear) {
        x = Math.sign(x || 1) * (centerClear + rand(0, area.x - centerClear));
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = rand(area.y0, area.y1);
      pos[i * 3 + 2] = rand(area.z0, area.z1);
    }
    aSize[i] = rand(sizeMin, sizeMax);
    aPhase[i] = rand(0, TAU);
    aAlpha[i] = rand(alphaMin, alphaMax);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTex: { value: tex },
      uDriftX: { value: driftX },
      uDriftY: { value: driftY },
      uTwinkle: { value: twinkle },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      attribute float aAlpha;
      uniform float uTime; uniform float uDriftX; uniform float uDriftY; uniform float uTwinkle;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.21 + aPhase) * uDriftX
             + sin(uTime * 0.07 + aPhase * 2.3) * uDriftX * 0.6;
        p.y += sin(uTime * 0.17 + aPhase * 1.7) * uDriftY;
        p.z += cos(uTime * 0.13 + aPhase) * uDriftX * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (260.0 / max(0.6, -mv.z));
        gl_Position = projectionMatrix * mv;
        float tw = mix(1.0, 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.4 + aPhase * 4.0)), uTwinkle);
        vAlpha = aAlpha * tw;
      }`,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vAlpha;
      void main() {
        vec4 c = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(c.rgb, c.a * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  moteFields.push(pts);
  scene.add(pts);
  return pts;
}

// EFFECT 1 — floating dust / pollen motes, sunlit and near-invisible
makeMoteField({
  count: 90,
  tex: softDot('rgba(255,252,232,0.95)', 'rgba(255,248,214,0.45)'),
  area: { x: 17, y0: 0.4, y1: 8.5, z0: -18, z1: 9 },
  sizeMin: 0.5, sizeMax: 2.6, alphaMin: 0.1, alphaMax: 0.5,
  driftX: 0.55, driftY: 0.3, twinkle: 0.35, centerClear: 2.5,
});
// a few larger, closer motes catching the light
makeMoteField({
  count: 22,
  tex: softDot('rgba(255,253,240,1)', 'rgba(255,246,205,0.5)'),
  area: { x: 13, y0: 0.6, y1: 5.5, z0: 3, z1: 9.5 },
  sizeMin: 2.2, sizeMax: 4.5, alphaMin: 0.08, alphaMax: 0.28,
  driftX: 0.4, driftY: 0.22, twinkle: 0.25, centerClear: 4,
});

// EFFECT 2 — sparse firefly-like glows, warm golden-green
makeMoteField({
  count: 12,
  tex: softDot('rgba(250,255,200,1)', 'rgba(214,246,150,0.55)'),
  area: { x: 16, y0: 0.5, y1: 4.5, z0: -12, z1: 8 },
  sizeMin: 2, sizeMax: 4.2, alphaMin: 0.35, alphaMax: 0.8,
  driftX: 0.9, driftY: 0.5, twinkle: 1, centerClear: 4.5,
});

// EFFECT 3 — soft sunlight shafts filtering through the canopy
{
  const beamTex = (() => {
    const c = makeCanvas(128, 512);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, 'rgba(255,247,214,0)');
    grad.addColorStop(0.5, 'rgba(255,250,226,0.5)');
    grad.addColorStop(1, 'rgba(255,247,214,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 512);
    const fade = g.createLinearGradient(0, 0, 0, 512);
    fade.addColorStop(0, 'rgba(0,0,0,0)');       // soft at the canopy
    fade.addColorStop(0.25, 'rgba(0,0,0,1)');
    fade.addColorStop(0.75, 'rgba(0,0,0,0.55)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');       // dissolves before the ground
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = fade;
    g.fillRect(0, 0, 128, 512);
    return canvasTex(c);
  })();
  const spots = [
    { x: -9.5, z: -3, w: 3.2, h: 13, tilt: 0.2, a: 0.16 },
    { x: -5.5, z: -8, w: 2.4, h: 12, tilt: 0.14, a: 0.1 },
    { x: 8.5, z: -2, w: 3.6, h: 13, tilt: -0.22, a: 0.18 },
    { x: 12.5, z: -7, w: 2.6, h: 12, tilt: -0.15, a: 0.12 },
    { x: 2.5, z: -12, w: 2.2, h: 11, tilt: -0.1, a: 0.07 }, // faint, far behind the stage
  ];
  for (const sp of spots) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(sp.w, sp.h),
      new THREE.MeshBasicMaterial({
        map: beamTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: sp.a,
      }),
    );
    m.position.set(sp.x, sp.h / 2 - 1, sp.z);
    m.rotation.z = sp.tilt;
    m.rotation.y = rand(-0.3, 0.3);
    m.userData = { base: sp.a, sp: rand(0.08, 0.2), ph: rand(0, TAU) };
    m.renderOrder = 20;
    sunBeams.push(m);
    scene.add(m);
  }
}

// EFFECT 4 — very light haze separating the depth planes
{
  const hazeTex = (() => {
    const c = makeCanvas(512, 256);
    const g = c.getContext('2d');
    g.save();
    g.translate(256, 128);
    g.scale(2, 1); // ellipse fitted to the canvas: alpha hits 0 on every edge
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(232,244,222,0.5)');
    grad.addColorStop(0.55, 'rgba(232,244,222,0.16)');
    grad.addColorStop(1, 'rgba(232,244,222,0)');
    g.fillStyle = grad;
    g.fillRect(-128, -128, 256, 256);
    g.restore();
    return canvasTex(c);
  })();
  const spots = [
    { x: -12, y: 2.6, z: -9, w: 18, a: 0.2 },
    { x: 11, y: 2.4, z: -11, w: 20, a: 0.18 },
    { x: -3, y: 2.2, z: -16, w: 22, a: 0.14 },
    { x: 14, y: 1.8, z: -2, w: 12, a: 0.1 },
  ];
  for (const sp of spots) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(sp.w, sp.w * 0.42),
      new THREE.MeshBasicMaterial({
        map: hazeTex, transparent: true, depthWrite: false, fog: false, opacity: sp.a,
      }),
    );
    m.position.set(sp.x, sp.y, sp.z);
    m.userData = { x0: sp.x, base: sp.a, sp: rand(0.01, 0.03), ph: rand(0, TAU) };
    m.renderOrder = 18;
    hazePatches.push(m);
    scene.add(m);
  }
}

// EFFECT 5 — a few individual leaves drifting on the breeze
{
  for (let i = 0; i < 14; i++) {
    const near = i < 4; // a few closer to the camera, slightly larger
    const sz = near ? rand(0.22, 0.34) : rand(0.1, 0.2);
    const geo = new THREE.PlaneGeometry(sz, sz);
    const v = randInt(0, 3); // pick one leaf sprig from the atlas
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, (uv.getX(k) + (v % 2)) * 0.5, (uv.getY(k) + (v > 1 ? 1 : 0)) * 0.5);
    }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: singleLeafTexture, transparent: true, alphaTest: 0.35,
      side: THREE.DoubleSide, color: new THREE.Color().setHSL(rand(0.22, 0.3), rand(0.15, 0.35), rand(0.72, 0.9)),
    }));
    m.userData = {
      x: rand(-1, 1) * (near ? 12 : 15),
      y: rand(1, 10),
      z: near ? rand(5, 9) : rand(-14, 6),
      age: rand(0, 6),
      fall: rand(0.28, 0.6),
      sway: rand(0.5, 1.6),
      swaySp: rand(0.4, 1.1),
      ph: rand(0, TAU),
      rx: rand(-1.1, 1.1), ry: rand(-0.9, 0.9), rz: rand(-1.3, 1.3),
    };
    driftLeaves.push(m);
    scene.add(m);
  }
}

// ============================================================
// LAYER 8 — SUBTLE MAGICAL LIFE
// A far particle tier for cinematic depth, fireflies gathering around the
// vegetation, warm light pockets caught in the canopy, and a few seeds
// drifting on the breeze. Deliberately understated.
// ============================================================

const lightPockets = [];
const driftSeeds = [];

{
  // --- distant micro-particles: the faintest depth tier ---
  makeMoteField({
    count: 70,
    tex: softDot('rgba(255,253,238,0.9)', 'rgba(238,248,206,0.35)'),
    area: { x: 20, y0: 0.6, y1: 7.5, z0: -26, z1: -6 },
    sizeMin: 0.35, sizeMax: 1.1, alphaMin: 0.06, alphaMax: 0.22,
    driftX: 0.5, driftY: 0.25, twinkle: 0.3, centerClear: 2,
  });

  // --- fireflies gathering where the plants are ---
  const vegSpots = [];
  for (const b of treeBases) if (Math.abs(b.x) > 4) vegSpots.push(b);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = rand(-6, 8);
      vegSpots.push({ x: side * rand(0.5, 0.95) * xBound(z), z });
    }
  }
  if (vegSpots.length) {
    makeMoteField({
      count: 20,
      tex: softDot('rgba(252,255,206,1)', 'rgba(220,248,158,0.5)'),
      area: { x: 18, y0: 0.35, y1: 3.4, z0: -12, z1: 8 },
      sizeMin: 1.8, sizeMax: 3.8, alphaMin: 0.3, alphaMax: 0.72,
      driftX: 0.85, driftY: 0.45, twinkle: 1, spots: vegSpots,
    });
  }

  // --- warm light pockets: sun caught between the leaves ---
  const pocketTex = radialTex(128, [
    [0, 'rgba(255,246,206,0.75)'], [0.4, 'rgba(255,240,180,0.22)'], [1, 'rgba(255,240,180,0)'],
  ]);
  for (const side of [-1, 1]) {
    for (let i = 0, n = randInt(3, 4); i < n; i++) {
      const z = rand(-14, 3);
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: pocketTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.1,
      }));
      const sc = rand(1.6, 3.4);
      m.scale.set(sc, sc, 1);
      m.position.set(side * rand(0.35, 0.9) * xBound(z), rand(4.5, 9), z);
      m.userData = { base: rand(0.06, 0.13), sp: rand(0.13, 0.3), ph: rand(0, TAU) };
      lightPockets.push(m);
      scene.add(m);
    }
  }

  // --- a few seeds drifting on the breeze ---
  const seedTex = (() => {
    const c = makeCanvas(128, 128);
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,246,0.8)';
    g.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + rand(-1.05, 1.05);
      g.beginPath();
      g.moveTo(64, 96);
      g.quadraticCurveTo(64 + Math.cos(a) * 22, 96 + Math.sin(a) * 26,
        64 + Math.cos(a) * 46, 96 + Math.sin(a) * 52);
      g.stroke();
    }
    g.strokeStyle = 'rgba(214,196,150,0.95)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(64, 96);
    g.lineTo(64, 118);
    g.stroke();
    return canvasTex(c);
  })();
  for (let i = 0; i < 11; i++) {
    const near = i < 3;
    const sz = near ? rand(0.2, 0.3) : rand(0.09, 0.16);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshBasicMaterial({
      map: seedTex, transparent: true, depthWrite: false, opacity: rand(0.5, 0.85),
      side: THREE.DoubleSide,
    }));
    m.userData = {
      x: rand(-1, 1) * (near ? 11 : 16),
      y: rand(0.8, 6),
      z: near ? rand(4, 9) : rand(-13, 5),
      t0: rand(0, 40),
      rise: rand(0.05, 0.16),
      sway: rand(0.6, 1.9),
      swaySp: rand(0.25, 0.6),
      ph: rand(0, TAU),
      spin: rand(-0.5, 0.5),
    };
    driftSeeds.push(m);
    scene.add(m);
  }
}

// ============================================================
// LAYER 9 — INTERACTIVE CLEARING FOCUS
// Sunlight filtered through the canopy pools softly in the clearing and
// shifts as the leaves move; a few warm motes hang around the perimeter.
// Nothing here draws an edge, a ring or a stage.
// ============================================================

const sunPatches = [];

{
  // an irregular, feathered pool of light — never a clean circle
  const dappleTex = (() => {
    const S = 256;
    const sharp = makeCanvas(S, S);
    const g = sharp.getContext('2d');
    for (let i = 0, n = randInt(4, 7); i < n; i++) {
      const gx = rand(S * 0.36, S * 0.64), gy = rand(S * 0.36, S * 0.64);
      const rr = rand(S * 0.1, S * 0.2);
      const grad = g.createRadialGradient(gx, gy, 0, gx, gy, rr);
      grad.addColorStop(0, 'rgba(255,248,214,0.85)');
      grad.addColorStop(0.55, 'rgba(255,244,196,0.3)');
      grad.addColorStop(1, 'rgba(255,244,196,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(gx, gy, rr, rr * rand(0.6, 1), rand(0, TAU), 0, TAU);
      g.fill();
    }
    const c = makeCanvas(S, S);
    const out = c.getContext('2d');
    out.filter = 'blur(14px)'; // feathered, no hard edge anywhere
    out.drawImage(sharp, 0, 0);
    out.filter = 'none';
    out.globalCompositeOperation = 'destination-in'; // guarantee a zero border
    const mask = out.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(0.62, 'rgba(0,0,0,1)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    out.fillStyle = mask;
    out.fillRect(0, 0, S, S);
    out.globalCompositeOperation = 'source-over';
    return canvasTex(c);
  })();

  // scattered through and around the clearing, weighted to the sides
  const spots = [
    { x: -6.2, z: 2.5, s: 4.4, a: 0.1 },
    { x: -3.1, z: 6.4, s: 3.2, a: 0.075 },
    { x: 5.8, z: 1.2, s: 4.8, a: 0.11 },
    { x: 8.4, z: 5.6, s: 3.6, a: 0.085 },
    { x: 1.4, z: -1.4, s: 3.8, a: 0.07 },
    { x: -8.6, z: -2.2, s: 3.4, a: 0.08 },
    { x: 3.4, z: 8.2, s: 2.8, a: 0.06 },
    { x: -1.8, z: 3.6, s: 3.0, a: 0.045 }, // faintest, nearest the stage
  ];
  for (const sp of (FOCUS ? spots : [])) {
    const geo = new THREE.PlaneGeometry(sp.s, sp.s * 2.6); // elongated: the
    geo.rotateX(-Math.PI / 2);                             // ground is seen
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({  // near edge-on
      map: dappleTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: sp.a, fog: false,
    }));
    m.position.set(sp.x, groundHeight(sp.x, sp.z) + 0.035, sp.z);
    m.rotation.y = rand(0, TAU);
    m.userData = { base: sp.a, sp: rand(0.06, 0.16), ph: rand(0, TAU), x0: sp.x };
    m.renderOrder = 2;
    sunPatches.push(m);
    scene.add(m);
  }

  // a few warm motes loitering around the clearing's edge, not over the stage
  const rim = [];
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU);
    const rr = rand(1.15, 1.6);
    const rx = Math.cos(a) * 5.6 * rr, rz = 3 + Math.sin(a) * 6.6 * rr;
    if (rz > 9 || rz < -5) continue;
    rim.push({ x: rx, z: rz });
  }
  if (FOCUS && rim.length) {
    makeMoteField({
      count: 24,
      tex: softDot('rgba(255,250,226,0.95)', 'rgba(255,242,196,0.4)'),
      area: { x: 14, y0: 0.4, y1: 2.8, z0: -5, z1: 9 },
      sizeMin: 1, sizeMax: 2.6, alphaMin: 0.08, alphaMax: 0.26,
      driftX: 0.5, driftY: 0.3, twinkle: 0.5, spots: rim,
    });
  }
}

// ============================================================
// THE LIVING FOREST — logical map + animals
// The animals never read the picture. They read a grid built from where the
// trunks, rocks and bushes actually stand, so the map cannot drift out of
// step with what is on screen.
// ============================================================

const forestMap = new ForestMap({
  cellSize: 0.4,
  zMin: -9, zMax: 7.5,
  xCap: 10,
  halfWidth: xBound,
  groundHeight,
  edgeMargin: 0.86, // the animals keep clear of the framing foliage
});

{
  const obstacles = [];
  const interests = [];

  for (const t of treeBases) obstacles.push({ x: t.x, z: t.z, r: t.r * 0.85 });
  for (const p of navProps) {
    if (p.kind === 'bush' || p.kind === 'fern') obstacles.push(p);
    // the edge of a bush is worth a sniff even though its middle is solid
    interests.push({ x: p.x, z: p.z, r: p.r + 0.85, kind: p.kind });
  }
  for (const spot of rockSpots) {
    const p = spot.g.position;
    obstacles.push({ x: p.x, z: p.z, r: Math.max(0.3, spot.s * 1.6) });
    interests.push({ x: p.x, z: p.z, r: 0.9, kind: 'rock' });
  }
  for (const hb of heroBases) interests.push({ x: hb.x, z: hb.z + 1.4, r: 1, kind: 'roots' });

  forestMap.build(obstacles, interests, 0.34);

  const open = forestMap.grid.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
  console.log('forest map: ' + forestMap.nx + 'x' + forestMap.nz + ' cells, '
    + open + ' walkable, ' + forestMap.interests.length + ' points of interest');

  if (location.hash.includes('map')) scene.add(forestMap.debugMesh());
}

// The clearing comfortably holds about a dozen creatures at readable spacing.
// The server remembers far more; the oldest simply wander out of shot.
const animals = new AnimalManager({ scene, map: forestMap, groundHeight, max: 12 });

// ---- a child's drawing becomes a creature ----
// A coloured template page goes onto the rigged model it was rendered from —
// aligned by construction. A freehand PICTURE never goes onto a model:
// smearing a whole drawn animal across a differently-shaped 3D body lands
// eyes on necks and legs on bellies. Freehand becomes a sculpted body built
// FROM the drawing instead (/lab#flat forces the flat cut-out).
const FLAT = location.hash.includes('flat');
const SCULPT = location.hash.includes('sculpt');
loadAnimalManifest();
function addDrawing(data, live) {
  const img = new Image();
  img.onload = async () => {
    let asset = null;
    if (!FLAT && !SCULPT && data.mode === 'color') {
      // A coloured page belongs on the exact model it was drawn for. A kind
      // this wall doesn't know resolves to the prowler fallback - which would
      // dress the fox in a stranger's colours - and a kind with no model
      // would become a made-up clay stand-in. Both are worse than showing
      // nothing: skip anything that isn't precisely itself.
      if (resolveSpecies(data.kind).label !== data.kind) {
        console.warn('unknown coloured kind "' + data.kind + '" - not spawning');
        return;
      }
      try { asset = await getAsset(data.kind); }
      catch { asset = null; }
      if (!asset) {
        console.warn('no model for coloured kind "' + data.kind + '" - not spawning');
        return;
      }
    }
    try {
      animals.spawn(data.kind, {
        id: data.id,
        // the transformation moment is for the child watching right now;
        // creatures restored after a reload just walk in from the trees
        intro: live ? img : null,
        body: (sp) => (asset ? new ModelBody(sp, asset, img, data.name, true)
          : FLAT ? new DrawingBody(sp, img, data.name)
                 : new SculptedBody(sp, img, data.name)),
      });
    } catch (err) {
      console.warn('could not bring drawing to life:', err);
    }
  };
  img.onerror = () => console.warn('drawing failed to decode, id ' + data.id);
  img.src = data.img;
}

// ---- the link to the iPads ----
// Same protocol the original wall speaks, so /draw needs no changes and the
// old wall keeps working as a fallback during the event.
{
  let ws = null, retry = 800;
  // A long-lived wall can outlive the code it was built from: when the server
  // restarts (new boot id), this page's species tables and models may be
  // stale, and every unknown animal would fall back to the fox. Reload once
  // and come back current. A plain network blip reconnects to the SAME boot
  // id and changes nothing.
  let bootSeen = null;
  const checkBoot = (boot) => {
    if (!boot) return;
    if (bootSeen === null) { bootSeen = boot; return; }
    if (boot === bootSeen) return;
    const last = Number(sessionStorage.getItem('dj-reload-at') || 0);
    if (Date.now() - last < 20000) return; // never loop, whatever happens
    sessionStorage.setItem('dj-reload-at', String(Date.now()));
    console.log('server restarted — reloading the wall for fresh code');
    location.reload();
  };
  const connect = () => {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host);
    ws.onopen = () => {
      retry = 800;
      ws.send(JSON.stringify({ type: 'hello', role: 'wall' }));
      console.log('forest connected to the drawing table');
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'welcome') { checkBoot(msg.boot); return; }
      if (msg.type === 'init') for (const c of msg.creatures) addDrawing(c, false);
      else if (msg.type === 'creature') addDrawing(msg.creature, true);
      else if (msg.type === 'remove') animals.remove(msg.id);
      else if (msg.type === 'clear') animals.clear();
    };
    // never leave the wall dead for the rest of the event because the server
    // blinked: keep reaching back for it
    ws.onclose = () => { setTimeout(connect, retry); retry = Math.min(8000, retry * 2); };
    ws.onerror = () => ws.close();
  };
  connect();
}

// ---- the forest notices an arrival ----
// While a page transforms on stage the camera leans in a little, and the
// burst sends a gust through every leaf. Subtle on purpose: this plays on a
// large wall, and a lurching camera would be worse than none.
const arrival = { active: false, t0: 0, x: 0, z: 0, gust: 0 };
window.addEventListener('creature-arrival', (e) => {
  if (e.detail.phase === 'flight') {
    arrival.active = true;
    arrival.t0 = clock.elapsedTime;
    arrival.x = e.detail.x;
    arrival.z = e.detail.z;
  } else if (e.detail.phase === 'burst') {
    arrival.gust = 1.4;
  }
});

// console handle for tuning at the event, and a grey stand-in for testing
// the navigation without needing a drawing: /lab#proxy
window.forest = {
  map: forestMap, animals,
  spawn: (kind) => animals.spawn(kind || 'hopper'),
};
if (location.hash.includes('proxy')) animals.spawn('hopper');

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
  camera.position.x = Math.sin(t * 0.06) * 0.1; // barely-there sway, no perceptible drift
  camera.position.y = 1.7 + Math.sin(t * 0.07) * 0.08;
  let lookX = 0, lookY = 2.6;
  camera.position.z = 12.5;
  if (arrival.active) {
    const at = t - arrival.t0;
    // ease in over the flight, hold through the magic, ease out after
    const inK = clamp(at / 2.2, 0, 1);
    const outK = clamp((at - 6.8) / 1.8, 0, 1);
    const k = inK * inK * (3 - 2 * inK) * (1 - outK * outK * (3 - 2 * outK));
    camera.position.z = 12.5 - 1.15 * k;
    lookX = arrival.x * 0.3 * k;
    lookY = 2.6 - 0.55 * k;
    if (at > 9) arrival.active = false;
  }
  camera.lookAt(lookX, lookY, -20);

  // mist drifts sideways, barely
  for (const m of mists) {
    m.position.x = m.userData.baseX + Math.sin(t * m.userData.speed * 10 + m.userData.phase) * 4;
  }

  // clouds cross the sky very slowly, wrapping around
  for (const cl of clouds) {
    cl.position.x += cl.userData.speed * dt;
    if (cl.position.x > 90) cl.position.x = -90;
  }

  // wind gusts rise and fall — and surge when magic bursts in the clearing
  WIND.time.value = t;
  arrival.gust = Math.max(0, arrival.gust - dt * 0.8);
  WIND.gust.value = 0.75 + Math.sin(t * 0.23) * 0.22 + Math.sin(t * 0.9) * 0.1 + arrival.gust;

  // mid-distance trees breathe in the breeze
  for (const tr of midTrees) {
    tr.rotation.z = Math.sin(t * tr.userData.swaySpeed + tr.userData.phase) * tr.userData.swayAmp;
  }

  // ---- layer 5 atmosphere ----
  for (const m of moteFields) m.material.uniforms.uTime.value = t;
  for (const p of sunPatches) {
    const d = p.userData;
    p.material.opacity = d.base * (0.6 + 0.4 * Math.sin(t * d.sp + d.ph));
    p.position.x = d.x0 + Math.sin(t * d.sp * 0.8 + d.ph) * 0.5;
  }
  for (const p of lightPockets) {
    p.material.opacity = p.userData.base * (0.55 + 0.45 * Math.sin(t * p.userData.sp + p.userData.ph));
  }
  for (const sd of driftSeeds) {
    const d = sd.userData;
    const age = (t + d.t0) % 42;
    sd.position.set(
      d.x + Math.sin(t * d.swaySp + d.ph) * d.sway,
      d.y + Math.sin(age * 0.11 + d.ph) * 0.5 + age * d.rise * 0.35,
      d.z + Math.cos(t * d.swaySp * 0.6 + d.ph) * d.sway * 0.4);
    sd.rotation.z = Math.sin(t * 0.5 + d.ph) * 0.5 + d.spin * t * 0.25;
    if (age > 40) sd.position.y -= (age - 40) * 6; // slip away and return
  }
  for (const b of sunBeams) {
    b.material.opacity = b.userData.base * (0.72 + 0.28 * Math.sin(t * b.userData.sp + b.userData.ph));
  }
  for (const h of hazePatches) {
    h.position.x = h.userData.x0 + Math.sin(t * h.userData.sp + h.userData.ph) * 2.2;
    h.material.opacity = h.userData.base * (0.75 + 0.25 * Math.sin(t * 0.11 + h.userData.ph));
  }
  for (const lf of driftLeaves) {
    const d = lf.userData;
    d.age += dt;
    lf.position.set(
      d.x + Math.sin(t * d.swaySp + d.ph) * d.sway,
      d.y - d.fall * d.age,
      d.z + Math.cos(t * d.swaySp * 0.7 + d.ph) * d.sway * 0.5);
    lf.rotation.x += d.rx * dt;
    lf.rotation.y += d.ry * dt;
    lf.rotation.z += d.rz * dt;
    if (lf.position.y < -0.6) { // caught by a new gust up in the canopy
      d.age = 0;
      d.x = rand(-1, 1) * 15;
      d.y = rand(7, 11);
      d.z = rand(-14, 8);
    }
  }

  animals.update(dt, t);

  renderer.render(scene, camera);
}
frame();
