# 🌿 Digital Jungle

A kids' event attraction: children draw a creature on an iPad and watch it
come to life — walking, flying, or growing — in an animated jungle on a big
LED wall. Inspired by teamLab's Sketch Aquarium.

## Event-day setup (2 minutes)

1. Connect the laptop and the iPad(s) to the **same WiFi network**.
2. On the laptop:
   ```
   npm install   (first time only)
   npm start
   ```
   The console prints the two URLs, e.g.:
   ```
   LED wall display :  http://192.168.1.3:3000/wall
   iPad canvas      :  http://192.168.1.3:3000/draw
   ```
3. Open the **wall URL** in a browser on the machine driving the LED wall
   and press **F** for fullscreen.
4. Open the **draw URL** in Safari/Chrome on the iPad.
   (Tip: "Add to Home Screen" in Safari makes it a fullscreen app.)

That's it. Kids draw, pick whether their creature **🐾 Walks**, **🦋 Flies**,
or is a **🌿 Plant**, optionally type their name, and hit
**Send to the Jungle!**

## Wall controls

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen |
| `C` | Clear the whole jungle (asks for confirmation) |
| `H` | Hide/show the corner hint |

## How it behaves

Every ground-animal drawing is automatically **segmented into body parts**
by silhouette analysis — legs, ears, tail/trunk, torso — and each part is
animated on its own pivot: legs swing from the hip in an asymmetric,
speed-matched stride (alternating diagonal pairs with foot lift), ears
flop like springs against the body's motion, and tails wag as a 4-segment
whip chain (faster when excited, drooping in sleep). Drawings that can't
be segmented (blobs) fall back to whole-body motion.

Kids pick *how their creature moves*, and each archetype has its own gait,
body deformation and personality-driven behaviors with floating emotes:

- **🐯 Prowls** — cat-like walk in step impulses with scissoring legs,
  stops to sniff the ground, looks around (❓), gets excited (✨),
  sometimes naps (💤).
- **🐘 Stomps** — slow heavy lumber with a body roll; every footfall kicks
  up dust, and it occasionally rears back to trumpet (🎵).
- **🐰 Hops** — crouch → leap → land with squash-and-stretch, a parabolic
  arc, and a dust puff on landing; twitchy and alert between hops.
- **🐍 Slithers** — a traveling wave ripples through the drawing itself
  (sliced deformation), and it raises its head to look around.
- **🐦 Bird** — flaps in bursts then glides, banks into turns, lands on
  the ground to hop and peck, then takes off again.
- **🦋 Flutters** — jittery butterfly flight, and it perches to rest with
  wings slowly opening and closing.
- **🌿 Grows** — roots where it lands, sways in the breeze, shivers now
  and then.
- Ground animals that wander close to each other stop, turn face-to-face,
  and greet (❤️).
- Every creature gets a random tempo and energy, so no two move alike.
- Every creature spawns with a sparkle burst and a glowing halo, and shows
  the kid's name for a few seconds.
- The jungle holds up to **40 creatures**; when full, the oldest one fades
  away to make room.
- The jungle state lives in the server, so refreshing the wall page brings
  every creature back.
- Multiple iPads can draw at the same time — just open `/draw` on each.

## Tech

Plain Node.js + `ws` WebSocket relay ([server.js](server.js)), a real-time
**3D jungle** built with Three.js — procedural low-poly trees, sculpted
ground, fog, god rays, fireflies — where drawings live as paper-cutout
creatures in 3D space ([public/wall.js](public/wall.js)), and a touch-first
drawing app ([public/draw.js](public/draw.js)). Three.js is vendored in
[public/vendor/](public/vendor/) so the event needs no internet. No build step.

- `/wall` — the 3D jungle (needs WebGL, any modern PC browser is fine)
- `/wall2d` — the previous 2D canvas jungle, kept as a fallback
- `/wall#steady` skips spawn animations (useful for testing)
