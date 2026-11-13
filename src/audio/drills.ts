import type { DrillSpec, DrillType } from './levels'

/** The singer's comfortable range, as whole MIDI note numbers. */
export type Range = { low: number; high: number }

export type DrillNote = {
  midi: number
  /** Seconds from the start of the drill. */
  start: number
  seconds: number
  /** Part of a run: too quick to judge alone, so it is scored with its neighbours. */
  run?: boolean
}

export type Drill = {
  type: DrillType
  /** Key the drill was written in, e.g. "D major". Empty for chromatic drills. */
  key: string
  notes: DrillNote[]
  /** The drill's pulse in seconds: the note length for equal notes, one beat for rhythm drills. */
  noteSeconds: number
  /** Total length in seconds. */
  duration: number
}

/** Speeds the tempo control offers, as a share of normal speed. */
export const SPEEDS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5]
/** Shortest note (seconds) that can be scored fairly on its own, and inside a run. Sets the top speed. */
const MIN_NOTE = 0.2
const MIN_RUN = 0.1

const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const MAJOR_PENTA = [0, 2, 4, 7, 9]
const MINOR_PENTA = [0, 3, 5, 7, 10]

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (Math.max(lo, hi) - lo + 1))

/** The middle share of the singer's range, never narrower than `minSpan` semitones. */
export function usedRange(range: Range, share: number, minSpan = 5): Range {
  const span = range.high - range.low
  const used = Math.max(Math.min(minSpan, span), Math.round(span * share))
  const low = range.low + Math.floor((span - used) / 2)
  return { low, high: low + used }
}

/** Builds a walk of `n` pitches by repeatedly calling `step`, keeping inside `pool` bounds. */
function walk(pool: number[], n: number, start: number, step: (i: number, idx: number) => number): number[] {
  const out: number[] = []
  let idx = Math.max(0, Math.min(pool.length - 1, start))
  for (let i = 0; i < n; i++) {
    out.push(pool[idx])
    let move = step(i, idx)
    if (idx + move < 0 || idx + move >= pool.length) move = -move
    idx = Math.max(0, Math.min(pool.length - 1, idx + move))
  }
  return out
}

