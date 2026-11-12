import { useEffect, useRef, useState } from 'react'
import type { Listener } from './audio/listener'
import { midiName } from './audio/notes'
import { playClick, playNote } from './audio/player'
import { BANDS, scoreNote, stars, type NoteScore, type Sample } from './audio/scoring'
import { PRACTICE as P } from './audio/tuning'

type Phase = 'ready' | 'playing' | 'countin' | 'singing' | 'result'

const LOWEST = 36 // C2
const HIGHEST = 84 // C6
const BAND = BANDS.beginner

function describe(r: NoteScore): string {
  if (!r.heard) {
    return 'I didn’t hear a clear note. Sing a steady “ah”, a little louder, straight after the fourth click.'
  }
  const tuning =
    Math.abs(r.cents) <= BAND.full
      ? 'in tune'
      : `${Math.abs(r.cents)} cents ${r.cents < 0 ? 'flat' : 'sharp'}`
  if (r.octaveOff !== 0) {
    const n = Math.abs(r.octaveOff)
    return `Right note, but ${n === 1 ? 'an octave' : `${n} octaves`} too ${r.octaveOff > 0 ? 'high' : 'low'} (${tuning}). That earns half marks.`
  }
  if (Math.abs(r.cents) <= BAND.full) {
    return r.cents === 0 ? 'Spot on.' : `In tune: just ${Math.abs(r.cents)} cents ${r.cents < 0 ? 'flat' : 'sharp'}.`
  }
  if (Math.abs(r.cents) >= 100) {
    return `You sang ${midiName(r.sung)}, which is a different note. Aim ${r.cents < 0 ? 'higher' : 'lower'}.`
  }
  return `You were ${tuning}. Aim a little ${r.cents < 0 ? 'higher' : 'lower'}.`
}

export default function Practice({ listener }: { listener: Listener }) {
  const [target, setTarget] = useState(60) // C4
  const [phase, setPhase] = useState<Phase>('ready')
  const [beat, setBeat] = useState(0)
  const [progress, setProgress] = useState(0)
  const [live, setLive] = useState<number | null>(null) // cents away from the target
  const [result, setResult] = useState<NoteScore | null>(null)
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const busy = phase === 'playing' || phase === 'countin' || phase === 'singing'

  function move(by: number) {
    setTarget((t) => Math.max(LOWEST, Math.min(HIGHEST, t + by)))
    setResult(null)
    setPhase('ready')
  }

  function hear() {
    playNote(listener.ctx, target, listener.ctx.currentTime + 0.05, P.noteSeconds)
  }

  function run() {
    cancelAnimationFrame(raf.current)
    setResult(null)
    setLive(null)
    setProgress(0)
    const ctx = listener.ctx
    const t0 = ctx.currentTime + 0.15
    const countStart = t0 + P.noteSeconds + P.gapSeconds
    const singStart = countStart + P.countInBeats * P.beatSeconds
    const singEnd = singStart + P.noteSeconds

    playNote(ctx, target, t0, P.noteSeconds)
    for (let i = 0; i < P.countInBeats; i++) playClick(ctx, countStart + i * P.beatSeconds, i === 0)

    const samples: Sample[] = []
    const tick = () => {
      const now = ctx.currentTime
      const r = listener.read()
      if (now >= singStart - P.earlySeconds && now < singEnd + P.lateSeconds) {
        samples.push({ t: now, midi: r.midi })
      }
      if (now < countStart) {
        setPhase('playing')
      } else if (now < singStart) {
        setPhase('countin')
        setBeat(Math.min(P.countInBeats, Math.floor((now - countStart) / P.beatSeconds) + 1))
      } else if (now < singEnd + P.lateSeconds) {
        setPhase('singing')
        setProgress(Math.min(1, (now - singStart) / P.noteSeconds))
        setLive(r.midi === null ? null : (r.midi - target) * 100)
      } else {
        setResult(scoreNote(samples, target, BAND))
        setPhase('result')
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const liveOk = live !== null && Math.abs(live) <= BAND.full
  const starCount = result ? stars(result.score) : 0

  return (
    <section className="practice">
      <div className="target">
        <button className="step" onClick={() => move(-1)} disabled={busy} aria-label="Lower note">
          −
        </button>
        <div>
          <div className="label">Note to sing</div>
          <div className="targetNote">{midiName(target)}</div>
        </div>
        <button className="step" onClick={() => move(1)} disabled={busy} aria-label="Higher note">
          +
        </button>
      </div>

      <div className="stage">
        {phase === 'ready' && (
          <p className="prompt">
            The app plays the note, clicks four times, then it’s your turn to sing it back for two
            seconds.
          </p>
        )}
        {phase === 'playing' && <p className="big">Listen…</p>}
        {phase === 'countin' && <p className="big count">{beat}</p>}
        {phase === 'singing' && (
          <>
            <p className="big sing">Sing!</p>
            <div className="meter wide" aria-hidden="true">
              <div className="zone" />
              <div className="mid" />
              {live !== null && (
                <div
                  className={`needle ${liveOk ? 'good' : 'off'}`}
                  style={{ left: `${50 + Math.max(-100, Math.min(100, live)) / 2}%` }}
                />
              )}
            </div>
            <div className="scale">
              <span>flat</span>
              <span>sharp</span>
            </div>
            <div className="progress">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        )}
        {phase === 'result' && result && (
          <div className="result">
            <div className={`score ${result.score >= 70 ? 'good' : result.heard ? 'off' : 'none'}`}>
              {result.heard ? `${result.score}%` : '–'}
            </div>
            <div className="stars" aria-label={`${starCount} of 3 stars`}>
              {'★'.repeat(starCount)}
              <span className="dim">{'★'.repeat(3 - starCount)}</span>
            </div>
            <p className="prompt">{describe(result)}</p>
            {result.heard && (
              <p className="detail">
                Held steady {Math.round(result.steadiness * 100)}% of the time
              </p>
            )}
          </div>
        )}
      </div>

      <div className="actions">
        <button className="primary" onClick={run} disabled={busy}>
          {phase === 'result' ? 'Try again' : 'Play and sing'}
        </button>
        <div className="row">
          <button className="secondary" onClick={hear} disabled={busy}>
            Hear the note
          </button>
          <button
            className="secondary"
            onClick={() => move(Math.round(Math.random() * 8) - 4 || 2)}
            disabled={busy}
          >
            Different note
          </button>
        </div>
      </div>
    </section>
  )
}
