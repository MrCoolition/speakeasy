import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeDocuments, type Document } from './model';
import { authToken, decrypt, encrypt, persist, readSaved, STORAGE_KEY, type Saved } from './storage';

export type SyncStatus = 'syncing' | 'synced' | 'pending' | 'offline' | 'unavailable';
export function useVault(paused: boolean) {
  const [initial] = useState(readSaved);
  const [saved, setSaved] = useState(initial.saved);
  const current = useRef(saved);
  const [warning, setWarning] = useState(initial.warning);
  const [status, setStatus] = useState<SyncStatus>('pending');
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const busy = useRef(false);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const replace = useCallback((next: Saved) => {
    if (JSON.stringify(next.document) === JSON.stringify(current.current.document)) next = { ...next, document: current.current.document };
    current.current = next;
    setSaved(next);
    const ok = persist(next);
    setWarning(ok ? '' : 'Device save failed. Keep this window open and export a backup now.');
    return ok;
  }, []);
  const change = useCallback((update: (doc: Document) => Document) => {
    const next = update(current.current.document);
    replace({ ...current.current, document: next });
    setStatus(navigator.onLine ? 'pending' : 'offline');
  }, [replace]);
  const sync = useCallback(async () => {
    if (busy.current || pausedRef.current) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    busy.current = true; setStatus('syncing');
    const key = current.current.key;
    try {
      const authorization = 'Bearer ' + await authToken(key);
      const response = await fetch('/api/vault', { headers: { authorization }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Cloud unavailable');
      const remote = await response.json();
      const remoteDoc = remote.payload ? await decrypt(remote.payload, key) : null;
      if (key !== current.current.key) return;
      const before = current.current;
      const combined = remoteDoc ? mergeDocuments(before.document, remoteDoc, before.base) : before.document;
      if (JSON.stringify(combined) === JSON.stringify(remoteDoc)) {
        replace({ ...before, document: combined, revision: remote.revision, base: combined });
        setStatus('synced'); return;
      }
      replace({ ...before, document: combined, revision: remote.revision, base: remoteDoc });
      const payload = await encrypt(combined, key);
      const result = await fetch('/api/vault', { method: 'PUT', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: remote.revision, payload }), signal: AbortSignal.timeout(12000) });
      if (result.status === 409) { setStatus('pending'); return; }
      if (!result.ok) throw new Error('Cloud unavailable');
      const { revision } = await result.json();
      if (key !== current.current.key) return;
      replace({ ...current.current, revision, base: combined });
      setStatus(JSON.stringify(current.current.document) === JSON.stringify(combined) ? 'synced' : 'pending');
    } catch { setStatus(navigator.onLine ? 'unavailable' : 'offline'); }
    finally { busy.current = false; }
  }, [replace]);
  useEffect(() => { if (!persist(current.current)) setWarning('Device storage is unavailable. Export your work before leaving.'); }, []);
  useEffect(() => {
    const handle = () => { setOnline(navigator.onLine); setStatus(navigator.onLine ? 'pending' : 'offline'); };
    window.addEventListener('online', handle); window.addEventListener('offline', handle);
    const crossTab = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const remote = JSON.parse(e.newValue) as Saved;
        if (remote.key !== current.current.key) { setWarning('Another window connected a different vault. Export this window’s work before reloading.'); return; }
        const base = e.oldValue ? JSON.parse(e.oldValue).document as Document : null;
        const document = mergeDocuments(current.current.document, remote.document, base);
        current.current = { ...remote, document }; setSaved(current.current);
        if (JSON.stringify(document) !== JSON.stringify(remote.document)) persist(current.current);
      } catch { setWarning('Another window could not be synchronized. Export a backup.'); }
    };
    window.addEventListener('storage', crossTab);
    return () => { window.removeEventListener('online', handle); window.removeEventListener('offline', handle); window.removeEventListener('storage', crossTab); };
  }, []);
  useEffect(() => {
    if (paused) return;
    const timeout = setTimeout(() => void sync(), 1800);
    const interval = setInterval(() => void sync(), 30000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [saved.document, paused, online, sync]);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let mounted = true;
    const verify = async () => {
      const registration = await navigator.serviceWorker.ready;
      const channel = new MessageChannel();
      channel.port1.onmessage = e => { if (mounted) setOfflineReady(e.data.ready === true); channel.port1.close(); };
      registration.active?.postMessage('CHECK_OFFLINE', [channel.port2]);
    };
    navigator.serviceWorker.register('/sw.js').then(verify).catch(() => { if (mounted) setOfflineReady(false); });
    const onVisible = () => { if (document.visibilityState === 'visible') void verify(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { mounted = false; document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return { saved, change, replace, warning, status, online, offlineReady, sync };
}
