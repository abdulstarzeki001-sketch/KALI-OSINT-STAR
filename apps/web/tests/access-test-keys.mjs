// Test-only Cloudflare Access issuer: a throwaway RSA key pair, a JWKS served
// through a stubbed global fetch, and helpers to mint signed tokens.
import {DEFAULT_ACCESS_TEAM_DOMAIN, DEFAULT_ACCESS_AUD, resetAccessKeyCache} from '../access-jwt.js';

export const TEAM = DEFAULT_ACCESS_TEAM_DOMAIN;
export const AUD = DEFAULT_ACCESS_AUD;
export const ISSUER = 'https://' + TEAM;
export const CERTS_URL = ISSUER + '/cdn-cgi/access/certs';
export const OWNER_EMAIL = 'owner@example.test';

const algorithm = {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'};
export const signingPair = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
export const attackerPair = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
const publicJwk = {...await crypto.subtle.exportKey('jwk', signingPair.publicKey), kid: 'test-kid-1', use: 'sig', alg: 'RS256'};

export const certs = {calls: 0, fail: false, keys: [publicJwk]};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === CERTS_URL) {
    certs.calls++;
    if (certs.fail) return new Response('unavailable', {status: 503});
    return new Response(JSON.stringify({keys: certs.keys}), {status: 200, headers: {'content-type': 'application/json'}});
  }
  if (String(url).includes('cloudflareaccess.com')) throw new Error('unexpected Access fetch: ' + url);
  return realFetch(url, init);
};

export function resetCerts() {
  certs.calls = 0; certs.fail = false; certs.keys = [publicJwk];
  resetAccessKeyCache();
}

const enc = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

export async function mint(claims = {}, {header = {}, key = signingPair.privateKey} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = enc({alg: 'RS256', kid: 'test-kid-1', typ: 'JWT', ...header});
  const body = enc({
    aud: [AUD], iss: ISSUER, type: 'app', email: OWNER_EMAIL, sub: 'owner-sub',
    iat: now, nbf: now, exp: now + 3600, ...claims
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + body));
  return head + '.' + body + '.' + Buffer.from(sig).toString('base64url');
}

export const ownerToken = await mint();
