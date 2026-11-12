/**
 * The four levels. All difficulty numbers live here so they can be tuned from testing.
 * See the "Levels and difficulty" and "Scoring" tables in the plan.
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

export type Level = {
  id: LevelId
  name: string
  /** Fewest and most notes in a drill. */
  notes: [number, number]
  /** Shortest and longest note length, in seconds. Every note in one drill has the same length. */
  noteSeconds: [number, number]
  /** Share (0 to 1) of the singer's range that drills use, taken from the middle. */
  rangeShare: number
  /** Largest jump between two neighbouring notes, in semitones. */
  maxJump: number
  /** Drill types this level picks from. */
  drills: DrillType[]
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
    notes: [1, 3],
    noteSeconds: [2, 2],
    rangeShare: 0.5,
    maxJump: 4, // a major third
    drills: ['held', 'steps'],
    full: 40,
    zero: 100,
    timing: 0.4,
  },
  intermediate: {
    id: 'intermediate',
    name: 'Intermediate',
    notes: [3, 5],
    noteSeconds: [1, 1],
    rangeShare: 0.7,
    maxJump: 7, // a fifth
    drills: ['intervals', 'scaleFragment'],
    full: 25,
    zero: 75,
    timing: 0.3,
  },
  advanced: {
    id: 'advanced',
    name: 'Advanced',
    notes: [5, 8],
    noteSeconds: [0.5, 0.75],
    rangeShare: 0.9,
    maxJump: 12, // an octave
    drills: ['scale', 'arpeggio', 'melody'],
    full: 15,
    zero: 50,
    timing: 0.2,
  },
  expert: {
    id: 'expert',
    name: 'Expert',
    notes: [8, 12],
    noteSeconds: [0.25, 0.5],
    rangeShare: 1,
    maxJump: 16, // more than an octave
    drills: ['chromaticRun', 'melody', 'arpeggio'],
    full: 10,
    zero: 40,
    timing: 0.15,
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
}
