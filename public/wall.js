// Digital Jungle — LED wall display (3D)
// A stylized low-poly Three.js jungle. Kids' drawings arrive over WebSocket
// and live in the scene as paper-cutout creatures with body-part rigs:
// legs swing from hips, ears flop, tails wag, wings flap in real 3D.

import * as THREE from './vendor/three.module.js';

const hintEl = document.getElementById('hint');
const statusEl = document.getElementById('status');
const inviteEl = document.getElementById('invite');
const STEADY = location.hash === '#steady';

window.addEventListener('error', (e) => { hintEl.textContent = '⚠ ' + e.message; });

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const TAU = Math.PI * 2;
const pulse = (p) => Math.sin(clamp(p, 0, 1) * Math.PI);
const skewSin = (p) => Math.sin(p + 0.45 * Math.sin(p));
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ---------- world bounds ----------
const GROUND = { zMin: -1.5, zMax: 7.5 };
const SKY = { yMin: 2.6, yMax: 5.4, zMin: -5, zMax: 4 };
const CAM_Z = 12.5;
let halfTanH = 1; // tan of half the horizontal fov (updated on resize)
function xBound(z) {
  return Math.max(3, halfTanH * (CAM_Z - z) * 0.82 - 0.4);
}

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.55;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x155c40, 0.017);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(0, 3.0, CAM_Z);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  halfTanH = Math.tan((camera.fov * Math.PI / 180) / 2) * camera.aspect;
}
window.addEventListener('resize', resize);
resize();

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x9fdcbb, 0x0a2e1f, 1.05));
scene.add(new THREE.AmbientLight(0x3d7a5c, 0.55));
// soft warm fill from behind the camera so the clearing never goes murky
const fill = new THREE.DirectionalLight(0xd8f2c8, 0.55);
fill.position.set(-4, 7, 18);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xffe9b0, 2.0);
sun.position.set(11, 14, -8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -10;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0015;
scene.add(sun);

// ---------- canvas-texture helpers ----------
function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function radialTex(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return canvasTex(c);
}

const glowTexture = radialTex(128, [
  [0, 'rgba(255,250,200,1)'], [0.25, 'rgba(240,255,170,0.6)'], [1, 'rgba(240,255,170,0)'],
]);
const shadowTexture = radialTex(128, [
  [0, 'rgba(0,0,0,0.4)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)'],
]);
const puffTexture = radialTex(96, [
  [0, 'rgba(160,185,155,0.55)'], [1, 'rgba(160,185,155,0)'],
]);

function leafTexCanvas(dark) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = dark ? '#07271a' : '#0d3a26';
  g.beginPath();
  g.ellipse(128, 64, 122, 52, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(10, 64); g.lineTo(246, 64);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    const x = 40 + i * 34;
    g.moveTo(x, 64); g.lineTo(x + 26, 20);
    g.moveTo(x, 64); g.lineTo(x + 26, 108);
    g.stroke();
  }
  return c;
}

// ---------- procedural jungle textures ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const barkTexture = (() => {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#4a4034';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 128;
    g.strokeStyle = `rgba(${randInt(20, 70)},${randInt(18, 60)},${randInt(12, 40)},${rand(0.15, 0.4)})`;
    g.lineWidth = rand(1, 3.5);
    g.beginPath();
    g.moveTo(x, -10);
    g.bezierCurveTo(x + rand(-8, 8), 60, x + rand(-8, 8), 180, x + rand(-10, 10), 270);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) { // moss flecks
    g.fillStyle = `rgba(${randInt(60, 90)},${randInt(100, 130)},${randInt(60, 85)},${rand(0.08, 0.2)})`;
    g.beginPath();
    g.ellipse(rand(0, 128), rand(0, 256), rand(2, 9), rand(4, 14), 0, 0, TAU);
    g.fill();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

const palmBarkTexture = (() => {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#5c5240';
  g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 13) { // leaf-scar rings
    g.fillStyle = `rgba(30,26,18,${rand(0.25, 0.45)})`;
    g.fillRect(0, y, 128, rand(3, 6));
    g.fillStyle = `rgba(120,110,80,${rand(0.1, 0.25)})`;
    g.fillRect(0, y + 6, 128, 2);
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

const GREENS = ['#1d5c39', '#27714a', '#2f8253', '#1a4d31', '#39955f', '#245f40'];

// a cluster of individual leaves — canopy is built from many of these cards
const leafClusterTexture = (() => {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  for (let i = 0; i < 17; i++) {
    g.save();
    g.translate(rand(30, 226), rand(30, 226));
    g.rotate(rand(0, TAU));
    const L = rand(34, 62), W = rand(14, 24);
    const grad = g.createLinearGradient(0, 0, L, 0);
    grad.addColorStop(0, pick(GREENS));
    grad.addColorStop(1, pick(GREENS));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(L * 0.5, -W, L, 0);
    g.quadraticCurveTo(L * 0.5, W, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(2, 0); g.lineTo(L - 4, 0);
    g.stroke();
    g.restore();
  }
  return canvasTex(c);
})();

// pinnate palm frond: central rachis with tapering leaflets
const frondTexture = (() => {
  const c = makeCanvas(512, 128);
  const g = c.getContext('2d');
  g.strokeStyle = '#3c6b3e';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(505, 64); g.stroke();
  for (let x = 16; x < 500; x += 8) {
    const u = x / 512;
    const L = 54 * (1 - Math.pow(u, 1.7)) + 6;
    for (const s of [-1, 1]) {
      g.fillStyle = pick(GREENS);
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 14 + L * 0.25, 64 + s * L);
      g.lineTo(x + 20 + L * 0.25, 64 + s * (L - 6));
      g.closePath();
      g.fill();
    }
  }
  return canvasTex(c);
})();

// big banana paddle leaf with rib, veins and torn notches
const bananaTexture = (() => {
  const c = makeCanvas(512, 256);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#2f8253');
  grad.addColorStop(1, '#1a5233');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(4, 128);
  g.bezierCurveTo(60, 18, 320, 10, 508, 128);
  g.bezierCurveTo(320, 246, 60, 238, 4, 128);
  g.fill();
  g.strokeStyle = '#9dc987';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(6, 128); g.lineTo(506, 128); g.stroke();
  g.strokeStyle = 'rgba(10,40,20,0.25)';
  g.lineWidth = 3;
  for (let x = 20; x < 500; x += 16) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x, 128);
      g.lineTo(x + 34, 128 + s * 110);
      g.stroke();
    }
  }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const x = rand(60, 480), s = pick([-1, 1]);
    g.beginPath();
    g.moveTo(x, 128 + s * 128);
    g.lineTo(x + rand(-6, 6), 128 + s * rand(30, 80));
    g.lineTo(x + rand(10, 22), 128 + s * 128);
    g.closePath();
    g.fill();
  }
  return canvasTex(c);
})();

