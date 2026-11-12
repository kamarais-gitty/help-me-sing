import { LEVELS, type DrillType, type Level, type LevelId } from './levels'

/** The singer's comfortable range, as whole MIDI note numbers. */
export type Range = { low: number; high: number }

export type DrillNote = {
  midi: number
  /** Seconds from the start of the drill. */
  start: number
  seconds: number
}

export type Drill = {
  level: LevelId
  type: DrillType
  /** Key the drill was written in, e.g. "D major". Empty for chromatic drills. */
  key: string
  notes: DrillNote[]
  noteSeconds: number
  /** Total length in seconds. */
  duration: number
}

const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))

/** The middle share of the singer's range, never narrower than `minSpan` semitones. */
export function usedRange(range: Range, share: number, minSpan = 5): Range {
  const span = range.high - range.low
  const used = Math.max(Math.min(minSpan, span), Math.round(span * share))
  const low = range.low + Math.floor((span - used) / 2)
  return { low, high: low + used }
}

/** Builds a walk of `n` pitches by repeatedly calling `next`, keeping inside `pool` bounds. */
function walk(pool: number[], n: number, start: number, step: (i: number, idx: number) => number): number[] {
  const out: number[] = []
  let idx = start
  for (let i = 0; i < n; i++) {
    out.push(pool[idx])
    let move = step(i, idx)
    if (idx + move < 0 || idx + move >= pool.length) move = -move
    idx = Math.max(0, Math.min(pool.length - 1, idx + move))
  }
  return out
}

/** Index moves in `pool` that keep a jump within `maxJump` semitones. */
function legalMoves(pool: number[], idx: number, maxJump: number, minJump = 1): number[] {
  const moves: number[] = []
  for (let j = 0; j < pool.length; j++) {
    const d = Math.abs(pool[j] - pool[idx])
    if (j !== idx && d >= minJump && d <= maxJump) moves.push(j - idx)
  }
  return moves
}

function generatePitches(type: DrillType, level: Level, scale: number[], chord: number[], chromatic: number[], n: number): number[] {
  const mid = (pool: number[]) => between(Math.floor(pool.length / 4), Math.ceil((pool.length * 3) / 4) - 1)
  switch (type) {
    case 'held':
      return [scale[mid(scale)]]
    case 'steps': {
      // Neighbouring notes of the key, one step at a time.
      return walk(scale, n, mid(scale), () => (Math.random() < 0.5 ? -1 : 1))
    }
    case 'intervals': {
      // Leaps of at least a third, up to the level's largest jump.
      return walk(scale, n, mid(scale), (_, idx) => {
        const moves = legalMoves(scale, idx, level.maxJump, 3)
        return moves.length ? pick(moves) : 1
      })
    }
    case 'scaleFragment':
    case 'scale': {
      // A straight run up or down the key; turns around if it runs out of room.
      const dir = Math.random() < 0.5 ? 1 : -1
      const start = dir > 0 ? between(0, Math.max(0, scale.length - n)) : between(Math.min(n - 1, scale.length - 1), scale.length - 1)
      let d = dir
      return walk(scale, n, start, (_, idx) => {
        if (idx + d < 0 || idx + d >= scale.length) d = -d
        return d
      })
    }
    case 'arpeggio': {
      // The notes of the key's home chord, up then back down.
      const pool = chord.length >= 3 ? chord : scale
      let d = Math.random() < 0.5 ? 1 : -1
      return walk(pool, n, d > 0 ? between(0, Math.floor(pool.length / 3)) : pool.length - 1 - between(0, Math.floor(pool.length / 3)), (_, idx) => {
        if (idx + d < 0 || idx + d >= pool.length || Math.abs(pool[idx + d] - pool[idx]) > level.maxJump) d = -d
        return d
      })
    }
    case 'melody': {
      // Mostly steps with the occasional leap, within the key.
      return walk(scale, n, mid(scale), (_, idx) => {
        if (Math.random() < 0.7) return Math.random() < 0.5 ? -1 : 1
        const moves = legalMoves(scale, idx, level.maxJump, 3)
        return moves.length ? pick(moves) : 1
      })
    }
    case 'chromaticRun': {
      // Quick steps that include notes outside the key, with a wide leap now and then.
      return walk(chromatic, n, mid(chromatic), (_, idx) => {
        if (Math.random() < 0.8) return pick([-2, -1, 1, 2])
        const moves = legalMoves(chromatic, idx, level.maxJump, 5)
        return moves.length ? pick(moves) : 1
      })
    }
  }
}

/** Makes a new drill for this level, fitted to the singer's range. */
export function makeDrill(levelId: LevelId, range: Range): Drill {
  const level = LEVELS[levelId]
  const used = usedRange(range, level.rangeShare)
  const type = pick(level.drills)

  // Choose a key that gives enough notes inside the range being used.
  let scale: number[] = []
  let chord: number[] = []
  let key = ''
  for (let tries = 0; tries < 20; tries++) {
    const tonic = between(0, 11)
    const minor = type === 'scaleFragment' || type === 'scale' ? Math.random() < 0.35 : Math.random() < 0.25
    const steps = minor ? MINOR : MAJOR
    const inKey = (m: number) => steps.includes((((m - tonic) % 12) + 12) % 12)
    const inChord = (m: number) => [0, steps[2], 7].includes((((m - tonic) % 12) + 12) % 12)
    const all = Array.from({ length: used.high - used.low + 1 }, (_, i) => used.low + i)
    scale = all.filter(inKey)
    chord = all.filter(inChord)
    key = `${KEY_NAMES[tonic]} ${minor ? 'minor' : 'major'}`
    if (scale.length >= 4 && (type !== 'arpeggio' || chord.length >= 3)) break
  }
  const chromatic = Array.from({ length: used.high - used.low + 1 }, (_, i) => used.low + i)

  const n = type === 'held' ? 1 : between(Math.max(2, level.notes[0]), level.notes[1])
  const pitches = generatePitches(type, level, scale, chord, chromatic, n)

  const [lo, hi] = level.noteSeconds
  const noteSeconds = Math.round((lo + Math.random() * (hi - lo)) * 20) / 20
  const notes = pitches.map((midi, i) => ({ midi, start: i * noteSeconds, seconds: noteSeconds }))
  return {
    level: levelId,
    type,
    key: type === 'chromaticRun' ? '' : key,
    notes,
    noteSeconds,
    duration: notes.length * noteSeconds,
  }
}

/** Count-in beat: the note length, halved or doubled until it is a comfortable click speed. */
export function beatFor(noteSeconds: number): number {
  let b = noteSeconds
  while (b > 1) b /= 2
  while (b < 0.45) b *= 2
  return b
}
