#!/usr/bin/env node
/**
 * Capturas y comprobaciones automáticas del juego con Chrome headless.
 *
 *   node tools/shot.mjs --out /tmp/shot.png            # carga y captura
 *   node tools/shot.mjs --script spin --out /tmp/a.png # ejecuta un guion
 *
 * Guiones disponibles: load, spin, tumble, buy, super, paytable, settings.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const url = arg('url', 'http://localhost:5173/');
const out = arg('out', '/tmp/shot.png');
const script = arg('script', 'load');
const width = Number(arg('width', 1440));
const height = Number(arg('height', 900));
const seed = arg('seed', '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    '--force-device-scale-factor=1',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
page.on('requestfailed', (request) => logs.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText}`));

await page.goto(seed ? `${url}?seed=${seed}` : url, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('document.getElementById("loader-play") && !document.getElementById("loader-play").hidden', {
  timeout: 45000,
});
await page.click('#loader-play');
await sleep(900);

const spin = async (waitMs = 5200) => {
  await page.click('#spin');
  await sleep(waitMs);
};

const waitIdle = async (timeout = 90000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const busy = await page.evaluate(() => document.getElementById('spin').classList.contains('is-busy'));
    if (!busy) return true;
    await sleep(400);
  }
  return false;
};

switch (script) {
  case 'spin':
    await spin();
    break;
  case 'tumble': {
    // Gira hasta encontrar una tirada con cascada visible.
    for (let i = 0; i < 14; i++) {
      await page.click('#spin');
      await sleep(2600);
      const caption = await page.evaluate(() => document.getElementById('win-value').textContent);
      if (caption && caption !== '0,00 $') break;
      await waitIdle(20000);
    }
    break;
  }
  case 'buy':
    await page.click('#buy-free');
    await sleep(Number(arg('wait', 12000)));
    break;
  case 'super':
    await page.click('#buy-super');
    await sleep(Number(arg('wait', 14000)));
    break;
  case 'paytable':
    await page.click('#btn-info');
    await sleep(700);
    break;
  case 'settings':
    await page.click('#btn-menu');
    await sleep(700);
    break;
  case 'auto':
    await page.click('#btn-auto');
    await sleep(600);
    break;
  default:
    break;
}

mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });

const state = await page.evaluate(() => ({
  balance: document.getElementById('meter-balance')?.textContent,
  bet: document.getElementById('meter-bet')?.textContent,
  win: document.getElementById('win-value')?.textContent,
  canvas: (() => {
    const canvas = document.querySelector('canvas');
    return canvas ? `${canvas.width}x${canvas.height}` : 'sin canvas';
  })(),
}));

console.log(JSON.stringify({ script, out, state }, null, 2));
if (logs.length) console.log('--- consola ---\n' + logs.join('\n'));
await browser.close();
