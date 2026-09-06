// Digital Jungle — the operator's console
// A live roster of every creature in the jungle. From here a person can
// summon an animal to the front of the stage (it hurries in, faces the
// audience and celebrates — also how a wanderer lost in the hidden forest is
// brought back), make it emote where it stands, delete one, or clear the lot.

'use strict';

const grid = document.getElementById('grid');
const emptyMsg = document.getElementById('empty');
const countEl = document.getElementById('count');
const connBadge = document.getElementById('connBadge');

const KIND_NAMES = {
  prowler: 'Fox', stomper: 'Bull', hopper: 'Rabbit', slitherer: 'Snake',
  bird: 'Chicken', butterfly: 'Bee', dog: 'Dog', deer: 'Deer',
  stag: 'Stag', horse: 'Horse', plant: 'Flower',
  toucan: 'Toucan', hawk: 'Hawk', walker: 'Walker', flyer: 'Flyer',
};

let creatures = []; // {id, kind, name, img, born}

function ago(born) {
  const m = Math.max(0, Math.round((Date.now() - born) / 60000));
  return m < 1 ? 'just now' : m + ' min';
}

function render() {
  grid.innerHTML = '';
  countEl.textContent = creatures.length + (creatures.length === 1 ? ' creature' : ' creatures');
  emptyMsg.hidden = creatures.length > 0;
  for (const c of creatures) {
    const card = document.createElement('div');
    card.className = 'card';

    const tw = document.createElement('div');
    tw.className = 'thumbWrap';
    const im = document.createElement('img');
    im.src = c.img;
    tw.appendChild(im);
    card.appendChild(tw);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<span class="nm"></span><span class="kd"></span><span class="ago"></span>';
    meta.querySelector('.nm').textContent = c.name || 'unnamed';
    meta.querySelector('.kd').textContent = KIND_NAMES[c.kind] || c.kind;
    meta.querySelector('.ago').textContent = ago(c.born);
    card.appendChild(meta);

    const row = document.createElement('div');
    row.className = 'row';
    const mkBtn = (cls, label, fn) => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.onclick = fn;
      row.appendChild(b);
    };
    mkBtn('summon', '📣 To stage', () => send({ type: 'admin', op: 'summon', id: c.id }));
    mkBtn('emote', '🎉 Emote', () => send({ type: 'admin', op: 'emote', id: c.id }));
    mkBtn('del', '🗑', () => {
      if (confirm('Delete ' + (c.name || KIND_NAMES[c.kind] || c.kind) + ' from the jungle for good?')) {
        send({ type: 'admin', op: 'remove', id: c.id });
      }
    });
    card.appendChild(row);
    grid.appendChild(card);
  }
}
setInterval(() => { // keep the "x min" labels honest
  for (const el of grid.querySelectorAll('.card')) el.remove();
  render();
}, 60000);

// ---------- websocket ----------
let ws = null;
let bootSeen = null;
function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    connBadge.classList.remove('show');
    ws.send(JSON.stringify({ type: 'hello', role: 'admin' }));
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'welcome') {
      // the console holds no local state worth keeping: a restarted server
      // (new boot id) simply means reload for fresh code
      if (bootSeen === null) bootSeen = msg.boot;
      else if (msg.boot !== bootSeen) location.reload();
    } else if (msg.type === 'init') { creatures = msg.creatures.slice(); render(); }
    else if (msg.type === 'creature') { creatures.push(msg.creature); render(); }
    else if (msg.type === 'remove') { creatures = creatures.filter((c) => c.id !== msg.id); render(); }
    else if (msg.type === 'clear') { creatures = []; render(); }
  };
  ws.onclose = () => {
    connBadge.classList.add('show');
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}
connect();

document.getElementById('clearBtn').onclick = () => {
  if (confirm('Remove EVERY creature from the jungle?')
    && confirm('Really? This cannot be undone.')) {
    send({ type: 'clear' });
  }
};