const groundTexture = (() => {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#2a4a2e';
  g.fillRect(0, 0, 512, 512);
  const cols = ['#33583a', '#223f27', '#3c6642', '#2c5233', '#4a5a40', '#57614a', '#213b25'];
  for (let i = 0; i < 520; i++) {
    g.fillStyle = pick(cols);
    g.globalAlpha = rand(0.08, 0.3);
    g.beginPath();
    g.ellipse(rand(0, 512), rand(0, 512), rand(6, 46), rand(5, 32), rand(0, TAU), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${randInt(20, 90)},${randInt(50, 120)},${randInt(25, 70)},${rand(0.1, 0.35)})`;
    g.fillRect(rand(0, 512), rand(0, 512), rand(1, 2.4), rand(1, 2.4));
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 6);
  return t;
})();

// ---------- merged foliage geometry (many leaves, one draw call) ----------
function foliageBuilder() {
  const pos = [], norm = [], uv = [], idx = [];
  const V = new THREE.Vector3(), N = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  // a strip along +X that tapers and droops — a frond or long leaf
  function strip(m4, len, w0, w1, segs, droop) {
    nm.getNormalMatrix(m4);
    const start = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = u * len;
      const y = -droop * u * u * len;
      const hw = lerp(w0, w1, u) / 2;
      for (const s of [-1, 1]) {
        V.set(x, y, s * hw).applyMatrix4(m4);
        pos.push(V.x, V.y, V.z);
        N.set(droop * u * 1.5, 1, 0).normalize().applyMatrix3(nm).normalize();
        norm.push(N.x, N.y, N.z);
        uv.push(u, s * 0.5 + 0.5);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = start + i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // a flat square card (leaf cluster) centered at its matrix origin
  function card(m4, size) {
    nm.getNormalMatrix(m4);
    const start = pos.length / 3;
    const h = size / 2;
    for (const [cx, cy] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
      V.set(cx, cy, 0).applyMatrix4(m4);
      pos.push(V.x, V.y, V.z);
      N.set(0, 0, 1).applyMatrix3(nm).normalize();
      norm.push(N.x, N.y, N.z);
      uv.push(cx > 0 ? 1 : 0, cy > 0 ? 1 : 0);
    }
    idx.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
  }
  function build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }
  return { strip, card, build };
}

function composeM4(px, py, pz, rx, ry, rz, s = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(s, s, s),
  );
}

// ---------- wind (vertex-shader sway + flutter on all foliage) ----------
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
          float wh = clamp(wpos.y * uWHk, 0.0, 1.6);
          float sway = sin(uWTime * 1.3 + wpos.x * 0.32 + wpos.z * 0.45)
                     + 0.6 * sin(uWTime * 2.2 + wpos.x * 0.85 + wpos.y * 0.4);
          float flut = sin(uWTime * 5.7 + wpos.x * 3.1 + wpos.y * 2.3 + wpos.z * 1.7);
          float k = uWStr * uWGust * wh;
          transformed.x += (sway * 0.075 + flut * 0.02) * k;
          transformed.z += (sway * 0.05 + flut * 0.015) * k;
          transformed.y += flut * 0.02 * k;
        }
      `);
  };
}

const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
const dryFrondMat = new THREE.MeshStandardMaterial({ map: frondTexture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: 0xc9b078 });
const leafCardMat = new THREE.MeshStandardMaterial({ map: leafClusterTexture, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1 });
const leafCardDarkMat = new THREE.MeshStandardMaterial({ map: leafClusterTexture, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: 0x77917a });
const bananaMat = new THREE.MeshStandardMaterial({ map: bananaTexture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
const fernMat = new THREE.MeshStandardMaterial({ map: frondTexture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture, roughness: 1 });
const palmBarkMat = new THREE.MeshStandardMaterial({ map: palmBarkTexture, roughness: 1 });
addWind(frondMat, 1.15, 0.22);      // palm crowns, high up
addWind(dryFrondMat, 1.3, 0.22);
addWind(leafCardMat, 0.9, 0.2);     // canopy leaves
addWind(leafCardDarkMat, 0.9, 0.2);
addWind(bananaMat, 1.5, 0.6);       // big floppy leaves
addWind(fernMat, 1.2, 1.6);         // low ferns still need to move

// ---------- sky, sun, god rays ----------
{
  const skyGeo = new THREE.SphereGeometry(80, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x06281c) },
      mid: { value: new THREE.Color(0x0d4a30) },
      hor: { value: new THREE.Color(0x7cbf95) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h))
                          : mix(hor, mid, smoothstep(-0.05, 0.25, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTex(256, [[0, 'rgba(255,246,200,1)'], [0.2, 'rgba(255,240,170,0.5)'], [1, 'rgba(255,240,170,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  sunSprite.scale.set(26, 26, 1);
  sunSprite.position.set(16, 13, -38);
  scene.add(sunSprite);
}

const rays = [];
{
  const rayMat = () => new THREE.MeshBasicMaterial({
    color: 0xfff6be, transparent: true, opacity: 0.045,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(1.2, 2.4), 46), rayMat());
    m.position.set(15, 12, -30);
    m.rotation.z = 0.55 + i * 0.16 + rand(-0.04, 0.04);
    m.geometry.translate(0, -23, 0); // pivot at the sun end
    m.userData.phase = rand(0, TAU);
    rays.push(m);
    scene.add(m);
  }
}

// ---------- ground ----------
function groundBump(x, z) {
  // flat where creatures walk, rolling hills elsewhere
  const inBandZ = z > GROUND.zMin - 1.5 && z < GROUND.zMax + 2;
  const inBandX = Math.abs(x) < 17;
  const edge = (inBandZ && inBandX)
    ? 0
    : clamp(Math.max(
        inBandZ ? 0 : Math.min(Math.abs(z - GROUND.zMin), Math.abs(z - GROUND.zMax)) / 5,
        inBandX ? 0 : (Math.abs(x) - 17) / 5,
      ), 0, 1);
  return edge * (Math.sin(x * 0.24) * 0.7 + Math.cos(z * 0.3 + x * 0.08) * 0.55 + Math.sin(x * 1.1) * Math.sin(z * 0.9) * 0.22 + 0.4);
}
{
  const geo = new THREE.PlaneGeometry(120, 70, 80, 46);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -10);
  const pos = geo.attributes.position;
  const colors = [];
  const cA = new THREE.Color(0x6f8f6a), cB = new THREE.Color(0xb9d6a5), cC = new THREE.Color(0x3d5a44);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = groundBump(x, z);
    pos.setY(i, y);
    const c = cA.clone().lerp(cB, clamp(y / 1.6 + rand(-0.06, 0.06) + 0.25, 0, 1));
    if (z > 8.5) c.lerp(cC, clamp((z - 8.5) / 6, 0, 1)); // darker toward the camera
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: groundTexture, vertexColors: true, roughness: 1, metalness: 0,
  }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// grass tufts
{
  const geo = new THREE.ConeGeometry(0.025, 0.17, 4);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3da173, roughness: 1, flatShading: true });
  addWind(mat, 0.7, 5); // grass shivers in the breeze
  const inst = new THREE.InstancedMesh(geo, mat, 180);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 180; i++) {
    const x = rand(-16, 16), z = rand(GROUND.zMin - 1, GROUND.zMax + 2);
    m4.makeRotationY(rand(0, TAU));
    m4.setPosition(x, 0.1 + groundBump(x, z), z);
    inst.setMatrixAt(i, m4);
  }
  scene.add(inst);
}

// ---------- flora: palms, canopy trees, bananas, ferns ----------
function makePalm(s) {
  const g = new THREE.Group();
  let p = new THREE.Vector3(0, 0, 0);
  const tilt = rand(-0.14, 0.14), leanA = rand(0, TAU);
  const segs = 6, segLen = 0.88 * s;
  let dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(leanA), 1, Math.sin(tilt) * Math.sin(leanA)).normalize();
  for (let i = 0; i < segs; i++) {
    const r0 = lerp(0.14, 0.08, i / segs) * s;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.92, r0, segLen, 7), palmBarkMat);
    seg.castShadow = true;
    seg.position.copy(p).addScaledVector(dir, segLen / 2);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(seg);
    p.addScaledVector(dir, segLen);
    dir = dir.clone();
    dir.x += rand(-0.02, 0.09) * Math.sign(dir.x || 1);
    dir.normalize();
  }
  // crown of arching fronds
  const fb = foliageBuilder();
  const n = randInt(9, 13);
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * TAU + rand(-0.2, 0.2);
    const pitch = lerp(0.35, -0.75, Math.random());
    fb.strip(
      composeM4(p.x, p.y, p.z, 0, yaw, 0).multiply(composeM4(0, 0, 0, 0, 0, pitch)),
      rand(2.1, 3) * s, 0.5 * s, 0.06 * s, 7, rand(0.28, 0.45));
  }
  g.add(new THREE.Mesh(fb.build(), frondMat));
  // dry hanging fronds under the crown
  const db = foliageBuilder();
  for (let i = 0; i < 3; i++) {
    db.strip(
      composeM4(p.x, p.y - 0.1, p.z, 0, rand(0, TAU), 0).multiply(composeM4(0, 0, 0, 0, 0, -rand(1.7, 2.2))),
      rand(1.4, 2) * s, 0.4 * s, 0.05 * s, 6, 0.15);
  }
  g.add(new THREE.Mesh(db.build(), dryFrondMat));
  // coconuts
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(
      new THREE.SphereGeometry(0.09 * s, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x5a4a2e, roughness: 1 }),
    );
    nut.position.set(p.x + rand(-0.15, 0.15) * s, p.y - 0.18 * s, p.z + rand(-0.15, 0.15) * s);
    g.add(nut);
  }
  return g;
}

