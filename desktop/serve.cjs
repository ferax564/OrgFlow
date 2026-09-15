'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

const ALLOWED_FILES = new Set([
  'index.html', 'app.html', '404.html', 'robots.txt', 'LICENSE',
  'manifest.webmanifest', 'README.md'
]);
const ALLOWED_DIRS = ['css', 'js', 'assets', 'examples'];

function posixRel(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function allowedPath(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  let rel = decoded.replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  if (rel.includes('\0') || rel.includes('\\')) return null;
  const abs = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
  const posix = posixRel(rootAbs, abs);
  if (posix.startsWith('..')) return null;
  if (ALLOWED_FILES.has(posix)) return abs;
  const top = posix.split('/')[0];
  if (ALLOWED_DIRS.includes(top)) return abs;
  return null;
}

function portableUserData(env = process.env, execPath = process.execPath) {
  if (env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(env.PORTABLE_EXECUTABLE_DIR, 'OrgFlow-data');
  }
  const exeDir = path.dirname(execPath);
  let neighbor = exeDir;
  if (exeDir.endsWith(path.join('Contents', 'MacOS'))) {
    neighbor = path.dirname(path.dirname(path.dirname(exeDir)));
  } else if (env.APPIMAGE) {
    neighbor = path.dirname(env.APPIMAGE);
  }
  const folder = path.join(neighbor, 'OrgFlow-data');
  try {
    if (fs.existsSync(folder)) return folder;
  } catch { /* default Electron userData */ }
  return null;
}

function startStaticServer(root, { host = '127.0.0.1', port = 0 } = {}) {
  const server = http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end();
      return;
    }
    const hostHeader = String(req.headers.host || '').split(':')[0];
    if (hostHeader && hostHeader !== '127.0.0.1' && hostHeader !== 'localhost') {
      res.writeHead(403);
      res.end();
      return;
    }
    const file = allowedPath(root, req.url || '/');
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'content-type': type,
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff'
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        url: `http://${host}:${addr.port}`,
        port: addr.port,
        close: () => new Promise((done, fail) => server.close(err => err ? fail(err) : done()))
      });
    });
  });
}

module.exports = { allowedPath, portableUserData, startStaticServer };
