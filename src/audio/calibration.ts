import { playClick } from './player'
import type { Listening } from '../storage'

/**
 * Earphone timing check. Earphones (Bluetooth most of all) play sound a little late, so a singer
 * who is perfectly in time looks late to the app. The check plays clicks, the singer taps along,
 * and the usual gap between a click being sent and the tap is taken as the delay.
 */
export const TAP = { clicks: 8, gap: 0.6, skip: 2, maxDelay: 0.6 } as const

/** Delay assumed before a timing check has been done, in seconds. */
export const DEFAULT_DELAY: Record<Listening, number> = { speaker: 0, wired: 0.04, bluetooth: 0.2 }

/** Schedules the clicks and returns the audio-clock time of each. */
export function scheduleClicks(ctx: AudioContext, dest?: AudioNode): number[] {
  const t0 = ctx.currentTime + 0.8
  const times = Array.from({ length: TAP.clicks }, (_, i) => t0 + i * TAP.gap)
  times.forEach((t, i) => playClick(ctx, t, i === 0, dest))
  return times
}

/**
 * Works out the delay from taps (audio-clock times). The first clicks are ignored while the
 * singer finds the beat. Returns null when there were too few usable taps.
 */
export function delayFromTaps(clicks: number[], taps: number[]): number | null {
  const gaps: number[] = []
  for (const tap of taps) {
    let best = 0
    for (let i = 1; i < clicks.length; i++) if (Math.abs(tap - clicks[i]) < Math.abs(tap - clicks[best])) best = i
    if (best >= TAP.skip && Math.abs(tap - clicks[best]) < TAP.gap / 2) gaps.push(tap - clicks[best])
  }
  if (gaps.length < 4) return null
  gaps.sort((a, b) => a - b)
  const mid = gaps.length >> 1
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
  return Math.max(0, Math.min(TAP.maxDelay, median))
}
