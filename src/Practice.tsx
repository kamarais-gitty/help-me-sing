import { useEffect, useMemo, useRef, useState } from 'react'
import { beatFor, makeDrill, type Drill, type Range } from './audio/drills'
import { DRILL_NAMES, LEVEL_ORDER, LEVELS, type LevelId } from './audio/levels'
import type { Listener } from './audio/listener'
import { midiName } from './audio/notes'
import { playClick, playNote } from './audio/player'
import { scoreDrill, stars, type DrillScore, type NoteScore, type Sample } from './audio/scoring'
import { PRACTICE as P } from './audio/tuning'
import PitchGrid from './PitchGrid'

type Phase = 'ready' | 'hearing' | 'playing' | 'countin' | 'singing' | 'result'

const GOOD = '#4fd1a5'
const OFF = '#f2b84b'
const BAD = '#f07a6a'
const MISSED = 'rgba(255,255,255,0.18)'

const colourFor = (n: NoteScore) => (!n.heard ? MISSED : n.score >= 70 ? GOOD : n.score >= 40 ? OFF : BAD)

function noteVerdict(n: NoteScore, full: number): string {
  if (!n.heard) return 'not heard'
  const tuning =
    Math.abs(n.cents) <= full ? 'in tune' : `${Math.abs(n.cents)}¢ ${n.cents < 0 ? 'flat' : 'sharp'}`
  if (n.octaveOff !== 0) return `octave ${n.octaveOff > 0 ? 'high' : 'low'}`
  if (Math.abs(n.cents) >= 100) return `sang ${midiName(n.sung)}`
  return tuning
}

/** One plain sentence about a held note. */
function describeHeld(r: NoteScore, full: number): string {
  if (!r.heard) {
    return 'I didn’t hear a clear note. Sing a steady “ah”, a little louder, straight after the fourth click.'
  }
  const tuning = Math.abs(r.cents) <= full ? 'in tune' : `${Math.abs(r.cents)} cents ${r.cents < 0 ? 'flat' : 'sharp'}`
  if (r.octaveOff !== 0) {
    const n = Math.abs(r.octaveOff)
    return `Right note, but ${n === 1 ? 'an octave' : `${n} octaves`} too ${r.octaveOff > 0 ? 'high' : 'low'} (${tuning}). That earns half marks.`
  }
  if (r.steadiness < 0.6 && Math.abs(r.cents) < 100) {
    return `Your pitch wandered up and down around the note (middle: ${tuning}). Try to hold one steady pitch.`
  }
  if (Math.abs(r.cents) <= full) {
    return r.cents === 0 ? 'Spot on.' : `In tune: just ${Math.abs(r.cents)} cents ${r.cents < 0 ? 'flat' : 'sharp'}.`
  }
  if (Math.abs(r.cents) >= 100) {
    return `You sang ${midiName(r.sung)}, which is a different note. Aim ${r.cents < 0 ? 'higher' : 'lower'}.`
  }
  return `You were ${tuning}. Aim a little ${r.cents < 0 ? 'higher' : 'lower'}.`
}

/** One plain sentence about a multi-note drill. */
function describeDrill(r: DrillScore): string {
  const heard = r.notes.filter((n) => n.heard)
  if (!heard.length) return 'I didn’t hear any clear notes. Sing “ah” a little louder, starting on the beat after the fourth click.'
  const missed = r.notes.length - heard.length
  const parts: string[] = []
  if (missed) parts.push(`${missed} of ${r.notes.length} notes weren’t heard clearly.`)
  const timing = Math.abs(r.offset) >= 0.1 ? ` You came in ${Math.abs(r.offset).toFixed(2)} s ${r.offset > 0 ? 'late' : 'early'}, which is allowed.` : ''
  if (r.score >= 85) parts.unshift('Nicely sung.')
  else if (r.score >= 70) parts.unshift('Good. A few notes were a little off.')
  else parts.unshift('Keep at it. Tap “Hear it” and listen for where the tune goes.')
  return parts.join(' ') + timing
}