/** A straight line of `n` notes up (dir 1) or down (dir -1) the pool, turning round at its ends. */
function line(pool: number[], n: number, dir: number): number[] {
  const start = dir > 0 ? between(0, Math.max(0, pool.length - n)) : between(Math.min(n - 1, pool.length - 1), pool.length - 1)
  let d = dir
  return walk(pool, n, start, (_, idx) => {
    if (idx + d < 0 || idx + d >= pool.length) d = -d
    return d
  })
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

type Pools = { scale: number[]; chord: number[]; chromatic: number[]; penta: number[] }
/** A generated note before timing: its pitch, its length in beats, and whether it is part of a run. */
type Gen = { midi: number; beats: number; run?: boolean }

const even = (pitches: number[]): Gen[] => pitches.map((midi) => ({ midi, beats: 1 }))

/** A rhythm for `n` notes built from short cells, always ending on a long note. */
function rhythm(n: number, cells: number[][], shortest: number): number[] {
  const out: number[] = []
  let left = n - 1
  let hasShort = false
  while (left > 0) {
    let options = cells.filter((c) => c.length <= left)
    // Make sure every rhythm has at least one group of quick notes.
    if (!hasShort && left <= 4) {
      const quick = options.filter((c) => c.includes(shortest))
      if (quick.length) options = quick
    }
    const c = options.length ? pick(options) : [1]
    out.push(...c)
    left -= c.length
    if (c.includes(shortest)) hasShort = true
  }
  out.push(2)
  return out
}

function generate(type: DrillType, spec: DrillSpec, p: Pools, n: number): Gen[] {
  const { scale, chord, chromatic, penta } = p
  const mid = (pool: number[]) => between(Math.floor(pool.length / 4), Math.ceil((pool.length * 3) / 4) - 1)
  const updown = () => (Math.random() < 0.5 ? 1 : -1)
  switch (type) {
    case 'held':
      return even([scale[mid(scale)]])
    case 'steps':
      // Neighbouring notes of the key, one step at a time.
      return even(walk(scale, n, mid(scale), updown))
    case 'intervals':
      // Leaps of at least a third, up to the largest jump allowed.
      return even(
        walk(scale, n, mid(scale), (_, idx) => {
          const moves = legalMoves(scale, idx, spec.maxJump, 3)
          return moves.length ? pick(moves) : 1
        }),
      )
    case 'scaleFragment':
    case 'scale':
      // A straight run up or down the key; turns around if it runs out of room.
      return even(line(scale, n, updown()))
    case 'arpeggio': {
      // The notes of the key's home chord, up then back down.
      const pool = chord.length >= 3 ? chord : scale
      let d = updown()
      const third = Math.floor(pool.length / 3)
      return even(
        walk(pool, n, d > 0 ? between(0, third) : pool.length - 1 - between(0, third), (_, idx) => {
          if (idx + d < 0 || idx + d >= pool.length || Math.abs(pool[idx + d] - pool[idx]) > spec.maxJump) d = -d
          return d
        }),
      )
    }
    case 'melody':
      // Mostly steps with the occasional leap, within the key.
      return even(
        walk(scale, n, mid(scale), (_, idx) => {
          if (Math.random() < 0.7) return updown()
          const moves = legalMoves(scale, idx, spec.maxJump, 3)
          return moves.length ? pick(moves) : 1
        }),
      )
    case 'chromaticRun':
      // Quick steps that include notes outside the key, with a wide leap now and then.
      return even(
        walk(chromatic, n, mid(chromatic), (_, idx) => {
          if (Math.random() < 0.8) return pick([-2, -1, 1, 2])
          const moves = legalMoves(chromatic, idx, spec.maxJump, 5)
          return moves.length ? pick(moves) : 1
        }),
      )
    case 'rhythmScale': {
      // A scale line in a long-and-short rhythm, ending on a held note.
      const beats = rhythm(n, [[1, 1], [0.5, 0.5, 1], [1, 0.5, 0.5], [0.5, 0.5], [1]], 0.5)
      return line(scale, n, updown()).map((midi, i) => ({ midi, beats: beats[i] }))
    }
    case 'arpeggioHold': {
      // Up the home chord, hold the top note, and come back down.
      const pool = chord.length >= 3 ? chord : scale
      const k = Math.min(3, pool.length - 1)
      const from = between(0, pool.length - 1 - k)
      const up = pool.slice(from, from + k + 1)
      const down = up.slice(0, -1).reverse()
      return [
        ...up.map((midi, i) => ({ midi, beats: i === up.length - 1 ? 2 : 1 })),
        ...down.map((midi, i) => ({ midi, beats: i === down.length - 1 ? 2 : 1 })),
      ]
    }
    case 'shortRun': {
      // Four to six quick notes that land on a held note.
      const k = between(4, 6)
      return line(scale, k + 1, updown()).map((midi, i) => (i < k ? { midi, beats: 0.5, run: true } : { midi, beats: 2 }))
    }
    case 'longRun': {
      // Eight to twelve fast notes up, down, or up and back, landing on a held note.
      const k = between(Math.max(8, spec.notes[0]), Math.max(8, spec.notes[1]))
      let pitches: number[]
      if (Math.random() < 0.4 && scale.length >= 4) {
        const h = Math.min(Math.ceil(k / 2), scale.length - 1)
        const from = between(0, scale.length - 1 - h)
        pitches = Array.from({ length: k + 1 }, (_, i) => {
          const m = i % (2 * h)
          return scale[from + (m <= h ? m : 2 * h - m)]
        })
      } else {
        pitches = line(scale, k + 1, updown())
      }
      return pitches.map((midi, i) => (i < k ? { midi, beats: 0.25, run: true } : { midi, beats: 2 }))
    }
    case 'turn': {
      // A quick turn around a note (note, above, note, below), then the note held. Two or three times.
      const count = between(2, 3)
      const dir = updown()
      let c = between(1, Math.max(1, scale.length - 2))
      const out: Gen[] = []
      for (let i = 0; i < count; i++) {
        const at = (j: number) => scale[Math.max(0, Math.min(scale.length - 1, j))]
        for (const j of [c, c + 1, c, c - 1]) out.push({ midi: at(j), beats: 0.25, run: true })
        out.push({ midi: at(c), beats: i === count - 1 ? 2 : 1 })
        c = Math.max(1, Math.min(scale.length - 2, c + dir))
      }
      return out
    }
    case 'riff': {
      // A pentatonic phrase, mostly falling, with dotted rhythms and groups of four fast notes.
      const count = between(7, 10)
      const beats = rhythm(count, [[0.75, 0.25], [0.25, 0.25, 0.25, 0.25], [0.5, 0.5], [0.75, 0.25, 0.5, 0.5]], 0.25)
      const pool = penta.length >= 4 ? penta : scale
      const start = pool.length - 1 - between(0, Math.floor(pool.length / 3))
      return walk(pool, count, start, () => (Math.random() < 0.75 ? -1 : 1)).map((midi, i) => ({
        midi,
        beats: beats[i],
        run: beats[i] <= 0.25 ? true : undefined,
      }))
    }
  }
}

/** Makes a new drill at normal speed, fitted to the singer's range. */
export function makeDrill(spec: DrillSpec, range: Range): Drill {
  const used = usedRange(range, spec.rangeShare)
  const type = pick(spec.types)
  const all = Array.from({ length: used.high - used.low + 1 }, (_, i) => used.low + i)

  // Choose a key that gives enough notes inside the range being used.
  const pools: Pools = { scale: [], chord: [], chromatic: all, penta: [] }
  let key = ''
  for (let tries = 0; tries < 30; tries++) {
    const tonic = between(0, 11)
    const minor = spec.minor ?? (type === 'scaleFragment' || type === 'scale' ? Math.random() < 0.35 : Math.random() < 0.25)
    const steps = minor ? MINOR : MAJOR
    const degree = (m: number) => (((m - tonic) % 12) + 12) % 12
    pools.scale = all.filter((m) => steps.includes(degree(m)))
    pools.chord = all.filter((m) => [0, steps[2], 7].includes(degree(m)))
    pools.penta = all.filter((m) => (minor ? MINOR_PENTA : MAJOR_PENTA).includes(degree(m)))
    key = `${KEY_NAMES[tonic]} ${minor ? 'minor' : 'major'}`
    const needsChord = type === 'arpeggio' || type === 'arpeggioHold'
    if (pools.scale.length >= 4 && (!needsChord || pools.chord.length >= 3) && (type !== 'riff' || pools.penta.length >= 4)) break
  }

  const n = type === 'held' ? 1 : between(Math.max(2, spec.notes[0]), spec.notes[1])
  const gen = generate(type, spec, pools, n)

  const isRhythm = gen.some((g) => g.beats !== 1)
  const [lo, hi] = isRhythm ? spec.rhythmBeat : spec.noteSeconds
  const unit = Math.round((lo + Math.random() * (hi - lo)) * 20) / 20
  let t = 0
  const notes: DrillNote[] = gen.map((g) => {
    const note: DrillNote = { midi: g.midi, start: t, seconds: g.beats * unit }
    if (g.run) note.run = true
    t += note.seconds
    return note
  })
  return { type, key: type === 'chromaticRun' ? '' : key, notes, noteSeconds: unit, duration: t }
}

/** The same drill, faster or slower. `speed` is a share of normal speed (1 = normal). */
export function atSpeed(drill: Drill, speed: number): Drill {
  if (speed === 1) return drill
  const k = 1 / speed
  return {
    ...drill,
    notes: drill.notes.map((n) => ({ ...n, start: n.start * k, seconds: n.seconds * k })),
    noteSeconds: drill.noteSeconds * k,
    duration: drill.duration * k,
  }
}

/** The fastest speed at which every note of this drill is still long enough to score fairly. */
export function maxSpeed(drill: Drill): number {
  const room = Math.min(...drill.notes.map((n) => n.seconds / (n.run ? MIN_RUN : MIN_NOTE)))
  return Math.max(1, Math.min(1.5, Math.floor(room * 10 + 1e-6) / 10))
}

/** Count-in beat: the note length, halved or doubled until it is a comfortable click speed. */
export function beatFor(noteSeconds: number): number {
  let b = noteSeconds
  while (b > 1) b /= 2
  while (b < 0.45) b *= 2
  return b
}
