#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

async function serve(root, port) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
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

(async () => {
  const root = path.resolve(__dirname, '..');
  const port = 4174;
  const server = await serve(root, port);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', err => { throw err; });
    page.on('dialog', async dialog => { await dialog.accept(); });
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
    const home = await page.$eval('h1', el => el.textContent);
    assert.match(home, /See the company/);
    const cta = await page.$eval('a.btn.primary', el => el.getAttribute('href'));
    assert.equal(cta, 'app.html');
    await page.goto(`http://127.0.0.1:${port}/app.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#welcomeModal.open');
    await page.click('#welcomeSkip');
    await page.waitForFunction(() => !document.querySelector('#welcomeModal.open'));
    await page.waitForSelector('#chart .node');
    const brand = await page.$eval('#brandName', el => el.textContent);
    assert.equal(brand, 'Harbor & Co');
    const count = await page.$eval('#countVisible', el => el.textContent);
    assert.equal(count, '17');
    const dateFilter = await page.$eval('#dateFilter', el => el.checked);
    assert.equal(dateFilter, false);
    await page.click('#search');
    await page.type('#search', 'Maya Chen');
    await page.waitForSelector('#chart .node.search-hit');
    await page.click('#chart .node.search-hit');
    await page.waitForSelector('#drawer.open');
    const title = await page.$eval('#fTitle', el => el.value);
    assert.match(title, /Head of Product/);
    await page.click('#drawerClose');
    await page.click('#newScenarioBtn');
    await page.waitForSelector('#scenarioModal.open');
    await page.type('#scenarioName', 'Test proposal');
    await page.click('#scenarioSave');
    await page.waitForFunction(() => document.querySelector('#scenarioSelect')?.value !== 'current');
    await page.click('.plan-tabs [data-view="compare"]');
    await page.waitForSelector('#comparisonMetrics .metric');
    await page.click('#themeBtn');
    const theme = await page.$eval('html', el => el.dataset.theme);
    assert.equal(theme, 'dark');
    await page.click('#exampleNorthstarBtn');
    await page.waitForFunction(() => document.querySelector('#brandName')?.textContent === 'Northstar Commerce');
    const nCount = await page.$eval('#countVisible', el => el.textContent);
    assert.equal(nCount, '14');
    await page.click('.plan-tabs [data-view="chart"]');
    await page.waitForSelector('#roleChips .chip');
    await page.evaluate(() => {
      const head = [...document.querySelectorAll('#roleChips .chip')].find(b => b.dataset.value === 'Head');
      if (head && head.classList.contains('active')) head.click();
    });
    await page.waitForFunction(() => document.querySelector('#countVisible')?.textContent !== '14');
    await page.click('#exampleEmptyBtn');
    await page.waitForFunction(() => document.querySelector('#countVisible')?.textContent === '1');
    const emptyBrand = await page.$eval('#brandName', el => el.textContent);
    assert.equal(emptyBrand, 'OrgFlow');
    const headActive = await page.evaluate(() => [...document.querySelectorAll('#roleChips .chip')].find(b => b.dataset.value === 'Head')?.classList.contains('active'));
    assert.equal(headActive, true);
    await page.setViewport({ width: 390, height: 844 });
    await page.click('.plan-tabs [data-view="positions"]');
    await page.waitForSelector('#positionsPanel:not(.hidden)');
    const mobileFilters = await page.$eval('#filterToggle', el => {
      const r = el.getBoundingClientRect();
      return { display: getComputedStyle(el).display, visible: getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0 };
    });
    assert.equal(mobileFilters.visible, true, 'mobile Positions view should expose filters');
    console.log('browser smoke ok');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
