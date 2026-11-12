const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Frequency in Hz to a fractional MIDI note number (A4 = 440 Hz = 69). */
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440)
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Letter name with octave for a whole MIDI note number, e.g. 60 -> "C4". */
export function midiName(midi: number): string {
  const n = Math.round(midi)
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

export type NoteReading = {
  /** Fractional MIDI number of the sung pitch. */
  midi: number
  /** Nearest note name, e.g. "A3". */
  name: string
  /** How far the pitch is from that note, in cents (-50 to +50). */
  cents: number
  freq: number
}

export function readNote(midi: number): NoteReading {
  const nearest = Math.round(midi)
  return {
    midi,
    name: midiName(nearest),
    cents: (midi - nearest) * 100,
    freq: midiToFreq(midi),
  }
}
