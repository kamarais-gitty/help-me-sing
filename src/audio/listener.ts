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
  /** The room's background level, on the same raw scale as TUNING.minLevel. */
  noise: number
}

export type Listener = {
  ctx: AudioContext
  /** The name of the microphone in use, when the browser gives one. */
  mic: string
  /**
   * Analyse the microphone right now. Call once per animation frame.
   * `expected` (a MIDI note) is the note the singer should be on, if known; it helps decide
   * between a low note and its overtone an octave up.
   */
  read(expected?: number | null): Reading
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
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  let stream = await navigator.mediaDevices.getUserMedia({ audio })
  // With Bluetooth earbuds connected, the phone may pick the earbuds' microphone, which also
  // switches them into thin-sounding call mode. Ask for the phone's own microphone instead.
  try {
    if (/bluetooth/i.test(stream.getAudioTracks()[0]?.label ?? '')) {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const own = devices.find(
        (d) => d.kind === 'audioinput' && d.label && !/bluetooth|default/i.test(d.label) && /speakerphone|built-?in|internal|phone/i.test(d.label),
      )
      if (own) {
        const better = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: own.deviceId } } })
        stream.getTracks().forEach((t) => t.stop())
        stream = better
      }
    }
  } catch {
    // Keep the microphone we already have.
  }
  const mic = stream.getAudioTracks()[0]?.label ?? ''
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

  /** How alike the sound is to itself `lag` samples later: 1 = identical, 0 = unrelated. */
  function selfMatch(lag: number): number {
    let cross = 0
    let energy = 0
    for (let i = 0; i + lag < buf.length; i++) {
      cross += buf[i] * buf[i + lag]
      energy += buf[i] * buf[i] + buf[i + lag] * buf[i + lag]
    }
    return energy > 0 ? (2 * cross) / energy : 0
  }

  /**
   * Low voices often carry more sound in their first overtone (an octave up) than in the note
   * itself, and phone microphones pick up little of the lowest frequencies, so the detector can
   * report a low note an octave too high. If the sound repeats clearly better over twice the
   * period, the real note is the one an octave down.
   */
  function checkOctaveDown(freq: number, expected: number | null | undefined): number {
    const lower = freq / 2
    if (lower < TUNING.minFreq) return freq
    const lag = ctx.sampleRate / freq
    if (lag * 2 > buf.length / 2) return freq
    const gain = selfMatch(Math.round(lag * 2)) - selfMatch(Math.round(lag))
    const expectsLower = expected != null && Math.abs(freqToMidi(lower) - expected) < 1.5
    return gain > (expectsLower ? TUNING.octaveDownHinted : TUNING.octaveDownMargin) ? lower : freq
  }

  function read(expected?: number | null): Reading {
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
    let cand = clear ? freqToMidi(checkOctaveDown(freq, expected)) : null
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

    return { midi, level: Math.min(1, rms * 5), loud, noise: noiseFloor }
  }

  function stop() {
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }

  return { ctx, mic, read, stop }
}
