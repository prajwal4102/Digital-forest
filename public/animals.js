// THE ANIMAL LAYER
// ----------------
// Everything that makes a creature live in the forest, kept apart from the
// forest itself so adding a species is additive rather than surgical.
//
//   SPECIES    — per-animal tuning: size, speed, gait, temperament
//   Body       — how it looks. Swappable: a placeholder now, a rigged GLB
//                later, without the behaviour code knowing the difference.
//   Animal     — navigation, steering, terrain following, state machine
//   AnimalManager — owns the herd, updates it, enforces the population cap

import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shortestTurn = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ============================================================
// SPECIES
// Temperament lives here, not in the animal code, so a giraffe and a rabbit
// share one brain and differ only in these numbers.
// ============================================================

// How long each mood lasts and what tends to follow it. Most animals share
// this rhythm; the lively and the ponderous override pieces of it.
const MOODS = {
  idle:   { dur: [1.0, 2.4], next: { wander: 5, look: 4, sniff: 4, rest: 2 } },
  look:   { dur: [1.5, 3.0], next: { wander: 5, sniff: 3, idle: 3 } },
  sniff:  { dur: [1.4, 2.8], next: { wander: 5, idle: 3, look: 3 } },
  wander: { dur: [2.5, 5.0], next: { idle: 5, look: 4, sniff: 5, wander: 2 } },
  rest:   { dur: [3.0, 5.5], next: { idle: 4, look: 2 } },
};
const busier = (mul) => {
  const out = {};
  for (const k in MOODS) {
    out[k] = { dur: [MOODS[k].dur[0] * mul, MOODS[k].dur[1] * mul], next: MOODS[k].next };
  }
  return out;
};

// Scale is storybook, not zoological: on a wall-sized display a true-to-life
// 35cm rabbit reads as a speck. Tune sizes here and nowhere else.
const BASE = {
  radius: 0.36, maxWidth: 2.6, rigged: true, turnRate: 3.2,
  gait: 'walk', strideRate: 5, bobAmp: 0.05, roll: 0.03, hopHeight: 0.16,
  wagFreq: 2.2, states: MOODS, start: 'wander', interestChance: 0.6,
};

export const SPECIES = {
  // four-legged walkers: cats, dogs, tigers, horses
  prowler: { ...BASE, label: 'prowler',
    height: 1.5, speed: { walk: 1.3, run: 3.0 }, strideRate: 5.5 },

  // heavy and deliberate: elephants, rhinos, hippos
  stomper: { ...BASE, label: 'stomper',
    height: 2.1, radius: 0.62, maxWidth: 3.4,
    speed: { walk: 0.68, run: 1.3 }, turnRate: 1.5,
    strideRate: 2.6, bobAmp: 0.035, roll: 0.055, wagFreq: 1.2,
    states: busier(1.5) },

  // rabbits, frogs, kangaroos
  hopper: { ...BASE, label: 'hopper',
    height: 1.15, radius: 0.32, maxWidth: 2.2,
    speed: { walk: 1.15, run: 2.6 }, turnRate: 3.6,
    gait: 'hop', strideRate: 4.2, hopHeight: 0.19 },

  // snakes, worms, caterpillars: low, smooth, no separable legs
  slitherer: { ...BASE, label: 'slitherer',
    height: 0.78, radius: 0.3, maxWidth: 3.0, rigged: false,
    speed: { walk: 0.95, run: 1.9 }, turnRate: 2.2,
    gait: 'slide', strideRate: 3.2, bobAmp: 0.015, roll: 0.02, wagFreq: 3.2 },

  // ground birds: quick, twitchy, forever pecking
  bird: { ...BASE, label: 'bird',
    height: 0.95, radius: 0.28, maxWidth: 1.9,
    speed: { walk: 1.35, run: 3.2 }, turnRate: 4.5,
    gait: 'hop', strideRate: 6.5, hopHeight: 0.1, wagFreq: 3,
    states: busier(0.65), interestChance: 0.75 },

  // butterflies and anything else on the wing
  butterfly: { ...BASE, label: 'butterfly',
    height: 0.85, radius: 0.3, maxWidth: 1.7, rigged: false,
    flying: true, hover: 1.7, hoverWobble: 0.4,
    speed: { walk: 1.0, run: 2.0 }, turnRate: 2.4,
    gait: 'fly', strideRate: 8, bobAmp: 0.09,
    states: busier(0.7), interestChance: 0.85 },

  // graceful browsers
  deer: { ...BASE, label: 'deer',
    height: 1.7, radius: 0.42, maxWidth: 2.6,
    speed: { walk: 1.5, run: 3.4 }, turnRate: 3.2, strideRate: 5.2 },

  stag: { ...BASE, label: 'stag',
    height: 2.0, radius: 0.5, maxWidth: 3.0,
    speed: { walk: 1.35, run: 3.2 }, turnRate: 2.6, strideRate: 4.6,
    states: busier(1.2) },

  horse: { ...BASE, label: 'horse',
    height: 1.95, radius: 0.52, maxWidth: 3.0,
    speed: { walk: 1.5, run: 3.6 }, turnRate: 2.4, strideRate: 4.8 },

  // dogs are busy: quick trips, lots of sniffing
  dog: { ...BASE, label: 'dog',
    height: 1.25, radius: 0.36, maxWidth: 2.4,
    speed: { walk: 1.5, run: 3.4 }, turnRate: 4.0, strideRate: 6,
    states: busier(0.75), interestChance: 0.8 },

  // flowers and saplings: they stay put and simply grow there
  plant: { ...BASE, label: 'plant',
    height: 1.6, radius: 0.4, maxWidth: 2.2, rigged: false,
    rooted: true, speed: { walk: 0, run: 0 },
    states: { idle: { dur: [4, 8], next: { idle: 1 } } }, start: 'idle' },
};

