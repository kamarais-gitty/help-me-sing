import { useEffect, useMemo, useRef, useState } from 'react'
import { atSpeed, beatFor, makeDrill, maxSpeed, SPEEDS, type Drill, type Range } from './audio/drills'
import { DRILL_NAMES, PHRASE_TYPES, type DrillSpec, type Level } from './audio/levels'
import type { Listener } from './audio/listener'
import { midiName } from './audio/notes'
import { makeBus, playClick, playNote, type Bus } from './audio/player'
import { scoreDrill, stars, type DrillScore, type NoteScore, type Sample } from './audio/scoring'
import { sessionTip, type ScoredRound } from './audio/tips'
import { PRACTICE as P } from './audio/tuning'
import PitchGrid from './PitchGrid'
import { loadSettings, saveSettings } from './storage'

type Phase = 'ready' | 'hearing' | 'playing' | 'countin' | 'singing' | 'result' | 'summary'

export type SessionResult = {
  /** Average of the round scores. */
  score: number
  rounds: number[]
  /** Slowest speed used in any round (1 = normal). */
  speed: number
}

/** What the screen that started the session says about the result, and where to go next. */
export type SessionVerdict = { message: string; nextLabel?: string; onNext?: () => void }

const GOOD = '#4fd1a5'
const OFF = '#f2b84b'
const BAD = '#f07a6a'
const MISSED = 'rgba(255,255,255,0.18)'

const colourFor = (n: NoteScore) => (!n.heard ? MISSED : n.score >= 70 ? GOOD : n.score >= 40 ? OFF : BAD)
const pct = (speed: number) => `${Math.round(speed * 100)}%`

function noteVerdict(n: NoteScore, full: number): string {
  if (!n.heard) return 'not heard'
  if (n.octaveOff !== 0) return `octave ${n.octaveOff > 0 ? 'high' : 'low'}`
  if (Math.abs(n.cents) >= 100) return `sang ${midiName(n.sung)}`
  return Math.abs(n.cents) <= full ? 'in tune' : `${Math.abs(n.cents)}¢ ${n.cents < 0 ? 'flat' : 'sharp'}`
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
  if (r.notes.some((n) => n.octaveOff !== 0)) {
    parts.push('Some notes were heard an octave away. If you’re sure you sang them right, the microphone may have caught an overtone.')
  }
  const timing = Math.abs(r.offset) >= 0.1 ? ` You came in ${Math.abs(r.offset).toFixed(2)} s ${r.offset > 0 ? 'late' : 'early'}, which is allowed.` : ''
  if (r.score >= 85) parts.unshift('Nicely sung.')
  else if (r.score >= 70) parts.unshift('Good. A few notes were a little off.')
  else parts.unshift('Keep at it. Tap “Hear it” and listen for where the tune goes.')
  return parts.join(' ') + timing
}

/** Result chips: one per note, with each run folded into a single chip. */
function chipsFor(drill: Drill, r: DrillScore, full: number) {
  const chips: { key: number; title: string; score: string; note: string; colour: string }[] = []
  for (let i = 0; i < r.notes.length; i++) {
    const n = r.notes[i]
    if (!n.run) {
      chips.push({ key: i, title: midiName(drill.notes[i].midi), score: n.heard ? `${n.score}%` : '–', note: noteVerdict(n, full), colour: colourFor(n) })
      continue
    }
    let j = i
    let total = 0
    let weight = 0
    let heard = false
    while (j < r.notes.length && r.notes[j].run) {
      total += r.notes[j].score * drill.notes[j].seconds
      weight += drill.notes[j].seconds
      heard = heard || r.notes[j].heard
      j++
    }
    const score = Math.round(total / weight)
    const count = j - i
    chips.push({
      key: i,
      title: count > 1 ? `Run of ${count}` : midiName(drill.notes[i].midi),
      score: heard ? `${score}%` : '–',
      note: !heard ? 'not heard' : count > 1 ? 'time on the notes' : 'quick note',
      colour: colourFor({ ...n, heard, score }),
    })
    i = j - 1
  }
  return chips
}

