import { midiToFreq } from './notes'

// A piano-like tone built from a few harmonics with a struck-then-fading shape.
// Recorded piano samples replace this in a later phase.
const PARTIALS = [1, 0.5, 0.28, 0.14, 0.07]

/** Schedules one note. `when` is in the audio clock's seconds (ctx.currentTime). */
export function playNote(ctx: AudioContext, midi: number, when: number, seconds: number, volume = 0.5) {
  const freq = midiToFreq(midi)
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, when)
  out.gain.linearRampToValueAtTime(volume, when + 0.012)
  out.gain.exponentialRampToValueAtTime(volume * 0.3, when + seconds * 0.85)
  out.gain.linearRampToValueAtTime(0.0001, when + seconds)
  out.connect(ctx.destination)

  PARTIALS.forEach((amp, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq * (i + 1)
    const g = ctx.createGain()
    g.gain.value = amp / 2
    osc.connect(g).connect(out)
    osc.start(when)
    osc.stop(when + seconds + 0.05)
  })
}

/** Schedules one short count-in click. */
export function playClick(ctx: AudioContext, when: number, accent = false) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  // Pitched above the range the listener accepts, so a click is never mistaken for singing.
  osc.frequency.value = accent ? 2400 : 1800
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(0.25, when + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  osc.connect(g).connect(ctx.destination)
  osc.start(when)
  osc.stop(when + 0.07)
}
