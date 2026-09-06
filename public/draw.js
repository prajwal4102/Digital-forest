// Digital Jungle — iPad drawing canvas
// Kids draw with pointer/touch; the drawing is trimmed, exported as a
// transparent PNG and sent to the wall over WebSocket.

'use strict';

const pad = document.getElementById('pad');
const ctx = pad.getContext('2d', { willReadFrequently: true });
const wrap = document.getElementById('canvasWrap');
const sendBtn = document.getElementById('sendBtn');
const overlay = document.getElementById('overlay');
const ovEmoji = document.getElementById('ovEmoji');
const connBadge = document.getElementById('connBadge');
const nameInput = document.getElementById('name');
const toolsEl = document.getElementById('tools');

const COLORS = [
  '#1c1c1c', '#6c757d', '#ffffff', '#fde4cf',
  '#e63946', '#d00000', '#ff5da2', '#ff8fab',
  '#f4a261', '#ff7b00', '#ffd75e', '#fff3a0',
  '#7cb518', '#2d6a4f', '#2a9d8f', '#90e0c9',
  '#219ebc', '#3a5bd9', '#8ecae6', '#5e60ce',
  '#8338ec', '#c77dff', '#8d5a3a', '#5c4033',
];

// ---------- colouring templates ----------
// Each template is a photograph of the actual 3D animal the wall will use,
// so the colours land exactly where the child puts them. If the fetch fails
// (or a kind has no template, like the flower) the pad stays freehand.
const KIND_NAMES = {
  prowler: 'Fox', stomper: 'Bull', hopper: 'Rabbit', slitherer: 'Snake',
  bird: 'Chicken', butterfly: 'Bee', dog: 'Dog', deer: 'Deer',
  stag: 'Stag', horse: 'Horse', plant: 'Flower',
  toucan: 'Toucan', hawk: 'Hawk',
};
const KIND_ORDER = ['hopper', 'dog', 'prowler', 'deer', 'stag', 'horse',
  'stomper', 'bird', 'toucan', 'hawk', 'slitherer', 'butterfly', 'plant'];

let templates = null;      // kind -> {img, mask, w, h}
let tpl = null;            // the active template, or null for freehand
let tplRect = null;        // where the page sits on the pad, in CSS px

async function loadTemplates() {
  try {
    const idx = await (await fetch('templates/index.json')).json();
    const loaded = {};
    await Promise.all(Object.entries(idx).map(([k, t]) => new Promise((res) => {
      const img = new Image();
      const mask = new Image();
      let left = 2;
      const done = () => { if (--left === 0) { loaded[k] = { img, mask, w: t.w, h: t.h }; res(); } };
      img.onload = done; mask.onload = done;
      img.onerror = res; mask.onerror = res;
      img.src = 'templates/' + t.file;
      mask.src = 'templates/' + t.mask;
    })));
    templates = loaded;
    buildChooser();
    setKind(kind);
    showChooser();
  } catch (e) {
    console.warn('no colouring templates, staying freehand:', e);
    buildChooser();
  }
}

function setKind(k) {
  kind = k;
  tpl = (templates && templates[k]) || null;
  layoutTemplate();
  clearPad();
  document.getElementById('title').textContent =
    tpl ? '🎨 Colour your ' + (KIND_NAMES[k] || k) + '!' : '🎨 Draw your ' + (KIND_NAMES[k] || k) + '!';
}

// ---------- choose-your-animal gallery ----------
// A clear picture beats a word: each card shows the very page the child
// will colour.
function buildChooser() {
  const cards = document.getElementById('cards');
  cards.innerHTML = '';
  const idxFiles = templates || {};
  for (const k of KIND_ORDER) {
    const card = document.createElement('div');
    card.className = 'animalCard kindBtn';
    card.dataset.kind = k;
    if (idxFiles[k]) {
      const im = document.createElement('img');
      im.src = 'templates/' + k + '.png';
      card.appendChild(im);
    } else if (k === 'plant') {
      const em = document.createElement('div');
      em.className = 'cardEmoji';
      em.textContent = '🌸';
      card.appendChild(em);
    } else {
      continue; // no template and not the flower: don't offer it
    }
    const nm = document.createElement('div');
    nm.className = 'cardName';
    nm.textContent = KIND_NAMES[k] || k;
    card.appendChild(nm);
    card.onclick = () => {
      setKind(k);
      document.getElementById('chooser').classList.remove('show');
    };
    cards.appendChild(card);
  }
}