function makeCanopyTree(s, cards = 64) {
  const g = new THREE.Group();
  const trunkH = rand(3.1, 4.4) * s;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.3 * s, trunkH, 7), barkMat);
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = rand(-0.05, 0.05);
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const a = rand(0, TAU);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.09 * s, 1.5 * s, 5), barkMat);
    br.position.set(Math.cos(a) * 0.5 * s, trunkH + 0.4 * s, Math.sin(a) * 0.5 * s);
    br.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    g.add(br);
  }
  // canopy = a shell of leaf-cluster cards, not a solid blob
  const cy = trunkH + 1.0 * s;
  const rx = 2.1 * s, ry = 1.35 * s, rz = 2.1 * s;
  const V = new THREE.Vector3();
  const buildShell = (count, rMin, rMax) => {
    const fb = foliageBuilder();
    for (let i = 0; i < count; i++) {
      V.randomDirection();
      const rad = rand(rMin, rMax);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V);
      const roll = new THREE.Quaternion().setFromAxisAngle(V, rand(0, TAU));
      const m4 = new THREE.Matrix4().compose(
        new THREE.Vector3(V.x * rx * rad, cy + V.y * ry * rad, V.z * rz * rad),
        roll.multiply(q),
        new THREE.Vector3(1, 1, 1));
      fb.card(m4, rand(1.2, 2.0) * s);
    }
    return fb.build();
  };
  g.add(new THREE.Mesh(buildShell(cards, 0.55, 1), leafCardMat));
  g.add(new THREE.Mesh(buildShell(Math.round(cards * 0.3), 0.15, 0.5), leafCardDarkMat));
  return g;
}

function makeBanana(s) {
  const g = new THREE.Group();
  const stemH = 0.9 * s;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07 * s, 0.1 * s, stemH, 6),
    new THREE.MeshStandardMaterial({ color: 0x4e7a4a, roughness: 1 }),
  );
  stem.position.y = stemH / 2;
  g.add(stem);
  const fb = foliageBuilder();
  const n = randInt(5, 8);
  for (let i = 0; i < n; i++) {
    fb.strip(
      composeM4(0, stemH * 0.9, 0, 0, rand(0, TAU), 0).multiply(composeM4(0, 0, 0, 0, 0, rand(0.35, 1.1))),
      rand(1.6, 2.4) * s, 0.2 * s, 0.55 * s, 8, rand(0.45, 0.7));
  }
  g.add(new THREE.Mesh(fb.build(), bananaMat));
  return g;
}

function makeFern(s) {
  const fb = foliageBuilder();
  const n = randInt(7, 10);
  for (let i = 0; i < n; i++) {
    fb.strip(
      composeM4(0, 0.05, 0, 0, (i / n) * TAU + rand(-0.2, 0.2), 0).multiply(composeM4(0, 0, 0, 0, 0, rand(0.5, 0.95))),
      rand(0.7, 1.1) * s, 0.16 * s, 0.03 * s, 6, rand(0.6, 0.95));
  }
  return new THREE.Mesh(fb.build(), fernMat);
}

// ---------- plant the jungle (open clearing, breathing room between trees) ----------
const swayTrees = [];
{
  const place = (obj, x, z, sway = true) => {
    obj.position.set(x, groundBump(x, z), z);
    obj.rotation.y = rand(0, TAU);
    if (sway) swayTrees.push({ obj, phase: rand(0, TAU), amp: rand(0.006, 0.016), speed: rand(0.45, 0.75) });
    scene.add(obj);
  };
  // layered back wall of jungle — sparser, taller
  for (const [z0, gap, sMin, sMax] of [[-4.5, 4.2, 0.9, 1.3], [-7.5, 4.8, 1.1, 1.6], [-11, 5.4, 1.4, 2.1]]) {
    for (let x = -21; x <= 21; x += gap * rand(0.85, 1.3)) {
      place(Math.random() < 0.45 ? makePalm(rand(sMin, sMax)) : makeCanopyTree(rand(sMin, sMax)),
        x + rand(-0.8, 0.8), z0 + rand(-1.1, 1.1));
    }
  }
  // far dark skyline
  for (let i = 0; i < 7; i++) {
    place(makeCanopyTree(rand(2.4, 3.4), 40), rand(-36, 36), rand(-24, -16));
  }
  // side walls near the camera
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      place(Math.random() < 0.5 ? makePalm(rand(1.1, 1.5)) : makeCanopyTree(rand(1, 1.4)),
        sx * rand(14.5, 19), rand(-1, 6));
      place(makeBanana(rand(0.9, 1.4)), sx * rand(13, 17), rand(-2, 7));
    }
  }
  // understory
  for (let i = 0; i < 5; i++) place(makeBanana(rand(0.8, 1.3)), rand(-18, 18), rand(-6, -3.2));
  for (let i = 0; i < 15; i++) {
    let x = rand(-19, 19), z = rand(-5, 7.5);
    if (Math.abs(x) < 13 && z > -2.5) x = Math.sign(x || 1) * rand(13, 19);
    place(makeFern(rand(0.8, 1.5)), x, z);
  }
  for (let i = 0; i < 5; i++) place(makeFern(rand(0.5, 0.8)), rand(-12, 12), rand(-2.8, -1.2));
  // rocks
  for (let i = 0; i < 9; i++) {
    const r = rand(0.25, 0.7);
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshStandardMaterial({ color: pick([0x5f6f60, 0x6a7668, 0x566253]), roughness: 1, flatShading: true }),
    );
    const pa = rock.geometry.attributes.position;
    for (let v = 0; v < pa.count; v++) {
      pa.setXYZ(v, pa.getX(v) * rand(0.8, 1.2), pa.getY(v) * rand(0.6, 1), pa.getZ(v) * rand(0.8, 1.2));
    }
    rock.geometry.computeVertexNormals();
    rock.castShadow = true;
    let x = rand(-16, 16), z = rand(-6, 7);
    if (Math.abs(x) < 12 && z > -2) x = Math.sign(x || 1) * rand(12, 16);
    rock.position.set(x, groundBump(x, z) + r * 0.25, z);
    scene.add(rock);
  }
  // fallen mossy log at the clearing's back edge
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 4.4, 7), barkMat);
  log.rotation.z = Math.PI / 2 - 0.06;
  log.rotation.y = rand(-0.4, 0.4);
  log.position.set(rand(-9, 9), 0.26, rand(-2.4, -1.2));
  log.castShadow = true;
  scene.add(log);
  // lianas swinging between the canopy
  for (let i = 0; i < 6; i++) {
    const x0 = rand(-16, 16), x1 = x0 + rand(-7, 7);
    const z0 = rand(-9, -3);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0, rand(4.5, 7), z0),
      new THREE.Vector3((x0 + x1) / 2, rand(2.6, 4), z0 + rand(-1, 1)),
      new THREE.Vector3(x1, rand(4.5, 7), z0 + rand(-2, 2)),
    ]);
    scene.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, rand(0.02, 0.04), 5),
      new THREE.MeshStandardMaterial({ color: 0x3e5c33, roughness: 1 }),
    ));
  }
}