export default function Practice({
  listener,
  range,
  level,
  onLevel,
  onRedoRange,
}: {
  listener: Listener
  range: Range
  level: LevelId
  onLevel: (level: LevelId) => void
  onRedoRange: () => void
}) {
  const L = LEVELS[level]
  const [drill, setDrill] = useState<Drill>(() => makeDrill(level, range))
  const [phase, setPhase] = useState<Phase>('ready')
  const [beat, setBeat] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [result, setResult] = useState<DrillScore | null>(null)
  const [trace, setTrace] = useState<Sample[] | undefined>(undefined)
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const busy = phase === 'hearing' || phase === 'playing' || phase === 'countin' || phase === 'singing'
  const colours = useMemo(() => result?.notes.map(colourFor), [result])

  function newDrill(id: LevelId = level) {
    cancelAnimationFrame(raf.current)
    setDrill(makeDrill(id, range))
    setResult(null)
    setTrace(undefined)
    setCursor(null)
    setPhase('ready')
  }

  function changeLevel(id: LevelId) {
    onLevel(id)
    newDrill(id)
  }

  function playDrill(t0: number) {
    for (const n of drill.notes) playNote(listener.ctx, n.midi, t0 + n.start, n.seconds * 0.95)
  }

  function hear() {
    cancelAnimationFrame(raf.current)
    const ctx = listener.ctx
    const t0 = ctx.currentTime + 0.1
    const back = phase
    playDrill(t0)
    setPhase('hearing')
    const tick = () => {
      const t = ctx.currentTime - t0
      if (t > drill.duration) {
        setCursor(null)
        setPhase(back === 'result' ? 'result' : 'ready')
        return
      }
      setCursor(t)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  function run() {
    cancelAnimationFrame(raf.current)
    setResult(null)
    setTrace(undefined)
    const ctx = listener.ctx
    const beatSec = beatFor(drill.noteSeconds)
    const t0 = ctx.currentTime + 0.15
    const countStart = t0 + drill.duration + P.gapSeconds
    const singStart = countStart + P.countInBeats * beatSec
    const listenFrom = singStart - L.timing - 0.1
    const end = singStart + drill.duration + P.tailSeconds

    playDrill(t0)
    for (let i = 0; i < P.countInBeats; i++) playClick(ctx, countStart + i * beatSec, i === 0)

    const samples: Sample[] = []
    const tick = () => {
      const now = ctx.currentTime
      const r = listener.read()
      if (now >= listenFrom) samples.push({ t: now - singStart - P.detectLagSeconds, midi: r.midi })
      if (now < countStart) {
        setPhase('playing')
        setCursor(now >= t0 ? now - t0 : null)
      } else if (now < singStart) {
        setPhase('countin')
        setCursor(null)
        setBeat(Math.min(P.countInBeats, Math.floor((now - countStart) / beatSec) + 1))
      } else if (now < end) {
        setPhase('singing')
        setCursor(now - singStart)
      } else {
        const scored = scoreDrill(samples, drill.notes, L, L.timing)
        setResult(scored)
        setTrace(samples.map((s) => ({ t: s.t - scored.offset, midi: s.midi })))
        setCursor(null)
        setPhase('result')
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const held = drill.notes.length === 1
  const starCount = result ? stars(result.score) : 0
  const secs = drill.noteSeconds >= 1 ? `${drill.noteSeconds} s` : `${drill.noteSeconds.toFixed(2)} s`

  return (
    <section className="practice">
      <div className="levels" role="group" aria-label="Level">
        {LEVEL_ORDER.map((id) => (
          <button key={id} className={id === level ? 'on' : ''} onClick={() => changeLevel(id)} disabled={busy}>
            {LEVELS[id].name}
          </button>
        ))}
      </div>

      <div className="drillInfo">
        <span>
          <strong>{DRILL_NAMES[drill.type]}</strong>
          {drill.key && ` · ${drill.key}`} · {drill.notes.length} {drill.notes.length === 1 ? 'note' : 'notes'} ·{' '}
          {secs} each
        </span>
        <button className="link" onClick={onRedoRange} disabled={busy}>
          Range {midiName(range.low)}–{midiName(range.high)}
        </button>
      </div>

      <PitchGrid notes={drill.notes} duration={drill.duration} cursor={cursor} trace={trace} colours={colours} />

      <div className="stage compact">
        {phase === 'ready' && (
          <p className="prompt">
            The app plays these notes, clicks four times, then you sing them back while the line moves
            across.
          </p>
        )}
        {(phase === 'hearing' || phase === 'playing') && <p className="big">Listen…</p>}
        {phase === 'countin' && <p className="big count">{beat}</p>}
        {phase === 'singing' && <p className="big sing">Sing!</p>}
        {phase === 'result' && result && (
          <div className="result">
            <div className="scoreRow">
              <div className={`score ${result.score >= 70 ? 'good' : result.notes.some((n) => n.heard) ? 'off' : 'none'}`}>
                {result.notes.some((n) => n.heard) ? `${result.score}%` : '–'}
              </div>
              <div className="stars" aria-label={`${starCount} of 3 stars`}>
                {'★'.repeat(starCount)}
                <span className="dim">{'★'.repeat(3 - starCount)}</span>
              </div>
            </div>
            <p className="prompt">{held ? describeHeld(result.notes[0], L.full) : describeDrill(result)}</p>
            {held && result.notes[0].heard && (
              <p className="detail">Held steady {Math.round(result.notes[0].steadiness * 100)}% of the time</p>
            )}
            {!held && (
              <ul className="chips">
                {result.notes.map((n, i) => (
                  <li key={i} style={{ borderColor: colourFor(n) }}>
                    <b>{midiName(drill.notes[i].midi)}</b>
                    <span>{n.heard ? `${n.score}%` : '–'}</span>
                    <small>{noteVerdict(n, L.full)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="actions">
        {phase === 'result' ? (
          <div className="row">
            <button className="secondary" onClick={run}>
              Try again
            </button>
            <button className="primary" onClick={() => newDrill()}>
              Next drill
            </button>
          </div>
        ) : (
          <button className="primary" onClick={run} disabled={busy}>
            Play and sing
          </button>
        )}
        <div className="row">
          <button className="secondary" onClick={hear} disabled={busy}>
            Hear it
          </button>
          {phase !== 'result' && (
            <button className="secondary" onClick={() => newDrill()} disabled={busy}>
              Different drill
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