function showChooser() {
  document.getElementById('chooser').classList.add('show');
}

document.getElementById('backBtn').onclick = () => {
  if (hasInk && !confirm('Choose another animal? Your colouring starts over.')) return;
  showChooser();
};

function layoutTemplate() {
  if (!tpl) { tplRect = null; composite(); return; }
  const r = wrap.getBoundingClientRect();
  const m = 14; // page margin
  const availW = r.width - m * 2, availH = r.height - m * 2;
  const k = Math.min(availW / tpl.w, availH / tpl.h);
  const w = tpl.w * k, h = tpl.h * k;
  tplRect = { x: (r.width - w) / 2, y: (r.height - h) / 2, w, h };
  composite();
}

let color = COLORS[0];
let brushSize = 14;
let erasing = false;
let kind = 'prowler';
let drawing = false;
let hasInk = false;
let last = null;
let undoStack = [];
const UNDO_MAX = 12;

// ---------- toolbar ----------
let hue = 10; // the rainbow strip's current hue

function buildTools() {
  toolsEl.innerHTML = '';

  // quick swatches
  const sw = document.createElement('div');
  sw.id = 'swatches';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === color ? ' active' : '');
    b.style.background = c;
    if (c === '#ffffff' || c === '#fff3a0' || c === '#fde4cf') b.style.borderColor = 'rgba(0,0,0,.25)';
    b.onclick = () => {
      color = c;
      erasing = false;
      refreshTools();
    };
    b.dataset.color = c;
    sw.appendChild(b);
  }
  toolsEl.appendChild(sw);

  // every colour there is: a rainbow strip and a light-dark strip
  const row = document.createElement('div');
  row.id = 'pickerRow';
  const hueC = document.createElement('canvas');
  hueC.id = 'hueStrip';
  hueC.width = 30; hueC.height = 150;
  const shadeC = document.createElement('canvas');
  shadeC.id = 'shadeStrip';
  shadeC.width = 30; shadeC.height = 150;
  row.appendChild(hueC);
  row.appendChild(shadeC);
  toolsEl.appendChild(row);

  const paintHue = () => {
    const g = hueC.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 150);
    for (let i = 0; i <= 12; i++) grad.addColorStop(i / 12, 'hsl(' + (i * 30) + ',95%,55%)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 30, 150);
  };
  const paintShade = () => {
    const g = shadeC.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 150);
    grad.addColorStop(0, 'hsl(' + hue + ',90%,92%)');
    grad.addColorStop(0.5, 'hsl(' + hue + ',90%,52%)');
    grad.addColorStop(1, 'hsl(' + hue + ',90%,14%)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 30, 150);
  };
  paintHue();
  paintShade();
  const pickFrom = (cv, ev) => {
    const r = cv.getBoundingClientRect();
    const y = Math.max(0, Math.min(cv.height - 1, (ev.clientY - r.top) * (cv.height / r.height)));
    const d = cv.getContext('2d').getImageData(0, y, 1, 1).data;
    color = 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
    erasing = false;
    if (cv === hueC) { hue = Math.round((y / 150) * 360); paintShade(); }
    refreshTools();
  };
  for (const cv of [hueC, shadeC]) {
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      pickFrom(cv, e);
      const move = (e2) => pickFrom(cv, e2);
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', () => cv.removeEventListener('pointermove', move), { once: true });
    });
  }

  const d1 = document.createElement('div');
  d1.className = 'divider';
  toolsEl.appendChild(d1);

  // brush size: one smooth slider, previewed live
  const brushRow = document.createElement('div');
  brushRow.id = 'brushRow';
  const prevWrap = document.createElement('div');
  prevWrap.id = 'brushPreviewWrap';
  const prev = document.createElement('div');
  prev.id = 'brushPreview';
  prevWrap.appendChild(prev);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'brushSize';
  slider.min = 3; slider.max = 64; slider.value = brushSize;
  slider.oninput = () => { brushSize = Number(slider.value); refreshTools(); };
  brushRow.appendChild(prevWrap);
  brushRow.appendChild(slider);
  toolsEl.appendChild(brushRow);

  const d2 = document.createElement('div');
  d2.className = 'divider';
  toolsEl.appendChild(d2);

  const toolRow = document.createElement('div');
  toolRow.id = 'toolRow';
  const eraser = document.createElement('button');
  eraser.className = 'toolBtn';
  eraser.id = 'eraserBtn';
  eraser.textContent = '🧽';
  eraser.title = 'Eraser';
  eraser.onclick = () => { erasing = !erasing; refreshTools(); };
  toolRow.appendChild(eraser);

  const undo = document.createElement('button');
  undo.className = 'toolBtn';
  undo.textContent = '↩️';
  undo.title = 'Undo';
  undo.onclick = doUndo;
  toolRow.appendChild(undo);
  toolsEl.appendChild(toolRow);

  const trash = document.createElement('button');
  trash.className = 'toolBtn';
  trash.textContent = '🗑️';
  trash.title = 'Clear';
  trash.onclick = () => {
    if (!hasInk || confirm('Start over?')) clearPad();
  };
  toolRow.appendChild(trash);
}

