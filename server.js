// Digital Jungle — event server
// Serves the LED-wall display (/wall) and the iPad drawing canvas (/draw),
// and relays creatures between them over WebSocket.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_CREATURES = 40;

// In-memory jungle state — survives wall refreshes during the event.
let creatures = [];
let nextId = 1;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function lanIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];

  // Friendly routes
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/wall') urlPath = '/wall.html';
  if (urlPath === '/wall2d') urlPath = '/wall2d.html';
  if (urlPath === '/lab') urlPath = '/lab.html';
  if (urlPath === '/draw') urlPath = '/draw.html';

  if (urlPath === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ip: lanIP(), port: PORT, creatures: creatures.length }));
    return;
  }

  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^([\\/.])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 * 1024 });

function broadcast(msg, role) {
  const str = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && (!role || client.role === role)) {
      client.send(str);
    }
  }
}

wss.on('connection', (ws) => {
  ws.role = 'unknown';

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'hello':
        ws.role = msg.role === 'wall' ? 'wall' : 'draw';
        if (ws.role === 'wall') {
          ws.send(JSON.stringify({ type: 'init', creatures }));
        }
        break;

      case 'creature': {
        if (typeof msg.img !== 'string' || !msg.img.startsWith('data:image/png;base64,')) return;
        if (msg.img.length > 6 * 1024 * 1024) return;
        const creature = {
          id: nextId++,
          kind: ['prowler', 'stomper', 'hopper', 'slitherer', 'bird', 'butterfly', 'plant',
                 'walker', 'flyer'].includes(msg.kind) ? msg.kind : 'prowler',
          name: String(msg.name || '').slice(0, 24),
          img: msg.img,
          born: Date.now(),
        };
        creatures.push(creature);
        broadcast({ type: 'creature', creature }, 'wall');
        // Keep the jungle from overcrowding — oldest creature wanders off.
        while (creatures.length > MAX_CREATURES) {
          const old = creatures.shift();
          broadcast({ type: 'remove', id: old.id }, 'wall');
        }
        ws.send(JSON.stringify({ type: 'ack', id: creature.id, count: creatures.length }));
        console.log(`[jungle] +${creature.kind} "${creature.name || 'unnamed'}" (${creatures.length} alive)`);
        break;
      }

      case 'clear':
        creatures = [];
        broadcast({ type: 'clear' }, 'wall');
        console.log('[jungle] cleared');
        break;
    }
  });
});

server.listen(PORT, () => {
  const ip = lanIP();
  console.log('');
  console.log('  🌿 Digital Jungle is alive!');
  console.log('');
  console.log(`  LED wall display :  http://${ip}:${PORT}/wall`);
  console.log(`  iPad canvas      :  http://${ip}:${PORT}/draw`);
  console.log('');
  console.log('  (both devices must be on the same WiFi network)');
  console.log('');
});
