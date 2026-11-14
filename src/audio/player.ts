import { midiToFreq } from './notes'

export type SoundId = 'piano' | 'keys' | 'soft' | 'ooh'

export const SOUNDS: { id: SoundId; name: string }[] = [
  { id: 'piano', name: 'Piano' },
  { id: 'keys', name: 'Simple piano' },
  { id: 'soft', name: 'Soft tone' },
  { id: 'ooh', name: 'Voice “ooh”' },
]

let current: SoundId = 'piano'

/** Chooses the sound every note is played in from now on. */
export function setSound(id: SoundId) {
  current = id
}

export type PlayOpts = {
  volume?: number
  /** Hold the note at full length and let it run into the next one, for smooth phrases. */
  legato?: boolean
  /** Where the sound goes. Defaults to the speakers; pass a bus so it can be silenced. */
  dest?: AudioNode
  sound?: SoundId
}

export type Bus = { node: GainNode; kill(): void }

/** A volume stage that scheduled notes play through, so they can all be stopped at once. */
export function makeBus(ctx: AudioContext): Bus {
  const node = ctx.createGain()
  node.connect(ctx.destination)
  return {
    node,
    kill() {
      try {
        node.gain.cancelScheduledValues(ctx.currentTime)
        node.gain.setTargetAtTime(0, ctx.currentTime, 0.015)
        setTimeout(() => node.disconnect(), 200)
      } catch {
        // The audio engine has already shut down.
      }
    },
  }
}

// Recorded piano: one recording every three keys, each retuned to the notes around it.
// Recordings: Salamander Grand Piano by Alexander Holm, licensed CC BY 3.0.
const SAMPLE_NAMES = ['A', 'C', 'Ds', 'Fs']
const SAMPLE_STEPS = [9, 0, 3, 6]
type PianoSample = { midi: number; buffer: AudioBuffer; offset: number; peak: number }
let samples: PianoSample[] = []
let loading: Promise<boolean> | null = null

