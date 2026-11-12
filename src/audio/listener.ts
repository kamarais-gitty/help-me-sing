import { PitchDetector } from 'pitchy'
import { freqToMidi } from './notes'
import { TUNING } from './tuning'

export type Reading = {
  /** Smoothed pitch as a fractional MIDI number, or null when no clear note is heard. */
  midi: number | null
  /** Microphone loudness, 0 to 1. */
  level: number
  /** True when there is sound above the room's background noise. */
  loud: boolean
}

export type Listener = {
  ctx: AudioContext
  /** Analyse the microphone right now. Call once per animation frame. */
  read(): Reading
  stop(): void
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Opens the microphone and returns a pitch listener. Must be called from a tap. */
export async function startListener(): Promise<Listener> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot use the microphone here.')
  }
  // Phones clean up mic sound for calls; that distorts a sung note, so turn it off.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const ctx = new AudioContext()
  await ctx.resume()

  const analyser = ctx.createAnalyser()
  analyser.fftSize = TUNING.bufferSize
  // Cut rumble below and hiss above the singing range so background noise matters less.
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = TUNING.filterLow
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = TUNING.filterHigh
  ctx.createMediaStreamSource(stream).connect(highpass).connect(lowpass).connect(analyser)

  const detector = PitchDetector.forFloat32Array(analyser.fftSize)
  const buf = new Float32Array(analyser.fftSize)
  const recent: (number | null)[] = []
  let noiseFloor = 0.002 // running estimate of the room's background level
  let trusted: number | null = null // last pitch we believed
  let trustedAt = 0
  let slipSince = 0

  function read(): Reading {
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    const rms = Math.sqrt(sum / buf.length)
    const [freq, clarity] = detector.findPitch(buf, ctx.sampleRate)
    const now = performance.now()

    // Follow the room's background level: drop quickly to quiet moments, rise very slowly.
    noiseFloor += (rms - noiseFloor) * (rms < noiseFloor ? 0.2 : 0.0005)
    const loud = rms >= Math.max(TUNING.minLevel, noiseFloor * TUNING.noiseGateRatio)
    const clear =
      loud && clarity >= TUNING.minClarity && freq >= TUNING.minFreq && freq <= TUNING.maxFreq

    // Detectors sometimes report a note exactly an octave or two away for a moment.
    // Pull those back to the octave we were just hearing unless the jump lasts.
    let cand = clear ? freqToMidi(freq) : null
    if (cand !== null) {
      if (trusted !== null && now - trustedAt < 1000) {
        const octaves = Math.round((cand - trusted) / 12)
        const isOctaveJump = octaves !== 0 && Math.abs(cand - trusted - octaves * 12) < 1
        if (isOctaveJump) {
          if (!slipSince) slipSince = now
          if (now - slipSince < TUNING.octaveHoldMs) cand -= octaves * 12
          else slipSince = 0
        } else {
          slipSince = 0
        }
      }
      trusted = cand
      trustedAt = now
    }

    recent.push(cand)
    if (recent.length > TUNING.smoothing) recent.shift()
    const valid = recent.filter((v): v is number => v !== null)
    const midi = valid.length >= 3 ? median(valid) : null

    return { midi, level: Math.min(1, rms * 5), loud }
  }

  function stop() {
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }

  return { ctx, read, stop }
}
