// Installing to the home screen, and offline use.

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let offer: InstallEvent | null = null
const waiting = new Set<() => void>()

/** Call once at start-up: catches Chrome's install offer and switches on offline use. */
export function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    offer = e as InstallEvent
    waiting.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    waiting.forEach((f) => f())
  })
  // The offline copy is only made for the published app, never while developing.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
        // The app still works online.
      })
    })
  }
}

export function onInstallChange(f: () => void): () => void {
  waiting.add(f)
  return () => waiting.delete(f)
}

export const canInstall = () => offer !== null

/** True when the app was opened from its home-screen icon. */
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches

export async function install(): Promise<boolean> {
  if (!offer) return false
  const e = offer
  offer = null
  await e.prompt()
  const { outcome } = await e.userChoice
  waiting.forEach((f) => f())
  return outcome === 'accepted'
}

/** Keeps the screen on, so a long warm-up is not cut off by the phone going to sleep. */
export function keepAwake() {
  type Lock = { request(type: 'screen'): Promise<unknown> }
  const lock = (navigator as Navigator & { wakeLock?: Lock }).wakeLock
  if (!lock) return
  const ask = () => {
    if (document.visibilityState === 'visible') lock.request('screen').catch(() => {})
  }
  ask()
  document.addEventListener('visibilitychange', ask)
}
