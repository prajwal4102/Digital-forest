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
  '#1c1c1c', '#e63946', '#f4a261', '#ffd75e',
  '#7cb518', '#2a9d8f', '#219ebc', '#3a5bd9',
  '#8338ec', '#ff5da2', '#8d5a3a', '#ffffff',
];
const SIZES = [5, 12, 24, 44];

let color = COLORS[0];
let brushSize = SIZES[1];
let erasing = false;
let kind = 'prowler';
let drawing = false;
let hasInk = false;
let last = null;
let undoStack = [];
const UNDO_MAX = 12;

// ---------- toolbar ----------
function buildTools() {
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === color ? ' active' : '');
    b.style.background = c;
    if (c === '#ffffff') b.style.borderColor = 'rgba(0,0,0,.25)';
    b.onclick = () => {
      color = c;
      erasing = false;
      refreshTools();
    };
    b.dataset.color = c;
    toolsEl.appendChild(b);
  }
  const d1 = document.createElement('div');
  d1.className = 'divider';
  toolsEl.appendChild(d1);

  for (const s of SIZES) {
    const b = document.createElement('button');
    b.className = 'sizeBtn' + (s === brushSize ? ' active' : '');
    b.innerHTML = `<i style="width:${Math.min(30, s)}px;height:${Math.min(30, s)}px"></i>`;
    b.onclick = () => { brushSize = s; refreshTools(); };
    b.dataset.size = s;
    toolsEl.appendChild(b);
  }
  const d2 = document.createElement('div');
  d2.className = 'divider';
  toolsEl.appendChild(d2);

  const eraser = document.createElement('button');
  eraser.className = 'toolBtn';
  eraser.id = 'eraserBtn';
  eraser.textContent = '🧽';
  eraser.title = 'Eraser';
  eraser.onclick = () => { erasing = !erasing; refreshTools(); };
  toolsEl.appendChild(eraser);

  const undo = document.createElement('button');
  undo.className = 'toolBtn';
  undo.textContent = '↩️';
  undo.title = 'Undo';
  undo.onclick = doUndo;
  toolsEl.appendChild(undo);

  const trash = document.createElement('button');
  trash.className = 'toolBtn';
  trash.textContent = '🗑️';
  trash.title = 'Clear';
  trash.onclick = () => {
    if (!hasInk || confirm('Start over?')) clearPad();
  };
  toolsEl.appendChild(trash);
}

function refreshTools() {
  for (const b of toolsEl.querySelectorAll('.swatch')) {
    b.classList.toggle('active', !erasing && b.dataset.color === color);
  }
  for (const b of toolsEl.querySelectorAll('.sizeBtn')) {
    b.classList.toggle('active', Number(b.dataset.size) === brushSize);
  }
  document.getElementById('eraserBtn').classList.toggle('active', erasing);
}

// ---------- kind picker ----------
for (const b of document.querySelectorAll('.kindBtn')) {
  b.onclick = () => {
    document.querySelectorAll('.kindBtn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    kind = b.dataset.kind;
  };
}

// ---------- canvas ----------
function resizePad() {
  // Preserve current drawing across resize/rotation
  const prev = hasInk ? ctx.getImageData(0, 0, pad.width, pad.height) : null;
  const prevW = pad.width, prevH = pad.height;
  const r = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  pad.width = r.width * dpr;
  pad.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (prev) {
    const tmp = document.createElement('canvas');
    tmp.width = prevW; tmp.height = prevH;
    tmp.getContext('2d').putImageData(prev, 0, 0);
    ctx.drawImage(tmp, 0, 0, prevW, prevH, 0, 0, r.width, r.height);
  }
}

function padPos(e) {
  const r = pad.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function snapshot() {
  undoStack.push(ctx.getImageData(0, 0, pad.width, pad.height));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

function doUndo() {
  const snap = undoStack.pop();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pad.width, pad.height);
  if (snap) ctx.putImageData(snap, 0, 0);
  ctx.restore();
  if (undoStack.length === 0 && !snap) hasInk = false;
}

function clearPad() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pad.width, pad.height);
  ctx.restore();
  undoStack = [];
  hasInk = false;
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
  ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
  ctx.strokeStyle = color;
  ctx.lineWidth = erasing ? brushSize * 2.2 : brushSize;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x + 0.01, b.y + 0.01);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- export ----------
function exportCreature() {
  const w = pad.width, h = pad.height;
  const data = ctx.getImageData(0, 0, w, h).data;
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
  out.getContext('2d').drawImage(pad, minX, minY, bw, bh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// ---------- websocket ----------
let ws = null;
let wsReady = false;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    wsReady = true;
    connBadge.classList.remove('show');
    ws.send(JSON.stringify({ type: 'hello', role: 'draw' }));
  };
  ws.onclose = () => {
    wsReady = false;
    connBadge.classList.add('show');
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

// ---------- send ----------
const KIND_EMOJI = {
  prowler: '🐯', stomper: '🐘', hopper: '🐰', slitherer: '🐍',
  bird: '🐦', butterfly: '🦋', plant: '🌿',
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
    img,
  }));
  ovEmoji.textContent = KIND_EMOJI[kind];
  overlay.classList.add('show');
  setTimeout(() => {
    overlay.classList.remove('show');
    clearPad();
    nameInput.value = '';
    sendBtn.disabled = false;
  }, 2600);
});

// block iOS gestures interfering with drawing
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

buildTools();
window.addEventListener('resize', () => setTimeout(resizePad, 100));
resizePad();
connect();
