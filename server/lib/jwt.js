'use strict';
/** RS256 JSON Web Token checks against a published key set (Microsoft Entra ID, Bot Framework). */
const crypto = require('node:crypto');

function fail(message) { return Object.assign(new Error(message), { status: 401 }); }

function decode(token) {
  if (typeof token !== 'string' || token.length > 16384) throw fail('Malformed token.');
  const parts = token.split('.');
  if (parts.length !== 3) throw fail('Malformed token.');
  try {
    return { header: JSON.parse(Buffer.from(parts[0], 'base64url')), payload: JSON.parse(Buffer.from(parts[1], 'base64url')), input: parts[0] + '.' + parts[1], signature: Buffer.from(parts[2], 'base64url') };
  } catch { throw fail('Malformed token.'); }
}

/** Fetches a JWKS (directly, or through an OpenID configuration), caches it for an hour and
 *  refreshes at most every five minutes when an unknown key ID appears (key rollover). */
function keySet({ jwksUri, openIdConfiguration, fetchImpl = fetch, now = () => Date.now() }) {
  let keys = null, loadedAt = 0, pending = null;
  async function load() {
    let uri = jwksUri;
    if (!uri) {
      const res = await fetchImpl(openIdConfiguration);
      if (!res.ok) throw fail('Identity provider metadata is unavailable.');
      uri = (await res.json()).jwks_uri;
    }
    const res = await fetchImpl(uri);
    if (!res.ok) throw fail('Identity provider keys are unavailable.');
    const body = await res.json();
    keys = Array.isArray(body.keys) ? body.keys : [];
    loadedAt = now();
  }
  async function refresh() { if (!pending) pending = load().finally(() => { pending = null; }); return pending; }
  return {
    async get(kid) {
      if (!keys || now() - loadedAt > 3600000) await refresh();
      let key = keys.find(k => k.kid === kid);
      if (!key && now() - loadedAt > 300000) { await refresh(); key = keys.find(k => k.kid === kid); }
      if (!key) throw fail('Token signed with an unknown key.');
      return key;
    }
  };
}

async function verify(token, { keys, issuers, audiences, now = () => Date.now(), skewSec = 300, keyCheck }) {
  const { header, payload, input, signature } = decode(token);
  if (header.alg !== 'RS256') throw fail('Unsupported token algorithm.');
  const jwk = await keys.get(header.kid);
  if (keyCheck) keyCheck(jwk, payload);
  let publicKey;
  try { publicKey = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' }); } catch { throw fail('Invalid signing key.'); }
  if (!crypto.verify('RSA-SHA256', Buffer.from(input), publicKey, signature)) throw fail('Invalid token signature.');
  const t = Math.floor(now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + skewSec < t) throw fail('Token has expired.');
  if (typeof payload.nbf === 'number' && payload.nbf - skewSec > t) throw fail('Token is not valid yet.');
  if (!issuers.includes(payload.iss)) throw fail('Token issuer is not trusted.');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some(x => audiences.includes(x))) throw fail('Token was issued for another application.');
  return payload;
}

module.exports = { decode, keySet, verify };
