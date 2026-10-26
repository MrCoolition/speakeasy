import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDocument, validateDocument, mergeDocuments, cues, wordCount, clock } from '../src/lib/model';
import { encrypt, decrypt, newKey, authToken, persist, readSaved, STORAGE_KEY, type Saved } from '../src/lib/storage';

test('encrypted backups round-trip without exposing speech content', async () => {
  const document = initialDocument(), key = newKey();
  const payload = await encrypt(document, key);
  assert.equal(JSON.stringify(payload).includes(document.speeches[0].title), false);
  assert.deepEqual(await decrypt(payload, key), validateDocument(document));
  assert.equal((await authToken(key)).length, 64);
  assert.notEqual(await authToken(key), key);
});
test('different devices cannot decrypt each other’s backups', async () => {
  const payload = await encrypt(initialDocument(), newKey());
  await assert.rejects(() => decrypt(payload, newKey()));
});
test('backup tampering fails authenticated decryption', async () => {
  const key = newKey(), payload = await encrypt(initialDocument(), key);
  payload.data = (payload.data[0] === 'A' ? 'B' : 'A') + payload.data.slice(1);
  await assert.rejects(() => decrypt(payload, key));
});
test('each encrypted backup uses a fresh initialization vector', async () => {
  const key = newKey(), doc = initialDocument();
  const a = await encrypt(doc,key), b = await encrypt(doc,key);
  assert.notEqual(a.iv,b.iv); assert.notEqual(a.data,b.data);
});
test('concurrent edits to the same speech retain both versions', () => {
  const base = initialDocument(), local = structuredClone(base), remote = structuredClone(base);
  local.speeches[0].content = 'The local words'; local.speeches[0].updatedAt = 2;
  remote.speeches[0].content = 'The remote words'; remote.speeches[0].updatedAt = 3;
  const merged = mergeDocuments(local,remote,base);
  assert.equal(merged.speeches.length,4);
  assert.ok(merged.speeches.some(s => s.content === 'The local words'));
  assert.ok(merged.speeches.some(s => s.content === 'The remote words'));
  assert.ok(merged.speeches.some(s => s.title.endsWith('(recovered copy)')));
});
test('remote-only change does not create unnecessary duplicates', () => {
  const base = initialDocument(), remote = structuredClone(base);
  remote.speeches[0].content = 'Remote edit'; remote.speeches[0].updatedAt = 2;
  const result = mergeDocuments(base,remote,base);
  assert.equal(result.speeches.length,3); assert.equal(result.speeches[0].content,'Remote edit');
});
test('local-only change survives a remote sync', () => {
  const base = initialDocument(), local = structuredClone(base);
  local.speeches[0].content = 'Local edit'; local.speeches[0].updatedAt = 2;
  const result = mergeDocuments(local,base,base);
  assert.equal(result.speeches.length,3); assert.equal(result.speeches[0].content,'Local edit');
});
test('deletion propagates when there is no concurrent edit', () => {
  const base = initialDocument(), local = structuredClone(base);
  local.speeches[0].deleted = true; local.speeches[0].updatedAt = 2;
  assert.equal(mergeDocuments(local,base,base).speeches[0].deleted,true);
});
test('a concurrent edit is preserved over a deletion', () => {
  const base = initialDocument(), local = structuredClone(base), remote = structuredClone(base);
  local.speeches[0].deleted = true; local.speeches[0].updatedAt = 2;
  remote.speeches[0].content = 'Important new words'; remote.speeches[0].updatedAt = 3;
  const result = mergeDocuments(local,remote,base);
  assert.equal(result.speeches[0].content,'Important new words'); assert.equal(result.speeches[0].deleted,false);
});
test('rehearsals deduplicate across devices and latest preferences win', () => {
  const local = initialDocument(), remote = initialDocument();
  local.rehearsals = [{ id:'r1',speechId:'s1',title:'A',seconds:30,date:2,completed:true }];
  remote.rehearsals = [...local.rehearsals,{ id:'r2',speechId:'s2',title:'B',seconds:10,date:3,completed:false }];
  remote.preferences.pace = 150; remote.preferencesUpdatedAt = 3;
  const merged = mergeDocuments(local,remote,initialDocument());
  assert.equal(merged.rehearsals.length,2); assert.equal(merged.preferences.pace,150);
});
test('malformed, oversized, duplicate-ID, and nonfinite imports are rejected', () => {
  assert.throws(() => validateDocument({ version:2 }));
  const d = initialDocument(); d.speeches[0].content = 'x'.repeat(50001); assert.throws(() => validateDocument(d));
  d.speeches[0].content = ''; d.speeches[1].id = d.speeches[0].id; assert.throws(() => validateDocument(d));
  d.speeches[1].id = 'valid'; d.preferences.pace = NaN; assert.throws(() => validateDocument(d));
});
test('cue boundaries preserve delivery notes and word counts exclude them', () => {
  const script = '[PAUSE]\nHello everyone.\n\nHere we go.\n\n';
  assert.equal(cues(script).length,2); assert.equal(wordCount(script),5);
  assert.deepEqual(cues('  '),[]); assert.equal(wordCount(''),0);
  assert.equal(clock(65.8),'01:05'); assert.equal(clock(-1),'00:00');
});
test('corrupt primary storage recovers the last safe copy', () => {
  const values = new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{ configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)} });
  const saved: Saved = { key:newKey(),document:initialDocument(),revision:0,base:null };
  assert.equal(persist(saved),true);
  assert.equal(persist({ ...saved,revision:1 }),true);
  values.set(STORAGE_KEY,'{corrupted');
  const result = readSaved(); assert.equal(result.saved.revision,0); assert.match(result.warning,/Recovered/);
});
test('quota errors are reported instead of falsely claiming a successful save', () => {
  Object.defineProperty(globalThis,'localStorage',{ configurable:true,value:{getItem:()=>null,setItem:()=>{throw new Error('QuotaExceededError');}} });
  assert.equal(persist({ key:newKey(),document:initialDocument(),revision:0,base:null }),false);
});
