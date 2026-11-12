import { useEffect, useRef, useState } from 'react'
import type { Range } from './audio/drills'
import type { Listener } from './audio/listener'
import { midiName } from './audio/notes'
import { playNote } from './audio/player'
import { PRACTICE as P } from './audio/tuning'

type Which = 'low' | 'high'
type Step = { which: Which; state: 'idle' | 'listening' | 'set' }

const LOWEST = 33 // A1
const HIGHEST = 88 // E6

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const COPY: Record<Which, { title: string; ask: string }> = {
  low: {
    title: 'Your lowest comfortable note',
    ask: 'Sing “ah” and slide down to the lowest note you can sing clearly, not a growl or a croak. Hold it steady until the bar fills.',
  },
  high: {
    title: 'Your highest comfortable note',
    ask: 'Now slide up to the highest note you can sing without straining or squeaking. Hold it steady until the bar fills.',
  },
}

export default function RangeTest({
  listener,
  initial,
  onDone,
}: {
  listener: Listener
  initial: Range | null
  onDone: (range: Range) => void
}) {
  const [step, setStep] = useState<Step>({ which: 'low', state: 'idle' })
  const [low, setLow] = useState<number | null>(null)
  const [high, setHigh] = useState<number | null>(null)
  const [live, setLive] = useState<number | null>(null)
  const [hold, setHold] = useState(0)
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function listen(which: Which) {
    cancelAnimationFrame(raf.current)
    setStep({ which, state: 'listening' })
    setHold(0)
    let streak: number[] = []
    let streakStart = 0
    let misses = 0
    const tick = () => {
      const now = performance.now() / 1000
      const r = listener.read()
      setLive(r.midi)
      if (r.midi === null) {
        // Allow a breath-length gap of a few frames without starting over.
        if (++misses > 8) streak = []
      } else {
        misses = 0
        if (streak.length && Math.abs(r.midi - median(streak)) > P.rangeSpreadSemitones / 2) streak = []
        if (!streak.length) streakStart = now
        streak.push(r.midi)
      }
      const held = streak.length ? (now - streakStart) / P.rangeHoldSeconds : 0
      setHold(Math.min(1, held))
      if (held >= 1) {
        const note = Math.max(LOWEST, Math.min(HIGHEST, Math.round(median(streak))))
        if (which === 'low') setLow(note)
        else setHigh(note)
        setStep({ which, state: 'set' })
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  function adjust(which: Which, by: number) {
    const f = (n: number | null) => (n === null ? n : Math.max(LOWEST, Math.min(HIGHEST, n + by)))
    if (which === 'low') setLow(f)
    else setHigh(f)
  }

  function hear(note: number) {
    playNote(listener.ctx, note, listener.ctx.currentTime + 0.05, 1.2)
  }

  const value = step.which === 'low' ? low : high
  const span = low !== null && high !== null ? high - low : 0
  const finished = step.which === 'high' && step.state === 'set' && high !== null && low !== null

  return (
    <section className="range">
      <div className="steps">
        <span className={step.which === 'low' ? 'on' : 'done'}>1. Lowest</span>
        <span className={step.which === 'high' ? 'on' : ''}>2. Highest</span>
      </div>

      <div className="stage">
        <h2>{COPY[step.which].title}</h2>
        {step.state !== 'set' && <p className="prompt">{COPY[step.which].ask}</p>}

        {step.state === 'listening' && (
          <>
            <div className={`note ${live === null ? 'none' : ''}`}>{live === null ? '–' : midiName(live)}</div>
            <div className="progress tall">
              <span style={{ width: `${hold * 100}%` }} />
            </div>
          </>
        )}

        {step.state === 'set' && value !== null && (
          <>
            <div className="target">
              <button className="step" onClick={() => adjust(step.which, -1)} aria-label="Lower">
                −
              </button>
              <div className="targetNote">{midiName(value)}</div>
              <button className="step" onClick={() => adjust(step.which, 1)} aria-label="Higher">
                +
              </button>
            </div>
            <p className="detail">
              If that isn’t right, nudge it with − and +, or sing it again. Tap “Hear it” to check.
            </p>
          </>
        )}

        {finished && (
          <p className={`prompt ${span < 5 ? 'error' : ''}`}>
            {span <= 0
              ? 'Your highest note came out below your lowest. Please sing them again.'
              : span < 5
                ? `That range (${midiName(low)} to ${midiName(high)}) is very narrow, so drills will be limited. Try reaching a little further.`
                : `Your range: ${midiName(low)} to ${midiName(high)}, ${span} semitones (${(span / 12).toFixed(1)} octaves).`}
          </p>
        )}
      </div>

      <div className="actions">
        {step.state === 'idle' && (
          <button className="primary" onClick={() => listen(step.which)}>
            Start listening
          </button>
        )}
        {step.state === 'listening' && (
          <button
            className="secondary"
            onClick={() => {
              cancelAnimationFrame(raf.current)
              setStep({ which: step.which, state: 'idle' })
            }}
          >
            Stop
          </button>
        )}
        {step.state === 'set' && step.which === 'low' && (
          <button className="primary" onClick={() => listen('high')}>
            Next: highest note
          </button>
        )}
        {finished && (
          <button className="primary" disabled={span < 3} onClick={() => onDone({ low: low!, high: high! })}>
            Save my range
          </button>
        )}
        {step.state === 'set' && value !== null && (
          <div className="row">
            <button className="secondary" onClick={() => hear(value)}>
              Hear it
            </button>
            <button className="secondary" onClick={() => listen(step.which)}>
              Sing it again
            </button>
          </div>
        )}
        {initial && step.state === 'idle' && step.which === 'low' && (
          <p className="detail">
            Saved range: {midiName(initial.low)} to {midiName(initial.high)}.
          </p>
        )}
      </div>
    </section>
  )
}
