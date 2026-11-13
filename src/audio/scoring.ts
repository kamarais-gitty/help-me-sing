import type { DrillNote } from './drills'

export type Band = {
  /** Full marks when within this many cents of the target. */
  full: number
  /** Zero marks when this many cents away or more. */
  zero: number
}

export type Sample = { t: number; midi: number | null }

export type NoteScore = {
  /** False when no sung note was heard in the time slot. */
  heard: boolean
  /** 0 to 100. */
  score: number
  /** Cents sharp (+) or flat (-) of the target, after removing any octave error. */
  cents: number
  /** Whole octaves too high (+) or too low (-). 0 when sung in the right octave. */
  octaveOff: number
  /** Share (0 to 1) of the sung note that stayed close to its own middle pitch. */
  steadiness: number
  /** The pitch that was sung, as a fractional MIDI number. */
  sung: number
  /** True when the note was scored as part of a run, not on its own. */
  run?: boolean
}

export type DrillScore = {
  notes: NoteScore[]
  /** Average of the note scores, weighted by note length, 0 to 100. */
  score: number
  /** How late (+) or early (-) the singer came in overall, in seconds. */
  offset: number
}

const NOT_HEARD: NoteScore = { heard: false, score: 0, cents: 0, octaveOff: 0, steadiness: 0, sung: 0 }

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Scores one sung note from the pitch samples taken during its time slot.
 * `glide` is how long (seconds) to ignore at the start while the voice slides onto the note.
 */
export function scoreNote(samples: Sample[], target: number, band: Band, glide = 0.1): NoteScore {
  const voiced = samples.filter((s): s is { t: number; midi: number } => s.midi !== null)
  // At least a third of the slot must have a clear pitch, and never fewer than 4 readings.
  if (voiced.length < Math.max(4, samples.length * 0.33)) return NOT_HEARD

  const onset = voiced[0].t
  const settled = voiced.filter((s) => s.t >= onset + glide)
  const raw = settled.length >= Math.max(3, voiced.length * 0.4) ? settled : voiced

  // A reading that jumps exactly an octave away from the rest of the note is the detector
  // catching an overtone, not the singer. Find the octave most readings are in (the expected one
  // wins a tie) and move the odd ones back to it.
  const octaveOf = (m: number) => Math.round((m - target) / 12)
  const counts = new Map<number, number>()
  for (const s of raw) counts.set(octaveOf(s.midi), (counts.get(octaveOf(s.midi)) ?? 0) + 1)
  let home = 0
  for (const [k, c] of counts) if (c > (counts.get(home) ?? 0)) home = k
  const body = raw.map((s) => {
    const k = octaveOf(s.midi)
    return k !== home && Math.abs(s.midi - target - k * 12) < 1 ? { t: s.t, midi: s.midi - (k - home) * 12 } : s
  })
  const sung = median(body.map((s) => s.midi))

  let cents = (sung - target) * 100
  let octaveOff = 0
  const octaves = Math.round(cents / 1200)
  if (octaves !== 0 && Math.abs(cents - octaves * 1200) <= band.zero) {
    octaveOff = octaves
    cents -= octaves * 1200
  }

  // Score every reading against the target and average them, so a note that wanders above and
  // below the target loses marks even when its middle value happens to land in tune.
  const bandScore = (off: number) =>
    off <= band.full ? 100 : off >= band.zero ? 0 : (100 * (band.zero - off)) / (band.zero - band.full)
  const shift = octaveOff * 12
  let score =
    body.reduce((sum, s) => sum + bandScore(Math.abs((s.midi - shift - target) * 100)), 0) / body.length
  // The right note in the wrong octave is a different mistake from being out of tune: half marks.
  if (octaveOff !== 0) score /= 2

  const steady = body.filter((s) => Math.abs(s.midi - sung) * 100 <= band.full).length / body.length

  return {
    heard: true,
    score: Math.round(score),
    cents: Math.round(cents),
    octaveOff,
    steadiness: steady,
    sung,
  }
}

