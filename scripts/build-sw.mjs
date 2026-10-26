import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir('dist/assets')).map(x => '/assets/' + x);
const revision = createHash('sha256').update(await readFile('dist/index.html')).digest('hex').slice(0, 12);
const files = ['/', '/index.html', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', ...assets];
await writeFile('dist/sw.js', `
const CACHE = 'speakeasy-${revision}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  // An update waits until all old windows close. Never reload a speaker on stage.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('speakeasy-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data === 'CHECK_OFFLINE') event.waitUntil(caches.open(CACHE).then(async cache => {
    const complete = (await Promise.all(FILES.map(file => cache.match(file)))).every(Boolean);
    event.ports[0]?.postMessage({ ready: complete });
  }));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    // Static resources are identical for every user. Ignore Origin-related Vary
    // headers: module/CSS requests use CORS while precache requests may not.
    const cached = await cache.match(event.request.mode === 'navigate' ? '/index.html' : event.request, { ignoreVary: true });
    return cached || fetch(event.request);
  }));
});
`);
console.log('Offline app shell generated:', revision, files.length, 'files');
