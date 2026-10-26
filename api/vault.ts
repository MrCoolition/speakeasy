import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

let schema: Promise<void> | null = null;
type VercelRequest = IncomingMessage & { body?: unknown };
type VercelResponse = ServerResponse & { status(code: number): VercelResponse; json(data: unknown): void };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'GET' && req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); return res.status(405).json({ error: 'Method not allowed' }); }
  const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return res.status(401).json({ error: 'A private vault key is required.' });
  // Ignore cross-origin browser writes. Non-browser access still requires the capability.
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-origin access is not allowed.' });
  const connection = process.env.neon_connect || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connection) return res.status(503).json({ error: 'Cloud backup is not configured. Your device copy is available.' });
  try {
    const sql = neon(connection, { fetchOptions: { signal: AbortSignal.timeout(10000) } });
    if (!schema) schema = sql`CREATE TABLE IF NOT EXISTS speakeasy_vaults (owner_hash TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`.then(() => undefined).catch(error => { schema = null; throw error; });
    await schema;
    const owner = createHash('sha256').update(token).digest('hex');
    if (req.method === 'GET') {
      const rows = await sql`SELECT revision, payload FROM speakeasy_vaults WHERE owner_hash = ${owner}`;
      return res.status(200).json(rows[0] || { revision: 0, payload: null });
    }
    if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).json({ error: 'JSON required.' });
    let body: { revision?: unknown; payload?: { iv?: unknown; data?: unknown } };
    try { body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as typeof body; } catch { return res.status(400).json({ error: 'Invalid JSON.' }); }
    const revision = body?.revision, payload = body?.payload;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 || revision >= 2147483647 || !payload || typeof payload.iv !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(payload.iv) || typeof payload.data !== 'string' || payload.data.length < 24 || payload.data.length > 1_500_000 || !/^[A-Za-z0-9+/]+=*$/.test(payload.data)) return res.status(400).json({ error: 'Invalid or oversized encrypted backup.' });
    const json = JSON.stringify({ iv: payload.iv, data: payload.data });
    const rows = revision === 0
      ? await sql`INSERT INTO speakeasy_vaults (owner_hash, payload) VALUES (${owner}, ${json}::jsonb) ON CONFLICT DO NOTHING RETURNING revision`
      : await sql`UPDATE speakeasy_vaults SET payload = ${json}::jsonb, revision = revision + 1, updated_at = now() WHERE owner_hash = ${owner} AND revision = ${revision} RETURNING revision`;
    if (!rows.length) return res.status(409).json({ error: 'A newer backup exists. Sync again to preserve both versions.' });
    return res.status(200).json({ revision: rows[0].revision });
  } catch {
    // Never log credentials, speech content, or the capability token.
    console.error('Speakeasy vault request failed', { method: req.method });
    return res.status(503).json({ error: 'Cloud backup is temporarily unavailable. Your device copy is available.' });
  }
}
