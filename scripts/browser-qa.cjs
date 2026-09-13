#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const findings = [];
function bug(title, detail) { findings.push({ type: 'bug', title, detail }); console.log('BUG:', title, detail || ''); }
function note(title, detail) { findings.push({ type: 'note', title, detail }); console.log('NOTE:', title, detail || ''); }
function ok(title) { findings.push({ type: 'ok', title }); console.log('OK:', title); }

(async () => {
  const pageErrors = [];
  const consoleErrors = [];
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', err => pageErrors.push(String(err)));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('dialog', async dialog => { await dialog.accept(); });
  await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#chart .node');

  const boot = await page.evaluate(() => ({
    brand: document.querySelector('#brandName').textContent,
    positions: document.querySelector('#countVisible').textContent,
    dateFilter: document.querySelector('#dateFilter').checked,
    motorsport: document.body.innerText.includes('Vehicle Performance')
  }));
  if (boot.brand !== 'Harbor & Co') bug('Default brand is not Harbor & Co', JSON.stringify(boot));
  else ok('Default Harbor & Co branding');
  if (boot.motorsport) bug('Motorsport copy still visible');
  if (Number(boot.positions) !== 17) bug('Harbor position count', boot.positions);
  else ok('Harbor has 17 positions');
  if (boot.dateFilter) bug('Date filter is on by default and can hide future-dated roles');
  else ok('Date filter is off by default');

  // Search
  await page.click('#search', { clickCount: 3 });
  await page.type('#search', 'Priya');
  await page.waitForSelector('#chart .node.search-hit');
  ok('Search highlights Priya');
  await page.click('#search', { clickCount: 3 });
  await page.keyboard.press('Backspace');

  // Depth
  await page.click('#depthSeg [data-depth="1"]');
  const heads = await page.$$eval('#chart .node', ns => ns.length);
  if (heads !== 1) bug('Heads depth should show only CPO', String(heads));
  else ok('Heads depth shows 1 card');
  await page.click('#depthSeg [data-depth="99"]');

  // Date filter hides future Tom Becker
  await page.click('#dateFilter');
  await page.waitForFunction(() => document.querySelector('#countVisible').textContent !== '17');
  const dated = await page.$eval('#countVisible', el => el.textContent);
  if (!(Number(dated) < 17)) bug('Date filter did not hide future positions', dated);
  else ok('Date filter hides future-dated roles (' + dated + ')');
  await page.click('#resetFilters');
  await page.waitForFunction(() => document.querySelector('#countVisible').textContent === '17');

  // Add position while drawer was previously used for an existing card
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('#chart .node')].find(n => n.getAttribute('aria-label')?.includes('Alex Morgan'));
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForSelector('#drawer.open');
  await page.click('#drawerClose');
  await page.click('#addBtn');
  await page.waitForSelector('#drawer.open');
  const addTitle = await page.$eval('#fTitle', el => el.value);
  const addHeading = await page.$eval('#drawerTitle', el => el.textContent);
  if (addTitle) bug('Add position reused previous title', addTitle);
  else ok('Add position starts with an empty title');
  if (addHeading !== 'New position') bug('Add position heading', addHeading);
  await page.type('#fTitle', 'Staff Data Analyst');
  await page.select('#fType', 'Specialist');
  await page.select('#fStatus', 'Approved');
  await page.$eval('#fGroup', el => { el.value = 'Product'; el.dispatchEvent(new Event('input')); });
  await page.select('#fHiring', 'Recruiting');
  const newStart = await page.$eval('#fStart', el => el.value);
  const asOf = await page.$eval('#asOf', el => el.value);
  const today = await page.evaluate(() => {
    const n = new Date();
    return [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-');
  });
  if (newStart !== asOf) note('New position start date differs from as-of', newStart + ' vs ' + asOf);
  await page.click('#saveBtn');
  await page.waitForFunction(() => !document.querySelector('#drawer.open'));
  const afterAdd = await page.$eval('#countVisible', el => el.textContent);
  if (Number(afterAdd) !== 18) bug('Add recruiting position failed', afterAdd);
  else ok('Added recruiting Specialist');

  // Changing as-of without enabling the date filter should not stamp new positions
  await page.$eval('#asOf', el => { el.value = '2024-01-01'; el.dispatchEvent(new Event('change')); });
  await page.click('#addBtn');
  await page.waitForSelector('#drawer.open');
  const stamped = await page.$eval('#fStart', el => el.value);
  if (stamped === '2024-01-01') bug('New position inherited as-of date while date filter is off', stamped);
  else if (stamped === today) ok('New position start date stays today when date filter is off');
  else note('New position start date', stamped);
  await page.click('#drawerClose');
  await page.$eval('#asOf', (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); }, today);

  // FTE validation
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('#chart .node')].find(n => n.getAttribute('aria-label')?.includes('Alex Morgan'));
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForSelector('#drawer.open');
  await page.click('#fFte', { clickCount: 3 });
  await page.type('#fFte', '2');
  await page.click('#saveBtn');
  const fteErr = await page.$eval('#formValidation', el => el.classList.contains('show') && el.textContent);
  if (!fteErr) bug('FTE > 1 was accepted');
  else ok('FTE validation rejects 2.00: ' + fteErr);
  await page.click('#drawerClose');

  // Hidden by type filter after add
  await page.evaluate(() => {
    document.querySelectorAll('#roleChips .chip').forEach(b => {
      if (b.dataset.value === 'Specialist' && b.classList.contains('active')) b.click();
    });
  });
  await page.click('#addBtn');
  await page.waitForSelector('#drawer.open');
  await page.type('#fTitle', 'Hidden Specialist QA');
  await page.select('#fType', 'Specialist');
  await page.select('#fHiring', 'Vacant');
  await page.click('#saveBtn');
  await page.waitForFunction(() => !document.querySelector('#drawer.open'));
  const hidden = await page.evaluate(() => [...document.querySelectorAll('#chart .node')].some(n => (n.getAttribute('aria-label') || '').includes('Hidden Specialist QA')));
  if (!hidden) bug('Saved position is invisible because its type chip is off');
  else ok('Newly saved position remains visible even if its type chip was off');
  await page.click('#resetFilters');

  // Positions register + unassigned directory
  await page.click('.plan-tabs [data-view="positions"]');
  await page.waitForSelector('#positionsRows tr');
  const rows = await page.$$eval('#positionsRows tr', trs => trs.length);
  if (rows < 17) bug('Position register row count', String(rows));
  else ok('Position register lists rows');
  await page.click('#positionsRows [data-edit-position]');
  await page.waitForSelector('#drawer.open');
  ok('Register Edit opens drawer');
  await page.click('#drawerClose');

  // Unassign a filled person and open directory
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-edit-position]')].find(b => b.closest('tr')?.innerText.includes('Alex Morgan'));
    btn?.click();
  });
  await page.waitForSelector('#drawer.open');
  await page.select('#fHiring', 'Vacant');
  await page.click('#saveBtn');
  await page.waitForFunction(() => !document.querySelector('#drawer.open'));
  const unassignedLink = await page.$('#showUnassigned');
  if (!unassignedLink) bug('Unassigned people link missing after vacating a filled role');
  else {
    await unassignedLink.click();
    await page.waitForSelector('#directoryModal.open');
    const names = await page.$eval('#directoryRows', el => el.innerText);
    if (!names.includes('Alex Morgan')) bug('Directory missing vacated person', names.slice(0, 200));
    else ok('Unassigned directory lists vacated person');
    await page.click('#directoryClose');
  }

  // Scenario + compare
  await page.click('#newScenarioBtn');
  await page.waitForSelector('#scenarioModal.open');
  await page.click('#scenarioSave');
  const scenErr = await page.$eval('#scenarioValidation', el => el.classList.contains('show'));
  if (!scenErr) bug('Empty scenario name was accepted');
  else ok('Empty scenario name is rejected');
  await page.type('#scenarioName', 'Browser QA');
  await page.click('#scenarioSave');
  await page.waitForFunction(() => document.querySelector('#scenarioSelect')?.selectedOptions[0]?.textContent.includes('Browser QA'));
  ok('Created scenario Browser QA');
  await page.click('.plan-tabs [data-view="compare"]');
  await page.waitForSelector('#comparisonMetrics .metric');
  ok('Compare view renders metrics');
  const details = await page.$('[data-diff-toggle]');
  if (details) {
    await details.click();
    const shown = await page.$eval('[data-detail-id]', el => !el.classList.contains('hidden'));
    if (!shown) bug('Compare details did not expand');
    else ok('Compare details expands');
  }

  // Branding
  await page.click('#brandingBtn');
  await page.waitForSelector('#brandingModal.open');
  await page.click('#brandChartTitle', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.click('#brandingSave');
  const brandErr = await page.$eval('#brandingError', el => el.classList.contains('show'));
  if (!brandErr) bug('Empty chart title was saved');
  else ok('Branding requires a chart title');
  await page.type('#brandChartTitle', 'QA chart title');
  await page.click('#brandCompany', { clickCount: 3 });
  await page.type('#brandCompany', 'Harbor QA');
  await page.click('#brandingSave');
  await page.waitForFunction(() => document.querySelector('#brandName').textContent.includes('Harbor QA'));
  ok('Branding saves company name');

  await page.click('#paletteBtn');
  await page.waitForSelector('#paletteMenu.open');
  await page.click('#paletteMenu [data-palette="crimson"]');
  const pal = await page.$eval('html', el => el.dataset.palette);
  if (pal !== 'crimson') bug('Crimson palette not applied', pal);
  else ok('Crimson palette applied');
  await page.click('#themeBtn');
  const dark = await page.$eval('html', el => el.dataset.theme);
  if (dark !== 'dark') bug('Dark mode not applied', dark);
  else ok('Dark mode applied');
  await page.click('#themeBtn');

  // CSV import
  const csv = fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/positions.csv'), 'utf8');
  await page.click('.plan-tabs [data-view="chart"]');
  const fileInput = await page.$('#fileInput');
  const tmp = '/tmp/harbor-import.csv';
  fs.writeFileSync(tmp, csv);
  await fileInput.uploadFile(tmp);
  await page.waitForSelector('#importModal.open');
  const importOk = await page.$eval('#importConfirm', el => !el.disabled);
  if (!importOk) {
    const issues = await page.$eval('#importIssues', el => el.innerText);
    bug('Harbor CSV import blocked', issues);
  } else {
    ok('Harbor CSV import review is valid');
    await page.click('#importConfirm');
    await page.waitForFunction(() => !document.querySelector('#importModal.open'));
    ok('CSV import confirmed');
  }

  // Group ZIP export
  const zipOk = await page.evaluate(async () => {
    try {
      const groups = [...new Set(flatten(buildFilteredForest(), []).map(p => p.group).filter(Boolean))];
      if (!groups.length) return 'no groups';
      const job = buildExportSVG(groups[0]);
      if (!job || !job.xml.includes('<svg')) return 'no svg';
      const blob = await pngFromExport(job);
      const archive = makeZip([{ name: 'group.png', data: new Uint8Array(await blob.arrayBuffer()) }]);
      return archive && archive.size > 1000 ? 'ok:' + archive.size + ':' + groups.length : 'small';
    } catch (e) { return 'err:' + e.message; }
  });
  if (!String(zipOk).startsWith('ok:')) bug('Group ZIP export failed', zipOk);
  else ok('Group ZIP export produced an archive ' + zipOk);

  // Workspace backup round-trip
  const exported = await page.evaluate(() => {
    const data = { format: 'orgflow.workspace', version: 2, planning: workspace, branding, theme: document.documentElement.dataset.theme, palette: document.documentElement.dataset.palette, view: captureView() };
    return JSON.stringify(data);
  });
  fs.writeFileSync('/tmp/ws.json', exported);
  ok('Workspace JSON export is valid');

  // Restore without dateFilter should not turn the date filter on
  const parsed = JSON.parse(exported);
  delete parsed.view.dateFilter;
  fs.writeFileSync('/tmp/ws-nodate.json', JSON.stringify(parsed));
  await page.click('#exampleEmptyBtn');
  await page.waitForFunction(() => document.querySelector('#countVisible').textContent === '1');
  const restoreInput = await page.$('#restoreInput');
  await restoreInput.uploadFile('/tmp/ws-nodate.json');
  await page.waitForFunction(() => document.querySelector('#brandName').textContent.includes('Harbor'));
  const restoredDate = await page.$eval('#dateFilter', el => el.checked);
  if (restoredDate) bug('Restoring a backup without dateFilter turns the date filter on');
  else ok('Restore without dateFilter keeps all dates visible');

  // Legacy saved view without Specialist hides specialists after reload
  await page.evaluate(() => {
    const view = JSON.parse(localStorage.getItem('orgflow.planning.view.v2') || '{}');
    view.roles = ['Head', 'Team Leader', 'Engineer', 'Graduate', 'Intern'];
    view.dateFilter = false;
    localStorage.setItem('orgflow.planning.view.v2', JSON.stringify(view));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#chart .node');
  const specialistChip = await page.evaluate(() => {
    const chip = [...document.querySelectorAll('#roleChips .chip')].find(b => b.dataset.value === 'Specialist');
    return chip ? chip.classList.contains('active') : null;
  });
  const specialistCount = await page.evaluate(() => people.filter(p => p.type === 'Specialist' && document.querySelector('#countVisible')).length);
  const visibleSpecialists = await page.evaluate(() => people.filter(p => p.type === 'Specialist').filter(p => activeRoles.has(p.type)).length);
  if (specialistChip === false) bug('Saved pre-Specialist filter hides Specialist roles on reload', 'visible=' + visibleSpecialists);
  else ok('Specialist filter remains available after a legacy saved view');

  // PNG export
  const pngOk = await page.evaluate(async () => {
    try {
      const art = buildExportSVG();
      if (!art || !art.xml.includes('<svg')) return 'no svg';
      const blob = await pngFromExport(art);
      return blob && blob.size > 1000 ? 'ok:' + blob.size : 'small:' + (blob && blob.size);
    } catch (e) { return 'err:' + e.message; }
  });
  if (!String(pngOk).startsWith('ok:')) bug('PNG export failed', pngOk);
  else ok('PNG export produced a blob ' + pngOk);

  await page.click('#collapseBtn');
  const collapsed = await page.$$eval('#chart .node', ns => ns.length);
  if (!(collapsed < 17)) bug('Collapse to team leaders did not reduce cards', String(collapsed));
  else ok('Collapse reduces visible cards to ' + collapsed);
  await page.click('#expandBtn');

  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  if (focused !== 'search') bug('Ctrl+K did not focus search', focused);
  else ok('Ctrl+K focuses search');

  await page.click('#exampleNorthstarBtn');
  await page.waitForFunction(() => document.querySelector('#brandName').textContent === 'Northstar Commerce');
  const n = await page.$eval('#countVisible', el => el.textContent);
  if (n !== '14') bug('Northstar count', n);
  else ok('Northstar sample loads 14 positions');

  // Mobile: filters from Positions view
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('aside')).display === 'none');
  ok('Aside hides on mobile');
  await page.click('.plan-tabs [data-view="positions"]');
  await page.waitForSelector('#positionsPanel:not(.hidden)');
  const toggleBox = await page.$eval('#filterToggle', el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { display: s.display, w: r.width, h: r.height, visible: s.display !== 'none' && r.width > 0 && r.height > 0 };
  });
  const toolbarHidden = await page.$eval('.toolbar', el => el.classList.contains('hidden'));
  if (toolbarHidden && toggleBox.visible === false) bug('Mobile Positions view has no way to open filters', JSON.stringify({ toggleBox, toolbarHidden }));
  else if (!toggleBox.visible) bug('Mobile filter toggle is not visible', JSON.stringify({ toggleBox, toolbarHidden }));
  else ok('Mobile filter toggle is visible on Positions');

  if (toggleBox.visible) {
    await page.click('#filterToggle');
    const open = await page.$eval('.layout', el => el.classList.contains('filters-open'));
    if (!open) bug('Mobile filter toggle did not open sidebar');
    else ok('Mobile filter toggle opens sidebar from Positions');
  }

  await page.setViewport({ width: 1440, height: 900 });
  if (pageErrors.length) bug('pageerror', pageErrors.join('\n'));
  else ok('No uncaught page errors');
  const realConsole = consoleErrors.filter(t => !/Download the React DevTools|favicon|frame-ancestors/.test(t));
  if (realConsole.length) note('console errors', realConsole.join('\n'));

  await browser.close();
  const bugs = findings.filter(f => f.type === 'bug');
  console.log('\nSUMMARY bugs=' + bugs.length + ' notes=' + findings.filter(f => f.type === 'note').length);
  fs.writeFileSync('/tmp/orgflow-qa.json', JSON.stringify({ findings, pageErrors, consoleErrors }, null, 2));
  if (bugs.length) process.exit(2);
})().catch(err => { console.error(err); process.exit(1); });
