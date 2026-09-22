#!/usr/bin/env node
'use strict';
/* global document, localStorage, openWelcome */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

async function main() {
  const puppeteer = require('puppeteer-core');
  const root = path.resolve(__dirname, '..');
  const port = 4173;
  const server = await serve(root, port);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--window-size=1440,900`]
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    page.on('dialog', async dialog => { await dialog.accept(); });
    await page.goto(`http://127.0.0.1:${port}/app.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' });
    const welcome = await page.$('#welcomeModal.open');
    if (welcome) {
      await page.click('#welcomeSkip');
      await page.waitForFunction(() => !document.querySelector('#welcomeModal.open'));
    }
    await captureCompany(page, 'harbor-and-co');
    await page.evaluate(() => openWelcome(true)); // Templates live on the Start page.
    await page.click('#exampleNorthstarBtn');
    await page.waitForFunction(() => document.querySelector('#brandName')?.textContent.includes('Northstar'));
    await new Promise(r => setTimeout(r, 2300));
    await captureCompany(page, 'northstar-commerce');
  } finally {
    await browser.close();
    server.close();
  }
}

async function captureCompany(page, folder) {
  await page.click('#resetFilters');
  await page.waitForSelector('#chart .node');
  await page.click('#depthSeg [data-depth="3"]');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#centerBtn');
  await new Promise(r => setTimeout(r, 500));
  const dest = path.join(__dirname, '..', 'examples', folder);
  await page.screenshot({ path: path.join(dest, 'chart.png'), fullPage: false });
  await page.click('.plan-tabs [data-view="positions"]');
  await page.waitForSelector('#positionsRows tr');
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(dest, 'positions.png') });
  await page.click('.plan-tabs [data-view="compare"]');
  await page.waitForSelector('#comparisonRows tr');
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(dest, 'compare.png') });
  await page.click('.plan-tabs [data-view="chart"]');
  await page.waitForSelector('#chart .node');
  console.log('captured', folder);
}

function serve(root, port) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json'
  };
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
