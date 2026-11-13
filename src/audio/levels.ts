/**
 * The four levels and their guided-path stages. All difficulty numbers live here so they can be
 * tuned from testing. See the "Levels and difficulty" and "Scoring" tables in the plan.
 */

export type LevelId = 'beginner' | 'intermediate' | 'advanced' | 'expert'

export type DrillType =
  | 'held'
  | 'steps'
  | 'intervals'
  | 'scaleFragment'
  | 'scale'
  | 'arpeggio'
  | 'melody'
  | 'chromaticRun'
  // Rhythm and run drills (Advanced and Expert).
  | 'rhythmScale'
  | 'arpeggioHold'
  | 'shortRun'
  | 'longRun'
  | 'turn'
  | 'riff'

/** Everything the drill generator needs to know. */
export type DrillSpec = {
  /** Drill types to pick from. */
  types: DrillType[]
  /** Fewest and most notes in a drill. */
  notes: [number, number]
  /** Shortest and longest note length (seconds, at normal speed) for drills of equal notes. */
  noteSeconds: [number, number]
  /** Shortest and longest beat (seconds, at normal speed) for rhythm and run drills. */
  rhythmBeat: [number, number]
  /** Share (0 to 1) of the singer's range that drills use, taken from the middle. */
  rangeShare: number
  /** Largest jump between two neighbouring notes, in semitones. */
  maxJump: number
  /** Force a minor (true) or major (false) key. Left out: the generator chooses. */
  minor?: boolean
}

export type Level = DrillSpec & {
  id: LevelId
  name: string
  /** Full marks within this many cents of the target. */
  full: number
  /** Zero marks this many cents away or more. */
  zero: number
  /** How early or late (seconds) the singer may come in and still be scored fairly. */
  timing: number
}

export const LEVELS: Record<LevelId, Level> = {
  beginner: {
    id: 'beginner',
    name: 'Beginner',
    types: ['held', 'steps', 'intervals'],
    notes: [1, 3],
    noteSeconds: [2, 2],
    rhythmBeat: [0.75, 0.75],
    rangeShare: 0.5,
    maxJump: 4, // a major third
    full: 40,
    zero: 100,
    timing: 0.5,
  },
  intermediate: {
    id: 'intermediate',
    name: 'Intermediate',
    types: ['intervals', 'scaleFragment', 'melody'],
    notes: [3, 5],
    noteSeconds: [1, 1],
    rhythmBeat: [0.75, 0.75],
    rangeShare: 0.7,
    maxJump: 7, // a fifth
    full: 25,
    zero: 75,
    timing: 0.4,
  },
  advanced: {
    id: 'advanced',
    name: 'Advanced',
    types: ['scale', 'arpeggio', 'melody', 'rhythmScale', 'arpeggioHold', 'shortRun'],
    notes: [5, 8],
    noteSeconds: [0.5, 0.75],
    rhythmBeat: [0.6, 0.75],
    rangeShare: 0.9,
    maxJump: 12, // an octave
    full: 15,
    zero: 50,
    timing: 0.3,
  },
  expert: {
    id: 'expert',
    name: 'Expert',
    types: ['chromaticRun', 'melody', 'arpeggio', 'longRun', 'turn', 'riff'],
    notes: [8, 12],
    noteSeconds: [0.25, 0.5],
    rhythmBeat: [0.6, 0.72],
    rangeShare: 1,
    maxJump: 16, // more than an octave
    full: 10,
    zero: 40,
    timing: 0.25,
  },
}

export const LEVEL_ORDER: LevelId[] = ['beginner', 'intermediate', 'advanced', 'expert']

export const DRILL_NAMES: Record<DrillType, string> = {
  held: 'Held note',
  steps: 'Steps',
  intervals: 'Intervals',
  scaleFragment: 'Scale fragment',
  scale: 'Scale',
  arpeggio: 'Arpeggio',
  melody: 'Melody',
  chromaticRun: 'Fast run',
  rhythmScale: 'Scale in rhythm',
  arpeggioHold: 'Arpeggio, held top',
  shortRun: 'Short run',
  longRun: 'Long run',
  turn: 'Turns',
  riff: 'Pentatonic riff',
}

