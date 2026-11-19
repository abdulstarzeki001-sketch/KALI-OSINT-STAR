import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAccessJwt, accessFailureStatus, accessConfig} from '../access-jwt.js';
import {mint, ownerToken, attackerPair, certs, resetCerts, AUD, OWNER_EMAIL} from './access-test-keys.mjs';

test.beforeEach(resetCerts);

test('accepts a correctly signed owner application token', async () => {
  const result = await verifyAccessJwt(ownerToken, {});
  assert.equal(result.ok, true);
  assert.equal(result.identity.email, OWNER_EMAIL);
});

test('rejects the old placeholder style: any non-empty header string', async () => {
  for (const value of ['owner-access-test-assertion', 'a.b.c', 'x'.repeat(9000), '']) {
    const result = await verifyAccessJwt(value, {});
    assert.equal(result.ok, false, value.slice(0, 20));
  }
});

test('rejects a token signed by a key that is not in the Access JWKS', async () => {
  const forged = await mint({}, {key: attackerPair.privateKey});
  assert.equal((await verifyAccessJwt(forged, {})).reason, 'ACCESS_TOKEN_SIGNATURE');
});

test('rejects a tampered payload even with an originally valid signature', async () => {
  const [h, , s] = ownerToken.split('.');
  const body = Buffer.from(JSON.stringify({aud: [AUD], iss: 'https://fancy-haze-5879.cloudflareaccess.com', type: 'app', email: 'attacker@evil.test', exp: 9999999999})).toString('base64url');
  assert.equal((await verifyAccessJwt(h + '.' + body + '.' + s, {})).reason, 'ACCESS_TOKEN_SIGNATURE');
});

test('rejects the signed login-page `meta` token that anonymous visitors receive', async () => {
  const meta = await mint({type: 'meta', email: undefined, sub: undefined, iss: undefined, auth_status: 'NONE'});
  assert.equal((await verifyAccessJwt(meta, {})).ok, false);
  const metaWithIssuer = await mint({type: 'meta'});
  assert.equal((await verifyAccessJwt(metaWithIssuer, {})).reason, 'ACCESS_TOKEN_TYPE');
});

test('rejects wrong audience, wrong issuer, alg none and unknown algorithms', async () => {
  assert.equal((await verifyAccessJwt(await mint({aud: ['f'.repeat(64)]}), {})).reason, 'ACCESS_TOKEN_AUDIENCE');
  assert.equal((await verifyAccessJwt(await mint({iss: 'https://evil.cloudflareaccess.com'}), {})).reason, 'ACCESS_TOKEN_ISSUER');
  assert.equal((await verifyAccessJwt(await mint({}, {header: {alg: 'none'}}), {})).reason, 'ACCESS_TOKEN_ALG');
  assert.equal((await verifyAccessJwt(await mint({}, {header: {alg: 'HS256'}}), {})).reason, 'ACCESS_TOKEN_ALG');
});

test('enforces expiry and not-before with a 60 second leeway', async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await verifyAccessJwt(await mint({exp: now - 120}), {})).reason, 'ACCESS_TOKEN_EXPIRED');
  assert.equal((await verifyAccessJwt(await mint({exp: now - 30}), {})).ok, true);
  assert.equal((await verifyAccessJwt(await mint({nbf: now + 600}), {})).reason, 'ACCESS_TOKEN_NOT_YET_VALID');
  assert.equal((await verifyAccessJwt(await mint({exp: undefined}), {})).reason, 'ACCESS_TOKEN_EXPIRED');
});

test('requires an identity and honours the optional email allowlist', async () => {
  assert.equal((await verifyAccessJwt(await mint({email: '', sub: ''}), {})).reason, 'ACCESS_TOKEN_IDENTITY');
  assert.equal((await verifyAccessJwt(ownerToken, {ACCESS_ALLOWED_EMAILS: 'someone@else.test'})).reason, 'ACCESS_IDENTITY_DENIED');
  assert.equal((await verifyAccessJwt(ownerToken, {ACCESS_ALLOWED_EMAILS: ' OWNER@example.test , x@y.z'})).ok, true);
  assert.equal(accessFailureStatus('ACCESS_IDENTITY_DENIED'), 403);
});

test('caches the JWKS and refetches once for an unknown key id (rotation)', async () => {
  await verifyAccessJwt(ownerToken, {});
  await verifyAccessJwt(ownerToken, {});
  assert.equal(certs.calls, 1);
  const rotated = await mint({}, {header: {kid: 'not-published'}});
  assert.equal((await verifyAccessJwt(rotated, {})).reason, 'ACCESS_TOKEN_UNKNOWN_KEY');
  assert.equal(certs.calls, 2);
});

test('fails closed with 503 when the JWKS cannot be fetched or config is invalid', async () => {
  certs.fail = true;
  const result = await verifyAccessJwt(ownerToken, {});
  assert.equal(result.reason, 'ACCESS_CERTS_UNAVAILABLE');
  assert.equal(accessFailureStatus(result.reason), 503);
  assert.equal(accessConfig({ACCESS_TEAM_DOMAIN: 'evil.example.com'}), null);
  assert.equal(accessConfig({ACCESS_AUD: 'short'}), null);
  assert.equal((await verifyAccessJwt(ownerToken, {ACCESS_TEAM_DOMAIN: 'http://x'})).reason, 'ACCESS_VERIFIER_NOT_CONFIGURED');
});
