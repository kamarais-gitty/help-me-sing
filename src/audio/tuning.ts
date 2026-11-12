/**
 * Values that control how the microphone is listened to.
 * Kept in one place so they can be tuned from real-phone testing.
 */
export const TUNING = {
  /** Samples analysed per reading. Bigger = steadier on low notes, slower to react. */
  bufferSize: 2048,
  /** Quieter than this (0 to 1) counts as silence. */
  minLevel: 0.01,
  /** How sure the detector must be (0 to 1) before a pitch is trusted. */
  minClarity: 0.9,
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
