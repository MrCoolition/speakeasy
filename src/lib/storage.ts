import { initialDocument, validateDocument, type Document } from './model';
export const STORAGE_KEY = 'speakeasy.v1';
export type Saved = { document: Document; revision: number; base: Document | null; key: string };
export function newKey() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export function validKey(key: string) { return /^[A-Za-z0-9_-]{43}$/.test(key); }
export function readSaved(): { saved: Saved; warning: string } {
  let warning = '';
  for (const name of [STORAGE_KEY, STORAGE_KEY + '.backup']) {
    try {
      const raw = localStorage.getItem(name);
      if (!raw) continue;
      const s = JSON.parse(raw) as Saved;
      if (!validKey(s.key) || !Number.isSafeInteger(s.revision) || s.revision < 0) throw new Error();
      return { saved: { ...s, document: validateDocument(s.document), base: s.base ? validateDocument(s.base) : null }, warning: name.endsWith('.backup') ? 'Recovered your last safe copy. Please export a backup.' : warning };
    } catch { warning = 'Device storage could not be read. Export your work before closing the app.'; }
  }
  return { saved: { document: initialDocument(), revision: 0, base: null, key: newKey() }, warning };
}
export function persist(saved: Saved): boolean {
  try {
    const text = JSON.stringify(saved);
    if (text.length > 2_000_000) return false;
    const previous = localStorage.getItem(STORAGE_KEY);
    // A backup failure should never prevent the primary save.
    try { if (previous) localStorage.setItem(STORAGE_KEY + '.backup', previous); } catch { /* Primary save still attempted. */ }
    localStorage.setItem(STORAGE_KEY, text);
    return true;
  } catch { return false; }
}
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function base64(bytes: Uint8Array) { let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value); }
function unbase64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export async function authToken(key: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('speakeasy-auth:' + key)); return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join(''); }
async function encryptionKey(secret: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('speakeasy-encryption:' + secret)); return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function encrypt(document: Document, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(key), new TextEncoder().encode(JSON.stringify(document)));
  return { iv: base64(iv), data: base64(new Uint8Array(data)) };
}
export async function decrypt(payload: { iv: string; data: string }, key: string): Promise<Document> {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(payload.iv) }, await encryptionKey(key), unbase64(payload.data));
  return validateDocument(JSON.parse(new TextDecoder().decode(bytes)));
}