// what the drawing app sends → what we simulate
export const KIND_MAP = { walker: 'prowler', flyer: 'butterfly' };
export const resolveSpecies = (kind) => SPECIES[KIND_MAP[kind] || kind] || SPECIES.prowler;

// ============================================================
// BODIES
// ============================================================

// A deliberately plain stand-in so the navigation and behaviour can be judged
// on their own. This is not the rabbit — it is the crash-test dummy that the
// rigged GLB will replace, and it is grey on purpose.
export class ProxyBody {
  constructor(species) {
    this.species = species;
    const g = new THREE.Group();
    const h = species.height;
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x8e8779, roughness: 0.9 });

    const torso = new THREE.Mesh(new THREE.SphereGeometry(h * 0.34, 16, 12), mat);
    torso.scale.set(0.85, 0.9, 1.35);
    torso.position.y = h * 0.42;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.2, 14, 10), mat);
    head.position.set(0, h * 0.72, h * 0.34);
    g.add(head);
    this.head = head;

    const snout = new THREE.Mesh(new THREE.SphereGeometry(h * 0.1, 10, 8), dark);
    snout.scale.set(0.8, 0.7, 1.2);
    snout.position.set(0, h * 0.66, h * 0.5);
    g.add(snout);

    // ears, so we can see which way it is facing at a glance
    this.ears = [];
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.045, h * 0.26, 4, 8), mat);
      ear.position.set(side * h * 0.1, h * 0.98, h * 0.28);
      ear.rotation.z = side * 0.16;
      g.add(ear);
      this.ears.push(ear);
    }

    const tail = new THREE.Mesh(new THREE.SphereGeometry(h * 0.09, 10, 8), mat);
    tail.position.set(0, h * 0.46, -h * 0.42);
    g.add(tail);

    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.object3D = g;
    this.inner = new THREE.Group();  // everything above is bobbed via the parent
    this.phase = 0;
  }

  // ctx: { state, speed, moving, turning, dt, t }
  update(dt, ctx) {
    const h = this.species.height;
    const s = this.species;

    if (ctx.moving && s.gait === 'hop') {
      // a hop cycle that speeds up with the animal, so it never moonwalks
      this.phase += dt * s.strideRate * (0.55 + ctx.speed / Math.max(0.1, s.speed.walk) * 0.45);
      const bounce = Math.abs(Math.sin(this.phase));
      this.object3D.position.y = ctx.groundY + bounce * s.hopHeight;
      // nose down on the way up, level on landing
      this.pitch = -Math.cos(this.phase * 2) * 0.07;
    } else {
      this.phase += dt * 0.9;
      this.object3D.position.y = ctx.groundY + Math.sin(this.phase) * 0.008;
      this.pitch = (this.pitch || 0) * 0.9;
    }
    this.object3D.rotation.x = this.pitch - clamp(ctx.slope || 0, -0.5, 0.5) * 0.5;

    // ears react: pinned back at speed, upright and twitching at rest
    const alert = ctx.state === 'look' || ctx.state === 'sniff' ? 1 : 0;
    for (let i = 0; i < this.ears.length; i++) {
      const side = i === 0 ? -1 : 1;
      const lean = ctx.moving ? -0.35 * (ctx.speed / Math.max(0.1, s.speed.run)) : 0;
      const twitch = alert ? Math.sin(ctx.t * 7 + i * 2.1) * 0.09 : 0;
      this.ears[i].rotation.x = lean + twitch;
      this.ears[i].rotation.z = side * (0.16 + twitch * 0.4);
    }

    // head leads the turn, and dips when sniffing
    const dip = ctx.state === 'sniff' ? 0.45 : 0;
    this.head.rotation.x += ((-dip) - this.head.rotation.x) * Math.min(1, dt * 5);
    const scan = ctx.state === 'look' ? Math.sin(ctx.t * 1.3) * 0.6 : 0;
    this.head.rotation.y += (scan - this.head.rotation.y) * Math.min(1, dt * 4);
  }
}

