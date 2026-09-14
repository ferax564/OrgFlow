'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('landing keeps public CTAs and documents both hosts', () => {
  const html = read('index.html');
  assert.match(html, /<h1>See the company\./);
  assert.match(html, /<a class="btn primary" href="app.html">Open the planner<\/a>/);
  assert.match(html, /id="run"/);
  assert.match(html, /Two ways to run OrgFlow/);
  assert.match(html, /https:\/\/deep-quinoa-tbf2\.here\.now\//);
  assert.match(html, /https:\/\/ferax564\.github\.io\/OrgFlow\//);
  assert.match(html, /npm run start:enterprise/);
  assert.match(html, /Named views/);
  assert.match(html, /Print \/ A3/);
  assert.match(html, /Group and site chips/);
  assert.doesNotMatch(html, /nothing is uploaded unless you download a file and send it yourself/i);
});

test('README lists live hosts once and a single enterprise heading', () => {
  const md = read('README.md');
  assert.match(md, /deep-quinoa-tbf2\.here\.now/);
  assert.match(md, /ferax564\.github\.io\/OrgFlow/);
  const headings = md.match(/^## Enterprise host \(optional\)$/gm) || [];
  assert.equal(headings.length, 1);
});

test('login page shares site styles', () => {
  const html = read('login.html');
  assert.match(html, /css\/site\.css/);
  assert.match(html, /class="login-page"/);
  assert.doesNotMatch(html, /<style>/);
});

test('enterprise landing CSS can hide mode cards', () => {
  const css = read('css/site.css');
  assert.match(css, /html\[data-host="enterprise"\] \.modes/);
  assert.match(css, /\.modes\[hidden\]/);
});
