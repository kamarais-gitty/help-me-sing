import type { Range } from './audio/drills'
import { LEVEL_ORDER, PATH, STAGES, type LevelId } from './audio/levels'
import type { SoundId } from './audio/player'

// Saved on this phone only. Browser storage can be blocked or cleared, so every access is guarded.

const RANGE_KEY = 'hms.range'
const LEVEL_KEY = 'hms.level'
const SETTINGS_KEY = 'hms.settings'
const PROGRESS_KEY = 'hms.progress'
const HISTORY_KEY = 'hms.history'

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

function getJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(get(key) ?? 'null')
    return v && typeof v === 'object' ? v : fallback
  } catch {
    return fallback
  }
}

export function loadRange(): Range | null {
  const r = getJson<Range | null>(RANGE_KEY, null)
  return r && Number.isInteger(r.low) && Number.isInteger(r.high) && r.high > r.low ? r : null
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

// Settings

/** How the singer hears the piano during a warm-up. */
export type Listening = 'speaker' | 'wired' | 'bluetooth'

export type Settings = {
  sound: SoundId
  /** Draw the sung pitch on the grid while singing. */
  live: boolean
  /** Last speed used at each level (1 = normal). */
  speeds: Partial<Record<LevelId, number>>
  listening: Listening
  /** Measured delay (seconds) between the app playing a sound and the singer hearing it. */
  latency: { wired?: number; bluetooth?: number }
}

const DEFAULT_SETTINGS: Settings = { sound: 'piano', live: true, speeds: {}, listening: 'speaker', latency: {} }

export function loadSettings(): Settings {
  const s = getJson<Partial<Settings>>(SETTINGS_KEY, {})
  return { ...DEFAULT_SETTINGS, ...s, speeds: { ...s.speeds }, latency: { ...s.latency } }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  set(SETTINGS_KEY, JSON.stringify(next))
  return next
}

// Progress on the guided path

export type Progress = {
  /** Best passing-speed score for each stage of each level; 0 when not yet tried. */
  stages: Record<LevelId, number[]>
  /** Best level-test score per level. */
  tests: Record<LevelId, number>
  /** Best session score at each speed (key: speed as a percentage), per level. */
  bestBySpeed: Record<LevelId, Record<string, number>>
  warmups: number
}

function emptyProgress(): Progress {
  const per = <T,>(make: (id: LevelId) => T) => Object.fromEntries(LEVEL_ORDER.map((id) => [id, make(id)])) as Record<LevelId, T>
  return {
    stages: per((id) => STAGES[id].map(() => 0)),
    tests: per(() => 0),
    bestBySpeed: per(() => ({})),
    warmups: 0,
  }
}

export function loadProgress(): Progress {
  const base = emptyProgress()
  const p = getJson<Partial<Progress>>(PROGRESS_KEY, {})
  for (const id of LEVEL_ORDER) {
    const saved = p.stages?.[id]
    if (Array.isArray(saved)) base.stages[id] = base.stages[id].map((_, i) => Number(saved[i]) || 0)
    base.tests[id] = Number(p.tests?.[id]) || 0
    base.bestBySpeed[id] = { ...p.bestBySpeed?.[id] }
  }
  base.warmups = Number(p.warmups) || 0
  return base
}

export function levelUnlocked(p: Progress, level: LevelId): boolean {
  const i = LEVEL_ORDER.indexOf(level)
  return i === 0 || p.tests[LEVEL_ORDER[i - 1]] >= PATH.pass
}

export function stageUnlocked(p: Progress, level: LevelId, stage: number): boolean {
  return levelUnlocked(p, level) && (stage === 0 || p.stages[level][stage - 1] >= PATH.pass)
}

// History

export type HistoryItem = {
  /** When it was finished (milliseconds since 1970). */
  t: number
  kind: 'stage' | 'test' | 'free' | 'warmup'
  level?: LevelId
  stage?: number
  score?: number
  speed?: number
}

export function loadHistory(): HistoryItem[] {
  const h = getJson<HistoryItem[]>(HISTORY_KEY, [])
  return Array.isArray(h) ? h : []
}

function addHistory(item: HistoryItem) {
  set(HISTORY_KEY, JSON.stringify([...loadHistory(), item].slice(-300)))
}

export type SessionOutcome = { passed: boolean; counted: boolean; newlyUnlocked: boolean }

/**
 * Saves a finished session. A stage or level test only counts towards unlocks at normal speed
 * or faster. Returns whether it passed and whether it unlocked something new.
 */
export function recordSession(item: Omit<HistoryItem, 't'>): SessionOutcome {
  addHistory({ ...item, t: Date.now() })
  const p = loadProgress()
  const score = item.score ?? 0
  const speed = item.speed ?? 1
  const counted = speed >= 1
  let newlyUnlocked = false
  if (item.kind === 'warmup') p.warmups += 1
  if (item.level && item.kind !== 'warmup') {
    const key = String(Math.round(speed * 100))
    const bests = p.bestBySpeed[item.level]
    bests[key] = Math.max(bests[key] ?? 0, score)
    if (counted && item.kind === 'stage' && item.stage !== undefined) {
      const before = p.stages[item.level][item.stage]
      newlyUnlocked = before < PATH.pass && score >= PATH.pass
      p.stages[item.level][item.stage] = Math.max(before, score)
    }
    if (counted && item.kind === 'test') {
      const before = p.tests[item.level]
      newlyUnlocked = before < PATH.pass && score >= PATH.pass
      p.tests[item.level] = Math.max(before, score)
    }
  }
  set(PROGRESS_KEY, JSON.stringify(p))
  return { passed: counted && score >= PATH.pass, counted, newlyUnlocked }
}

export function resetProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY)
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** Days in a row, ending today or yesterday, with at least one finished session. */
export function streak(history: HistoryItem[]): number {
  const day = (t: number) => {
    const d = new Date(t)
    return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000 + 0.5)
  }
  const days = new Set(history.map((h) => day(h.t)))
  let d = day(Date.now())
  if (!days.has(d)) d -= 1
  let n = 0
  while (days.has(d)) {
    n += 1
    d -= 1
  }
  return n
}
