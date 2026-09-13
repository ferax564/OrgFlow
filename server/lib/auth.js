'use strict';

const crypto = require('node:crypto');

const COOKIE = 'orgflow_sid';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signSid(sid, secret) {
  const mac = crypto.createHmac('sha256', secret).update(sid).digest('base64url');
  return sid + '.' + mac;
}

function unsignSid(value, secret) {
  if (!value || !value.includes('.')) return null;
  const i = value.lastIndexOf('.');
  const sid = value.slice(0, i);
  const mac = value.slice(i + 1);
  const expected = crypto.createHmac('sha256', secret).update(sid).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return sid;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(sid, secret, { secure, maxAgeSec }) {
  const parts = [
    `${COOKIE}=${signSid(sid, secret)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieHeader(secure) {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  return { verifier, challenge, state, nonce };
}

async function discoverIssuer(issuer) {
  const url = String(issuer).replace(/\/$/, '') + '/.well-known/openid-configuration';
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('Could not load OpenID configuration from Keycloak.');
  return res.json();
}

async function exchangeCode(cfg, { code, verifier, redirectUri, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier
  });
  if (clientSecret) body.set('client_secret', clientSecret);
  const res = await fetch(cfg.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || 'Token exchange failed.');
  return json;
}

async function fetchUserInfo(cfg, accessToken) {
  const res = await fetch(cfg.userinfo_endpoint, {
    headers: { authorization: 'Bearer ' + accessToken, accept: 'application/json' }
  });
  if (!res.ok) throw new Error('Could not read the signed-in profile from Keycloak.');
  return res.json();
}

function publicSession(user, membership, tenant) {
  return {
    authenticated: true,
    user: { id: user.id || membership.user_id, email: membership.email, name: membership.name },
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    role: membership.role,
    canExport: Boolean(membership.can_export),
    canWrite: membership.role === 'admin' || membership.role === 'editor',
    isAdmin: membership.role === 'admin',
    scopePositionId: membership.scope_position_id || ''
  };
}

module.exports = {
  COOKIE,
  signSid,
  unsignSid,
  parseCookies,
  cookieHeader,
  clearCookieHeader,
  pkce,
  discoverIssuer,
  exchangeCode,
  fetchUserInfo,
  publicSession
};
