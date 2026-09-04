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
import { mergeVertices } from './vendor/utils/BufferGeometryUtils.js';
import { prepareDrawing, skinify, bakeProjection, makeNameLabel } from './creature-3d.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// each animal's anatomy-line map, worn as soft surface detailing.
// Loaded once per kind; every creature of that kind shares the texture.
const detailCache = new Map(); // label -> { tex, ready: uniform-style flag list }
function detailFor(label) {
  if (!detailCache.has(label)) {
    const entry = { tex: null, on: [] };
    const loader2 = new THREE.TextureLoader();
    entry.tex = loader2.load('templates/' + label + '.detail.png',
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        for (const u of entry.on) u.value = 1;
        entry.loaded = true;
      },
      undefined,
      () => { /* no detail map for this kind: the skin just goes without */ });
    detailCache.set(label, entry);
  }
  return detailCache.get(label);
}

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
    if (hasModel(kind)) getAsset(kind).catch(() => {});
  }
  return manifest;
}

const DETAILED = typeof location !== 'undefined' && location.hash.includes('detailed');

function entryFor(kind) {
  if (!manifest || kind.startsWith('_')) return null;
  if (DETAILED && manifest._detailed && manifest._detailed[kind]) return manifest._detailed[kind];
  return manifest[kind] || null;
}

export function hasModel(kind) {
  return !!entryFor(kind);
}

export function getAsset(kind) {
  if (!hasModel(kind)) return Promise.resolve(null);
  if (!gltfCache.has(kind)) {
    const cfg = entryFor(kind);
    gltfCache.set(kind, loader.loadAsync('models/animals/' + cfg.file)
      .then((gltf) => { smoothScene(gltf.scene, cfg); return { gltf, cfg }; })
      .catch((e) => { console.warn('model failed, will sculpt instead:', kind, e); return null; }));
  }
  return gltfCache.get(kind);
}

// Low-poly packs split every vertex per face, so each triangle shades as its
// own flat plate — the boxy look. Welding the vertices back together and
// recomputing the normals keeps the silhouette but lets light flow smoothly
// across the body. Done once per loaded file; every clone shares the result.
function smoothScene(scene, cfg) {
  if (cfg.smooth === false) return;
  const done = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let g = done.get(o.geometry);
    if (!g) {
      const before = o.geometry.attributes.position.count;
      const tmp = o.geometry.clone();
      tmp.deleteAttribute('normal');
      g = mergeVertices(tmp, 1e-4);
      g.computeVertexNormals();
      // a merge that barely merged means per-face UVs blocked it: fall back
      // to welding by position only, trading the palette texture's per-face
      // detail (which the child's colours replace anyway) for smooth light
      if (g.attributes.position.count > before * 0.72) {
        const bare = o.geometry.clone();
        bare.deleteAttribute('normal');
        bare.deleteAttribute('uv');
        const merged = mergeVertices(bare, 1e-4);
        if (merged.attributes.position.count < g.attributes.position.count * 0.85) {
          merged.computeVertexNormals();
          g = merged;
          g.userData.uvDropped = true;
        }
      }
      console.log('smooth ' + (cfg.title || '') + '/' + (o.name || 'mesh') + ': '
        + before + ' -> ' + g.attributes.position.count + ' verts'
        + (g.userData.uvDropped ? ' (uv dropped)' : ''));
      done.set(o.geometry, g);
    }
    o.geometry = g;
    if (g.userData.uvDropped && o.material && o.material.map) {
      o.material = o.material.clone();
      o.material.map = null;
    }
    if (o.material) o.material.flatShading = false;
  });
}

// clip names arrive as "CharacterArmature|Walk" or "Snake_Walk"; index them
// under every suffix so one resolver serves every pack
function indexClips(clips) {
  const map = new Map();
  const put = (k, c) => { const lk = k.toLowerCase(); if (!map.has(lk)) map.set(lk, c); };
  for (const c of clips) {
    const bare = c.name.replace(/^.*\|/, '');
    put(bare, c);
    // 'Bunny_walk' and friends: index the suffix after any single prefix word
    const stripped = bare.replace(/^[A-Za-z]+_(?=idle|walk|attack|jump|run)/i, '');
    put(stripped, c);
  }
  return map;
}

