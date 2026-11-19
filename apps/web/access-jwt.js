/**
 * Cloudflare Access application-token verification for Pages Functions.
 *
 * The edge already blocks anonymous visitors, but a Function must not trust
 * the mere presence of `Cf-Access-Jwt-Assertion`: a misconfigured Access
 * policy (bypass rule, path exclusion, removed app) would otherwise let any
 * caller forge the header and reach the terminal, installer or AI routes.
 *
 * Checks performed (fail closed on every error):
 *  - RS256 signature against the team's published JWKS (`/cdn-cgi/access/certs`)
 *  - `iss` equals the team domain, `aud` contains this application's AUD tag
 *  - `type` is `app` — Access also hands unauthenticated visitors a signed
 *    `meta` token carrying the same `aud` on its login page, which must never
 *    count as a session
 *  - `exp` / `nbf` / `iat` with a small clock-skew leeway
 *  - a non-empty `email` or `sub` identity, optionally from an email allowlist
 *
 * Team domain and AUD are public identifiers, not secrets. They default to the
 * values of the production owner app and can be overridden with
 * ACCESS_TEAM_DOMAIN / ACCESS_AUD. ACCESS_ALLOWED_EMAILS (comma separated)
 * adds an in-code identity allowlist on top of the Access policy.
 */

export const DEFAULT_ACCESS_TEAM_DOMAIN = 'fancy-haze-5879.cloudflareaccess.com';
export const DEFAULT_ACCESS_AUD = '6292524fefea4e592af928e3a5f5c2e3b4c4dfd63fb0a324a5501b5b4c562e26';

const KEY_CACHE_MS = 10 * 60 * 1000;
const LEEWAY_SECONDS = 60;
const MAX_TOKEN_LENGTH = 8192;
const keyCache = new Map(); // certsUrl -> {expires, keys: Map<kid, CryptoKey>}

export function resetAccessKeyCache() { keyCache.clear(); }

function b64urlBytes(part) {
  if (typeof part !== 'string' || !/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('bad_base64url');
  const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function b64urlJson(part) {
  const value = JSON.parse(new TextDecoder().decode(b64urlBytes(part)));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad_json');
  return value;
}

export function accessConfig(env = {}) {
  const team = String(env.ACCESS_TEAM_DOMAIN || DEFAULT_ACCESS_TEAM_DOMAIN).trim().toLowerCase();
  const aud = String(env.ACCESS_AUD || DEFAULT_ACCESS_AUD).trim();
  const emails = String(env.ACCESS_ALLOWED_EMAILS || '')
    .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !/^[a-f0-9]{64}$/.test(aud)) return null;
  return { issuer: 'https://' + team, certsUrl: 'https://' + team + '/cdn-cgi/access/certs', aud, emails };
}

async function signingKeys(certsUrl, fetchImpl, now, forceRefresh) {
  const cached = keyCache.get(certsUrl);
  if (!forceRefresh && cached && cached.expires > now) return cached.keys;
  const response = await fetchImpl(certsUrl, { headers: { accept: 'application/json' }, redirect: 'error' });
  if (!response.ok) throw new Error('certs_unavailable');
  const body = await response.json();
  const keys = new Map();
  for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
    if (jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string' || !jwk.n || !jwk.e) continue;
    if (jwk.use && jwk.use !== 'sig') continue;
    const key = await crypto.subtle.importKey(
      'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    keys.set(jwk.kid, key);
  }
  if (!keys.size) throw new Error('certs_empty');
  keyCache.set(certsUrl, { expires: now + KEY_CACHE_MS, keys });
  return keys;
}

/**
 * Verify a Cloudflare Access application JWT.
 * Returns {ok:true, identity} or {ok:false, reason}. Never throws.
 */
export async function verifyAccessJwt(token, env = {}, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const nowMs = options.now ?? Date.now();
  const config = accessConfig(env);
  if (!config) return { ok: false, reason: 'ACCESS_VERIFIER_NOT_CONFIGURED' };
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'ACCESS_REQUIRED' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'ACCESS_TOKEN_MALFORMED' };
  let header, payload, signature;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
    signature = b64urlBytes(parts[2]);
  } catch (_) { return { ok: false, reason: 'ACCESS_TOKEN_MALFORMED' }; }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, reason: 'ACCESS_TOKEN_ALG' };

  try {
    let keys = await signingKeys(config.certsUrl, fetchImpl, nowMs, false);
    if (!keys.has(header.kid)) keys = await signingKeys(config.certsUrl, fetchImpl, nowMs, true); // key rotation
    const key = keys.get(header.kid);
    if (!key) return { ok: false, reason: 'ACCESS_TOKEN_UNKNOWN_KEY' };
    const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed)))
      return { ok: false, reason: 'ACCESS_TOKEN_SIGNATURE' };
  } catch (_) { return { ok: false, reason: 'ACCESS_CERTS_UNAVAILABLE' }; }

  const now = Math.floor(nowMs / 1000);
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== config.issuer) return { ok: false, reason: 'ACCESS_TOKEN_ISSUER' };
  if (!audList.includes(config.aud)) return { ok: false, reason: 'ACCESS_TOKEN_AUDIENCE' };
  if (payload.type !== 'app') return { ok: false, reason: 'ACCESS_TOKEN_TYPE' };
  if (!Number.isFinite(payload.exp) || payload.exp + LEEWAY_SECONDS < now) return { ok: false, reason: 'ACCESS_TOKEN_EXPIRED' };
  if (Number.isFinite(payload.nbf) && payload.nbf - LEEWAY_SECONDS > now) return { ok: false, reason: 'ACCESS_TOKEN_NOT_YET_VALID' };
  if (Number.isFinite(payload.iat) && payload.iat - LEEWAY_SECONDS > now) return { ok: false, reason: 'ACCESS_TOKEN_NOT_YET_VALID' };

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!email && !sub) return { ok: false, reason: 'ACCESS_TOKEN_IDENTITY' };
  if (config.emails.length && !config.emails.includes(email)) return { ok: false, reason: 'ACCESS_IDENTITY_DENIED' };
  return { ok: true, identity: { email, sub } };
}

/** Convenience wrapper: read the assertion header from a Request. */
export function verifyAccessRequest(request, env, options) {
  return verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion') || '', env, options);
}

/** HTTP status for a failed verification reason. */
export function accessFailureStatus(reason) {
  if (reason === 'ACCESS_VERIFIER_NOT_CONFIGURED' || reason === 'ACCESS_CERTS_UNAVAILABLE') return 503;
  if (reason === 'ACCESS_IDENTITY_DENIED') return 403;
  return 401;
}
