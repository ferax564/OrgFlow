'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');

const root = path.join(__dirname, '..');
const dirs = { claude: path.join(root, '.claude', 'skills'), codex: path.join(root, '.agents', 'skills') };
const names = dir => fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
function frontmatter(text) {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'SKILL.md starts with YAML frontmatter');
  return Object.fromEntries(m[1].split('\n').map(line => { const i = line.indexOf(':'); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
}

test('Claude Code and Codex get identical skills', () => {
  assert.deepEqual(names(dirs.claude), names(dirs.codex));
  for (const name of names(dirs.claude)) {
    for (const file of fs.readdirSync(path.join(dirs.claude, name), { recursive: true })) {
      const a = path.join(dirs.claude, name, file), b = path.join(dirs.codex, name, file);
      if (fs.statSync(a).isDirectory()) continue;
      assert.ok(fs.existsSync(b), `.agents/skills/${name}/${file} is missing`);
      assert.equal(fs.readFileSync(b, 'utf8'), fs.readFileSync(a, 'utf8'), `${name}/${file} differs between .claude and .agents; copy one over the other`);
    }
  }
});

test('every skill has a portable name and a description that says when to use it', () => {
  const cli = require('../bin/orgflow.cjs');
  for (const name of names(dirs.claude)) {
    const meta = frontmatter(fs.readFileSync(path.join(dirs.claude, name, 'SKILL.md'), 'utf8'));
    assert.deepEqual(Object.keys(meta).sort(), ['description', 'name'], `${name}: only name and description, which both tools understand`);
    assert.equal(meta.name, name);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(meta.description.length > 80 && meta.description.length <= 1024, `${name}: description length`);
    assert.match(meta.description, /Use when/, `${name}: description says when to use it`);
  }
  // Every CLI command a skill shows must exist.
  const commands = new Set([...cli.HELP.matchAll(/^ {2}([a-z-]+)/gm)].map(m => m[1]));
  for (const name of names(dirs.claude)) {
    const body = fs.readFileSync(path.join(dirs.claude, name, 'SKILL.md'), 'utf8');
    for (const [, cmd] of body.matchAll(/^orgflow ([a-z-]+)/gm)) assert.ok(commands.has(cmd), `${name} uses unknown command "orgflow ${cmd}"`);
  }
});

test('AGENTS.md lists every skill and CLAUDE.md imports it', () => {
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  for (const name of names(dirs.claude)) assert.ok(agents.includes('`' + name + '`'), name);
  assert.match(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md$/m);
});
