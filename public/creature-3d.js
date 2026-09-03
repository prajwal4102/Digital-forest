// THE CHILD'S DRAWING, WRAPPED ONTO A REAL 3D ANIMAL
// --------------------------------------------------
// A flat cut-out reads as a sticker in a 3D forest. A generic 3D model reads
// as somebody else's animal. This does both at once: we sculpt a smooth
// little body per species, then project the child's own drawing onto its
// flanks, so the shape has real volume and every colour, stripe and wobbly
// line on it is theirs.
//
// The projection is planar from the side, which is exactly how children draw
// animals — side-on, head at one end. Body length maps to the drawing's
// width, body height to its height, so a long drawing makes a long animal.

import * as THREE from './vendor/three.module.js';
import { analyzeParts } from './drawing-creature.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const skewSin = (p) => Math.sin(p + 0.45 * Math.sin(p));

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ============================================================
// PREPARING THE DRAWING
// ============================================================

// The 3D body's silhouette will never match the drawing's exactly, so bare
// patches are inevitable at the edges. Bleeding a heavily blurred copy of the
// drawing out behind itself fills those with the child's own palette instead
// of a hard cut or a flat grey.
export function prepareDrawing(img) {
  const W = 512;
  const H = Math.max(8, Math.round(W * img.height / img.width));
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });

  g.filter = 'blur(16px)';
  for (let i = 0; i < 6; i++) {
    g.drawImage(img, -W * 0.05, -H * 0.05, W * 1.10, H * 1.10);
  }
  g.filter = 'none';
  g.drawImage(img, 0, 0, W, H);

  // average of what the child actually drew, for the surfaces the side
  // projection cannot reach (the nose cap, the rump)
  const avg = new THREE.Color(0.72, 0.68, 0.6);
  let headRight = true;
  try {
    const small = makeCanvas(96, Math.max(4, Math.round(96 * img.height / img.width)));
    const sg = small.getContext('2d', { willReadFrequently: true });
    sg.drawImage(img, 0, 0, small.width, small.height);
    const d = sg.getImageData(0, 0, small.width, small.height).data;
    let r = 0, gg = 0, b = 0, n = 0;
    let sumX = 0, mass = 0, topX = 0, topMass = 0;
    const topBand = small.height * 0.34;
    for (let y = 0; y < small.height; y++) {
      for (let x = 0; x < small.width; x++) {
        const o = (y * small.width + x) * 4;
        if (d[o + 3] < 60) continue;
        // skip near-black outline pixels: they would drag every average grey
        const lum = (d[o] + d[o + 1] + d[o + 2]) / 3;
        if (lum > 40) { r += d[o]; gg += d[o + 1]; b += d[o + 2]; n++; }
        sumX += x; mass++;
        if (y < topBand) { topX += x; topMass++; }
      }
    }
    if (n > 20) avg.setRGB(r / n / 255, gg / n / 255, b / n / 255);
    // Which end is the head? Whatever sticks up — ears, a raised muzzle —
    // pulls the upper band's centre of mass toward the head.
    if (mass > 0 && topMass > 8) headRight = (topX / topMass) >= (sumX / mass);
  } catch { /* tainted or unreadable: the defaults are fine */ }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  // Where the drawn legs end. Our sculpted legs are usually longer in
  // proportion than a child draws them, so a straight stretch would slide the
  // body markings down onto the legs.
  let legSplit = -1;
  try {
    const P = analyzeParts(img);
    if (P && P.legs.length) {
      const top = Math.min(...P.legs.map((l) => l.top));
      const bottom = Math.max(...P.legs.map((l) => l.y1));
      const span = P.span || (bottom - top);
      if (span > 0) legSplit = clamp((bottom - top) / span, 0.08, 0.6);
    }
  } catch { /* unreadable: fall back to a straight stretch */ }

  return { tex, avg, headRight, legSplit, aspect: img.width / Math.max(1, img.height) };
}