function refreshTools() {
  for (const b of toolsEl.querySelectorAll('.swatch')) {
    b.classList.toggle('active', !erasing && b.dataset.color === color);
  }
  const prev = document.getElementById('brushPreview');
  if (prev) {
    const d = Math.max(6, Math.min(46, brushSize));
    prev.style.width = d + 'px';
    prev.style.height = d + 'px';
    prev.style.background = erasing ? '#fff' : color;
  }
  document.getElementById('eraserBtn').classList.toggle('active', erasing);
}

// (the animal picker lives in the chooser gallery, built after templates load)

// ---------- canvas ----------
const inkCv = document.createElement('canvas');   // the child's strokes
const inkCtx = inkCv.getContext('2d', { willReadFrequently: true });
const maskCv = document.createElement('canvas');  // scratch for clipping

function resizePad() {
  // Preserve current strokes across resize/rotation
  const prev = hasInk ? inkCtx.getImageData(0, 0, inkCv.width, inkCv.height) : null;
  const prevW = inkCv.width, prevH = inkCv.height;
  const r = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  pad.width = r.width * dpr;
  pad.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  inkCv.width = pad.width;
  inkCv.height = pad.height;
  maskCv.width = pad.width;
  maskCv.height = pad.height;
  inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  inkCtx.lineCap = 'round';
  inkCtx.lineJoin = 'round';
  if (prev) {
    const tmp = document.createElement('canvas');
    tmp.width = prevW; tmp.height = prevH;
    tmp.getContext('2d').putImageData(prev, 0, 0);
    inkCtx.save();
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.drawImage(tmp, 0, 0, prevW, prevH, 0, 0, inkCv.width, inkCv.height);
    inkCtx.restore();
  }
  layoutTemplate();
}

// paint the visible pad: strokes (clipped to the animal) with the template
// lines on top, where they can never be painted over
let paperFlying = false; // while the page rides the wind, the pad is empty

function composite() {
  const r = wrap.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  if (paperFlying) return; // the paper has left the pad
  if (!tpl || !tplRect) {
    ctx.drawImage(inkCv, 0, 0, r.width, r.height);
    return;
  }
  const mg = maskCv.getContext('2d');
  mg.save();
  mg.setTransform(1, 0, 0, 1, 0, 0);
  mg.clearRect(0, 0, maskCv.width, maskCv.height);
  mg.drawImage(inkCv, 0, 0);
  mg.restore();
  const dpr = pad.width / r.width;
  mg.save();
  mg.globalCompositeOperation = 'destination-in';
  mg.setTransform(dpr, 0, 0, dpr, 0, 0);
  mg.drawImage(tpl.mask, tplRect.x, tplRect.y, tplRect.w, tplRect.h);
  mg.restore();
  ctx.drawImage(maskCv, 0, 0, r.width, r.height);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(tpl.img, tplRect.x, tplRect.y, tplRect.w, tplRect.h);
  ctx.globalCompositeOperation = 'source-over';
}

