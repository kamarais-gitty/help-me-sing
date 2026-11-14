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
  /**
   * Overtone check: how much better (0 to 1) the sound must repeat over twice the period before
   * the note an octave down is chosen. Smaller when the app expects that lower note.
   */
  octaveDownMargin: 0.04,
  octaveDownHinted: 0.01,
  /** Pitches outside this range (Hz) are ignored as not a singing voice. */
  minFreq: 60,
  maxFreq: 1400,
  /** A background level at or above this is called "noisy". A guess, to be tuned on the phone. */
  noisyLevel: 0.012,
  /** Readings smoothed together (median) to hide brief jumps. */
  smoothing: 5,
  /** Within this many cents counts as "in tune" on the tuner. */
  inTuneCents: 10,
  /** Seconds of history shown on the pitch graph. */
  historySeconds: 6,
} as const

/** Timing of a practice round, in seconds. */
// Note lengths, timing tolerance and strictness per level are in levels.ts.
export const PRACTICE = {
  /** Beats in a bar. The count runs under the played notes and the clicks finish the bar. */
  barBeats: 4,
  /** Fewest count-in clicks; with fewer left in the bar, a whole extra bar is clicked. */
  minClicks: 1,
  /** Live glow: a note glows while the singer is within this many cents (or the level's band, if wider). */
  glowCents: 20,
  /** Live burst: the share of a note's sung time that must be inside that band to count as nailed. */
  nailedShare: 0.8,
  /** The detector reports a pitch about this late (its listening window plus smoothing). */
  detectLagSeconds: 0.08,
  /** Keep listening this long after the last note, for singers who come in late. */
  tailSeconds: 0.5,
  /** Range test: hold a note this long, this steadily, to set it. */
  rangeHoldSeconds: 1.2,
  rangeSpreadSemitones: 0.6,
} as const
