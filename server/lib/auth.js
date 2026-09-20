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
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* malformed cookie is ignored */ }
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

async function discoverIssuer(issuer, clientId, clientSecret, allowHttp = false) {
  const oidc = await import('openid-client');
  const config = await oidc.discovery(new URL(issuer), clientId,
    clientSecret ? { client_secret: clientSecret } : undefined,
    clientSecret ? oidc.ClientSecretPost(clientSecret) : oidc.None(),
    { timeout: 10, execute: [...(allowHttp ? [oidc.allowInsecureRequests] : []), oidc.enableNonRepudiationChecks] });
  return config;
}
async function authorizationUrl(config, params) {
  const oidc = await import('openid-client');
  return oidc.buildAuthorizationUrl(config, params);
}
async function validateCallback(config, url, saved) {
  const oidc = await import('openid-client');
  const tokens = await oidc.authorizationCodeGrant(config, url, {
    pkceCodeVerifier: saved.code_verifier, expectedState: saved.state,
    expectedNonce: saved.nonce, idTokenExpected: true
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new Error('Identity token has no subject.');
  const profile = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
  if (profile.email_verified !== true || !profile.email) throw new Error('A verified email address is required.');
  return profile;
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
  authorizationUrl,
  validateCallback,
  publicSession
};