// ============================================================
// ASSEMBLY
// Shared by the runtime bodies and the template generator: the colouring
// page is a photograph of exactly this assembly, so the child's colours can
// be carried back onto it without any guessing.
// ============================================================

export function assembleBody(gltf, cfg, height) {
  const model = SkeletonUtils.clone(gltf.scene);

  const measure = () => {
    model.updateMatrixWorld(true);
    const b = new THREE.Box3();
    model.traverse((o) => {
      if (o.isMesh && o.visible) {
        o.geometry.computeBoundingBox();
        b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      }
    });
    return b;
  };

  model.rotation.y = cfg.rotY || 0;

  // accessories are not part of the animal — the bunny keeps its carrot
  const hide = new Set(cfg.hide || []);
  model.traverse((o) => { if (hide.has(o.name)) o.visible = false; });

  // one size table rules every animal: scale the bind pose to the species
  // height, feet on the ground, centred
  const box = measure();
  const size = new THREE.Vector3();
  box.getSize(size);
  const k = height / Math.max(0.001, size.y);
  const holder = new THREE.Group();
  holder.scale.setScalar(k);
  const c = new THREE.Vector3();
  box.getCenter(c);
  holder.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  holder.add(model);

  const paintable = [], facial = [];
  model.traverse((o) => {
    if (o.isMesh && o.visible) {
      (KEEP_MAT.test(o.material.name || '') ? facial : paintable).push(o);
    }
  });
  return { model, holder, paintable, facial, scaleK: k };
}

// ============================================================
// THE BODY
// ============================================================

