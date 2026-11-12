export type Band = {
  /** Full marks when within this many cents of the target. */
  full: number
  /** Zero marks when this many cents away or more. */
  zero: number
}

export const BANDS: Record<'beginner' | 'intermediate' | 'advanced' | 'expert', Band> = {
  beginner: { full: 40, zero: 100 },
  intermediate: { full: 25, zero: 75 },
  advanced: { full: 15, zero: 50 },
  expert: { full: 10, zero: 40 },
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
  /** Share (0 to 1) of the sung note that stayed close to its own average pitch. */
  steadiness: number
  /** The pitch that was sung, as a fractional MIDI number. */
  sung: number
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Scores one sung note from the pitch samples taken during its time slot. */
export function scoreNote(samples: Sample[], target: number, band: Band): NoteScore {
  const voiced = samples.filter((s): s is { t: number; midi: number } => s.midi !== null)
  if (voiced.length < 15) {
    return { heard: false, score: 0, cents: 0, octaveOff: 0, steadiness: 0, sung: 0 }
  }
  // Voices slide into a note, so ignore the first tenth of a second.
  const onset = voiced[0].t
  const settled = voiced.filter((s) => s.t >= onset + 0.1)
  const body = settled.length >= 8 ? settled : voiced
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

export function stars(score: number): number {
  return score >= 95 ? 3 : score >= 85 ? 2 : score >= 70 ? 1 : 0
}