function padPos(e) {
  const r = pad.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function snapshot() {
  undoStack.push(inkCtx.getImageData(0, 0, inkCv.width, inkCv.height));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

function doUndo() {
  const snap = undoStack.pop();
  inkCtx.save();
  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.clearRect(0, 0, inkCv.width, inkCv.height);
  if (snap) inkCtx.putImageData(snap, 0, 0);
  inkCtx.restore();
  if (undoStack.length === 0 && !snap) hasInk = false;
  composite();
}

function clearPad() {
  inkCtx.save();
  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.clearRect(0, 0, inkCv.width, inkCv.height);
  inkCtx.restore();
  undoStack = [];
  hasInk = false;
  composite();
}

pad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pad.setPointerCapture(e.pointerId);
  snapshot();
  drawing = true;
  hasInk = true;
  last = padPos(e);
  drawSeg(last, last);
});

pad.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  e.preventDefault();
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events) {
    const p = padPos(ev);
    drawSeg(last, p);
    last = p;
  }
});

function endStroke() { drawing = false; last = null; }
pad.addEventListener('pointerup', endStroke);
pad.addEventListener('pointercancel', endStroke);

function drawSeg(a, b) {
  inkCtx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
  inkCtx.strokeStyle = color;
  inkCtx.lineWidth = erasing ? brushSize * 2.2 : brushSize;
  inkCtx.beginPath();
  inkCtx.moveTo(a.x, a.y);
  inkCtx.lineTo(b.x + 0.01, b.y + 0.01);
  inkCtx.stroke();
  inkCtx.globalCompositeOperation = 'source-over';
  composite();
}

// ---------- export ----------
// Colouring mode: the sent image spans EXACTLY the template frame, because
// the wall projects it back through that same frame. Never crop it.
function exportColoring() {
  const outH = 512;
  const outW = Math.round(outH * tpl.w / tpl.h);
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const g = out.getContext('2d');
  // the animal's body: white paper wherever it is not coloured
  g.drawImage(tpl.mask, 0, 0, outW, outH);
  // the child's colours, kept inside the lines
  const dpr = pad.width / wrap.getBoundingClientRect().width;
  g.globalCompositeOperation = 'source-atop';
  g.drawImage(inkCv,
    tplRect.x * dpr, tplRect.y * dpr, tplRect.w * dpr, tplRect.h * dpr,
    0, 0, outW, outH);
  g.globalCompositeOperation = 'source-over';
  // The template lines stay OUT of the export on purpose: they are a guide
  // for colouring, not part of the artwork. The 3D animal supplies its own
  // form and face, and baked-on black lines read as dirt on its skin.
  return out.toDataURL('image/png');
}