// ============================================================
// ANIMAL
// ============================================================

export class Animal {
  constructor({ species, body, map, groundHeight, scene, at, intro }) {
    this.s = typeof species === 'string' ? SPECIES[species] : species;
    this.body = body;
    this.map = map;
    this.groundHeight = groundHeight;
    this.scene = scene;

    const spot = map.nearestOpen(at.x, at.z) || { x: at.x, z: at.z };
    this.pos = new THREE.Vector2(spot.x, spot.z);
    this.heading = Math.atan2(-spot.x, -spot.z); // roughly facing the clearing
    this.speed = 0;
    this.path = null;
    this.leg = 0;

    this.sinceCheck = 0;
    this.lastCheck = this.pos.clone();
    this.jitter = Math.random() * Math.PI * 2;

    this.state = this.s.start || 'idle';
    this.stateTime = 0;
    this.stateDur = 0;
    this.enterState(this.state);

    scene.add(body.object3D);

    // a soft contact patch: the sun shadow alone leaves it looking unstuck
    const tex = contactShadowTexture();
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(this.s.height * 0.95, this.s.height * 1.2),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
        opacity: 0.32, color: 0x1d3324, fog: false,
      }));
    this.shadow.geometry.rotateX(-Math.PI / 2);
    this.shadow.renderOrder = 3;
    scene.add(this.shadow);

    // THE MAGIC MOMENT: the child's page drifts down at centre stage, bursts
    // into sparkles, and the animal steps out of it. Skipped for creatures
    // restored from the server's memory - only a fresh sending earns it.
    // (Last in the constructor: it hides parts built above.)
    this.introT = -1;
    if (intro) this.beginIntro(intro);
  }

  // ---------- the arrival ----------
  // One continuous story: the child's page rides the wind in through the
  // trees, settles in the clearing, magic gathers around it, and the animal
  // steps out of the burst. Timings in seconds from beginIntro.
  beginIntro(img) {
    const aspect = img.width / Math.max(1, img.height);
    const ph = Math.min(1.7, Math.max(1.0, this.s.height * 1.05));
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide,
      depthWrite: false, fog: false,
    });
    // segments along the width so the paper can flex like paper
    const geo = new THREE.PlaneGeometry(ph * aspect, ph, 10, 1);
    this.pageBase = Float32Array.from(geo.attributes.position.array);
    this.pagePlane = new THREE.Mesh(geo, mat);
    this.pagePlane.renderOrder = 4;
    this.scene.add(this.pagePlane);

    // the flight path: in from high among the trees, curving down to stage
    const side = Math.random() < 0.5 ? -1 : 1;
    this.flightFrom = new THREE.Vector3(side * rand(6, 8.5), rand(5.2, 6.2), rand(-8, -5));
    this.flightMid = new THREE.Vector3(side * rand(2, 3.5), rand(3.2, 3.9), rand(-2, 0.5));
    const gy = this.groundHeight(this.pos.x, this.pos.y);
    // The magic must happen exactly where the animal will BE: the page
    // hovers and bursts at this species' mid-body height, so the creature
    // grows up into the very space the light occupies.
    const bodyMid = gy + (this.s.hover || 0) + this.s.height * 0.55;
    this.flightTo = new THREE.Vector3(this.pos.x, bodyMid, this.pos.y);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: introTextures().glow, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0,
    }));
    this.glow.scale.set(0.1, 0.1, 1);
    this.scene.add(this.glow);

    this.orbiters = [];
    this.trail = [];
    this.sparks = null;
    this.body.object3D.visible = false;
    this.shadow.visible = false;
    this.introT = 0;
    window.dispatchEvent(new CustomEvent('creature-arrival', {
      detail: { x: this.pos.x, z: this.pos.y, phase: 'flight' },
    }));
  }

  spawnDust(pos, tint, n, speed) {
    const T = introTextures();
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tint === 'leaf' ? T.leaf : T.glow, transparent: true, depthWrite: false,
        blending: tint === 'leaf' ? THREE.NormalBlending : THREE.AdditiveBlending,
        opacity: rand(0.5, 0.95),
        rotation: rand(0, TAU),
      }));
      const sc = tint === 'leaf' ? rand(0.09, 0.17) : rand(0.05, 0.2);
      sp.scale.set(sc, sc, 1);
      sp.position.copy(pos);
      sp.position.x += rand(-0.15, 0.15);
      sp.position.y += rand(-0.15, 0.15);
      sp.position.z += rand(-0.15, 0.15);
      const a = rand(0, TAU);
      sp.userData.vel = new THREE.Vector3(
        Math.cos(a) * rand(0.1, 1) * speed, rand(0.2, 1.2) * speed, Math.sin(a) * rand(0.1, 1) * speed);
      sp.userData.fade = rand(0.6, 1.3);
      sp.userData.spin = rand(-3, 3);
      this.trail.push(sp);
      this.scene.add(sp);
    }
  }

  updateIntro(dt, t) {
    this.introT += dt;
    const T = this.introT;
    const gy = this.groundHeight(this.pos.x, this.pos.y);
    const o = this.body.object3D;
    o.position.set(this.pos.x, o.position.y, this.pos.y);
    const P = this.pagePlane;

    // ---- phases 1+2 as ONE continuous motion ----
    // The flight eases into the hover through a half-second crossfade, and
    // every hover wobble starts at its zero-crossing, so there is no seam.
    const FLY_END = 2.6;
    if (P && T < 4.8) {
      const k = clamp(T / FLY_END, 0, 1);
      const e = k * k * k * (k * (k * 6 - 15) + 10); // smootherstep
      const q = 1 - e;
      const a2 = this.flightFrom, b2 = this.flightMid, c2 = this.flightTo;
      const wob = (1 - e) * (1 - e);
      const fx = q * q * a2.x + 2 * q * e * b2.x + e * e * c2.x + Math.sin(T * 2.3) * 0.1 * wob;
      const fy = q * q * a2.y + 2 * q * e * b2.y + e * e * c2.y + Math.sin(T * 3.1) * 0.07 * wob;
      const fz = q * q * a2.z + 2 * q * e * b2.z + e * e * c2.z;

      const hT = Math.max(0, T - FLY_END);
      const g = clamp(hT / 2.2, 0, 1);
      const hx = this.flightTo.x + Math.sin(hT * 1.3) * 0.05;
      const hy = this.flightTo.y + Math.sin(hT * 2.0) * 0.05 - g * g * 0.06;
      const hz = this.flightTo.z;

      const mixK = clamp((T - (FLY_END - 0.5)) / 0.5, 0, 1);
      const mix = mixK * mixK * (3 - 2 * mixK);
      P.position.set(fx + (hx - fx) * mix, fy + (hy - fy) * mix, fz + (hz - fz) * mix);

      // banking in flight eases into a gentle hover sway
      const frz = Math.sin(T * 2.1) * 0.15 * (1 - e * 0.6);
      const fry = Math.sin(T * 1.5) * 0.42 * (1 - e * 0.5);
      const frx = Math.sin(T * 2.9) * 0.1 * (1 - e * 0.4);
      const hrz = Math.sin(hT * 1.4) * 0.04;
      const hry = Math.sin(hT * 0.8) * 0.2;
      const hrx = Math.sin(hT * 1.1) * 0.05;
      P.rotation.set(frx + (hrx - frx) * mix, fry + (hry - fry) * mix, frz + (hrz - frz) * mix);

      // dust on the way in
      if (T < FLY_END && (this.lastDust || 0) < T - 0.07) {
        this.lastDust = T;
        this.spawnDust(P.position, 'glow', 1, 0.2);
      }

      // once hovering, the magic gathers
      if (hT > 0) {
        // paper flexes as energy takes hold - amplitude fades in with the mix
        const posA = P.geometry.attributes.position;
        const bend = (0.05 + g * 0.15) * mix;
        for (let i = 0; i < posA.count; i++) {
          const bx = this.pageBase[i * 3];
          posA.setZ(i, Math.sin(bx * 4.2 + T * 5) * bend * Math.abs(bx));
        }
        posA.needsUpdate = true;

        if (this.orbiters.length < 16 && Math.random() < g * 0.5) {
          const TX = introTextures();
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: TX.glow, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0,
            color: Math.random() < 0.5 ? 0xffe9a8 : 0xc0ffc8,
          }));
          const sc = rand(0.08, 0.18);
          sp.scale.set(sc, sc, 1);
          sp.userData.orbit = { a: rand(0, TAU), sp: rand(1.4, 2.6), r: rand(0.9, 1.3), y: rand(-0.4, 0.5), born: T };
          this.orbiters.push(sp);
          this.scene.add(sp);
        }
        for (const sp of this.orbiters) {
          const ob = sp.userData.orbit;
          ob.a += dt * ob.sp * (1 + g * 0.8);
          const r = ob.r * (1 - g * 0.68);
          sp.position.set(
            P.position.x + Math.cos(ob.a) * r,
            P.position.y + ob.y * (1 - g * 0.5) + Math.sin(ob.a * 2) * 0.07,
            P.position.z + Math.sin(ob.a) * r);
          // each light breathes in softly instead of popping
          sp.material.opacity = Math.min(0.9, sp.material.opacity + dt * 1.6);
        }

        this.glow.position.copy(P.position);
        const gs = 0.3 + g * g * 1.6 + Math.sin(T * 6) * 0.06 * g;
        this.glow.scale.set(gs, gs, 1);
        this.glow.material.opacity = g * g * 0.55;
      }
    }

    // ---- phase 3: the burst (4.8) ----
    if (T >= 4.8 && !this.sparks) {
      this.sparks = true;
      this.spawnDust(this.flightTo, 'glow', 26, 1.6);
      this.spawnDust(this.flightTo, 'leaf', 10, 1.1);
      for (const sp of this.orbiters) { this.scene.remove(sp); sp.material.dispose(); }
      this.orbiters = [];
      window.dispatchEvent(new CustomEvent('creature-arrival', {
        detail: { x: this.pos.x, z: this.pos.y, phase: 'burst' },
      }));
    }
    if (P && T >= 4.8) {
      const kr = clamp((T - 4.8) / 0.45, 0, 1);
      const k = kr * kr * (3 - 2 * kr);
      const sc = 1 - k * 0.96;
      P.scale.set(sc, sc, sc);
      P.material.opacity = 1 - k;
      this.glow.material.opacity = (1 - k) * 0.8;
      const ggs = 1.9 + k * 1.4;
      this.glow.scale.set(ggs, ggs, 1);
      if (k >= 1) {
        this.scene.remove(P);
        P.geometry.dispose();
        P.material.map.dispose();
        P.material.dispose();
        this.pagePlane = null;
        this.scene.remove(this.glow);
        this.glow.material.dispose();
        this.glow = null;
      }
    }

    // dust and leaves drift and fade throughout
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const sp = this.trail[i];
      sp.position.addScaledVector(sp.userData.vel, dt);
      sp.userData.vel.y -= 1.4 * dt;
      sp.material.rotation += sp.userData.spin * dt;
      sp.material.opacity -= dt / sp.userData.fade;
      if (sp.material.opacity <= 0) {
        this.scene.remove(sp);
        sp.material.dispose();
        this.trail.splice(i, 1);
      }
    }

    // ---- phase 4: the animal grows out of the light (4.95 ..) ----
    if (T >= 4.95) {
      if (!o.visible) {
        o.visible = true;
        this.shadow.visible = true;
        if (this.body.celebrate) this.body.celebrate();
      }
      const kr = clamp((T - 4.95) / 0.9, 0, 1);
      const k = kr * kr * kr * (kr * (kr * 6 - 15) + 10); // smootherstep
      const back = 1 + 0.08 * Math.sin(k * Math.PI);
      o.scale.setScalar((0.5 + 0.5 * k) * back);
      this.body.update(dt, {
        state: 'look', speed: 0, moving: false,
        groundY: gy, t, slope: 0, heading: this.heading,
      });
      this.shadow.position.set(this.pos.x, gy + 0.03, this.pos.y);
    }

    if (T >= 6.3 && this.trail.length === 0) {
      o.scale.setScalar(1);
      this.introT = -1;
      this.enterState('look'); // it looks around at its new world first
    }
  }

  // ---------- behaviour ----------
  enterState(name) {
    this.state = name;
    this.stateTime = 0;
    const cfg = this.s.states[name];
    this.stateDur = rand(cfg.dur[0], cfg.dur[1]);
    // A pause keeps the route it was walking, so the animal stops to look
    // around and then carries on where it left off instead of forgetting the
    // errand entirely. Only a finished trip clears the path.
    if (name === 'wander' && !this.path) this.chooseDestination();
  }

  nextState() {
    const table = this.s.states[this.state].next;
    let total = 0;
    for (const k in table) total += table[k];
    let r = Math.random() * total;
    for (const k in table) {
      r -= table[k];
      if (r <= 0) return this.enterState(k);
    }
    this.enterState('idle');
  }

  chooseDestination() {
    for (let tries = 0; tries < 6; tries++) {
      let dest = null;
      if (Math.random() < this.s.interestChance) dest = this.map.randomInterest();
      if (!dest) dest = this.map.randomOpen({ z: 2.5, spread: 6 });
      if (!dest) continue;
      // don't bother travelling somewhere we are already standing
      if (Math.hypot(dest.x - this.pos.x, dest.z - this.pos.y) < 1.4) continue;
      const path = this.map.findPath({ x: this.pos.x, z: this.pos.y }, dest);
      if (path && path.length > 1) {
        this.path = path;
        this.leg = 1; // path[0] is where we already are
        return;
      }
    }
    this.path = null;
    this.enterState('look'); // nowhere to go: have a look around instead
  }

  // Children's drawings must never stack up into an unreadable pile: nudge
  // each animal out of its neighbours' space. Fliers and walkers ignore each
  // other — they are at different heights.
  separate(dt, herd) {
    let px = 0, pz = 0;
    for (const o of herd) {
      if (o === this || !!o.s.flying !== !!this.s.flying) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.y - o.pos.y;
      // Room enough that neither hides the other on screen, not merely
      // enough that their feet do not touch: a tall animal standing near the
      // camera blots out a small one well behind it.
      const want = (this.s.radius + o.s.radius) * 1.7
        + Math.max(this.s.height, o.s.height) * 0.55;
      const d2 = dx * dx + dz * dz;
      if (d2 > want * want) continue;
      const d = Math.sqrt(d2) || 0.001;
      // deterministic tie-break, so two animals dead on top of each other
      // still part instead of jittering in place
      const ux = d2 < 1e-4 ? Math.cos(this.jitter) : dx / d;
      const uz = d2 < 1e-4 ? Math.sin(this.jitter) : dz / d;
      const push = (want - d) / want;
      px += ux * push; pz += uz * push;
    }
    if (!px && !pz) return;
    const k = Math.min(1.5, Math.hypot(px, pz)) * dt * 2.2;
    const nx = this.pos.x + px * k, nz = this.pos.y + pz * k;
    if (this.map.isOpen(nx, nz)) this.pos.set(nx, nz);
    else if (this.map.isOpen(nx, this.pos.y)) this.pos.x = nx;
    else if (this.map.isOpen(this.pos.x, nz)) this.pos.y = nz;
  }

  // Wedged against the edge of the world. Turn back toward the open middle,
  // step off the boundary, and go somewhere else.
  unstick() {
    const cx = 0, cz = 2.5;
    this.heading = Math.atan2(cx - this.pos.x, cz - this.pos.y);
    const safe = this.map.nearestOpen(
      this.pos.x + (cx - this.pos.x) * 0.15,
      this.pos.y + (cz - this.pos.y) * 0.15);
    if (safe) this.pos.set(safe.x, safe.z);
    this.path = null;
    this.enterState('wander');
  }

  // ---------- per frame ----------
  update(dt, t, herd) {
    if (this.introT >= 0) { this.updateIntro(dt, t); return; }
    this.stateTime += dt;

    // A drawn flower does not go anywhere. It just grows where it was put.
    if (this.s.rooted) {
      if (herd) this.separate(dt, herd);
      const gy0 = this.groundHeight(this.pos.x, this.pos.y);
      const o0 = this.body.object3D;
      o0.position.set(this.pos.x, gy0, this.pos.y);
      this.body.update(dt, {
        state: 'idle', speed: 0, moving: false,
        groundY: gy0, t, heading: this.heading, slope: 0,
      });
      this.shadow.position.set(this.pos.x, gy0 + 0.03, this.pos.y);
      return;
    }

    const moving = this.state === 'wander' && this.path;
    let target = null;
    if (moving) {
      target = this.path[this.leg];
      const d = Math.hypot(target.x - this.pos.x, target.z - this.pos.y);
      if (d < 0.35) {
        this.leg++;
        if (this.leg >= this.path.length) { this.path = null; this.nextState(); return; }
        target = this.path[this.leg];
      }
    }

    // steer: turn toward the target, and only commit to speed once facing it
    let wantSpeed = 0;
    if (target) {
      const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.y);
      const diff = shortestTurn(want - this.heading);
      const turn = clamp(diff, -this.s.turnRate * dt, this.s.turnRate * dt);
      this.heading += turn;
      const facing = Math.max(0, Math.cos(diff));
      wantSpeed = this.s.speed.walk * (0.25 + 0.75 * facing * facing);
    }
    this.speed += (wantSpeed - this.speed) * Math.min(1, dt * 4);

    // Move, sliding along anything solid rather than stopping dead. The path is
    // clear by construction, but a limited turn rate makes the animal arc off
    // it, and near the frame's diagonal edge that arc runs out of bounds.
    if (this.speed > 0.01) {
      const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.pos.y + Math.cos(this.heading) * this.speed * dt;
      if (this.map.isOpen(nx, nz)) this.pos.set(nx, nz);
      else if (this.map.isOpen(nx, this.pos.y)) this.pos.x = nx;
      else if (this.map.isOpen(this.pos.x, nz)) this.pos.y = nz;
    }

    if (herd) this.separate(dt, herd);

    // Wedged-in detector. Sliding handles a graze; this catches the corner
    // case where every direction it wants is solid and it would sit there
    // twitching for the rest of the event.
    this.sinceCheck += dt;
    if (this.sinceCheck >= 2.5) {
      const gone = Math.hypot(this.pos.x - this.lastCheck.x, this.pos.y - this.lastCheck.y);
      if (this.state === 'wander' && gone < 0.3) this.unstick();
      this.lastCheck.copy(this.pos);
      this.sinceCheck = 0;
    }

    // sit on the terrain, and lean with its slope
    const gy = this.groundHeight(this.pos.x, this.pos.y);
    const o = this.body.object3D;
    o.position.x = this.pos.x;
    o.position.z = this.pos.y;
    // A cut-out drawing turns itself: seen edge-on it would vanish, so it
    // flips to face the camera instead of yawing away. Solid bodies just point
    // where they are going.
    if (!this.body.ownsFacing) o.rotation.y = this.heading;

    const e = 0.35;
    const slopeF = (this.groundHeight(this.pos.x + Math.sin(this.heading) * e,
                                     this.pos.y + Math.cos(this.heading) * e) - gy) / e;
    if (!this.body.ownsFacing) o.rotation.z = 0;
    this.body.update(dt, {
      state: this.state, speed: this.speed, moving: this.speed > 0.15,
      groundY: gy, t, slope: slopeF, heading: this.heading,
    });
    // The terrain lean is the body's to apply, not ours. Mutating a rotation
    // the body also writes to means whichever of us assigns it last wins, and
    // any body that only reads it accumulates our nudge every frame until it
    // is face down in the ground.

    this.shadow.position.set(this.pos.x, gy + 0.03, this.pos.y);
    this.shadow.rotation.y = this.heading;
    const lift = clamp(o.position.y - gy, 0, 0.5);
    this.shadow.material.opacity = 0.32 * (1 - lift * 1.1);
    const spread = 1 + lift * 0.5;
    this.shadow.scale.set(spread, 1, spread);

    if (this.stateTime >= this.stateDur) this.nextState();
    else if (this.state === 'wander' && !this.path) this.nextState();
  }

  dispose() {
    if (this.pagePlane) { this.scene.remove(this.pagePlane); }
    if (this.sparks) { for (const sp of this.sparks) this.scene.remove(sp); }
    this.scene.remove(this.body.object3D);
    this.scene.remove(this.shadow);
    if (this.body.dispose) this.body.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}

