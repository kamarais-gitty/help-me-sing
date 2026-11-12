/**
 * Values that control how the microphone is listened to.
 * Kept in one place so they can be tuned from real-phone testing.
 */
export const TUNING = {
  /** Samples analysed per reading. Bigger = steadier on low notes, slower to react. */
  bufferSize: 4096,
  /** Quieter than this (0 to 1) counts as silence. */
  minLevel: 0.004,
  /** A sound must also be this many times louder than the room's background noise. */
  noiseGateRatio: 2,
  /** How sure the detector must be (0 to 1) before a pitch is trusted. */
  minClarity: 0.85,
  /** Sound below and above these (Hz) is filtered out before listening: rumble and hiss. */
  filterLow: 70,
  filterHigh: 1500,
  /** A sudden jump of exactly one or two octaves is treated as a detector slip for this long (ms). */
  octaveHoldMs: 400,
  /** Pitches outside this range (Hz) are ignored as not a singing voice. */
  minFreq: 60,
  maxFreq: 1400,
  /** Readings smoothed together (median) to hide brief jumps. */
  smoothing: 5,
  /** Within this many cents counts as "in tune" on the tuner. */
  inTuneCents: 10,
  /** Seconds of history shown on the pitch graph. */
  historySeconds: 6,
} as const

/** Timing of a practice round, in seconds. */
export const PRACTICE = {
  /** How long the target note plays, and how long you sing it back. */
  noteSeconds: 2,
  /** Pause between the played note and the count-in. */
  gapSeconds: 0.4,
  /** Count-in clicks and the time between them. */
  countInBeats: 4,
  beatSeconds: 0.6,
  /** Singing this much before or after the slot still counts. */
  earlySeconds: 0.2,
  lateSeconds: 0.4,
} as const
