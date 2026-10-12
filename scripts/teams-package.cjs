#!/usr/bin/env node
'use strict';
/** Builds the Microsoft Teams app package (manifest.json + icons in a zip) for one deployment.
 *  Usage: npm run teams:package -- --app-id GUID --public-url https://orgflow.example.com --client-id GUID [--bot-id GUID]
 *         [--company "Example AG"] [--privacy-url URL] [--terms-url URL] [--version 1.0.0] [--out dist/teams]
 *  Each option can also come from TEAMS_APP_ID, PUBLIC_URL, TEAMS_CLIENT_ID, TEAMS_BOT_ID, … */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const ROOT = path.resolve(__dirname, '..'), SRC = path.join(ROOT, 'teams', 'package');
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function options(argv = process.argv.slice(2), env = process.env) {
  const arg = name => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : undefined; };
  const publicUrl = String(arg('public-url') || env.PUBLIC_URL || '').replace(/\/$/, '');
  return {
    appId: arg('app-id') || env.TEAMS_APP_ID || '', clientId: arg('client-id') || env.TEAMS_CLIENT_ID || '', botId: arg('bot-id') || env.TEAMS_BOT_ID || '',
    publicUrl, company: arg('company') || env.TENANT_NAME || 'OrgFlow', version: arg('version') || require('../package.json').version,
    privacyUrl: arg('privacy-url') || env.TEAMS_PRIVACY_URL || publicUrl + '/', termsUrl: arg('terms-url') || env.TEAMS_TERMS_URL || publicUrl + '/',
    out: path.resolve(arg('out') || path.join(ROOT, 'dist', 'teams'))
  };
}

function manifest(o) {
  for (const [label, value] of [['--app-id', o.appId], ['--client-id', o.clientId]]) if (!GUID.test(value)) throw new Error(`${label} must be a GUID.`);
  if (o.botId && !GUID.test(o.botId)) throw new Error('--bot-id must be a GUID.');
  let url;
  try { url = new URL(o.publicUrl); } catch { throw new Error('--public-url must be the HTTPS address of the OrgFlow host.'); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search) throw new Error('--public-url must be an HTTPS origin without a path; Teams only embeds HTTPS pages.');
  if (!/^\d+\.\d+\.\d+$/.test(o.version)) throw new Error('--version must look like 1.2.3.');
  for (const u of [o.privacyUrl, o.termsUrl]) if (!/^https:\/\//.test(u)) throw new Error('Privacy and terms URLs must use HTTPS.');
  const values = { APP_ID: o.appId, CLIENT_ID: o.clientId, BOT_ID: o.botId, PUBLIC_URL: url.origin, HOST: url.host, COMPANY: o.company.slice(0, 32), VERSION: o.version, PRIVACY_URL: o.privacyUrl, TERMS_URL: o.termsUrl };
  const text = fs.readFileSync(path.join(SRC, 'manifest.template.json'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => JSON.stringify(values[key]).slice(1, -1));
  const out = JSON.parse(text);
  if (!o.botId) delete out.bots; // sign-in only; notifications then stay in the OrgFlow inbox
  return out;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
/** A minimal deflate zip writer; Teams accepts any standard zip with the files at the root. */
function zip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const packed = zlib.deflateRawSync(data), nameBuf = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0, 8); dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12); dir.writeUInt16LE(33, 14); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed); central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const dirSize = central.reduce((n, b) => n + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dirSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

function build(o) {
  const m = manifest(o);
  fs.mkdirSync(o.out, { recursive: true });
  const json = Buffer.from(JSON.stringify(m, null, 2) + '\n');
  fs.writeFileSync(path.join(o.out, 'manifest.json'), json);
  const file = path.join(o.out, 'orgflow-teams.zip');
  fs.writeFileSync(file, zip([['manifest.json', json], ['color.png', fs.readFileSync(path.join(SRC, 'color.png'))], ['outline.png', fs.readFileSync(path.join(SRC, 'outline.png'))]]));
  return { file, manifest: m };
}

if (require.main === module) {
  try { const { file } = build(options()); console.log('Teams app package: ' + file); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { options, manifest, zip, build, crc32 };