/** Drill types whose notes are played joined together, as a phrase. */
export const PHRASE_TYPES: DrillType[] = ['rhythmScale', 'arpeggioHold', 'shortRun', 'longRun', 'turn', 'riff']

/** One step of the guided path: a name and what it changes from the level's normal drill. */
export type Stage = { name: string; spec: Partial<DrillSpec> }

/** Rounds in a stage, rounds in a level test, and the average score that passes either. */
export const PATH = { stageRounds: 5, testRounds: 10, pass: 70 } as const

export const STAGES: Record<LevelId, Stage[]> = {
  beginner: [
    { name: 'One held note', spec: { types: ['held'], rangeShare: 0.3 } },
    { name: 'Held notes, higher and lower', spec: { types: ['held'] } },
    { name: 'Two notes, a step apart', spec: { types: ['steps'], notes: [2, 2] } },
    { name: 'Three notes in steps', spec: { types: ['steps'], notes: [3, 3] } },
    { name: 'Two notes, a skip apart', spec: { types: ['intervals'], notes: [2, 2] } },
    { name: 'Three notes with skips', spec: { types: ['intervals', 'steps'], notes: [3, 3] } },
    { name: 'A little quicker', spec: { types: ['steps', 'intervals'], notes: [3, 3], noteSeconds: [1.5, 1.5] } },
    { name: 'Everything so far', spec: {} },
  ],
  intermediate: [
    { name: 'Three notes of a scale', spec: { types: ['scaleFragment'], notes: [3, 3], minor: false } },
    { name: 'Longer scale fragments', spec: { types: ['scaleFragment'], notes: [4, 5], minor: false } },
    { name: 'Leaps of a third', spec: { types: ['intervals'], notes: [3, 3], maxJump: 4 } },
    { name: 'Leaps up to a fourth', spec: { types: ['intervals'], notes: [3, 4], maxJump: 5 } },
    { name: 'Leaps up to a fifth', spec: { types: ['intervals'], notes: [3, 5] } },
    { name: 'Minor scale fragments', spec: { types: ['scaleFragment'], notes: [4, 5], minor: true } },
    { name: 'Short melodies', spec: { types: ['melody'], notes: [4, 5], maxJump: 5 } },
    { name: 'Everything so far', spec: {} },
  ],
  advanced: [
    { name: 'Scales of five or six notes', spec: { types: ['scale'], notes: [5, 6] } },
    { name: 'Longer scales', spec: { types: ['scale'], notes: [7, 8] } },
    { name: 'Arpeggios', spec: { types: ['arpeggio'], notes: [5, 7] } },
    { name: 'Melodies with leaps', spec: { types: ['melody'], maxJump: 9 } },
    { name: 'Melodies up to an octave', spec: { types: ['melody'] } },
    { name: 'Scales in rhythm', spec: { types: ['rhythmScale'] } },
    { name: 'Held top notes and short runs', spec: { types: ['arpeggioHold', 'shortRun'] } },
    { name: 'Everything so far', spec: {} },
  ],
  expert: [
    { name: 'Quick melodies', spec: { types: ['melody'], notes: [8, 8], noteSeconds: [0.4, 0.5] } },
    { name: 'Quicker and longer', spec: { types: ['melody'], noteSeconds: [0.25, 0.35] } },
    { name: 'Wide arpeggios', spec: { types: ['arpeggio'] } },
    { name: 'Runs outside the key', spec: { types: ['chromaticRun'] } },
    { name: 'Long runs', spec: { types: ['longRun'] } },
    { name: 'Turns', spec: { types: ['turn'] } },
    { name: 'Pentatonic riffs', spec: { types: ['riff'] } },
    { name: 'Everything so far', spec: {} },
  ],
}

/** The drill settings for a stage of a level, or for the whole level (free practice and the level test). */
export function specFor(level: LevelId, stage?: number): DrillSpec {
  const L = LEVELS[level]
  const base: DrillSpec = {
    types: L.types,
    notes: L.notes,
    noteSeconds: L.noteSeconds,
    rhythmBeat: L.rhythmBeat,
    rangeShare: L.rangeShare,
    maxJump: L.maxJump,
  }
  return stage === undefined ? base : { ...base, ...STAGES[level][stage].spec }
}