/** In a run, a reading within this many cents of a note counts as on it. */
const RUN_CENTS = 50
/** In a run, being on the right pitches for this share of the time earns full marks. */
const RUN_FULL_SHARE = 0.75

/**
 * Scores one quick note of a run. Notes this short cannot be judged one by one, so the score is
 * the share of the note's time spent on its pitch or on the run note just before or after it
 * (being a note early or late in a run is forgiven).
 */
function scoreRunNote(samples: Sample[], targets: number[]): NoteScore {
  const voiced = samples.filter((s): s is { t: number; midi: number } => s.midi !== null)
  if (voiced.length < Math.max(2, samples.length * 0.25)) return { ...NOT_HEARD, run: true }
  const on = (m: number) =>
    targets.some((t) => {
      const d = m - t
      return Math.abs(d - 12 * Math.round(d / 12)) * 100 <= RUN_CENTS
    })
  const share = voiced.filter((s) => on(s.midi)).length / samples.length
  return {
    heard: true,
    score: Math.min(100, Math.round((share / RUN_FULL_SHARE) * 100)),
    cents: 0,
    octaveOff: 0,
    steadiness: share,
    sung: median(voiced.map((s) => s.midi)),
    run: true,
  }
}

function scoreAt(samples: Sample[], notes: DrillNote[], band: Band, offset: number, all = notes): NoteScore[] {
  return notes.map((n) => {
    const from = n.start + offset
    const to = from + n.seconds
    const slot = samples.filter((s) => s.t >= from && s.t < to)
    if (n.run) {
      const i = all.indexOf(n)
      const near = [all[i - 1], n, all[i + 1]].filter((x) => x).map((x) => x.midi)
      return scoreRunNote(slot, near)
    }
    return scoreNote(slot, n.midi, band, Math.min(0.1, n.seconds * 0.3))
  })
}

/** Total of the note scores, each counted by its length, so a held note matters more than a passing one. */
const weighted = (scores: NoteScore[], notes: DrillNote[]) => scores.reduce((sum, s, i) => sum + s.score * notes[i].seconds, 0)

/**
 * Scores a whole drill. Sample times are seconds from when singing should have started.
 * Singers often come in a little early or late, so every start within `timing` seconds is
 * tried and the fairest one is used.
 */
export function scoreDrill(samples: Sample[], notes: DrillNote[], band: Band, timing: number): DrillScore {
  let best: { notes: NoteScore[]; total: number; offset: number } | null = null
  const step = 0.025
  for (let k = -Math.round(timing / step); k <= Math.round(timing / step); k++) {
    const offset = k * step
    const scored = scoreAt(samples, notes, band, offset)
    const total = weighted(scored, notes)
    if (!best || total > best.total || (total === best.total && Math.abs(offset) < Math.abs(best.offset))) {
      best = { notes: scored, total, offset }
    }
  }
  const result = best!

  // Then let each note be a little early or late on its own (up to 40% of its length,
  // and no more than half the level's allowance), keeping whichever start fits it best.
  const notesOut = notes.map((n, i) => {
    if (n.run) return result.notes[i]
    const local = Math.min(n.seconds * 0.4, timing / 2)
    let bestNote = result.notes[i]
    let bestShift = 0
    for (let k = -Math.round(local / step); k <= Math.round(local / step); k++) {
      const shift = k * step
      const [s] = scoreAt(samples, [n], band, result.offset + shift)
      if (s.score > bestNote.score || (s.score === bestNote.score && Math.abs(shift) < Math.abs(bestShift))) {
        bestNote = s
        bestShift = shift
      }
    }
    return bestNote
  })
  result.notes = notesOut
  result.total = weighted(notesOut, notes)

  return {
    notes: result.notes,
    score: Math.round(result.total / notes.reduce((sum, n) => sum + n.seconds, 0)),
    offset: result.offset,
  }
}

export function stars(score: number): number {
  return score >= 95 ? 3 : score >= 85 ? 2 : score >= 70 ? 1 : 0
}
