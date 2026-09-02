// REAL ANIMATED MODELS, PAINTED BY THE CHILD
// -------------------------------------------
// Professionally rigged animals (Quaternius, CC0, vendored locally) driven by
// the same navigation and mood system as every other body. The child's iPad
// drawing is projected onto the model's flanks — same skin shader the
// sculpted bodies use — so the animal's shape and motion are predictable
// while its colours stay entirely the child's. Eyes and mouths keep their own
// materials so every animal keeps its face.

import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import * as SkeletonUtils from './vendor/utils/SkeletonUtils.js';
import { prepareDrawing, skinify, bakeProjection, makeNameLabel } from './creature-3d.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// materials that stay the model's own: without them every animal is faceless
const KEEP_MAT = /eye|pupil|teeth|tooth|tongue|nose|mouth/i;

// ============================================================
// LOADING
// One GLB per species, fetched once, cloned per creature.
// ============================================================

let manifest = null;
const gltfCache = new Map(); // kind -> Promise<{gltf, cfg}>
const loader = new GLTFLoader();

export async function loadAnimalManifest() {
  if (manifest) return manifest;
  try {
    manifest = await (await fetch('models/animals/manifest.json')).json();
  } catch (e) {
    console.warn('animal models unavailable:', e);
    manifest = {};
  }
  // warm the cache in the background so the first child never waits
  for (const kind of Object.keys(manifest)) {
    if (kind.startsWith('_')) continue;
    getAsset(kind).catch(() => {});
  }
  return manifest;
}

export function hasModel(kind) {
  return !!(manifest && manifest[kind] && !kind.startsWith('_'));
}

export function getAsset(kind) {
  if (!hasModel(kind)) return Promise.resolve(null);
  if (!gltfCache.has(kind)) {
    const cfg = manifest[kind];
    gltfCache.set(kind, loader.loadAsync('models/animals/' + cfg.file)
      .then((gltf) => ({ gltf, cfg }))
      .catch((e) => { console.warn('model failed, will sculpt instead:', kind, e); return null; }));
  }
  return gltfCache.get(kind);
}

// clip names arrive as "CharacterArmature|Walk" or "Snake_Walk"; index them
// under every suffix so one resolver serves every pack
function indexClips(clips) {
  const map = new Map();
  for (const c of clips) {
    const bare = c.name.replace(/^.*\|/, '');
    if (!map.has(bare)) map.set(bare, c);
    const stripped = bare.replace(/^[A-Za-z]+_(?=Idle|Walk|Attack|Jump)/, '');
    if (!map.has(stripped)) map.set(stripped, c);
  }
  return map;
}

// ============================================================
// THE BODY
// ============================================================