// ============================================================
// THE SKIN
// One material for the whole animal. Each vertex carries where it sits in
// body space, so the drawing stays painted on while the legs swing.
// ============================================================

export function skinMaterial(prep, box, split, hip) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
  return skinify(mat, prep, box, split, hip, false);
}

// Inject the child's-drawing projection into any material. With keepDetail
// the original albedo keeps working as a luminance layer — baked fur and
// feather shading show through the child's colours instead of being
// flattened into balloons.
export function skinify(mat, prep, box, split, hip, keepDetail = false, detailTex = null) {
  const u = {
    uDraw: { value: prep.tex },
    uMin: { value: box.min.clone() },
    uMax: { value: box.max.clone() },
    uAvg: { value: prep.avg.clone() },
    uFlip: { value: prep.headRight ? 1 : 0 },
    // the two heights at which the drawing and the sculpt agree
    uSplit: { value: split },
    uHip: { value: hip },
    // the animal's own anatomy lines, worn as soft shading (models only)
    uDetail: { value: detailTex || blankDetailTexture() },
    uDetailOn: { value: 0 },
  };
  mat.userData.uniforms = u;
  const prevHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, renderer) => {
    if (prevHook) prevHook(sh, renderer);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aProj;
        attribute vec3 aProjN;
        varying vec3 vProj;
        varying vec3 vProjN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vProj = aProj;
        vProjN = aProjN;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDraw;
        uniform sampler2D uDetail;
        uniform float uDetailOn;
        uniform vec3 uMin;
        uniform vec3 uMax;
        uniform vec3 uAvg;
        uniform float uFlip;
        uniform float uSplit;
        uniform float uHip;
        varying vec3 vProj;
        varying vec3 vProjN;
        vec3 gDrawCol = vec3(1.0);
        float djHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
        float djNoise(vec2 q) {
          vec2 i = floor(q); vec2 f = fract(q);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(djHash(i), djHash(i + vec2(1, 0)), f.x),
                     mix(djHash(i + vec2(0, 1)), djHash(i + vec2(1, 1)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float tz = (vProj.z - uMin.z) / max(0.0001, uMax.z - uMin.z);
          float ty = (vProj.y - uMin.y) / max(0.0001, uMax.y - uMin.y);
          // Two-piece stretch: the drawn legs map onto the sculpted legs and
          // the drawn body onto the sculpted body, so markings land where the
          // child put them however different the proportions are.
          float tv = ty < uHip
            ? (ty / max(0.0001, uHip)) * uSplit
            : uSplit + (ty - uHip) / max(0.0001, 1.0 - uHip) * (1.0 - uSplit);
          vec2 duv = clamp(vec2(mix(1.0 - tz, tz, uFlip), tv), 0.0, 1.0);
          vec4 t = texture2D(uDraw, duv);
          vec3 col = mix(uAvg, t.rgb, t.a);
          // A side projection smears across surfaces that face fore and aft,
          // so let those settle into the drawing's own average instead.
          float smear = abs(normalize(vProjN).z);
          col = mix(col, uAvg, smoothstep(0.74, 0.99, smear));
          // Children pick bright colours on purpose. Full shading drains them,
          // so keep a little of the drawing glowing through the shadow side —
          // the form still reads, the colour stays theirs.
          ${keepDetail ? `
          // undersides settle darker, so the body reads as a volume
          col *= 0.86 + 0.26 * clamp(vProjN.y * 0.5 + 0.5, 0.0, 1.0);
          // the animal's own anatomy lines, worn as soft shading: ear folds,
          // toes, tail bands, the line of the jaw
          float dLine = texture2D(uDetail, duv).a * uDetailOn;
          col *= 1.0 - dLine * 0.42;
          // fur grain, two scales, so the surface stops reading as clay
          vec2 gAspect = vec2((uMax.z - uMin.z) / max(0.001, uMax.y - uMin.y), 1.0);
          float g1 = djNoise(duv * gAspect * 90.0);
          float g2 = djNoise(duv * gAspect * 260.0 + 17.0);
          col *= 0.90 + 0.10 * g1 + 0.06 * g2;
          // the original texture keeps working as light-and-shade under the
          // child's colour: fur stays fur, feathers stay feathers
          float dLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          gDrawCol = col * (0.5 + dLum * 0.6);
          diffuseColor.rgb = col * (0.42 + dLum * 0.85);
          ` : `
          gDrawCol = col;
          diffuseColor.rgb *= col;
          `}
        }
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gDrawCol * ${keepDetail ? '0.17' : '0.3'};`);
  };
  return mat;
}

let _blankDetail = null;
function blankDetailTexture() {
  if (!_blankDetail) {
    _blankDetail = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    _blankDetail.needsUpdate = true;
  }
  return _blankDetail;
}

// Freeze where every vertex sits in body space. Baked once at rest, so a leg
// carries its own stripes around with it when it swings.
// The drawing must land on the animal's body, not be stretched across
// whatever a tail or a trunk happens to reach. So the box that defines the
// projection comes from the core lumps only; limbs sample past its edges and
// pick up the colour there.
export function bakeProjection(root, core) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  // Two different fits, because the drawing and the sculpt agree on one axis
  // and not the other. Vertically a child draws the whole animal, feet to
  // ears, so that maps to the whole body. Lengthwise a tail or a trunk juts
  // further than its share of the drawing, so that maps to the core only.
  const full = new THREE.Box3();
  const box = new THREE.Box3();
  const useCore = core && core.length > 0;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    nm.getNormalMatrix(m);
    const pos = o.geometry.attributes.position;
    const nrm = o.geometry.attributes.normal;
    const P = new Float32Array(pos.count * 3);
    const N = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      v.toArray(P, i * 3);
      full.expandByPoint(v);
      if (!useCore || core.includes(o)) box.expandByPoint(v);
      v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      v.toArray(N, i * 3);
    }
    o.geometry.setAttribute('aProj', new THREE.BufferAttribute(P, 3));
    o.geometry.setAttribute('aProjN', new THREE.BufferAttribute(N, 3));
  });
  box.min.y = full.min.y;
  box.max.y = full.max.y;
  return box;
}

// ============================================================
// SHAPES
// ============================================================

const lump = (rx, ry, rz, seg = 16) => {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, seg - 4));
  g.scale(rx, ry, rz);
  return g;
};
// a limb hanging from a pivot at its top
const limb = (r, len) => {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 10);
  g.translate(0, -len / 2, 0);
  return g;
};

// Proportions as fractions of the species height. Smooth overlapping lumps,
// never boxes.
const FORMS = {
  hopper: {
    aspect: 1.05,
    torso: { r: [0.24, 0.25, 0.32], at: [0, 0.44, -0.05] },
    neck: { r: [0.15, 0.15, 0.13], at: [0, 0.57, 0.16] },
    head: { r: [0.18, 0.18, 0.17], at: [0, 0.68, 0.26] },
    snout: { r: [0.10, 0.09, 0.11], at: [0, 0.63, 0.40] },
    ears: { r: [0.05, 0.20, 0.04], at: [0.08, 0.86, 0.22], lean: 0.18, tilt: -0.12 },
    legs: { r: 0.058, x: 0.15, zf: 0.18, zb: -0.21, hip: 0.28 },
    tail: { r: [0.08, 0.08, 0.075], at: [0, 0.45, -0.36] },
  },
  prowler: {
    aspect: 1.45,
    torso: { r: [0.20, 0.21, 0.42], at: [0, 0.60, -0.04] },
    neck: { r: [0.14, 0.145, 0.14], at: [0, 0.71, 0.30] },
    head: { r: [0.17, 0.165, 0.165], at: [0, 0.80, 0.44] },
    snout: { r: [0.10, 0.09, 0.11], at: [0, 0.755, 0.58] },
    ears: { r: [0.05, 0.08, 0.032], at: [0.095, 0.93, 0.42], lean: 0.32, tilt: 0 },
    legs: { r: 0.052, x: 0.15, zf: 0.28, zb: -0.30, hip: 0.44 },
    tailChain: { n: 4, r: 0.042, len: 0.14, at: [0, 0.64, -0.44],
                 dir: Math.PI * 0.62, curve: -0.2 },
  },
  stomper: {
    aspect: 1.35,
    torso: { r: [0.27, 0.28, 0.40], at: [0, 0.62, -0.05] },
    head: { r: [0.21, 0.21, 0.18], at: [0, 0.74, 0.36] },
    ears: { r: [0.032, 0.17, 0.15], at: [0.215, 0.78, 0.32], lean: 0.1, tilt: 0, flat: true },
    legs: { r: 0.092, x: 0.175, zf: 0.23, zb: -0.25, hip: 0.44 },
    trunk: { n: 4, r: 0.055, len: 0.115, at: [0, 0.68, 0.52], dir: -0.18, curve: -0.2 },
    tail: { r: [0.042, 0.042, 0.042], at: [0, 0.62, -0.43] },
  },
  bird: {
    aspect: 1.15,
    torso: { r: [0.24, 0.27, 0.31], at: [0, 0.52, 0] },
    head: { r: [0.17, 0.17, 0.16], at: [0, 0.80, 0.15] },
    snout: { r: [0.055, 0.05, 0.12], at: [0, 0.78, 0.34] },
    wings: { r: [0.045, 0.19, 0.26], at: [0.22, 0.56, -0.02] },
    legs: { r: 0.03, x: 0.09, zf: 0.05, zb: -0.05, hip: 0.26 },
    tail: { r: [0.10, 0.045, 0.17], at: [0, 0.56, -0.32] },
  },
  slitherer: {
    aspect: 3.0,
    serpent: { n: 7, r: [0.30, 0.26, 0.24], span: 1.9, taper: 0.55 },
  },
  butterfly: {
    aspect: 1.1,
    cards: 'wings',
    torso: { r: [0.07, 0.09, 0.34], at: [0, 0, 0] },
  },
  plant: {
    aspect: 0.85,
    cards: 'crossed',
    stem: { r: 0.035 },
  },
};

// ============================================================
// THE BODY
// ============================================================

export class SculptedBody {
  constructor(species, image, name) {
    this.s = species;
    const form = FORMS[species.label] || FORMS.prowler;
    this.form = form;
    const prep = prepareDrawing(image);
    this.prep = prep;

    const h = species.height;
    // A long drawing makes a long animal, a tall one a stocky animal — the
    // child's proportions survive into the sculpt.
    this.stretch = clamp(prep.aspect / form.aspect, 0.7, 1.7);

    this.object3D = new THREE.Group();
    this.root = new THREE.Group();
    this.object3D.add(this.root);

    this.legPivots = []; this.legRots = []; this.legLifts = []; this.legOffs = [];
    this.earPivots = []; this.chain = []; this.segments = []; this.wings = [];
    this.meshes = [];
    this.core = [];   // torso, neck, head: what the drawing is fitted to

    if (form.cards === 'wings') this.buildFlyer(h, prep);
    else if (form.cards === 'crossed') this.buildPlant(h, prep);
    else if (form.serpent) this.buildSerpent(h, form, prep);
    else this.buildQuadruped(h, form);

    // one skin for the whole animal
    const box = bakeProjection(this.root, this.core);
    // where the sculpted legs stop, as a fraction of the body's height
    const hipY = form.legs ? form.legs.hip * h : 0;
    const span = Math.max(0.0001, box.max.y - box.min.y);
    let hip = clamp((hipY - box.min.y) / span, 0.05, 0.85);
    let split = prep.legSplit;
    if (!form.legs || split < 0) { split = hip; } // nothing to line up: straight stretch
    if (!this.skinMat) {
      this.skinMat = skinMaterial(prep, box, split, hip);
      for (const m of this.meshes) m.material = this.skinMat;
    }
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    this.wH = h;
    this.addLabel(name, h);

    this.age = 0; this.stride = 0; this.bob = 0; this.prevBob = 0;
    this.earRot = 0; this.wagAmp = 0.2;
    this.fade = 0;
    this.allMats = [];
    this.root.traverse((o) => { if (o.isMesh && !this.allMats.includes(o.material)) this.allMats.push(o.material); });
    for (const m of this.allMats) { m.transparent = true; m.opacity = 0; }
  }

  add(geo, x, y, z, isCore) {
    const m = new THREE.Mesh(geo, null);
    m.position.set(x, y, z);
    this.root.add(m);
    this.meshes.push(m);
    if (isCore) this.core.push(m);
    return m;
  }

  // ---------- four legs and a head ----------
  buildQuadruped(h, F) {
    const S = this.stretch;
    const T = F.torso;
    this.add(lump(T.r[0] * h, T.r[1] * h, T.r[2] * h * S), T.at[0] * h, T.at[1] * h, T.at[2] * h * S, true);
    if (F.neck) {
      const K = F.neck;
      this.add(lump(K.r[0] * h, K.r[1] * h, K.r[2] * h, 12), K.at[0] * h, K.at[1] * h, K.at[2] * h * S, true);
    }
    if (F.head) {
      const H = F.head;
      this.head = this.add(lump(H.r[0] * h, H.r[1] * h, H.r[2] * h), H.at[0] * h, H.at[1] * h, H.at[2] * h * S, true);
    }
    if (F.snout) {
      const N = F.snout;
      const m = this.add(lump(N.r[0] * h, N.r[1] * h, N.r[2] * h, 12), 0, 0, 0);
      m.position.set(N.at[0] * h, N.at[1] * h - (F.head.at[1] * h), (N.at[2] - F.head.at[2]) * h * S);
      this.root.remove(m);
      this.head.add(m);
    }
    if (F.wings) {
      const W = F.wings;
      for (const side of [-1, 1]) {
        const m = this.add(lump(W.r[0] * h, W.r[1] * h, W.r[2] * h * S, 12),
          side * W.at[0] * h, W.at[1] * h, W.at[2] * h * S);
        m.rotation.z = side * 0.12;
        this.wings.push(m);
      }
    }
    if (F.ears) {
      const E = F.ears;
      for (const side of [-1, 1]) {
        const pg = new THREE.Group();
        pg.position.set(side * E.at[0] * h, E.at[1] * h, E.at[2] * h * S);
        pg.rotation.z = side * E.lean;
        pg.rotation.x = E.tilt || 0;
        const m = new THREE.Mesh(lump(E.r[0] * h, E.r[1] * h, E.r[2] * h, 12), null);
        m.position.y = -E.r[1] * h * 0.15;
        if (E.flat) m.rotation.y = side * 0.35;
        pg.add(m);
        this.meshes.push(m);
        this.root.add(pg);
        this.earPivots.push(pg);
      }
    }
    if (F.legs) {
      const L = F.legs;
      const zs = [[L.zf, 1], [L.zb, -1]];
      let i = 0;
      for (const [z, fb] of zs) {
        for (const side of [-1, 1]) {
          const pg = new THREE.Group();
          pg.position.set(side * L.x * h, L.hip * h, z * h * S);
          pg.userData.baseY = pg.position.y;
          const m = new THREE.Mesh(limb(L.r * h, L.hip * h - L.r * h), null);
          pg.add(m);
          this.meshes.push(m);
          this.root.add(pg);
          this.legPivots.push(pg);
          this.legRots.push(0); this.legLifts.push(0);
          // diagonal pairs move together, the way four-legged animals walk
          this.legOffs.push((fb * side > 0 ? 0 : Math.PI) + rand(-0.15, 0.15));
          i++;
        }
      }
    }
    if (F.tail) {
      const T2 = F.tail;
      const pg = new THREE.Group();
      pg.position.set(T2.at[0] * h, T2.at[1] * h, T2.at[2] * h * S);
      const m = new THREE.Mesh(lump(T2.r[0] * h, T2.r[1] * h, T2.r[2] * h, 12), null);
      pg.add(m);
      this.meshes.push(m);
      this.root.add(pg);
      this.chain.push([pg]);
    }
    if (F.tailChain) this.buildChain(F.tailChain, h);
    if (F.trunk) this.buildChain(F.trunk, h);
  }

  // a tail or a trunk: nested joints so it whips instead of swinging as a stick
  // Each joint hangs from the end of the one before it, so the chain stays
  // joined however it is aimed. dir aims the first segment, curve bends each
  // one after: a tail lifts and straightens, a trunk hangs and curls forward.
  buildChain(C, h) {
    const S = this.stretch;
    const len = C.len * h;
    const root = new THREE.Group();
    root.position.set(C.at[0] * h, C.at[1] * h, C.at[2] * h * S);
    let parent = root;
    const groups = [];
    for (let j = 0; j < C.n; j++) {
      const g = new THREE.Group();
      if (j > 0) g.position.y = -len;
      g.rotation.x = j === 0 ? C.dir : C.curve;
      const r = C.r * h * (1 - j * 0.16);
      const m = new THREE.Mesh(limb(r, len), null);
      g.add(m);
      this.meshes.push(m);
      parent.add(g);
      parent = g;
      groups.push(g);
    }
    this.root.add(root);
    this.chain.push(groups);
  }

  // ---------- a snake: lumps in a line that travel a wave ----------
  buildSerpent(h, F, prep) {
    const C = F.serpent;
    const span = C.span * h * this.stretch;
    for (let i = 0; i < C.n; i++) {
      const t = i / (C.n - 1);
      const k = 1 - Math.pow(t, 1.4) * C.taper;
      const g = new THREE.Group();
      g.position.set(0, C.r[1] * h, span * (0.5 - t));
      const m = new THREE.Mesh(lump(C.r[0] * h * k, C.r[1] * h * k, (span / C.n) * 0.75, 12), null);
      g.add(m);
      this.meshes.push(m);
      this.root.add(g);
      this.segments.push({ g, t });
    }
  }

  // ---------- a butterfly: the drawing IS the wings ----------
  buildFlyer(h, prep) {
    const T = this.form.torso;
    const body = this.add(lump(T.r[0] * h, T.r[1] * h, T.r[2] * h, 10), 0, 0, 0);
    this.skinBody = body;
    // wings use the drawing straight, split down the middle and hinged
    const mat = new THREE.MeshStandardMaterial({
      map: prep.tex, transparent: true, alphaTest: 0.2,
      side: THREE.DoubleSide, roughness: 0.9,
    });
    this.wingMat = mat;
    const ww = h * 0.62 * prep.aspect, wh = h * 0.62;
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(ww / 2, wh);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      }
      const m = new THREE.Mesh(geo, mat);
      m.position.x = side * ww / 4;
      m.castShadow = true;
      const pivot = new THREE.Group();
      pivot.add(m);
      pivot.userData.side = side;
      this.root.add(pivot);
      this.wings.push(pivot);
    }
  }

  // ---------- a flower: two cards crossed, so it has body from any angle ----------
  buildPlant(h, prep) {
    const mat = new THREE.MeshStandardMaterial({
      map: prep.tex, transparent: true, alphaTest: 0.25,
      side: THREE.DoubleSide, roughness: 0.95,
    });
    this.wingMat = mat;
    const w = h * prep.aspect, hh = h;
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
      m.position.y = hh / 2;
      m.rotation.y = i * Math.PI / 2;
      m.castShadow = true;
      this.root.add(m);
      this.segments.push({ g: m, t: i });
    }
  }

  addLabel(name, h) {
    if (!name) return;
    const s = makeNameLabel(name);
    s.position.set(0, h * 1.25, 0);
    this.label = s;
    this.object3D.add(s);
  }

  addLabelOld(name, h) {
    if (!name) return;
    const c = makeCanvas(8, 8);
    const g0 = c.getContext('2d');
    g0.font = '600 40px "Segoe UI", sans-serif';
    const tw = g0.measureText(name).width;
    c.width = Math.ceil(tw + 56); c.height = 72;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,20,10,0.6)';
    g.beginPath();
    g.roundRect(2, 4, c.width - 4, 64, 20);
    g.fill();
    g.font = '600 40px "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#eafff4';
    g.fillText(name, c.width / 2, 38);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
    }));
    const lh = 0.3;
    s.scale.set(lh * (c.width / c.height), lh, 1);
    s.position.set(0, h * 1.25, 0);
    this.label = s;
    this.object3D.add(s);
  }

  // ============================================================
  update(dt, ctx) {
    this.age += dt;
    const s = this.s;

    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt * 1.3);
      for (const m of this.allMats) {
        m.opacity = this.fade;
        if (this.fade >= 1 && !m.map) m.transparent = false;
      }
      if (this.label) this.label.material.opacity = this.fade;
    }

    const gaitK = ctx.speed / Math.max(0.1, s.speed.walk);

    // ---- carriage ----
    // Pitch and roll are recomputed from scratch every frame and assigned,
    // never accumulated — see the note in animals.js about who owns what.
    let pitch = 0, roll = 0;
    if (ctx.moving) {
      this.stride += dt * s.strideRate * (0.5 + gaitK * 0.5);
      if (s.gait === 'hop') {
        this.bob = Math.abs(Math.sin(this.stride)) * s.hopHeight;
        pitch = -Math.cos(this.stride * 2) * 0.07;
      } else if (s.gait === 'fly') {
        this.bob = Math.sin(this.stride * 0.5) * s.bobAmp;
      } else {
        this.bob = Math.abs(Math.sin(this.stride * 2)) * s.bobAmp;
        roll = Math.sin(this.stride) * s.roll;
      }
    } else {
      this.stride += dt * 0.8;
      this.bob = Math.sin(this.stride) * 0.01;
    }
    // lean into the slope it is standing on
    this.root.rotation.x = pitch - clamp(ctx.slope || 0, -0.5, 0.5) * 0.45;
    this.root.rotation.z = roll;
    this.object3D.position.y = ctx.groundY + this.bob + (s.hover || 0);

    // ---- legs ----
    const drive = ctx.moving ? clamp(0.3 + gaitK * 0.55, 0, 0.9) : 0;
    for (let i = 0; i < this.legPivots.length; i++) {
      const p = this.stride + this.legOffs[i];
      const target = drive ? drive * skewSin(p) : (ctx.state === 'rest' ? 0.3 : 0);
      const lift = drive ? Math.max(0, Math.cos(p)) * drive * this.wH * 0.05 : 0;
      this.legRots[i] += (target - this.legRots[i]) * Math.min(1, dt * 14);
      this.legLifts[i] += (lift - this.legLifts[i]) * Math.min(1, dt * 14);
      const pg = this.legPivots[i];
      pg.rotation.x = this.legRots[i];
      pg.position.y = pg.userData.baseY + this.legLifts[i];
    }

    // ---- ears ----
    if (this.earPivots.length) {
      const bobVel = (this.bob - this.prevBob) / Math.max(dt, 1e-4);
      const alert = ctx.state === 'look' || ctx.state === 'sniff' ? 1 : 0;
      const t = clamp(bobVel * 0.5, -0.4, 0.4)
        + Math.sin(this.age * 1.4) * 0.04
        + alert * Math.sin(this.age * 6.5) * 0.08;
      this.earRot += (t - this.earRot) * Math.min(1, dt * 10);
      this.earPivots.forEach((pg, i) => { pg.rotation.x = this.earRot * (i ? 0.85 : 1.1); });
    }
    this.prevBob = this.bob;

    // ---- head ----
    if (this.head) {
      const dip = ctx.state === 'sniff' ? 0.4 : 0;
      this.head.rotation.x += (dip - this.head.rotation.x) * Math.min(1, dt * 5);
      const scan = ctx.state === 'look' ? Math.sin(this.age * 1.3) * 0.55 : 0;
      this.head.rotation.y += (scan - this.head.rotation.y) * Math.min(1, dt * 4);
    }

    // ---- tails and trunks ----
    if (this.chain.length) {
      let amp = 0.15;
      if (ctx.state === 'look' || ctx.state === 'sniff') amp = 0.32;
      else if (ctx.state === 'rest') amp = 0.05;
      else if (ctx.moving) amp = 0.26;
      this.wagAmp += (amp - this.wagAmp) * Math.min(1, dt * 3);
      const rot = Math.sin(this.age * s.wagFreq * 2) * this.wagAmp;
      for (const groups of this.chain) {
        const n = groups.length || 1;
        groups.forEach((g, j) => {
          const w = Math.pow((j + 1) / n, 1.3) - Math.pow(j / n, 1.3);
          g.rotation.y = rot * w * n;
        });
      }
    }

    // ---- a snake travels a wave down its length ----
    if (this.segments.length && this.form.serpent) {
      const amp = (ctx.moving ? 0.28 : 0.1) * this.wH;
      for (const seg of this.segments) {
        seg.g.position.x = Math.sin(this.age * 4 - seg.t * 5.5) * amp * (0.35 + seg.t * 0.65);
      }
    }

    // ---- wings ----
    if (this.wings.length && this.form.cards === 'wings') {
      const flap = Math.sin(this.age * 9) * 0.85 + 0.35;
      for (const p of this.wings) p.rotation.z = p.userData.side * flap;
      this.root.rotation.x = -0.25 + Math.sin(this.age * 9) * 0.08;
      this.root.rotation.z = 0;
    } else if (this.wings.length) {
      // a bird's folded wings just breathe
      const f = ctx.moving ? Math.sin(this.stride * 2) * 0.12 : Math.sin(this.age * 1.6) * 0.03;
      this.wings.forEach((m, i) => { m.rotation.z = (i ? 1 : -1) * (0.12 + f); });
    }

    // ---- a flower sways ----
    if (this.form.cards === 'crossed') {
      this.root.rotation.z = Math.sin(this.age * 0.9) * 0.05;
      this.root.rotation.x = Math.cos(this.age * 0.7) * 0.035;
    }
  }

  dispose() {
    this.object3D.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    if (this.skinMat) this.skinMat.dispose();
    if (this.wingMat) this.wingMat.dispose();
    if (this.prep.tex) this.prep.tex.dispose();
    if (this.label) { this.label.material.map.dispose(); this.label.material.dispose(); }
  }
}

// the child's name on a soft pill, shared by every body type
export function makeNameLabel(name) {
  const c = makeCanvas(8, 8);
  const g0 = c.getContext('2d');
  g0.font = '600 40px "Segoe UI", sans-serif';
  const tw = g0.measureText(name).width;
  c.width = Math.ceil(tw + 56); c.height = 72;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,20,10,0.6)';
  g.beginPath();
  g.roundRect(2, 4, c.width - 4, 64, 20);
  g.fill();
  g.font = '600 40px "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#eafff4';
  g.fillText(name, c.width / 2, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  const lh = 0.3;
  sp.scale.set(lh * (c.width / c.height), lh, 1);
  return sp;
}