// framing foliage near the camera
const framers = [];
{
  const spots = [
    { x: -10.5, y: 6.2, z: 9.6, r: -0.5 }, { x: -11, y: 1.0, z: 9.8, r: 0.5 },
    { x: 10.5, y: 6.4, z: 9.6, r: Math.PI + 0.5 }, { x: 11, y: 0.8, z: 9.8, r: Math.PI - 0.5 },
    { x: -12, y: 3.6, z: 9.2, r: 0.1 }, { x: 12, y: 3.4, z: 9.2, r: Math.PI - 0.1 },
  ];
  for (const sp of spots) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(rand(3.2, 4.6), rand(1.5, 2.1)),
        new THREE.MeshBasicMaterial({
          map: bananaTexture, transparent: true, depthWrite: false,
          side: THREE.DoubleSide, color: 0x2e4a34,
        }),
      );
      m.geometry.translate(m.geometry.parameters.width / 2, 0, 0); // pivot at stem
      m.position.set(sp.x + rand(-0.5, 0.5), sp.y + rand(-0.8, 0.8), sp.z + rand(-0.3, 0.3));
      m.rotation.z = sp.r + rand(-0.35, 0.35);
      m.userData = { baseRz: m.rotation.z, phase: rand(0, TAU) };
      m.renderOrder = 60;
      framers.push(m);
      scene.add(m);
    }
  }
}

// ---------- fireflies ----------
const fireflyClouds = [];
{
  for (let c = 0; c < 3; c++) {
    const n = 26;
    const pts = new Float32Array(n * 3);
    const base = [];
    for (let i = 0; i < n; i++) {
      const b = { x: rand(-14, 14), y: rand(0.5, 6), z: rand(-8, 8), p1: rand(0, TAU), p2: rand(0, TAU), s1: rand(0.15, 0.5), s2: rand(0.1, 0.4) };
      base.push(b);
      pts.set([b.x, b.y, b.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.22, map: glowTexture, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xf0ffaa, sizeAttenuation: true,
    });
    const cloud = new THREE.Points(geo, mat);
    cloud.userData = { base, blink: rand(0.5, 1.3), phase: rand(0, TAU) };
    fireflyClouds.push(cloud);
    scene.add(cloud);
  }
}

// ---------- falling leaves ----------
const fallingLeaves = [];
{
  const tex = canvasTex(leafTexCanvas(false));
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(rand(0.16, 0.28), rand(0.08, 0.14)),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color().setHSL(rand(0.2, 0.32), 0.5, rand(0.3, 0.45)) }),
    );
    m.userData = {
      x: rand(-13, 13), z: rand(-6, 8), y: rand(2, 9),
      vy: rand(0.35, 0.7), sway: rand(0.4, 1), swaySpeed: rand(0.6, 1.4),
      phase: rand(0, TAU), rs: rand(-1.5, 1.5),
    };
    fallingLeaves.push(m);
    scene.add(m);
  }
}

// ---------- dust puffs ----------
const puffPool = [];
{
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    s.userData = { t: 1, life: 1 };
    puffPool.push(s);
    scene.add(s);
  }
}
function spawnPuff(x, z, size) {
  for (let i = 0; i < 3; i++) {
    const s = puffPool.find(p => !p.visible);
    if (!s) return;
    s.visible = true;
    s.position.set(x + rand(-size, size) * 0.3, 0.12, z + rand(-0.1, 0.1));
    s.scale.setScalar(size * rand(0.5, 0.8));
    s.userData = { t: 0, life: rand(0.5, 0.9), vy: rand(0.3, 0.7), grow: rand(1.5, 2.5) };
  }
}

// ---------- emoji / label sprites ----------
const emojiCache = new Map();
function emojiTexture(ch) {
  if (emojiCache.has(ch)) return emojiCache.get(ch);
  const c = document.createElement('canvas');
  c.width = c.height = 144;
  const g = c.getContext('2d');
  g.font = '110px "Segoe UI Emoji", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 72, 80);
  const t = canvasTex(c);
  emojiCache.set(ch, t);
  return t;
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

const floaters = []; // rising emotes {sprite, t, life}
function spawnEmote(ch, x, y, z) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(ch), transparent: true, depthWrite: false }));
  s.position.set(x + rand(-0.1, 0.1), y, z + 0.4);
  s.scale.setScalar(0.02);
  floaters.push({ s, t: 0, life: 1.7 });
  scene.add(s);
}

// ---------- drawing → sprites & body-part rig (2D canvas work) ----------
const GLOW_M = 24;

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

