// Regenerate the colouring templates: run with the server up
//   node tools/gen-templates.js
// Renders each roster model side-on (public/template-gen.html does the work)
// and writes public/templates/*.png + index.json. Rerun whenever a model or
// its species height changes, or the colours will land misaligned.
const fs = require('fs');
const path = require('path');
const puppeteer = require('c:/Users/prajw/Desktop/Digital forest/node_modules/puppeteer-core');

const OUT = 'c:/Users/prajw/Desktop/Digital forest/public/templates';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    protocolTimeout: 600000, headless: 'new',
    args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1200,900'],
    defaultViewport: { width: 1200, height: 900 },
  });
  const page = await b.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { const t = m.text(); if (!t.includes('404') && !t.includes('GL Driver') && !t.includes('deprecat')) console.log(m.type().toUpperCase() + ':', t.slice(0, 200)); });
  await page.goto('http://localhost:3000/template-gen.html', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('!!window.RESULT', { timeout: 300000 });
  const res = await page.evaluate(() => window.RESULT);
  await b.close();
  if (res.error) { console.error('generator failed:', res.error); process.exit(1); }

  const index = {};
  for (const [kind, t] of Object.entries(res)) {
    fs.writeFileSync(path.join(OUT, kind + '.png'),
      Buffer.from(t.template.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT, kind + '.mask.png'),
      Buffer.from(t.mask.split(',')[1], 'base64'));
    index[kind] = { file: kind + '.png', mask: kind + '.mask.png', w: t.w, h: t.h, box: t.box, title: t.title };
    console.log(kind, t.w + 'x' + t.h, JSON.stringify(t.box));
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  console.log('templates written:', Object.keys(index).join(', '));
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
