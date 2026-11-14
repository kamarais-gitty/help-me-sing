const CACHE = 'sing-good-44eb4bf6df'
const FILES = ["./","assets/index-CZ1WhS98.js","assets/index-Dj82TygO.css","icon-192.png","icon-512.png","icon.svg","manifest.webmanifest","piano/A1.mp3","piano/A2.mp3","piano/A3.mp3","piano/A4.mp3","piano/A5.mp3","piano/C2.mp3","piano/C3.mp3","piano/C4.mp3","piano/C5.mp3","piano/C6.mp3","piano/Ds2.mp3","piano/Ds3.mp3","piano/Ds4.mp3","piano/Ds5.mp3","piano/Fs2.mp3","piano/Fs3.mp3","piano/Fs4.mp3","piano/Fs5.mp3"]

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