function analyzeParts(raw) {
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

// ---------- creatures ----------
const creatures = new Map();
const KIND_MAP = { walker: 'prowler', flyer: 'butterfly' };
const QUAD_PARAMS = {
  prowler: {
    speedMul: 1, bobAmp: 0.035, roll: 0.03, footDust: false,
    next: [['walk', 3], ['idle', 2], ['sniff', 2], ['look', 1.5], ['excited', 0.7], ['sleep', 0.5]],
  },
  stomper: {
    speedMul: 0.55, bobAmp: 0.02, roll: 0.055, footDust: true,
    next: [['walk', 3], ['idle', 2], ['trumpet', 1.2], ['look', 1.2], ['sleep', 0.4]],
  },
};

function partMaterial(cv) {
  return new THREE.MeshBasicMaterial({
    map: canvasTex(cv), transparent: true, alphaTest: 0.05,
    side: THREE.DoubleSide, depthWrite: true,
  });
}

class Creature {
  constructor(data) {
    this.id = data.id;
    this.kind = KIND_MAP[data.kind] || data.kind;
    if (!['prowler', 'stomper', 'hopper', 'slitherer', 'bird', 'butterfly', 'plant'].includes(this.kind)) {
      this.kind = 'prowler';
    }
    this.name = data.name;
    this.flying = this.kind === 'bird' || this.kind === 'butterfly';
    this.ready = false;
    this.dead = false;
    this.fade = STEADY ? 1 : 0;
    this.dying = 0;
    this.age = rand(0, 10);
    this.tempo = rand(0.8, 1.35);
    this.zest = Math.random();

    // world position
    this.z = rand(GROUND.zMin, GROUND.zMax);
    this.x = rand(-1, 1) * (xBound(this.z) - 1);
    this.y = rand(SKY.yMin, SKY.yMax);
    this.zTarget = this.z;
    this.zTimer = rand(2, 6);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.facing = this.dir;
    this.speed = rand(0.55, 1.0);
    this.vx = 0; this.vy = 0;

    // pose
    this.bob = 0; this.rot = 0; this.sqX = 1; this.sqY = 1;
    this.headLift = 0; this.fold = 0; this.bank = 0;
    this.legDrive = 0; this.legPose = 0;
    this.legRots = []; this.legLifts = []; this.legOffs = [];
    this.earRot = 0; this.tailRot = 0; this.prevBob = 0; this.wagAmpCur = 0.15;
    this.wagFreq = rand(1.2, 2.4);
    this.bobMul = rand(0.75, 1.3);
    this.stridePhase = rand(0, TAU);
    this.lastStrideSin = 0;
    this.wavePhase = rand(0, TAU);
    this.waveAmp = 0;
    this.emoteQueue = [];
    this.emoted = false;
    this.greetCd = rand(4, 12);
    this.labelT = 6;
    this.labelSprite = null;
    this.mats = [];
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    scene.add(this.group);

    this.initKind();

    const img = new Image();
    img.onload = () => {
      try {
        this.build(stripBackground(img));
        this.ready = true;
        if (!STEADY) this.spawnFx();
      } catch (e) {
        console.error(e);
        removeCreature(this.id);
      }
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

  progress() { return this.stateDur > 0 ? 1 - this.stateT / this.stateDur : 1; }

  emote(ch) { this.emoteQueue.push(ch); }

  pickFlyTarget() {
    this.tx = rand(-1, 1) * (xBound(this.z) - 1);
    this.ty = rand(SKY.yMin, SKY.yMax);
    this.targetT = rand(3, 8);
  }

  // ---------- build the 3D cutout ----------
  build(src) {
    this.src = src;
    const RW = src.width, RH = src.height;
    let targetH;
    if (this.kind === 'butterfly') targetH = 1.15;
    else if (this.kind === 'bird') targetH = 1.05;
    else if (this.kind === 'plant') targetH = rand(1.5, 2.1);
    else targetH = rand(1.7, 2.35);
    let u = targetH / RH;
    if (RW * u > 4.2) u = 4.2 / RW;
    this.u = u;
    this.wW = RW * u;
    this.wH = RH * u;
    const centerOrigin = this.flying;

    // local position of a part-canvas center (raw coords → world units)
    const localPos = (ox, oy, cw, ch) => {
      const cx = ox + cw / 2, cy = oy + ch / 2;
      return [
        (cx - RW / 2) * u,
        centerOrigin ? (RH / 2 - cy) * u : (RH - cy) * u,
      ];
    };
    const planeFor = (cv, ox, oy, zOff) => {
      const mat = partMaterial(cv);
      this.mats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width * u, cv.height * u), mat);
      const [lx, ly] = localPos(ox, oy, cv.width, cv.height);
      m.position.set(lx, ly, zOff);
      return m;
    };

    if (this.flying) {
      // two wing halves hinged at the drawing's center line — real 3D flap
      const glow = glowBake(src, GLOW_M);
      const hw = Math.ceil(glow.width / 2);
      this.wingPivots = [];
      for (const side of [-1, 1]) {
        const half = document.createElement('canvas');
        half.width = hw; half.height = glow.height;
        half.getContext('2d').drawImage(glow, side === -1 ? 0 : -hw, 0);
        const mat = partMaterial(half);
        this.mats.push(mat);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(hw * u, glow.height * u), mat);
        mesh.position.set(side * hw * u / 2, 0, side * 0.004);
        const pivot = new THREE.Group();
        pivot.add(mesh);
        pivot.userData.side = side;
        this.wingPivots.push(pivot);
        this.inner.add(pivot);
      }
    } else if (this.kind === 'slitherer') {
      // one plane whose vertices ripple with a traveling wave
      const glow = glowBake(src, GLOW_M);
      const mat = partMaterial(glow);
      this.mats.push(mat);
      const geo = new THREE.PlaneGeometry(glow.width * u, glow.height * u, 24, 1);
      const mesh = new THREE.Mesh(geo, mat);
      const [lx, ly] = localPos(-GLOW_M, -GLOW_M, glow.width, glow.height);
      mesh.position.set(lx, ly, 0);
      this.waveMesh = mesh;
      this.waveBase = Float32Array.from(geo.attributes.position.array);
      this.inner.add(mesh);
    } else {
      let rig = null;
      if (['prowler', 'stomper', 'hopper'].includes(this.kind)) {
        try { rig = buildRig(src); } catch { rig = null; }
      }
      if (rig) {
        this.rig = rig;
        this.rig.legLenW = rig.legLen * u;
        // torso
        this.inner.add(planeFor(rig.torso, -GLOW_M, -GLOW_M, 0.01));
        // legs
        this.legPivots = [];
        rig.legs.forEach((L, i) => {
          const pg = new THREE.Group();
          pg.position.set((L.px - RW / 2) * u, (RH - L.py) * u, -0.02 - i * 0.002);
          pg.userData.baseY = pg.position.y;
          const mat = partMaterial(L.cv);
          this.mats.push(mat);
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L.cv.width * u, L.cv.height * u), mat);
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
        // ears
        this.earPivots = [];
        for (const E of rig.ears) {
          const pg = new THREE.Group();
          pg.position.set((E.px - RW / 2) * u, (RH - E.py) * u, -0.02);
          const mat = partMaterial(E.cv);
          this.mats.push(mat);
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(E.cv.width * u, E.cv.height * u), mat);
          mesh.position.set(
            (E.ox + E.cv.width / 2 - E.px) * u,
            (E.py - (E.oy + E.cv.height / 2)) * u, 0);
          pg.add(mesh);
          this.earPivots.push(pg);
          this.inner.add(pg);
        }
        // tails: nested 4-segment chains
        this.tailChains = [];
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
            const mat = partMaterial(slice);
            this.mats.push(mat);
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(slice.width * u, slice.height * u), mat);
            // slice center relative to this joint (raw coords)
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
        this.inner.add(planeFor(glowBake(src, GLOW_M), -GLOW_M, -GLOW_M, 0));
      }
    }

    // blob shadow
    if (this.kind !== 'butterfly') {
      const sm = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
      this.shadowMat = sm;
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(this.wW * 0.9, this.wW * 0.4), sm);
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = centerOrigin ? -this.wH / 2 + 0.03 : 0.03;
      sh.renderOrder = 1;
      this.shadowMesh = sh;
      this.group.add(sh);
    }

    // name label
    if (this.name) {
      const { tex, aspect } = labelTexture(this.name);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const lh = 0.45;
      s.scale.set(lh * aspect, lh, 1);
      this.labelSprite = s;
      scene.add(s);
    }
  }

  spawnFx() {
    const n = 24;
    const posArr = new Float32Array(n * 3);
    const vels = [];
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), b = rand(-0.6, 1);
      vels.push(new THREE.Vector3(Math.cos(a) * rand(1, 3), b * rand(1, 3) + 1, Math.sin(a) * rand(0.5, 1.5)));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.16, map: glowTexture, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xfff7c8,
    });
    const pts = new THREE.Points(geo, mat);
    const cy = this.flying ? this.y : this.wH * 0.5;
    pts.position.set(this.x, cy, this.z);
    scene.add(pts);
    this.fx = { pts, vels, t: 0, life: 1.1 };
  }

  topY() { return this.flying ? this.y + this.wH * 0.55 : this.wH * 1.02; }

  // ---------- shared poses ----------
  applySpecialPose(dt) {
    const p = this.progress();
    switch (this.state) {
      case 'idle':
        this.sqY = 1 + Math.sin(this.age * 2.4 * this.tempo) * 0.022;
        this.sqX = 2 - this.sqY;
        break;
      case 'sniff':
        this.rot = -0.17 * pulse(p) * (1 + 0.25 * Math.sin(p * 14));
        this.bob = -Math.abs(Math.sin(p * 14)) * 0.015;
        break;
      case 'look':
        this.rot = 0.09 * pulse(p);
        this.sqY = 1 + 0.04 * pulse(p);
        if (!this.emoted && p > 0.25 && Math.random() < 0.4) { this.emote('❓'); this.emoted = true; }
        break;
      case 'sleep':
        this.sqY = 1 + Math.sin(this.age * 1.1) * 0.045;
        this.sqX = 2 - this.sqY;
        this.rot = -0.06;
        this.zzT = (this.zzT || 0) - dt;
        if (this.zzT <= 0) { this.emote('💤'); this.zzT = 1.8; }
        break;
      case 'excited': {
        const b = Math.abs(Math.sin(p * Math.PI * 2));
        this.bob = b * this.wH * 0.14;
        this.sqY = 1 + b * 0.1;
        this.sqX = 2 - this.sqY;
        if (!this.emoted) { this.emote(pick(['✨', '🎵', '⭐'])); this.emoted = true; }
        break;
      }
      case 'trumpet':
        this.rot = 0.14 * pulse(p);
        this.sqY = 1 + 0.08 * pulse(p);
        if (!this.emoted && p > 0.3) { this.emote('🎵'); this.emoted = true; }
        break;
      case 'greet': {
        const b = Math.abs(Math.sin((p + this.zest * 0.4) * Math.PI * 3));
        this.bob = b * this.wH * 0.05;
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

  wanderZ(dt) {
    this.zTimer -= dt;
    if (this.zTimer <= 0) {
      this.zTimer = rand(4, 10);
      this.zTarget = rand(GROUND.zMin, GROUND.zMax);
    }
    this.z += (this.zTarget - this.z) * Math.min(1, dt * 0.12);
  }

  updateQuad(dt, P) {
    this.stateT -= dt;
    if (this.stateT <= 0 && this.state !== 'greet') this.pickNextQuad(P);
    if (this.stateT <= 0 && this.state === 'greet') this.setState('walk', rand(3, 7));

    if (this.state === 'walk') {
      this.stridePhase += dt * this.strideFreq;
      const strideSin = Math.sin(this.stridePhase);
      const v = this.speed * P.speedMul * this.tempo * (0.3 + 0.7 * Math.abs(strideSin));
      this.x += this.dir * v * dt;
      const xB = xBound(this.z);
      if (this.x < -xB) { this.x = -xB; this.dir = 1; }
      if (this.x > xB) { this.x = xB; this.dir = -1; }
      this.wanderZ(dt);

      this.bob = Math.abs(strideSin) * this.wH * P.bobAmp * this.bobMul;
      if (this.rig && this.legPivots && this.legPivots.length) {
        const vAvg = this.speed * P.speedMul * this.tempo * 0.65;
        this.legDrive = clamp((vAvg / (Math.max(0.08, this.rig.legLenW) * this.strideFreq)) * 2.2, 0.15, 0.55);
      }
      this.rot = Math.sin(this.stridePhase * 0.5) * P.roll;
      this.sqY = 1 + Math.sin(this.stridePhase * 2) * 0.03;
      this.sqX = 2 - this.sqY;
      if (P.footDust && this.lastStrideSin > 0 && strideSin <= 0) {
        spawnPuff(this.x + this.dir * this.wW * 0.2, this.z, this.wW * 0.45);
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
      if (this.hopStage === 'rest' && this.hopStageT <= 0) {
        this.hopStage = 'crouch'; this.hopStageT = 0.16;
      } else if (this.hopStage === 'crouch') {
        this.sqY = lerp(1, 0.82, 1 - this.hopStageT / 0.16);
        this.sqX = 2 - this.sqY;
        this.legPose = -0.12;
        if (this.hopStageT <= 0) {
          this.hopStage = 'air';
          this.hopDur = rand(0.4, 0.55) / this.tempo;
          this.hopStageT = this.hopDur;
          this.hopDist = rand(0.5, 0.9) * this.wH * (0.8 + this.zest * 0.6);
          const xB = xBound(this.z);
          if (this.x < -xB + 0.5) this.dir = 1;
          if (this.x > xB - 0.5) this.dir = -1;
        }
      } else if (this.hopStage === 'air') {
        const u2 = 1 - this.hopStageT / this.hopDur;
        this.x += this.dir * this.hopDist * dt / this.hopDur;
        this.bob = 4 * this.wH * 0.32 * u2 * (1 - u2);
        this.rot = 0.22 * Math.cos(u2 * Math.PI) * -1;
        this.sqY = 1.1; this.sqX = 0.93;
        this.legPose = 0.45;
        if (this.hopStageT <= 0) {
          this.hopStage = 'land'; this.hopStageT = 0.13;
          spawnPuff(this.x, this.z, this.wW * 0.3);
        }
      } else if (this.hopStage === 'land') {
        this.sqY = lerp(0.8, 1, 1 - this.hopStageT / 0.13);
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
          this.wanderZ(0.4);
        }
      }
      if (this.state === 'hopSeq' && this.hopStage === 'rest') {
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
        this.setState(Math.random() < 0.5 ? 'headUp' : 'pause', rand(1.2, 2.5));
      } else {
        this.setState('slither', rand(4, 10));
        if (Math.random() < 0.4) this.dir *= -1;
      }
    }
    if (this.state === 'slither') {
      this.wavePhase += dt * 6.5 * this.tempo;
      this.waveAmp = this.src.height * 0.09;
      const v = this.speed * this.tempo * (0.85 + 0.15 * Math.sin(this.wavePhase));
      this.x += this.dir * v * dt;
      const xB = xBound(this.z);
      if (this.x < -xB) { this.x = -xB; this.dir = 1; }
      if (this.x > xB) { this.x = xB; this.dir = -1; }
      this.wanderZ(dt);
    } else if (this.state === 'headUp') {
      this.wavePhase += dt * 1.5;
      this.waveAmp = this.src.height * 0.03;
      this.headLift = pulse(this.progress()) * this.src.height * 0.18;
      if (!this.emoted && this.progress() > 0.3 && Math.random() < 0.35) { this.emote('❓'); this.emoted = true; }
    } else {
      this.wavePhase += dt * 1.2;
      this.waveAmp = this.src.height * 0.025;
      this.headLift = 0;
    }
    if (this.state !== 'headUp') this.headLift = 0;

    // ripple the plane's vertices
    if (this.waveMesh) {
      const pos = this.waveMesh.geometry.attributes.position;
      const w = this.wW + GLOW_M * 2 * this.u;
      for (let i = 0; i < pos.count; i++) {
        const bx = this.waveBase[i * 3];
        const ux = clamp(bx / w + 0.5, 0, 1);
        const dHead = 1 - ux;
        let dy = Math.sin(this.wavePhase - dHead * 5.5) * this.waveAmp * this.u * (0.25 + 0.75 * dHead);
        if (this.headLift > 0 && dHead < 0.28) dy += this.headLift * this.u * (1 - dHead / 0.28);
        pos.setY(i, this.waveBase[i * 3 + 1] + dy);
      }
      pos.needsUpdate = true;
    }
  }

  steer(dt, accel, maxV) {
    this.targetT -= dt;
    const dx = this.tx - this.x, dy = this.ty - this.y;
    if (this.targetT <= 0 || (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4)) this.pickFlyTarget();
    this.vx += dx * dt * accel;
    this.vy += dy * dt * accel;
    this.vx = clamp(this.vx, -maxV, maxV);
    this.vy = clamp(this.vy, -maxV, maxV);
    this.vx *= (1 - dt * 0.4);
    this.vy *= (1 - dt * 0.4);
    this.x = clamp(this.x + this.vx * dt * 3, -xBound(this.z), xBound(this.z));
    this.y = clamp(this.y + this.vy * dt * 3, SKY.yMin, SKY.yMax);
    if (Math.abs(this.vx) > 0.18) this.dir = this.vx > 0 ? 1 : -1;
  }

  updateBird(dt) {
    this.modeT -= dt;
    if (this.mode === 'fly') {
      this.flapBurst -= dt;
      if (this.flapBurst <= 0 && this.glideT <= 0) this.glideT = rand(0.4, 1.3);
      if (this.glideT > 0) {
        this.glideT -= dt;
        this.fold += (0.08 - this.fold) * Math.min(1, dt * 10);
        this.vy -= dt * 0.25;
        if (this.glideT <= 0) this.flapBurst = rand(0.5, 1);
      } else {
        this.stridePhase += dt * this.flapFreq;
        this.fold = (Math.sin(this.stridePhase * Math.PI) + 1) / 2 * 0.8;
        this.vy += dt * 0.3;
        this.bob = Math.sin(this.stridePhase * Math.PI) * this.wH * 0.05;
      }
      this.steer(dt, 0.6, 1.4);
      this.z += (Math.sin(this.age * 0.3) * 2 - (this.z - 0)) * dt * 0.05;
      this.bank = clamp(this.vx * 0.2, -0.3, 0.3);
      if (this.modeT <= 0) {
        this.mode = 'descend';
        this.zGround = rand(GROUND.zMin, GROUND.zMax);
        this.tx = clamp(this.x + rand(-2, 2), -xBound(this.zGround) + 1, xBound(this.zGround) - 1);
      }
    } else if (this.mode === 'descend') {
      const targetY = this.wH / 2;
      this.stridePhase += dt * this.flapFreq * 0.8;
      this.fold = (Math.sin(this.stridePhase * Math.PI) + 1) / 2 * 0.6;
      this.y += (targetY - this.y) * Math.min(1, dt * 1.6);
      this.x += (this.tx - this.x) * Math.min(1, dt * 1.5);
      this.z += (this.zGround - this.z) * Math.min(1, dt * 1.5);
      this.rot = 0.12;
      if (Math.abs(this.y - targetY) < 0.06) {
        this.y = targetY;
        this.mode = 'ground';
        this.modeT = rand(4, 9);
        this.setState('groundHop', rand(1, 2));
        spawnPuff(this.x, this.z, this.wW * 0.3);
      }
    } else if (this.mode === 'ground') {
      this.y = this.wH / 2;
      this.fold = 0.85 + Math.sin(this.age * 3) * 0.03;
      this.stateT -= dt;
      if (this.stateT <= 0) {
        const r = Math.random();
        if (r < 0.45) { this.setState('groundHop', rand(0.8, 1.6)); if (Math.random() < 0.5) this.dir *= -1; }
        else if (r < 0.8) this.setState('peck', rand(0.9, 1.4));
        else this.setState('look', rand(1, 1.8));
      }
      if (this.state === 'groundHop') {
        const hp = (this.age * 5 * this.tempo) % 1;
        this.bob = 4 * this.wH * 0.12 * hp * (1 - hp);
        this.x += this.dir * this.speed * 0.5 * dt;
        const xB = xBound(this.z);
        if (this.x < -xB) { this.x = -xB; this.dir = 1; }
        if (this.x > xB) { this.x = xB; this.dir = -1; }
      } else if (this.state === 'peck') {
        this.rot = -Math.max(0, Math.sin(this.progress() * Math.PI * 4)) * 0.35;
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
      this.fold = (Math.sin(this.stridePhase * Math.PI) + 1) / 2 * 0.9;
      this.y += dt * 2.2;
      this.rot = 0.15;
      this.modeT -= dt;
      if (this.y > SKY.yMin || this.modeT <= 0) {
        this.mode = 'fly';
        this.modeT = rand(7, 18);
        this.vx = this.dir * 0.4; this.vy = 0.3;
        this.pickFlyTarget();
      }
    }
  }

  updateButterfly(dt) {
    this.modeT -= dt;
    if (this.mode === 'fly') {
      this.stridePhase += dt * this.flapFreq;
      this.fold = (Math.sin(this.stridePhase * Math.PI) + 1) / 2;
      this.steer(dt, 0.4, 0.9);
      this.z += Math.sin(this.age * 0.5) * dt * 0.4;
      this.z = clamp(this.z, SKY.zMin, SKY.zMax);
      this.bob = Math.sin(this.stridePhase * Math.PI) * this.wH * 0.06
        + Math.sin(this.age * 0.7) * this.wH * 0.1
        + Math.sin(this.age * 5.3) * this.wH * 0.025;
      this.bank = clamp(this.vx * 0.3, -0.28, 0.28);
      if (this.modeT <= 0 && Math.random() < 0.6) {
        this.mode = 'descend';
        this.zGround = rand(GROUND.zMin, GROUND.zMax);
        this.tx = clamp(this.x + rand(-1.5, 1.5), -xBound(this.zGround) + 1, xBound(this.zGround) - 1);
      } else if (this.modeT <= 0) {
        this.modeT = rand(6, 14);
      }
    } else if (this.mode === 'descend') {
      const targetY = this.wH * 0.42;
      this.stridePhase += dt * this.flapFreq * 0.7;
      this.fold = (Math.sin(this.stridePhase * Math.PI) + 1) / 2 * 0.8;
      this.y += (targetY - this.y) * Math.min(1, dt * 1.2);
      this.x += (this.tx - this.x) * Math.min(1, dt * 1.2);
      this.z += (this.zGround - this.z) * Math.min(1, dt * 1.2);
      if (Math.abs(this.y - targetY) < 0.05) {
        this.y = targetY;
        this.mode = 'rest';
        this.modeT = rand(2.5, 6);
      }
    } else {
      this.fold = 0.45 + Math.sin(this.age * 2.1) * 0.35;
      if (this.modeT <= 0) {
        this.mode = 'fly';
        this.modeT = rand(8, 18);
        this.vy = 0.4;
        this.pickFlyTarget();
      }
    }
  }

  updatePlant(dt) {
    this.rot = Math.sin(this.age * 0.9) * 0.05 + Math.sin(this.age * 2.3 + 1) * 0.015;
    this.shiverT -= dt;
    if (this.shiverT <= -0.5) {
      this.shiverT = rand(8, 22);
      if (Math.random() < 0.3) this.emote('✨');
    } else if (this.shiverT <= 0) {
      this.rot += Math.sin(this.age * 40) * 0.03;
    }
    this.sqY = 1 + Math.sin(this.age * 1.3) * 0.015;
  }

  updateRigMotion(dt) {
    if (!this.rig || dt <= 0) return;
    if (this.legPivots) {
      for (let i = 0; i < this.legPivots.length; i++) {
        let target = this.legPose, lift = 0;
        if (this.legDrive) {
          const p = this.stridePhase + this.legOffs[i];
          target = this.legDrive * skewSin(p);
          lift = Math.max(0, Math.cos(p)) * this.legDrive * this.rig.legLenW * 0.22;
        }
        this.legRots[i] += (target - this.legRots[i]) * Math.min(1, dt * 14);
        this.legLifts[i] += (lift - this.legLifts[i]) * Math.min(1, dt * 14);
        const pg = this.legPivots[i];
        pg.rotation.z = this.legRots[i];
        pg.position.y = pg.userData.baseY + this.legLifts[i];
      }
    }
    if (this.earPivots && this.earPivots.length) {
      const bobVel = (this.bob - this.prevBob) / dt;
      const target = clamp((bobVel / Math.max(0.2, this.wH)) * 0.9, -0.45, 0.45)
        + Math.sin(this.age * 1.4) * 0.035;
      this.earRot += (target - this.earRot) * Math.min(1, dt * 10);
      this.earPivots.forEach((pg, i) => { pg.rotation.z = this.earRot * (i % 2 ? 0.8 : 1.15); });
    }
    this.prevBob = this.bob;
    if (this.tailChains && this.tailChains.length) {
      let amp = 0.15, f = this.wagFreq;
      if (this.state === 'excited' || this.state === 'greet') { amp = 0.5; f *= 2.4; }
      else if (this.state === 'sleep') amp = 0.04;
      else if (this.state === 'idle') amp = 0.24;
      this.wagAmpCur += (amp - this.wagAmpCur) * Math.min(1, dt * 3);
      this.tailRot = Math.sin(this.age * f * 2) * this.wagAmpCur;
      for (const chain of this.tailChains) {
        const n = chain.length || 1;
        chain.forEach((g2, j) => {
          const w = Math.pow((j + 1) / n, 1.3) - Math.pow(j / n, 1.3);
          g2.rotation.z = this.tailRot * w * n;
        });
      }
    }
  }

  // ---------- per-frame ----------
  update(dt) {
    this.age += dt;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 1.6);
    if (this.dead) this.dying = Math.min(1, this.dying + dt);

    if (!this.ready) return;

    if (!this.dead) {
      this.bob = 0; this.rot = 0; this.sqX = 1; this.sqY = 1;
      this.bank = 0; this.legDrive = 0; this.legPose = 0;
      if (this.labelT > 0) this.labelT -= dt;
      if (this.greetCd > 0) this.greetCd -= dt;

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

      // wing flap
      if (this.wingPivots) {
        const ang = this.fold * 1.1;
        for (const pv of this.wingPivots) pv.rotation.y = -pv.userData.side * ang;
      }

      // eased turn-around
      this.facing += (this.dir - this.facing) * Math.min(1, dt * (this.flying ? 9 : 5));
      const af = Math.abs(this.facing);
      if (af < 1 && !this.flying) this.sqY *= 1 - (1 - af) * 0.12;

      // emotes
      while (this.emoteQueue.length) {
        spawnEmote(this.emoteQueue.pop(), this.x, this.topY() + 0.2, this.z);
      }
    }

    // apply transforms
    const pop = this.fade < 1 ? easeOutBack(this.fade) : 1;
    const die = 1 - this.dying * 0.6;
    const alpha = this.fade * (1 - this.dying);
    const fxMin = this.flying ? 0.45 : 0.22;
    let fx = this.facing;
    if (Math.abs(fx) < fxMin) fx = (fx >= 0 ? 1 : -1) * fxMin;

    this.group.position.set(this.x, this.flying ? this.y : 0, this.z);
    this.group.scale.set(fx * pop * die, Math.max(0.001, pop * die), pop * die);
    this.inner.position.y = this.flying ? this.bob : this.bob;
    this.inner.rotation.z = this.rot + this.bank;
    this.inner.scale.set(this.sqX, this.sqY, 1);

    for (const m of this.mats) m.opacity = alpha;
    if (this.shadowMat) {
      const h = this.flying ? this.y - this.wH / 2 : this.bob;
      this.shadowMat.opacity = alpha * clamp(0.85 - h * 0.25, 0.1, 0.85);
      if (this.shadowMesh && this.flying) this.shadowMesh.position.y = -this.y + 0.03;
      if (this.shadowMesh && this.kind === 'bird') this.shadowMesh.visible = this.mode !== 'fly';
    }
    if (this.labelSprite) {
      const la = clamp(this.labelT, 0, 1) * alpha;
      this.labelSprite.material.opacity = la;
      this.labelSprite.visible = la > 0.01;
      this.labelSprite.position.set(this.x, this.topY() + 0.45, this.z + 0.3);
    }

    // spawn sparkles
    if (this.fx) {
      const F = this.fx;
      F.t += dt;
      const pos = F.pts.geometry.attributes.position;
      for (let i = 0; i < F.vels.length; i++) {
        pos.setXYZ(i,
          pos.getX(i) + F.vels[i].x * dt,
          pos.getY(i) + F.vels[i].y * dt,
          pos.getZ(i) + F.vels[i].z * dt);
        F.vels[i].y -= dt * 2;
      }
      pos.needsUpdate = true;
      F.pts.material.opacity = 1 - F.t / F.life;
      if (F.t >= F.life) {
        scene.remove(F.pts);
        F.pts.geometry.dispose();
        this.fx = null;
      }
    }
  }

  dispose() {
    scene.remove(this.group);
    if (this.labelSprite) scene.remove(this.labelSprite);
    if (this.fx) scene.remove(this.fx.pts);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
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
      if (Math.abs(a.z - b.z) > 1.3) continue;
      if (Math.abs(a.x - b.x) > 1.7) continue;
      a.setState('greet', 2.4); b.setState('greet', 2.4);
      a.dir = b.x > a.x ? 1 : -1;
      b.dir = -a.dir;
      a.greetCd = rand(20, 35); b.greetCd = rand(20, 35);
      return;
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
      for (const c of creatures.values()) c.dispose();
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
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  // camera drift
  camera.position.x = Math.sin(t * 0.05) * 0.5;
  camera.position.y = 3.0 + Math.sin(t * 0.083) * 0.15;
  camera.lookAt(0, 2.1, 0);

  // wind: gusts rise and fall; foliage shader + gentle trunk sway follow it
  WIND.time.value = t;
  const gust = 0.7 + Math.sin(t * 0.23) * 0.25 + Math.sin(t * 0.9) * 0.12 + Math.sin(t * 2.7) * 0.05;
  WIND.gust.value = gust;
  for (const s of swayTrees) {
    s.obj.rotation.z = Math.sin(t * s.speed + s.phase) * s.amp * (0.6 + gust * 0.5);
  }

  // rays pulse
  for (const r of rays) {
    r.material.opacity = 0.03 + (Math.sin(t * 0.4 + r.userData.phase) + 1) / 2 * 0.035;
  }

  // framing leaves sway
  for (const f of framers) {
    f.rotation.z = f.userData.baseRz + Math.sin(t * 0.7 + f.userData.phase) * 0.045;
  }

  // fireflies
  for (const cloud of fireflyClouds) {
    const { base, blink, phase } = cloud.userData;
    const pos = cloud.geometry.attributes.position;
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      pos.setXYZ(i,
        b.x + Math.sin(t * b.s1 + b.p1) * 1.2,
        b.y + Math.cos(t * b.s2 + b.p2) * 0.7,
        b.z + Math.sin(t * b.s2 + b.p1) * 0.8);
    }
    pos.needsUpdate = true;
    cloud.material.opacity = 0.35 + (Math.sin(t * blink + phase) + 1) / 2 * 0.6;
  }

  // falling leaves
  for (const lf of fallingLeaves) {
    const d = lf.userData;
    d.y -= d.vy * dt;
    d.phase += d.swaySpeed * dt;
    lf.position.set(d.x + Math.sin(d.phase) * d.sway, d.y, d.z);
    lf.rotation.x += d.rs * dt * 0.7;
    lf.rotation.z += d.rs * dt;
    if (d.y < 0.05) {
      d.y = rand(6, 10);
      d.x = rand(-13, 13);
      d.z = rand(-6, 8);
    }
  }

  // dust puffs
  for (const p of puffPool) {
    if (!p.visible) continue;
    p.userData.t += dt;
    const u2 = p.userData.t / p.userData.life;
    if (u2 >= 1) { p.visible = false; continue; }
    p.position.y += p.userData.vy * dt;
    p.scale.multiplyScalar(1 + p.userData.grow * dt * 0.4);
    p.material.opacity = 0.5 * (1 - u2);
  }

  // rising emotes
  for (let i = floaters.length - 1; i >= 0; i--) {
    const F = floaters[i];
    F.t += dt;
    const p = F.t / F.life;
    if (p >= 1) {
      scene.remove(F.s);
      floaters.splice(i, 1);
      continue;
    }
    F.s.position.y += dt * 0.8;
    const sc = 0.75 * Math.min(1, p * 6);
    F.s.scale.setScalar(sc);
    F.s.material.opacity = 1 - p;
  }

  // creatures
  for (const c of creatures.values()) {
    c.update(dt);
    if (c.dead && c.dying >= 1) {
      c.dispose();
      creatures.delete(c.id);
    }
  }
  socialPass(dt);

  inviteEl.classList.toggle('show', creatures.size === 0);

  renderer.render(scene, camera);
}

// ---------- keys / info ----------
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

connect();
frame();