function exportCreature() {
  if (tpl && tplRect) return exportColoring();
  const w = inkCv.width, h = inkCv.height;
  const data = inkCtx.getImageData(0, 0, w, h).data;
  // find bounding box of non-transparent pixels
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // empty
  if (maxX - minX < 25 && maxY - minY < 25) return null; // stray tap, not a drawing
  const pad2 = 6;
  minX = Math.max(0, minX - pad2); minY = Math.max(0, minY - pad2);
  maxX = Math.min(w - 1, maxX + pad2); maxY = Math.min(h - 1, maxY + pad2);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  // scale down so the largest side is <= 512
  const scale = Math.min(1, 512 / Math.max(bw, bh));
  const out = document.createElement('canvas');
  out.width = Math.round(bw * scale);
  out.height = Math.round(bh * scale);
  out.getContext('2d').drawImage(inkCv, minX, minY, bw, bh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// ---------- websocket ----------
let ws = null;
let wsReady = false;
// a served-restarted signal means this pad may be showing an outdated animal
// list: reload for fresh code (but never mid-drawing, and never in a loop)
let bootSeen = null;
let staleCode = false;
function checkBoot(boot) {
  if (!boot) return;
  if (bootSeen === null) { bootSeen = boot; return; }
  if (boot !== bootSeen) { staleCode = true; tryReload(); }
}
function tryReload() {
  if (!staleCode) return;
  const last = Number(sessionStorage.getItem('dj-reload-at') || 0);
  if (Date.now() - last < 20000) return; // never loop, whatever happens
  // only between children (animal chooser on screen): never yank a page out
  // of a child's hands mid-colouring
  const chooserUp = document.getElementById('chooser').classList.contains('show');
  if (!chooserUp || drawing || paperFlying) return;
  sessionStorage.setItem('dj-reload-at', String(Date.now()));
  location.reload();
}
setInterval(tryReload, 3000);
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    wsReady = true;
    connBadge.classList.remove('show');
    ws.send(JSON.stringify({ type: 'hello', role: 'draw' }));
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'welcome') checkBoot(msg.boot);
    } catch { /* not ours */ }
  };
  ws.onclose = () => {
    wsReady = false;
    connBadge.classList.add('show');
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

// ---------- the paper flies away ----------
// The exact page the child coloured lifts off the pad, sparkles swirl round
// it, the room dims, and the wind carries it off the top of the screen -
// where the jungle wall picks up the same paper flying in. One story.
function flyAwayPaper(done) {
  if (!tpl || !tplRect) { done(); return; }
  const padR = pad.getBoundingClientRect();
  const dpr = pad.width / padR.width;

  // snapshot the visible page exactly as the child sees it
  const snap = document.createElement('canvas');
  snap.width = Math.round(tplRect.w * dpr);
  snap.height = Math.round(tplRect.h * dpr);
  snap.getContext('2d').drawImage(pad,
    tplRect.x * dpr, tplRect.y * dpr, tplRect.w * dpr, tplRect.h * dpr,
    0, 0, snap.width, snap.height);

  // the dimming of the room
  const dim = document.createElement('div');
  dim.style.cssText = 'position:fixed;inset:0;background:rgba(3,24,15,0);' +
    'transition:background 0.7s ease;z-index:40;pointer-events:none;';
  document.body.appendChild(dim);

  // the paper itself
  const paper = document.createElement('img');
  paper.src = snap.toDataURL('image/png');
  const x0 = padR.left + tplRect.x, y0 = padR.top + tplRect.y;
  paper.style.cssText = 'position:fixed;left:' + x0 + 'px;top:' + y0 + 'px;' +
    'width:' + tplRect.w + 'px;height:' + tplRect.h + 'px;z-index:42;' +
    'pointer-events:none;will-change:transform;' +
    'filter:drop-shadow(0 6px 14px rgba(0,20,10,0.35));';
  document.body.appendChild(paper);

  // the sparkles
  const fx = document.createElement('canvas');
  fx.width = window.innerWidth;
  fx.height = window.innerHeight;
  fx.style.cssText = 'position:fixed;inset:0;z-index:43;pointer-events:none;';
  document.body.appendChild(fx);
  const fg = fx.getContext('2d');
  const motes = [];

  // the pad goes empty the instant the paper lifts: the page LEFT
  paperFlying = true;
  composite();

  const W = window.innerWidth, HH = window.innerHeight;
  const cx0 = x0 + tplRect.w / 2, cy0 = y0 + tplRect.h / 2;
  const DUR = 3.1;
  const sstep = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * v * (v * (v * 6 - 15) + 10); };

  // one continuous path: levitate, then a single bezier ride off-screen.
  // Rotation follows velocity like a real sheet of paper, smoothed.
  const P1 = { x: cx0 + W * 0.1, y: cy0 - HH * 0.3 };
  const P2 = { x: cx0 + W * 0.7, y: cy0 - HH * 1.05 };
  let last = null;
  let lastX = cx0, lastY = cy0, rotCur = 0;
  requestAnimationFrame(function tick(now) {
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const T = (now - start_) / 1000;

    // levitation eases in and simply persists; the wind ride eases in later,
    // so the two overlap instead of switching
    const lift = sstep(T / 0.95) * 26;
    const u = sstep((T - 0.7) / 2.0);
    const wobAmp = sstep(T / 0.5) * (1 - u);
    const q = 1 - u;
    const px = q * q * cx0 + 2 * q * u * P1.x + u * u * P2.x + Math.sin(T * 2.4) * 5 * wobAmp;
    const py = q * q * cy0 + 2 * q * u * P1.y + u * u * P2.y - lift
      + Math.sin(T * 3.1) * 3.5 * wobAmp;

    // bank into the motion, gently
    const vx = (px - lastX) / Math.max(dt, 1e-3);
    lastX = px; lastY = py;
    const rotTarget = Math.max(-16, Math.min(16, vx * 0.012)) + Math.sin(T * 2.0) * 1.6 * wobAmp;
    rotCur += (rotTarget - rotCur) * Math.min(1, dt * 5);
    const sc = 1 + 0.05 * sstep(T / 0.95) - 0.55 * u;

    paper.style.transform = 'translate3d(' + (px - cx0) + 'px,' + (py - cy0) + 'px,0) ' +
      'rotate(' + rotCur + 'deg) scale(' + sc + ')';

    // the room dims while the magic is closest, and breathes back
    const dimK = sstep(T / 0.7) * (1 - sstep((T - 2.2) / 0.8));
    dim.style.background = 'rgba(3,24,15,' + (0.42 * dimK).toFixed(3) + ')';

    // sparkles born at the paper's edges - real-dt so every screen agrees
    if (T < 2.5) {
      const born = (T < 0.9 ? 90 : 200) * dt;
      for (let i = 0; i < born || Math.random() < born % 1; i++) {
        if (i >= Math.floor(born) && Math.random() > born % 1) break;
        const a = Math.random() * Math.PI * 2;
        motes.push({
          x: px + Math.cos(a) * tplRect.w * 0.5 * sc,
          y: py + Math.sin(a) * tplRect.h * 0.5 * sc,
          vx: (Math.random() - 0.5) * 36 - u * 70,
          vy: -18 - Math.random() * 45,
          r: 1.5 + Math.random() * 3,
          life: 1,
        });
      }
    }
    fg.clearRect(0, 0, W, HH);
    for (let i = motes.length - 1; i >= 0; i--) {
      const m2 = motes[i];
      m2.x += m2.vx * dt;
      m2.y += m2.vy * dt;
      m2.life -= dt * 0.75;
      if (m2.life <= 0) { motes.splice(i, 1); continue; }
      fg.globalAlpha = m2.life;
      const grad = fg.createRadialGradient(m2.x, m2.y, 0, m2.x, m2.y, m2.r * 3);
      grad.addColorStop(0, 'rgba(255,244,190,0.95)');
      grad.addColorStop(1, 'rgba(255,244,190,0)');
      fg.fillStyle = grad;
      fg.beginPath();
      fg.arc(m2.x, m2.y, m2.r * 3, 0, Math.PI * 2);
      fg.fill();
    }
    fg.globalAlpha = 1;

    if (T < DUR || motes.length) {
      requestAnimationFrame(tick);
    } else {
      paper.remove();
      fx.remove();
      dim.remove();
      paperFlying = false;
      done();
    }
  });
  const start_ = performance.now();
}

