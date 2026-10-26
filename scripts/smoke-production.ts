import assert from 'node:assert/strict';
import { authToken, decrypt, encrypt, newKey } from '../src/lib/storage';
import { initialDocument, validateDocument } from '../src/lib/model';

// Creates an isolated, randomly keyed test vault. Never reads a user's vault.
// The private test key stays in process memory and is never logged.
const origin = process.env.BASE_URL || 'https://speakeasy-jet.vercel.app';
const endpoint = new URL('/api/vault', origin);
const key = newKey();
const headers = { authorization: 'Bearer ' + await authToken(key), 'Content-Type': 'application/json' };
async function request(method = 'GET', body?: unknown, authorization = headers) {
  return fetch(endpoint, { method, headers: authorization, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
}
const empty = await request();
assert.equal(empty.status, 200, 'Neon read must succeed');
assert.equal((await empty.json()).revision, 0);
console.log('PASS: authenticated Neon read');
const document = validateDocument(initialDocument());
const payload = await encrypt(document,key);
const write = await request('PUT',{revision:0,payload});
assert.equal(write.status,200,'Encrypted backup write must succeed');
const revision = (await write.json()).revision;
assert.equal(revision,1);
console.log('PASS: encrypted Neon write');
const read = await request();
assert.equal(read.status,200);
assert.equal(read.headers.get('cache-control'),'private, no-store');
const stored = await read.json();
assert.deepEqual(await decrypt(stored.payload,key),document);
console.log('PASS: persisted ciphertext decrypts to the exact document');
assert.equal((await request('PUT',{revision:0,payload})).status,409);
assert.equal((await request('PUT',{revision:revision+1,payload})).status,409);
console.log('PASS: concurrent/stale writes rejected');
const otherHeaders = { ...headers,authorization:'Bearer '+await authToken(newKey()) };
const isolated = await request('GET',undefined,otherHeaders);
assert.equal((await isolated.json()).revision,0);
assert.equal((await fetch(endpoint)).status,401);
console.log('PASS: vault isolation and authentication');
assert.equal((await request('PUT',{revision,payload:{iv:'bad',data:'bad'}})).status,400);
console.log('PASS: malformed write rejected');
// Leave the isolated smoke-test vault as a small, valid, empty encrypted document.
const cleaned = { ...document,speeches:[],rehearsals:[] };
assert.equal((await request('PUT',{revision,payload:await encrypt(cleaned,key)})).status,200);
console.log('Production smoke checks passed.');