export class ModelBody {
  constructor(species, asset, image, name, templated = false) {
    this.s = species;
    const { gltf, cfg } = asset;
    this.cfg = cfg;

    this.object3D = new THREE.Group();
    this.root = new THREE.Group(); // carries the slope lean
    this.object3D.add(this.root);

    const built = assembleBody(gltf, cfg, species.height);
    const model = built.model;
    const holder = built.holder;
    this.scaleK = built.scaleK;
    this.root.add(holder);

    // ---- the child's colours become the skin ----
    this.mats = [];
    this.flapUniform = { value: 0 };
    this.gaitUniform = { value: 0 };
    if (image) {
      const prep = prepareDrawing(image);
      this.prep = prep;
      // A coloured-in template needs no guessing: the page IS a photograph of
      // this very model, head to the right, frame = the projection box. Any
      // heuristics would only add error.
      if (templated) {
        prep.headRight = true;
        prep.legSplit = -1;
      }
      // bake body-space coordinates once per template model (bind pose is
      // shared by every clone, so the attributes are too)
      const paintable = built.paintable;
      const baked = paintable.length && paintable[0].geometry.userData.projBox;
      let pbox;
      if (baked) {
        pbox = paintable[0].geometry.userData.projBox;
      } else {
        holder.updateMatrixWorld(true);
        pbox = bakeProjection(holder, paintable);
        if (paintable.length) paintable[0].geometry.userData.projBox = pbox;
      }
      const hip01 = templated ? 0 : (cfg.hip || 0);
      const hip = hip01 > 0
        ? clamp((pbox.min.y + hip01 * (pbox.max.y - pbox.min.y) - pbox.min.y) / (pbox.max.y - pbox.min.y), 0.05, 0.85)
        : 0.5;
      const split = (hip01 > 0 && prep.legSplit > 0) ? prep.legSplit : hip;
      // each paintable keeps its own (cloned) material, so its baked texture
      // detail keeps shading the surface underneath the child's colours.
      // Procedural gaits need one material per MESH: each mesh carries its own
      // body-to-geometry transform, because these files hide up-axis
      // conversions in their node matrices - guessing axes melted an elephant.
      const det = detailFor(species.label);
      const perMesh = cfg.gait === 'walk4' || cfg.gait === 'flap';
      const skinned = new Map();
      for (const o of paintable) {
        const key = perMesh ? o : o.material;
        if (!skinned.has(key)) {
          const sm = skinify(o.material.clone(), prep, pbox, split, hip, true, det.tex);
          const flag = sm.userData.uniforms.uDetailOn;
          if (det.loaded) flag.value = 1;
          else det.on.push(flag);
          skinned.set(key, sm);
        }
        o.material = skinned.get(key);
      }
      for (const m of skinned.values()) this.mats.push(m);

      if (perMesh) {
        // Displacements are computed in the canonical body frame (feet at 0,
        // +z forward, metres) using the baked aProj, then carried into each
        // mesh's own vertex space by its inverse bake transform.
        const ug = this.gaitUniform;
        const uf = this.flapUniform;
        const hipY = pbox.min.y + (cfg.legHip || 0.5) * (pbox.max.y - pbox.min.y);
        const legSpan = Math.max(0.001, hipY - pbox.min.y);
        const midZ = (pbox.min.z + pbox.max.z) / 2;
        const amp = (cfg.legAmp || 0.3) * legSpan;
        holder.updateMatrixWorld(true);
        for (const o of paintable) {
          const b2g = new THREE.Matrix3().setFromMatrix4(
            new THREE.Matrix4().copy(o.matrixWorld).invert().multiply(holder.matrixWorld));
          const mat = o.material;
          const prev = mat.onBeforeCompile;
          const isWalk = cfg.gait === 'walk4';
          mat.onBeforeCompile = (sh, r) => {
            if (prev) prev(sh, r);
            sh.uniforms.uGaitP = ug;
            sh.uniforms.uFlapA = uf;
            sh.uniforms.uB2G = { value: b2g };
            sh.vertexShader = sh.vertexShader
              .replace('#include <common>', `#include <common>
                uniform float uGaitP;
                uniform float uFlapA;
                uniform mat3 uB2G;`)
              .replace('#include <begin_vertex>', isWalk ? `#include <begin_vertex>
                {
                  // no skeleton, but it still walks: below the hip the body
                  // shears fore-and-aft in diagonal pairs, like a stride
                  float below = ${hipY.toFixed(4)} - aProj.y;
                  if (below > 0.0) {
                    float quad = (aProj.z > ${midZ.toFixed(4)} ? 1.0 : -1.0) * (aProj.x > 0.0 ? 1.0 : -1.0);
                    float ph = uGaitP + (quad > 0.0 ? 0.0 : 3.14159);
                    float kk = min(below / ${legSpan.toFixed(4)}, 1.0);
                    transformed += uB2G * vec3(
                      0.0,
                      max(0.0, cos(ph)) * ${(amp * 0.3).toFixed(4)} * kk,
                      sin(ph) * ${amp.toFixed(4)} * kk);
                  }
                }` : `#include <begin_vertex>
                {
                  float w = abs(aProj.x);
                  transformed += uB2G * vec3(0.0, w * w * uFlapA, 0.0);
                }`);
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
    this.play(this.resolve(['Idle', 'Flying_Idle', 'Snake_Idle']));

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
    for (const n of names) if (this.clips.has(n.toLowerCase())) return n.toLowerCase();
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
      // a flourish layered over the base action, then back to it — and never
      // two flourishes at once: overlapping full-weight clips mangle the rig
      if (this.oneshot && this.oneshot !== a) this.oneshot.fadeOut(0.12);
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

  // a joyful reaction on arrival: whatever this pack has that reads happy
  celebrate() {
    this.play(this.resolve(['Yes', 'Wave', 'Dance', 'Idle_2', 'Jump']), true);
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
        this.phase += dt * s.strideRate * (0.5 + gaitK * 0.5) * (this.cfg.walkRate || 1);
        if (g === 'walk4') {
          this.gaitUniform.value = this.phase;
          bob = Math.abs(Math.sin(this.phase)) * 0.025;
          roll = Math.sin(this.phase) * 0.035;
        } else if (g === 'shuffle') {
          bob = Math.abs(Math.sin(this.phase)) * 0.03;
          roll = Math.sin(this.phase) * 0.05;
          pitch = -Math.cos(this.phase * 2) * 0.015;
        } else { // hop: a real leap, not a glide - up, tuck, land
          const hk = this.cfg.hopK || 1;
          bob = Math.abs(Math.sin(this.phase)) * (s.hopHeight || 0.15) * hk;
          pitch = -Math.cos(this.phase * 2) * 0.14 * hk;
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
