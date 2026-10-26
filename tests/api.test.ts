import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/vault';
// These boundary tests intentionally run without a database, including in Vercel builds.
delete process.env.neon_connect;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
async function request(method: string, headers: Record<string,string> = {}) {
  let status = 200; let result: unknown; const responseHeaders = new Map();
  const res = { setHeader: (key:string,value:string) => responseHeaders.set(key,value), status: (code:number) => {status=code;return res;}, json: (body:unknown)=> {result=body;} };
  await handler({ method,headers } as never,res as never);
  return {status,result,headers:responseHeaders};
}
test('vault rejects unauthenticated reads', async () => { assert.equal((await request('GET')).status,401); });
test('vault rejects unsupported methods', async () => { assert.equal((await request('POST')).status,405); });
test('vault rejects malformed capabilities', async () => { assert.equal((await request('PUT',{authorization:'Bearer not-a-real-key'})).status,401); });
test('vault blocks cross-site browser requests', async () => { assert.equal((await request('PUT',{authorization:'Bearer '+'a'.repeat(64),'sec-fetch-site':'cross-site'})).status,403); });
test('database outage/configuration failure degrades to a non-cacheable error', async () => {
  const r = await request('GET',{authorization:'Bearer '+'a'.repeat(64)});
  assert.equal(r.status,503); assert.equal(r.headers.get('Cache-Control'),'private, no-store');
});
