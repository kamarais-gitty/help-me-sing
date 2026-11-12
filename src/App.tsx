import { useEffect, useRef, useState } from 'react'
import { PitchDetector } from 'pitchy'
import { freqToMidi, midiName, readNote, type NoteReading } from './audio/notes'
import { TUNING } from './audio/tuning'
import './App.css'

type Status = 'idle' | 'starting' | 'listening' | 'error'
type Hint = 'silent' | 'unclear' | 'ok'
type Point = { t: number; midi: number | null }

type Session = {
  stream: MediaStream
  ctx: AudioContext
  raf: number
}

const GRAPH_RANGE = 7 // semitones shown above and below the centre

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function drawGraph(canvas: HTMLCanvasElement, points: Point[], now: number, centre: number) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)

  const labelW = 36
  const span = TUNING.historySeconds * 1000
  const y = (midi: number) => h / 2 - ((midi - centre) / GRAPH_RANGE) * (h / 2)
  const x = (t: number) => labelW + (1 - (now - t) / span) * (w - labelW)

  g.font = '11px system-ui, sans-serif'
  g.textBaseline = 'middle'
  for (let m = Math.ceil(centre - GRAPH_RANGE); m <= Math.floor(centre + GRAPH_RANGE); m++) {
    const natural = !midiName(m).includes('#')
    g.strokeStyle = natural ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'
    g.beginPath()
    g.moveTo(labelW, y(m))
    g.lineTo(w, y(m))
    g.stroke()
    if (natural) {
      g.fillStyle = 'rgba(255,255,255,0.5)'
      g.fillText(midiName(m), 4, y(m))
    }
  }

  g.strokeStyle = '#4fd1a5'
  g.lineWidth = 2.5
  g.lineJoin = 'round'
  g.lineCap = 'round'
  let drawing = false
  g.beginPath()
  for (const p of points) {
    if (p.midi === null) {
      drawing = false
      continue
    }
    if (drawing) g.lineTo(x(p.t), y(p.midi))
    else g.moveTo(x(p.t), y(p.midi))
    drawing = true
  }
  g.stroke()
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [note, setNote] = useState<NoteReading | null>(null)
  const [hint, setHint] = useState<Hint>('silent')
  const [level, setLevel] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<Session | null>(null)

  function stop() {
    const s = sessionRef.current
    if (!s) return
    cancelAnimationFrame(s.raf)
    s.stream.getTracks().forEach((t) => t.stop())
    void s.ctx.close()
    sessionRef.current = null
  }

  useEffect(() => stop, [])

  async function start() {
    setStatus('starting')
    setError('')
    try {
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
      const history: Point[] = []
      let centre = 57 // A3, until a first note is heard
      let lastUi = 0
      let noiseFloor = 0.002 // running estimate of the room's background level
      let trusted: number | null = null // last pitch we believed
      let trustedAt = 0
      let slipSince = 0
      const session: Session = { stream, ctx, raf: 0 }
      sessionRef.current = session

      const tick = () => {
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

        history.push({ t: now, midi })
        while (history.length && now - history[0].t > TUNING.historySeconds * 1000) history.shift()
        if (midi !== null) centre += (Math.round(midi) - centre) * 0.05
        if (canvasRef.current) drawGraph(canvasRef.current, history, now, centre)

        if (now - lastUi > 80) {
          lastUi = now
          setNote(midi === null ? null : readNote(midi))
          setHint(midi !== null ? 'ok' : loud ? 'unclear' : 'silent')
          setLevel(Math.min(1, rms * 5))
        }
        session.raf = requestAnimationFrame(tick)
      }
      session.raf = requestAnimationFrame(tick)
      setStatus('listening')
    } catch (e) {
      stop()
      const name = e instanceof DOMException ? e.name : ''
      setError(
        name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No microphone was found on this device.'
            : e instanceof Error
              ? e.message
              : 'Could not start the microphone.',
      )
      setStatus('error')
    }
  }

  function stopListening() {
    stop()
    setNote(null)
    setLevel(0)
    setHint('silent')
    setStatus('idle')
  }

  const listening = status === 'listening'
  const cents = note ? Math.round(note.cents) : 0
  const inTune = note !== null && Math.abs(note.cents) <= TUNING.inTuneCents
  const verdict = !note ? '' : inTune ? 'In tune' : cents < 0 ? 'A little flat' : 'A little sharp'

  return (
    <main className="app">
      <header>
        <h1>Help Me Sing</h1>
        <p className="sub">Pitch check</p>
      </header>

      {!listening && (
        <section className="intro">
          <p>
            Tap start, allow the microphone, then sing or hum a steady note. The app shows which
            note it hears and how close you are to it.
          </p>
          <button className="primary" onClick={start} disabled={status === 'starting'}>
            {status === 'starting' ? 'Starting…' : 'Start listening'}
          </button>
          {error && <p className="error">{error}</p>}
          <p className="privacy">Your voice is analysed on this device and never recorded or sent anywhere.</p>
        </section>
      )}

      {listening && (
        <section className="tuner">
          <div className={`note ${note ? (inTune ? 'good' : 'off') : 'none'}`}>
            {note ? note.name : '–'}
          </div>
          <div className="verdict">
            {note
              ? `${verdict} (${cents > 0 ? '+' : ''}${cents} cents)`
              : hint === 'unclear'
                ? 'I hear sound but not a clear note. Try a steady “ah”, or a quieter room.'
                : 'Sing or hum a note'}
          </div>

          <div className="meter" aria-hidden="true">
            <div className="zone" />
            <div className="mid" />
            {note && (
              <div
                className={`needle ${inTune ? 'good' : 'off'}`}
                style={{ left: `${50 + Math.max(-50, Math.min(50, note.cents))}%` }}
              />
            )}
          </div>
          <div className="scale">
            <span>flat</span>
            <span>sharp</span>
          </div>

          <canvas ref={canvasRef} className="graph" />

          <div className="readout">
            <span>{note ? `${note.freq.toFixed(1)} Hz` : ' '}</span>
            <span className="level">
              mic
              <span className="bar">
                <span style={{ width: `${level * 100}%` }} />
              </span>
            </span>
          </div>

          <button className="secondary" onClick={stopListening}>
            Stop
          </button>
        </section>
      )}
    </main>
  )
}