export default function Session({
  listener,
  range,
  title,
  spec,
  level,
  rounds,
  allowRetry = true,
  liveLocked = false,
  onRound,
  onFinish,
  onExit,
}: {
  listener: Listener
  range: Range
  title: string
  spec: DrillSpec
  /** Sets strictness and the remembered speed. */
  level: Level
  /** Rounds in the session, or null to keep going until the singer leaves. */
  rounds: number | null
  allowRetry?: boolean
  /** Live line forced off (the Expert level test). */
  liveLocked?: boolean
  onRound?: (score: number, speed: number) => void
  onFinish?: (result: SessionResult) => SessionVerdict
  onExit?: () => void
}) {
  const L = level
  const [drill, setDrill] = useState<Drill>(() => makeDrill(spec, range))
  const [phase, setPhase] = useState<Phase>('ready')
  const [beat, setBeat] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [result, setResult] = useState<DrillScore | null>(null)
  const [trace, setTrace] = useState<Sample[] | undefined>(undefined)
  const [wanted, setWanted] = useState(() => loadSettings().speeds[L.id] ?? 1)
  const [live, setLive] = useState(() => loadSettings().live)
  const [done, setDone] = useState<{ score: number; speed: number }[]>([])
  const [verdict, setVerdict] = useState<SessionVerdict | null>(null)
  const [tip, setTip] = useState('')
  const raf = useRef(0)
  const bus = useRef<Bus | null>(null)
  const scored = useRef<ScoredRound[]>([])
  const resultSpeed = useRef(1)

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      bus.current?.kill()
      bus.current = null
    },
    [],
  )

  // A new set of drills (different stage, level or free-practice choice) starts a fresh drill.
  const specKey = JSON.stringify(spec)
  const firstSpec = useRef(specKey)
  useEffect(() => {
    if (firstSpec.current === specKey) return
    firstSpec.current = specKey
    newDrill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey])

  const top = maxSpeed(drill)
  const speed = Math.min(wanted, top)
  const timed = useMemo(() => atSpeed(drill, speed), [drill, speed])
  const timing = Math.max(0.2, Math.min(0.6, L.timing / speed))
  const showLive = live && !liveLocked
  const phrase = PHRASE_TYPES.includes(drill.type)

  const busy = phase === 'hearing' || phase === 'playing' || phase === 'countin' || phase === 'singing'
  const colours = useMemo(() => result?.notes.map(colourFor), [result])
  const lastRound = rounds !== null && done.length + 1 >= rounds

  function out(): AudioNode {
    if (!bus.current) bus.current = makeBus(listener.ctx)
    return bus.current.node
  }

  function newDrill() {
    cancelAnimationFrame(raf.current)
    bus.current?.kill()
    bus.current = null
    setDrill(makeDrill(spec, range))
    setResult(null)
    setTrace(undefined)
    setCursor(null)
    setPhase('ready')
  }

  /** Stops the sound and the round at once, keeping the same drill. */
  function stop() {
    cancelAnimationFrame(raf.current)
    bus.current?.kill()
    bus.current = null
    setResult(null)
    setTrace(undefined)
    setCursor(null)
    setPhase('ready')
  }

  function changeSpeed(step: number) {
    const i = SPEEDS.findIndex((s) => Math.abs(s - speed) < 0.001)
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + step))]
    if (next > top + 0.001 || (phase === 'result' && !allowRetry)) return
    setWanted(next)
    saveSettings({ speeds: { ...loadSettings().speeds, [L.id]: next } })
    // A score belongs to the speed it was sung at.
    if (phase === 'result') {
      setResult(null)
      setTrace(undefined)
      setPhase('ready')
    }
  }

  function toggleLive() {
    setLive(!live)
    saveSettings({ live: !live })
  }

  function playDrill(t0: number) {
    const dest = out()
    for (const n of timed.notes) {
      playNote(listener.ctx, n.midi, t0 + n.start, phrase ? n.seconds : n.seconds * 0.95, { legato: phrase, dest })
    }
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
      if (t > timed.duration) {
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
    const d = timed
    const usedSpeed = speed
    const beatSec = beatFor(d.noteSeconds)
    const t0 = ctx.currentTime + 0.15
    // Everything is counted in bars of four. The beats run silently under the played notes, then the
    // clicks finish the bar, so singing starts on beat 1. When the notes fill the bar exactly, a whole bar is clicked.
    const used = Math.ceil(d.duration / beatSec - 1e-6)
    let clicks = (P.barBeats - (used % P.barBeats)) % P.barBeats
    if (clicks < P.minClicks) clicks += P.barBeats
    const countStart = t0 + used * beatSec
    const singStart = countStart + clicks * beatSec
    const beatAt = (t: number) => (Math.max(0, Math.floor((t - t0) / beatSec + 1e-6)) % P.barBeats) + 1
    const listenFrom = singStart - timing - 0.1
    const end = singStart + d.duration + P.tailSeconds

    playDrill(t0)
    const dest = out()
    for (let i = 0; i < clicks; i++) playClick(ctx, countStart + i * beatSec, (used + i) % P.barBeats === 0, dest)

    const samples: Sample[] = []
    const tick = () => {
      const now = ctx.currentTime
      // Tell the listener which note is due, so a low note isn't mistaken for its overtone.
      const due = d.notes.find((n) => {
        const t = now - singStart - P.detectLagSeconds
        return t >= n.start - timing && t < n.start + n.seconds
      })
      const r = listener.read(due?.midi)
      if (now >= listenFrom) samples.push({ t: now - singStart - P.detectLagSeconds, midi: r.midi })
      if (now < countStart) {
        setPhase('playing')
        setCursor(now >= t0 ? now - t0 : null)
        setBeat(beatAt(now))
      } else if (now < singStart) {
        setPhase('countin')
        setCursor(null)
        setBeat(beatAt(now))
      } else if (now < end) {
        setPhase('singing')
        setCursor(now - singStart)
        if (showLive) setTrace(samples)
      } else {
        const s = scoreDrill(samples, d.notes, L, timing)
        resultSpeed.current = usedSpeed
        setResult(s)
        setTrace(samples.map((x) => ({ t: x.t - s.offset, midi: x.midi })))
        setCursor(null)
        setPhase('result')
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  /** Banks the round just sung and moves on: to the next drill, or to the session summary. */
  function next() {
    if (!result) return
    const entry = { score: result.score, speed: resultSpeed.current }
    const all = [...done, entry]
    scored.current.push({ notes: timed.notes, result })
    onRound?.(entry.score, entry.speed)
    setDone(all)
    if (rounds !== null && all.length >= rounds) {
      const summary: SessionResult = {
        score: Math.round(all.reduce((sum, r) => sum + r.score, 0) / all.length),
        rounds: all.map((r) => r.score),
        speed: Math.min(...all.map((r) => r.speed)),
      }
      setTip(sessionTip(scored.current))
      setVerdict(onFinish?.(summary) ?? { message: '' })
      setPhase('summary')
      return
    }
    newDrill()
  }

  function again() {
    scored.current = []
    setDone([])
    setVerdict(null)
    newDrill()
  }

  const head = (
    <div className="sessionHead">
      {onExit ? (
        <button className="link" onClick={onExit} disabled={busy}>
          ‹ Back
        </button>
      ) : (
        <span />
      )}
      <strong>{title}</strong>
      <span>{rounds !== null && phase !== 'summary' ? `Round ${Math.min(done.length + 1, rounds)} of ${rounds}` : ''}</span>
    </div>
  )

  if (phase === 'summary') {
    const avg = Math.round(done.reduce((sum, r) => sum + r.score, 0) / done.length)
    const slowest = Math.min(...done.map((r) => r.speed))
    const starCount = stars(avg)
    return (
      <section className="practice">
        {head}
        <div className="stage">
          <div className="result">
            <div className={`score ${avg >= 70 ? 'good' : 'off'}`}>{avg}%</div>
            <div className="stars" aria-label={`${starCount} of 3 stars`}>
              {'★'.repeat(starCount)}
              <span className="dim">{'★'.repeat(3 - starCount)}</span>
            </div>
            {slowest !== 1 && <span className={`badge ${slowest > 1 ? 'fast' : ''}`}>{slowest > 1 ? `Speed badge: ${pct(slowest)}` : `Practice speed: ${pct(slowest)}`}</span>}
            {verdict?.message && <p className="prompt">{verdict.message}</p>}
            <ul className="chips">
              {done.map((r, i) => (
                <li key={i} style={{ borderColor: r.score >= 70 ? GOOD : r.score >= 40 ? OFF : BAD }}>
                  <small>Round {i + 1}</small>
                  <b>{r.score}%</b>
                </li>
              ))}
            </ul>
            {tip && (
              <p className="tip">
                <b>Tip.</b> {tip}
              </p>
            )}
          </div>
        </div>
        <div className="actions">
          {verdict?.onNext && (
            <button className="primary" onClick={verdict.onNext}>
              {verdict.nextLabel}
            </button>
          )}
          <div className="row">
            <button className="secondary" onClick={again}>
              Do it again
            </button>
            <button className={verdict?.onNext ? 'secondary' : 'primary'} onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      </section>
    )
  }

  const held = timed.notes.length === 1
  const even = timed.notes.every((n) => Math.abs(n.seconds - timed.noteSeconds) < 1e-6)
  const starCount = result ? stars(result.score) : 0
  const secs = timed.noteSeconds >= 1 ? `${+timed.noteSeconds.toFixed(1)} s` : `${timed.noteSeconds.toFixed(2)} s`

  return (
    <section className="practice">
      {head}

      <div className="drillInfo">
        <span>
          <strong>{DRILL_NAMES[drill.type]}</strong>
          {drill.key && ` · ${drill.key}`} · {timed.notes.length} {timed.notes.length === 1 ? 'note' : 'notes'}
          {even && ` · ${secs} each`}
        </span>
      </div>

      <div className="controls">
        <div className="stepper" role="group" aria-label="Speed">
          <button onClick={() => changeSpeed(-1)} disabled={busy || speed <= SPEEDS[0] + 0.001} aria-label="Slower">
            −
          </button>
          <span>
            <b>{pct(speed)}</b>
            <small>{speed < 1 ? 'practice speed' : speed >= top && top < 1.5 ? 'top speed here' : 'speed'}</small>
          </span>
          <button onClick={() => changeSpeed(1)} disabled={busy || speed >= top - 0.001} aria-label="Faster">
            +
          </button>
        </div>
        <button className={`switch ${showLive ? 'on' : ''}`} onClick={toggleLive} disabled={busy || liveLocked} aria-pressed={showLive}>
          <i />
          Live line {liveLocked ? 'off for this test' : showLive ? 'on' : 'off'}
        </button>
      </div>

      <PitchGrid notes={timed.notes} duration={timed.duration} cursor={cursor} trace={trace} colours={colours} />

      <div className="stage compact">
        {phase === 'ready' && (
          <p className="prompt">
            The app plays these notes while counting in fours, clicks to finish the bar, then you sing them back from the next “1”.
          </p>
        )}
        {phase === 'hearing' && <p className="big">Listen…</p>}
        {phase === 'playing' && (
          <p className="big">
            Listen… <span className="quietCount">{beat}</span>
          </p>
        )}
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
                {chipsFor(timed, result, L.full).map((c) => (
                  <li key={c.key} style={{ borderColor: c.colour }}>
                    <b>{c.title}</b>
                    <span>{c.score}</span>
                    <small>{c.note}</small>
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
            {allowRetry && (
              <button className="secondary" onClick={run}>
                Try again
              </button>
            )}
            <button className="primary" onClick={next}>
              {lastRound ? 'Finish' : 'Next drill'}
            </button>
          </div>
        ) : busy ? (
          <button className="primary stop" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className="primary" onClick={run}>
            Play and sing
          </button>
        )}
        <div className="row">
          <button className="secondary" onClick={hear} disabled={busy}>
            Hear it
          </button>
          {phase !== 'result' && rounds === null && (
            <button className="secondary" onClick={() => newDrill()} disabled={busy}>
              Different drill
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