// ============================================================
// MANAGER
// ============================================================

export class AnimalManager {
  constructor({ scene, map, groundHeight, max = 12 }) {
    this.scene = scene;
    this.map = map;
    this.groundHeight = groundHeight;
    this.max = max;
    this.animals = [];
  }

  // Spawn at the back of the clearing so the animal walks in rather than
  // popping into existence in front of the child.
  spawn(kind, opts = {}) {
    const s = resolveSpecies(kind);
    if (this.animals.length >= this.max) this.animals.shift().dispose();

    // A plant belongs in the open where it can be seen; everything else walks
    // in from the back rather than popping up in front of the child.
    // A fresh sending transforms in the open middle where everyone can see;
    // restored creatures walk in from the back as before.
    const band = s.rooted ? { z: 1.5, spread: 4 }
      : { z: this.map.zMin + 1.5, spread: 2.5 };
    const centreStage = opts.intro && !s.rooted;
    let entry = null;
    for (let tries = 0; tries < 12; tries++) {
      const cand = centreStage
        ? this.map.nearestOpen(rand(-1.8, 1.8), rand(2.0, 3.6))
        : this.map.randomOpen(band);
      if (!cand) continue;
      const clear = this.animals.every((o) =>
        Math.hypot(cand.x - o.pos.x, cand.z - o.pos.y)
          > (s.radius + o.s.radius) * 2.2 + Math.max(s.height, o.s.height) * 0.5);
      if (clear) { entry = cand; break; }
      if (!entry) entry = cand; // fall back to the first thing we found
    }
    entry = entry || this.map.randomOpen();
    if (!entry) return null;

    const body = opts.body ? opts.body(s) : new ProxyBody(s);
    const a = new Animal({
      species: s, body, map: this.map,
      groundHeight: this.groundHeight, scene: this.scene, at: entry,
      intro: opts.intro || null,
    });
    a.id = opts.id;
    this.animals.push(a);
    return a;
  }