// ---------- send ----------
const KIND_EMOJI = {
  prowler: '🦊', stomper: '🐂', hopper: '🐰', slitherer: '🐍',
  bird: '🐔', butterfly: '🐝', plant: '🌸',
  dog: '🐶', deer: '🦌', stag: '🫎', horse: '🐴',
};

sendBtn.addEventListener('click', () => {
  if (!hasInk) {
    sendBtn.textContent = '✏️ Draw something first!';
    setTimeout(() => { sendBtn.textContent = '🌿 Send to the Jungle! 🌿'; }, 1500);
    return;
  }
  const img = exportCreature();
  if (!img) {
    sendBtn.textContent = '✏️ Draw a bit more first!';
    setTimeout(() => { sendBtn.textContent = '🌿 Send to the Jungle! 🌿'; }, 1500);
    return;
  }
  if (!wsReady) {
    connBadge.classList.add('show');
    return;
  }
  sendBtn.disabled = true;
  ws.send(JSON.stringify({
    type: 'creature',
    kind,
    name: nameInput.value.trim(),
    mode: tpl && tplRect ? 'color' : 'draw',
    img,
  }));
  if (tpl && tplRect) {
    flyAwayPaper(() => {
      clearPad();
      nameInput.value = '';
      sendBtn.disabled = false;
      showChooser(); // ready for the next child
    });
  } else {
    ovEmoji.textContent = KIND_EMOJI[kind];
    overlay.classList.add('show');
    setTimeout(() => {
      overlay.classList.remove('show');
      clearPad();
      nameInput.value = '';
      sendBtn.disabled = false;
    }, 2600);
  }
});

// block iOS gestures interfering with drawing
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

buildTools();
window.addEventListener('resize', () => setTimeout(resizePad, 100));
resizePad();
connect();
loadTemplates();