/** Downloads and prepares the piano recordings. Until they are ready the simple piano is used. */
export function loadPiano(ctx: AudioContext): Promise<boolean> {
  if (loading) return loading
  const wanted: { midi: number; file: string }[] = []
  for (let midi = 33; midi <= 84; midi += 3) {
    const i = SAMPLE_STEPS.indexOf(midi % 12)
    wanted.push({ midi, file: `${SAMPLE_NAMES[i]}${Math.floor(midi / 12) - 1}.mp3` })
  }
  loading = Promise.all(
    wanted.map(async ({ midi, file }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}piano/${file}`)
      if (!res.ok) throw new Error(file)
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer())
      // Find where the note really starts, so every note lands on the beat.
      const data = buffer.getChannelData(0)
      let peak = 0
      for (let k = 0; k < data.length; k++) peak = Math.max(peak, Math.abs(data[k]))
      let first = 0
      while (first < data.length && Math.abs(data[first]) < peak * 0.02) first++
      return { midi, buffer, offset: Math.max(0, first / buffer.sampleRate - 0.003), peak: peak || 1 }
    }),
  ).then(
    (all) => {
      samples = all
      return true
    },
    () => {
      loading = null
      return false
    },
  )
  return loading
}

// The simple piano tone is built from a few harmonics with a struck-then-fading shape.
const PIANO = [1, 0.5, 0.28, 0.14, 0.07]
const SOFT = [1, 0.12]

/** Schedules one note. `when` is in the audio clock's seconds (ctx.currentTime). */
export function playNote(ctx: AudioContext, midi: number, when: number, seconds: number, opts: PlayOpts = {}) {
  const { volume = 0.5, legato = false, dest = ctx.destination } = opts
  const sound = opts.sound ?? current
  const freq = midiToFreq(midi)
  const out = ctx.createGain()
  out.connect(dest)
  const g = out.gain
  g.setValueAtTime(0.0001, when)
  let end = when + seconds

  if (sound === 'piano' && samples.length) {
    const s = samples.reduce((best, x) => (Math.abs(x.midi - midi) < Math.abs(best.midi - midi) ? x : best))
    const src = ctx.createBufferSource()
    src.buffer = s.buffer
    src.playbackRate.value = 2 ** ((midi - s.midi) / 12)
    const level = (volume * 0.9) / s.peak
    if (legato) end += 0.06
    g.setValueAtTime(level, when)
    g.setValueAtTime(level, end)
    // Like lifting a finger off the key: a quick fade, not a cut.
    g.setTargetAtTime(0, end, 0.05)
    src.connect(out)
    src.start(when, s.offset)
    src.stop(end + 0.4)
    return
  }

  if (sound === 'piano' || sound === 'keys') {
    g.linearRampToValueAtTime(volume, when + 0.012)
    if (legato) {
      // Stay fuller for longer and overlap the next note slightly.
      end += 0.06
      g.exponentialRampToValueAtTime(volume * 0.55, when + Math.max(0.03, seconds * 0.9))
    } else {
      g.exponentialRampToValueAtTime(volume * 0.3, when + seconds * 0.85)
    }
    g.linearRampToValueAtTime(0.0001, end)
    PIANO.forEach((amp, i) => tone(ctx, 'sine', freq * (i + 1), amp / 2, when, end, out))
    return
  }

  const attack = Math.min(sound === 'soft' ? 0.04 : 0.07, seconds * 0.3)
  const release = Math.min(0.09, seconds * 0.3)
  if (legato) end += 0.04
  g.linearRampToValueAtTime(volume, when + attack)
  g.setValueAtTime(volume, end - release)
  g.linearRampToValueAtTime(0.0001, end)

  if (sound === 'soft') {
    SOFT.forEach((amp, i) => tone(ctx, 'sine', freq * (i + 1), amp * 0.7, when, end, out))
    return
  }

  // Voice-like "ooh": a buzzy source shaped by the two resonances of the vowel, with a little vibrato.
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = freq
  if (seconds > 0.5) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.2
    const depth = ctx.createGain()
    depth.gain.setValueAtTime(0, when)
    depth.gain.linearRampToValueAtTime(freq * 0.006, when + 0.5)
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(when)
    lfo.stop(end + 0.05)
  }
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = Math.max(700, freq * 2.2)
  lowpass.Q.value = 0.7
  const f1 = ctx.createBiquadFilter()
  f1.type = 'peaking'
  f1.frequency.value = 330
  f1.Q.value = 2.5
  f1.gain.value = 9
  const f2 = ctx.createBiquadFilter()
  f2.type = 'peaking'
  f2.frequency.value = 850
  f2.Q.value = 4
  f2.gain.value = 5
  const level = ctx.createGain()
  level.gain.value = 0.32
  osc.connect(lowpass).connect(f1).connect(f2).connect(level).connect(out)
  osc.start(when)
  osc.stop(end + 0.05)
}

function tone(ctx: AudioContext, type: OscillatorType, freq: number, amp: number, when: number, end: number, out: AudioNode) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const g = ctx.createGain()
  g.gain.value = amp
  osc.connect(g).connect(out)
  osc.start(when)
  osc.stop(end + 0.05)
}

/** Schedules several notes at once, quietly: the chord that sets the key before a warm-up pattern. */
export function playChord(ctx: AudioContext, midis: number[], when: number, seconds: number, opts: PlayOpts = {}) {
  for (const m of midis) playNote(ctx, m, when, seconds, { ...opts, volume: (opts.volume ?? 0.5) * 0.5, legato: true })
}

/** Schedules a smooth slide from one pitch up to another and back: the guide for a siren. */
export function playGlide(ctx: AudioContext, fromMidi: number, toMidi: number, when: number, seconds: number, dest: AudioNode = ctx.destination) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(midiToFreq(fromMidi), when)
  osc.frequency.exponentialRampToValueAtTime(midiToFreq(toMidi), when + seconds / 2)
  osc.frequency.exponentialRampToValueAtTime(midiToFreq(fromMidi), when + seconds)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(0.3, when + 0.15)
  g.gain.setValueAtTime(0.3, when + seconds - 0.2)
  g.gain.linearRampToValueAtTime(0.0001, when + seconds)
  osc.connect(g).connect(dest)
  osc.start(when)
  osc.stop(when + seconds + 0.05)
}

/** Schedules one short count-in click. */
export function playClick(ctx: AudioContext, when: number, accent = false, dest: AudioNode = ctx.destination) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  // Pitched above the range the listener accepts, so a click is never mistaken for singing.
  osc.frequency.value = accent ? 2400 : 1800
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(0.25, when + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  osc.connect(g).connect(dest)
  osc.start(when)
  osc.stop(when + 0.07)
}