  remove(id) {
    const i = this.animals.findIndex((a) => a.id === id);
    if (i >= 0) this.animals.splice(i, 1)[0].dispose();
  }

  clear() {
    for (const a of this.animals) a.dispose();
    this.animals.length = 0;
  }

  update(dt, t) {
    for (const a of this.animals) a.update(dt, t, this.animals);
  }
}

// soft elliptical blob, darkest at the middle
let _introTex = null;
function introTextures() {
  if (_introTex) return _introTex;
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 64;
  const g = glowC.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,250,222,1)');
  grad.addColorStop(0.4, 'rgba(255,236,170,0.65)');
  grad.addColorStop(1, 'rgba(255,236,170,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const leafC = document.createElement('canvas');
  leafC.width = leafC.height = 64;
  const lg = leafC.getContext('2d');
  lg.translate(32, 32);
  lg.rotate(0.6);
  const lgrad = lg.createLinearGradient(-20, 0, 20, 0);
  lgrad.addColorStop(0, '#4f9a55');
  lgrad.addColorStop(1, '#8fbe5e');
  lg.fillStyle = lgrad;
  lg.beginPath();
  lg.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2);
  lg.fill();
  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  _introTex = { glow: mk(glowC), leaf: mk(leafC) };
  return _introTex;
}

function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