export class ModelBody {
  constructor(species, asset, image, name) {
    this.s = species;
    const { gltf, cfg } = asset;
    this.cfg = cfg;

    this.object3D = new THREE.Group();
    this.root = new THREE.Group(); // carries the slope lean
    this.object3D.add(this.root);

    const model = SkeletonUtils.clone(gltf.scene);
    model.rotation.y = cfg.rotY || 0;

    // accessories are not part of the animal — the bunny keeps its carrot to
    // itself
    const hide = new Set(cfg.hide || []);
    model.traverse((o) => { if (hide.has(o.name)) o.visible = false; });

    // ---- one size table rules every animal ----
    // Measure the bind pose and scale so this creature's height matches its
    // species entry. Ratios between animals, and against the forest, come
    // from that one table and nowhere else.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.traverse((o) => {
      if (o.isMesh && o.visible) {
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        box.union(b);
      }
    });
    const size = new THREE.Vector3();
    box.getSize(size);
    const k = species.height / Math.max(0.001, size.y);
    this.scaleK = k;
    const holder = new THREE.Group();
    holder.scale.setScalar(k);
    const c = new THREE.Vector3();
    box.getCenter(c);
    holder.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    holder.add(model);
    this.root.add(holder);

    // ---- the child's colours become the skin ----
    this.mats = [];
    if (image) {
      const prep = prepareDrawing(image);
      this.prep = prep;
      // bake body-space coordinates once per template model (bind pose is
      // shared by every clone, so the attributes are too)
      const paintable = [];
      model.traverse((o) => {
        if (o.isMesh && o.visible && !KEEP_MAT.test(o.material.name || '')) paintable.push(o);
      });
      const baked = paintable.length && paintable[0].geometry.userData.projBox;
      let pbox;
      if (baked) {
        pbox = paintable[0].geometry.userData.projBox;
      } else {
        pbox = bakeProjection(model, paintable);
        if (paintable.length) paintable[0].geometry.userData.projBox = pbox;
      }
      const hip01 = cfg.hip || 0;
      const hip = hip01 > 0
        ? clamp((pbox.min.y + hip01 * (pbox.max.y - pbox.min.y) - pbox.min.y) / (pbox.max.y - pbox.min.y), 0.05, 0.85)
        : 0.5;
      const split = (hip01 > 0 && prep.legSplit > 0) ? prep.legSplit : hip;
      // each paintable keeps its own (cloned) material, so its baked texture
      // detail keeps shading the surface underneath the child's colours
      const skinned = new Map();
      for (const o of paintable) {
        if (!skinned.has(o.material)) {
          skinned.set(o.material, skinify(o.material.clone(), prep, pbox, split, hip, true));
        }
        o.material = skinned.get(o.material);
      }
      for (const m of skinned.values()) this.mats.push(m);
      this.flapUniform = { value: 0 };
      if (cfg.gait === 'flap') {
        const uf = this.flapUniform;
        for (const m of skinned.values()) {
          const prev = m.onBeforeCompile;
          m.onBeforeCompile = (sh, r) => {
            if (prev) prev(sh, r);
            sh.uniforms.uFlapA = uf;
            sh.vertexShader = sh.vertexShader
              .replace('#include <common>', `#include <common>
                uniform float uFlapA;`)
              .replace('#include <begin_vertex>', `#include <begin_vertex>
                { float w = abs(aProj.x); transformed.y += w * w * uFlapA; }`);
          };
        }
      }
      // faces keep their own materials, cloned so the fade is per-creature
      model.traverse((o) => {
        if (o.isMesh && o.visible && KEEP_MAT.test(o.material.name || '')) {
          o.material = o.material.clone();
          this.mats.push(o.material);
        }
      });
    } else {
      model.traverse((o) => {
        if (o.isMesh && o.visible) { o.material = o.material.clone(); this.mats.push(o.material); }
      });
    }
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

    // ---- animation ----
    this.animated = (gltf.animations || []).length > 0;
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = indexClips(gltf.animations || []);
    this.phase = 0;
    this.holder = holder;
    this.actions = new Map();
    this.current = null;
    this.oneshot = null;
    this.mixer.addEventListener('finished', () => {
      if (this.oneshot) {
        this.oneshot.fadeOut(0.25);
        this.oneshot = null;
        if (this.current) this.current.reset().fadeIn(0.25).play();
      }
    });
    this.play(this.resolve(['Jump_Land', 'Yes', 'Wave', 'Idle', 'Flying_Idle', 'Snake_Idle']), true);

    if (name) {
      this.label = makeNameLabel(name);
      this.label.position.set(0, species.height * 1.25, 0);
      this.object3D.add(this.label);
    }

    this.fade = 0;
    for (const m of this.mats) { m.transparent = true; m.opacity = 0; }
    this.lastState = '';
  }

  resolve(names) {
    for (const n of names) if (this.clips.has(n)) return n;
    return null;
  }

  action(nm) {
    if (!nm) return null;
    if (!this.actions.has(nm)) this.actions.set(nm, this.mixer.clipAction(this.clips.get(nm)));
    return this.actions.get(nm);
  }

  play(nm, once = false) {
    const a = this.action(nm);
    if (!a) return;
    if (once) {
      // a flourish layered over the base action, then back to it
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = false;
      if (this.current) this.current.fadeOut(0.2);
      a.fadeIn(0.2).play();
      this.oneshot = a;
      return;
    }
    if (this.current === a) return;
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    if (this.current) this.current.crossFadeTo(a, 0.3, false);
    a.play();
    this.current = a;
  }

  // which clip suits the mood — resolved against whatever this pack offers
  baseFor(state, moving, fast) {
    if (moving) {
      if (fast) return this.resolve(['Run', 'Gallop', 'Fast_Flying', 'Walk', 'Snake_Walk']);
      return this.resolve(['Walk', 'Snake_Walk', 'Fast_Flying', 'Run']);
    }
    if (state === 'sniff') return this.resolve(['Duck', 'Idle_Headlow', 'Idle_2_HeadLow', 'Eating', 'Idle_Peck', 'Idle', 'Flying_Idle', 'Snake_Idle']);
    if (state === 'look') return this.resolve(['Idle_2', 'Idle', 'Flying_Idle', 'Snake_Idle']);
    return this.resolve(['Idle', 'Flying_Idle', 'Snake_Idle']);
  }

  update(dt, ctx) {
    const s = this.s;

    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt * 1.3);
      for (const m of this.mats) {
        m.opacity = this.fade;
        if (this.fade >= 1) m.transparent = false;
      }
      if (this.label) this.label.material.opacity = this.fade;
    }

    // A detailed model without a rig moves the way the animal moves anyway:
    // rabbits and birds hop whole-body, elephants sway, butterflies flap.
    if (!this.animated) {
      const g = this.cfg.gait || 'hop';
      const gaitK = ctx.speed / Math.max(0.1, s.speed.walk);
      let bob = 0, pitch = 0, roll = 0;
      if (g === 'flap') {
        this.phase += dt * 9;
        this.flapUniform.value = Math.sin(this.phase) * 0.4 + 0.12;
        bob = Math.sin(this.phase * 0.35) * 0.06;
        pitch = -0.12;
      } else if (ctx.moving) {
        this.phase += dt * s.strideRate * (0.5 + gaitK * 0.5);
        if (g === 'shuffle') {
          bob = Math.abs(Math.sin(this.phase)) * 0.03;
          roll = Math.sin(this.phase) * 0.05;
          pitch = -Math.cos(this.phase * 2) * 0.015;
        } else { // hop
          bob = Math.abs(Math.sin(this.phase)) * (s.hopHeight || 0.15);
          pitch = -Math.cos(this.phase * 2) * 0.09;
        }
      } else {
        this.phase += dt * 1.1;
        bob = Math.sin(this.phase) * 0.008;
        // breathing, and a little peck or nose-twitch when sniffing
        if (ctx.state === 'sniff') pitch = Math.max(0, Math.sin(this.phase * 4)) * 0.12;
      }
      this.object3D.position.y = ctx.groundY + bob + (s.hover || 0)
        + (s.flying ? Math.sin(ctx.t * 1.7) * (s.hoverWobble || 0) * 0.4 : 0);
      this.root.rotation.x = pitch - clamp(ctx.slope || 0, -0.5, 0.5) * 0.45;
      this.root.rotation.z = roll;
      return;
    }

    const fast = ctx.speed > s.speed.walk * 1.35;
    if (!this.oneshot) {
      const nm = this.baseFor(ctx.state, ctx.moving, fast);
      this.play(nm);
      // an occasional flourish when it stops to look around
      if (ctx.state === 'look' && this.lastState !== 'look' && Math.random() < 0.35) {
        this.play(this.resolve(['Yes', 'Wave', 'Dance', 'No']), true);
      }
    }
    this.lastState = ctx.state;

    // feet match the ground actually covered — no moonwalking
    if (this.current && ctx.moving) {
      this.current.timeScale = clamp(ctx.speed / Math.max(0.1, s.speed.walk), 0.6, 1.9)
        * (this.cfg.walkRate || 1);
    } else if (this.current) {
      this.current.timeScale = ctx.state === 'rest' ? 0.45 : 1;
    }

    this.mixer.update(dt);

    this.object3D.position.y = ctx.groundY + (s.hover || 0)
      + (s.flying ? Math.sin(ctx.t * 1.7) * (s.hoverWobble || 0) * 0.4 : 0);
    // lean with the slope: assigned, never accumulated
    this.root.rotation.x = -clamp(ctx.slope || 0, -0.5, 0.5) * 0.45;
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.mats) m.dispose();
    if (this.prep) this.prep.tex.dispose();
    if (this.label) { this.label.material.map.dispose(); this.label.material.dispose(); }
  }
}
