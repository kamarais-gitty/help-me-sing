import type { Range } from './audio/drills'
import { LEVEL_ORDER, type LevelId } from './audio/levels'

// Saved on this phone only. Browser storage can be blocked or cleared, so every access is guarded.

const RANGE_KEY = 'hms.range'
const LEVEL_KEY = 'hms.level'

function get(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not saved; the app still works for this visit.
  }
}

export function loadRange(): Range | null {
  try {
    const r = JSON.parse(get(RANGE_KEY) ?? 'null')
    if (r && Number.isInteger(r.low) && Number.isInteger(r.high) && r.high > r.low) return r
  } catch {
    // Ignore a damaged value.
  }
  return null
}

export function saveRange(range: Range) {
  set(RANGE_KEY, JSON.stringify(range))
}

export function loadLevel(): LevelId {
  const l = get(LEVEL_KEY)
  return LEVEL_ORDER.includes(l as LevelId) ? (l as LevelId) : 'beginner'
}

export function saveLevel(level: LevelId) {
  set(LEVEL_KEY, level)
}
