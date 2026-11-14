import type { DrillNote, Range } from './drills'

/**
 * Warm-up exercises. Each is written once as a pattern of steps above a starting note; the app
 * works out the actual notes from the singer's range and moves the pattern up and down by semitones.
 */
export type Exercise = {
  id: string
  name: string
  /** The sound to sing it on. */
  sing: string
  /** One line on how to do it. */
  how: string
  /** Semitones above the starting note, one per note. Empty for a siren. */
  steps: number[]
  /** Length of each note in beats. */
  beats: number[]
  /** Seconds per beat at normal speed. */
  beat: number
  /** Semitones kept clear of the top and bottom of the range, to go easy on a cold voice. */
  margin: number
  /** Play the notes short and detached. */
  staccato?: boolean
  /** A free slide with no fixed notes; never judged. */
  siren?: boolean
  /** Sung on a trill or roll, where pitch cannot be read reliably; never judged. */
  unjudged?: boolean
}

const UP_DOWN_5 = [0, 2, 4, 5, 7, 5, 4, 2, 0]
const ARPEGGIO = [0, 4, 7, 12, 7, 4, 0]
const NINE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 12, 11, 9, 7, 5, 4, 2, 0]
const lastLong = (n: number, last = 2) => Array.from({ length: n }, (_, i) => (i === n - 1 ? last : 1))

export const EXERCISES: Record<string, Exercise> = {
  hum: {
    id: 'hum',
    name: 'Hum',
    sing: 'mm',
    how: 'Lips closed, jaw loose. Five notes up and back down.',
    steps: UP_DOWN_5,
    beats: lastLong(9),
    beat: 0.55,
    margin: 4,
  },
  liptrill: {
    id: 'liptrill',
    name: 'Lip trill',
    sing: 'brrrr',
    how: 'Lips loose and bubbling, steady air. Five notes up and back down.',
    steps: UP_DOWN_5,
    beats: lastLong(9),
    beat: 0.5,
    margin: 3,
    unjudged: true,
  },
  tongueroll: {
    id: 'tongueroll',
    name: 'Tongue roll',
    sing: 'rrrrr',
    how: 'Roll the tip of your tongue and glide up the chord and back. If you can’t roll an R, use the lip trill.',
    steps: ARPEGGIO,
    beats: lastLong(7),
    beat: 0.55,
    margin: 2,
    unjudged: true,
  },
  vowels: {
    id: 'vowels',
    name: 'Vowels on one note',
    sing: 'ee – eh – ah – oh – oo',
    how: 'One vowel per note, all on the same pitch. Keep the jaw loose and the tone even as the vowel changes.',
    steps: [0, 0, 0, 0, 0],
    beats: [2, 2, 2, 2, 3],
    beat: 0.5,
    margin: 4,
  },
  meemay: {
    id: 'meemay',
    name: 'Mee-may-mah',
    sing: 'mee – may – mah – moh – moo',
    how: 'One syllable per note, coming down five notes. Let the “m” buzz on your lips.',
    steps: [7, 5, 4, 2, 0],
    beats: [1.5, 1.5, 1.5, 1.5, 3],
    beat: 0.5,
    margin: 2,
  },
  siren: {
    id: 'siren',
    name: 'Siren',
    sing: 'lip trill or “ng”',
    how: 'One slow slide from low to high and back, like a siren. Follow the shape, not exact notes.',
    steps: [],
    beats: [],
    beat: 1,
    margin: 2,
    siren: true,
  },
  five: {
    id: 'five',
    name: 'Five-note scale',
    sing: 'ah',
    how: 'Up five notes and back down, smooth and joined.',
    steps: UP_DOWN_5,
    beats: lastLong(9),
    beat: 0.45,
    margin: 3,
  },
  arpeggio: {
    id: 'arpeggio',
    name: 'Arpeggio',
    sing: 'ah or oh',
    how: 'Up the chord to the octave and back down.',
    steps: ARPEGGIO,
    beats: lastLong(7),
    beat: 0.5,
    margin: 2,
  },
  descending: {
    id: 'descending',
    name: 'Descending five',
    sing: 'nay or nee',
    how: 'Start on top and come down five notes. Bright and a little nasal.',
    steps: [7, 5, 4, 2, 0],
    beats: lastLong(5),
    beat: 0.5,
    margin: 2,
  },
  octave: {
    id: 'octave',
    name: 'Octave leap',
    sing: 'ah',
    how: 'Jump up an octave, hold it, then come down the chord.',
    steps: [0, 12, 7, 4, 0],
    beats: [1, 3, 1, 1, 2],
    beat: 0.5,
    margin: 0,
  },
  staccato: {
    id: 'staccato',
    name: 'Staccato arpeggio',
    sing: 'ha',
    how: 'Short, bouncy notes from the belly, up the chord and back.',
    steps: ARPEGGIO,
    beats: lastLong(7, 1),
    beat: 0.45,
    margin: 1,
    staccato: true,
  },
  nine: {
    id: 'nine',
    name: 'Nine-note run',
    sing: 'ah',
    how: 'A quick scale up nine notes and back. Light and even.',
    steps: NINE,
    beats: lastLong(17, 4),
    beat: 0.25,
    margin: 0,
  },
}

export type RoutineId = 'quick' | 'standard' | 'full'

export const ROUTINES: Record<RoutineId, { name: string; minutes: number; exercises: string[] }> = {
  quick: { name: 'Quick', minutes: 3, exercises: ['hum', 'liptrill', 'five', 'arpeggio'] },
  standard: { name: 'Standard', minutes: 5, exercises: ['hum', 'liptrill', 'siren', 'vowels', 'five', 'arpeggio', 'descending'] },
  full: {
    name: 'Full',
    minutes: 10,
    exercises: ['hum', 'liptrill', 'tongueroll', 'siren', 'vowels', 'five', 'meemay', 'arpeggio', 'descending', 'octave', 'staccato', 'nine'],
  },
}

/** Lowest and highest starting note an exercise may use in this range, and where it begins. */
export function rootBounds(ex: Exercise, range: Range): { min: number; max: number; start: number } {
  const span = ex.siren ? 0 : Math.max(...ex.steps)
  let margin = ex.margin
  // Give up the safety margin before letting the pattern spill outside the range.
  while (margin > 0 && range.high - margin - span < range.low + margin) margin -= 1
  const min = range.low + margin
  const max = Math.max(min, range.high - margin - span)
  // Begin a little below the middle: a warm-up climbs before it comes down.
  return { min, max, start: Math.round(min + (max - min) * 0.4) }
}

export type Rep = {
  notes: DrillNote[]
  /** Seconds before the first note: the chord that sets the key. */
  lead: number
  /** When the chord sounds, and for how long. */
  chordAt: number
  chordSeconds: number
  /** Whole repetition in seconds, including the breath at the end. */
  duration: number
}

/** Seconds a siren's slide takes at normal speed. */
export const SIREN_SECONDS = 8

/** One repetition of an exercise starting on `root`. `extraLead` adds settling time before it. */
export function makeRep(ex: Exercise, root: number, speed: number, extraLead = 0): Rep {
  const beat = ex.beat / speed
  const chordSeconds = Math.max(0.9, beat * 2)
  const lead = extraLead + chordSeconds + 0.1
  let t = lead
  const notes: DrillNote[] = ex.steps.map((s, i) => {
    const note = { midi: root + s, start: t, seconds: ex.beats[i] * beat }
    t += note.seconds
    return note
  })
  if (ex.siren) t += SIREN_SECONDS / speed
  return { notes, lead, chordAt: extraLead, chordSeconds, duration: t + Math.max(0.6, beat) }
}
