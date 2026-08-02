#!/usr/bin/env node
/**
 * Graba una secuencia de capturas mientras se juega, para revisar animaciones.
 *
 *   node tools/sequence.mjs --script buy --frames 40 --interval 450 --dir /tmp/seq
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const url = arg('url', 'http://localhost:5173/');
const dir = arg('dir', '/tmp/seq');
const script = arg('script', 'buy');
const frames = Number(arg('frames', 30));
const interval = Number(arg('interval', 500));
const width = Number(arg('width', 1440));
const height = Number(arg('height', 900));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(dir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('document.getElementById("loader-play") && !document.getElementById("loader-play").hidden');
await page.click('#loader-play');
await sleep(900);

if (script === 'buy') await page.click('#buy-free');
else if (script === 'super') await page.click('#buy-super');
else if (script === 'spin') await page.click('#spin');
else if (script === 'ante-spin') {
  await page.click('#ante-toggle');
  await page.click('#spin');
}

const snapshots = [];
for (let i = 0; i < frames; i++) {
  const label = String(i).padStart(3, '0');
  await page.screenshot({ path: `${dir}/frame-${label}.png` });
  const state = await page.evaluate(() => ({
    win: document.getElementById('win-value')?.textContent,
    label: document.getElementById('win-label')?.textContent,
    balance: document.getElementById('meter-balance')?.textContent,
    free: document.body.classList.contains('is-free'),
  }));
  snapshots.push({ frame: i, ...state });
  await sleep(interval);
}

writeFileSync(`${dir}/log.json`, JSON.stringify({ snapshots, logs }, null, 2));
console.log(
  snapshots
    .map((s) => `${String(s.frame).padStart(3)} ${s.free ? 'GRATIS' : '      '} ${s.label} ${s.win} · saldo ${s.balance}`)
    .join('\n'),
);
if (logs.length) console.log('--- consola ---\n' + logs.join('\n'));
await browser.close();
