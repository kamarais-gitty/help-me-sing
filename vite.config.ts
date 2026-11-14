import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Writes sw.js after a build: the small script that keeps a copy of the app on the phone so it
 * opens with no internet. It lists every built file, and its name changes whenever any file does,
 * so phones pick up a new version the next time they open the app online.
 */
function offline(): Plugin {
  return {
    name: 'offline',
    apply: 'build',
    closeBundle() {
      const dist = 'dist'
      const files = (readdirSync(dist, { recursive: true }) as string[])
        .map((f) => f.replaceAll('\\', '/'))
        .filter((f) => f.includes('.') && f !== 'sw.js')
        .sort()
      const hash = createHash('sha1')
      for (const f of files) hash.update(f).update(readFileSync(join(dist, f)))
      const version = hash.digest('hex').slice(0, 10)
      writeFileSync(
        join(dist, 'sw.js'),
        `const CACHE = 'sing-good-${version}'
const FILES = ${JSON.stringify(['./', ...files.filter((f) => f !== 'index.html')])}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sing-good-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location.href).pathname)) return
  if (e.request.mode === 'navigate') {
    // Online: always the newest version. Offline: the saved copy.
    e.respondWith(fetch(e.request).catch(() => caches.match('./', { cacheName: CACHE })))
    return
  }
  e.respondWith(caches.match(e.request, { cacheName: CACHE }).then((hit) => hit || fetch(e.request)))
})
`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/help-me-sing/',
  plugins: [react(), offline()],
})
