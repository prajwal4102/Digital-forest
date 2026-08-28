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

export const SPECIES = {
  rabbit: {
    label: 'rabbit',
    // Storybook scale, not zoological: on a wall-sized display a true-to-life
    // 35cm rabbit reads as a speck. Tune here, nowhere else.
    height: 1.15,
    radius: 0.34,
    speed: { walk: 1.15, run: 2.6 },
    turnRate: 3.4,        // radians/sec
    gait: 'hop',
    hopRate: 2.6,
    hopHeight: 0.17,
    // how long each mood lasts, and what tends to follow it
    states: {
      idle:   { dur: [1.0, 2.4], next: { wander: 5, look: 4, sniff: 4, rest: 2 } },
      look:   { dur: [1.5, 3.0], next: { wander: 5, sniff: 3, idle: 3 } },
      sniff:  { dur: [1.4, 2.8], next: { wander: 5, idle: 3, look: 3 } },
      wander: { dur: [2.5, 5.0], next: { idle: 5, look: 4, sniff: 5, wander: 2 } },
      rest:   { dur: [3.0, 5.5], next: { idle: 4, look: 2 } },
    },
    start: 'wander',
    interestChance: 0.65, // how often a trip targets something interesting
  },
};

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
      this.phase += dt * s.hopRate * (0.55 + ctx.speed / s.speed.walk * 0.45);
      const bounce = Math.abs(Math.sin(this.phase));
      this.object3D.position.y = ctx.groundY + bounce * s.hopHeight;
      // nose down on the way up, level on landing
      this.object3D.rotation.x = -Math.cos(this.phase * 2) * 0.07;
    } else {
      this.phase += dt * 0.9;
      this.object3D.position.y = ctx.groundY + Math.sin(this.phase) * 0.008;
      this.object3D.rotation.x *= 0.9;
    }

    // ears react: pinned back at speed, upright and twitching at rest
    const alert = ctx.state === 'look' || ctx.state === 'sniff' ? 1 : 0;
    for (let i = 0; i < this.ears.length; i++) {
      const side = i === 0 ? -1 : 1;
      const lean = ctx.moving ? -0.35 * (ctx.speed / s.speed.run) : 0;
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
  constructor({ species, body, map, groundHeight, scene, at }) {
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
  update(dt, t) {
    this.stateTime += dt;

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
    o.rotation.y = this.heading;

    const e = 0.35;
    const slopeF = (this.groundHeight(this.pos.x + Math.sin(this.heading) * e,
                                     this.pos.y + Math.cos(this.heading) * e) - gy) / e;
    o.rotation.z = 0;
    this.body.update(dt, {
      state: this.state, speed: this.speed, moving: this.speed > 0.15,
      groundY: gy, t, slope: slopeF,
    });
    o.rotation.x -= clamp(slopeF, -0.5, 0.5) * 0.5;

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
    this.scene.remove(this.body.object3D);
    this.scene.remove(this.shadow);
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
  spawn(speciesName, bodyFactory) {
    const s = SPECIES[speciesName];
    if (!s) throw new Error('unknown species: ' + speciesName);
    if (this.animals.length >= this.max) this.animals.shift().dispose();

    const entry = this.map.randomOpen({ z: this.map.zMin + 1.5, spread: 2.5 })
      || this.map.randomOpen();
    if (!entry) return null;

    const body = (bodyFactory || ((sp) => new ProxyBody(sp)))(s);
    const a = new Animal({
      species: s, body, map: this.map,
      groundHeight: this.groundHeight, scene: this.scene, at: entry,
    });
    this.animals.push(a);
    return a;
  }

  update(dt, t) {
    for (const a of this.animals) a.update(dt, t);
  }
}

// soft elliptical blob, darkest at the middle
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
