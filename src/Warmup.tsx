import { useEffect, useRef, useState } from 'react'
import { DEFAULT_DELAY } from './audio/calibration'
import { SPEEDS, type Range } from './audio/drills'
import type { Listener } from './audio/listener'
import { midiName } from './audio/notes'
import { makeBus, playChord, playGlide, playNote, type Bus } from './audio/player'
import { scoreNote, type NoteScore, type Sample } from './audio/scoring'
import { PRACTICE as P } from './audio/tuning'
import { EXERCISES, makeRep, rootBounds, ROUTINES, SIREN_SECONDS, type Exercise, type Rep, type RoutineId } from './audio/warmups'
import PitchGrid from './PitchGrid'
import { loadSettings, recordSession, saveSettings, type Listening } from './storage'
import TapCheck from './TapCheck'

type Mode = 'setup' | 'check' | 'running' | 'done'
/** A repetition that has been scheduled on the audio clock. */
type Scheduled = { exIdx: number; root: number; start: number; rep: Rep }

const GOOD = '#4fd1a5'
const OFF = '#f2b84b'
const MISSED = 'rgba(255,255,255,0.18)'
/** Warm-up feedback is deliberately gentle: a wide band, and a low bar for "in tune". */
const BAND = { full: 50, zero: 100 }
const IN_TUNE = 60
const LISTENING: { id: Listening; name: string }[] = [
  { id: 'speaker', name: 'Phone speaker' },
  { id: 'wired', name: 'Wired earphones' },
  { id: 'bluetooth', name: 'Bluetooth' },
]
const pct = (speed: number) => `${Math.round(speed * 100)}%`

export default function Warmup({ listener, range }: { listener: Listener; range: Range }) {
  const [mode, setMode] = useState<Mode>('setup')
  const [routineId, setRoutineId] = useState<RoutineId>('standard')
  const [settings, setSettings] = useState(loadSettings)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [view, setView] = useState<Scheduled | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [colours, setColours] = useState<string[]>([])
  const [done, setDone] = useState(0)
  const [turning, setTurning] = useState(false)
  const [summary, setSummary] = useState('')

  const listening = settings.listening
  const feedback = listening !== 'speaker'
  const delay = listening === 'speaker' ? 0 : (settings.latency[listening] ?? DEFAULT_DELAY[listening])
  const routine = ROUTINES[routineId]
  const exercises = routine.exercises.map((id) => EXERCISES[id])
  const budget = (routine.minutes * 60) / exercises.length

  // Everything the animation loop reads lives here, so it always sees current values.
  const live = useRef({ speed, feedback, delay, exercises, budget })
  live.current = { speed, feedback, delay, exercises, budget }
  const eng = useRef({
    root: 0,
    dir: 1,
    spent: 0,
    reps: 0,
    cur: null as Scheduled | null,
    next: null as Scheduled | 'end' | null,
    samples: [] as Sample[],
    marks: [] as string[],
    tally: { total: 0, heard: 0, good: 0 },
  })
  const raf = useRef(0)
  const bus = useRef<Bus | null>(null)

  function silence() {
    cancelAnimationFrame(raf.current)
    bus.current?.kill()
    bus.current = null
  }
  useEffect(() => silence, [])

  /** Puts one repetition on the audio clock. */
  function schedule(exIdx: number, root: number, when: number, first: boolean): Scheduled {
    const ctx = listener.ctx
    const ex = live.current.exercises[exIdx]
    const rep = makeRep(ex, root, live.current.speed, first ? 2 : 0)
    if (!bus.current) bus.current = makeBus(ctx)
    const dest = bus.current.node
    if (ex.siren) {
      playGlide(ctx, range.low + ex.margin, range.high - ex.margin, when + rep.lead, SIREN_SECONDS / live.current.speed, dest)
      playNote(ctx, range.low + ex.margin, when + rep.chordAt, rep.chordSeconds, { dest, volume: 0.35 })
    } else {
      playChord(ctx, [root, root + 4, root + 7], when + rep.chordAt, rep.chordSeconds, { dest })
      for (const n of rep.notes) {
        const seconds = ex.staccato ? Math.min(0.2, n.seconds * 0.45) : n.seconds
        playNote(ctx, n.midi, when + n.start, seconds, { legato: !ex.staccato, dest })
      }
    }
    return { exIdx, root, start: when, rep }
  }

  /** Starts an exercise from its first repetition. */
  function startExercise(exIdx: number) {
    const e = eng.current
    const b = rootBounds(live.current.exercises[exIdx], range)
    e.root = b.start
    e.dir = 1
    e.spent = 0
    e.reps = 0
    e.next = null
    show(schedule(exIdx, b.start, listener.ctx.currentTime + 0.25, true))
  }

  function show(s: Scheduled) {
    const e = eng.current
    e.cur = s
    e.samples = []
    e.marks = []
    setView(s)
    setColours([])
    setDone(s.exIdx)
    setTurning(false)
  }

  /** Decides what follows the current repetition: the pattern a semitone on, the next exercise, or the end. */
  function planNext(): Scheduled | 'end' {
    const e = eng.current
    const c = e.cur!
    const { exercises, budget } = live.current
    const ex = exercises[c.exIdx]
    const at = c.start + c.rep.duration
    e.spent += c.rep.duration
    e.reps += 1
    if (e.reps >= (ex.siren ? 2 : 3) && e.spent + c.rep.duration > budget) {
      const nextIdx = c.exIdx + 1
      if (nextIdx >= exercises.length) return 'end'
      const b = rootBounds(exercises[nextIdx], range)
      e.root = b.start
      e.dir = 1
      e.spent = 0
      e.reps = 0
      return schedule(nextIdx, b.start, at, true)
    }
    // Step a semitone on, turning round at the edges of the range.
    const b = rootBounds(ex, range)
    if (e.root + e.dir > b.max) e.dir = -1
    else if (e.root + e.dir < b.min) e.dir = 1
    e.root = Math.max(b.min, Math.min(b.max, e.root + e.dir))
    return schedule(c.exIdx, e.root, at, false)
  }

  /** Judges one note from what was sung, allowing it to be a little early or late. */
  function judge(ex: Exercise, i: number) {
    const e = eng.current
    const n = e.cur!.rep.notes[i]
    const seconds = ex.staccato ? n.seconds * 0.6 : n.seconds
    let best: NoteScore | null = null
    for (let shift = -0.15; shift <= 0.151; shift += 0.05) {
      const from = n.start + shift
      const slot = e.samples.filter((s) => s.t >= from && s.t < from + seconds)
      const s = scoreNote(slot, n.midi, BAND, Math.min(0.1, seconds * 0.3))
      // Singing an octave away from the piano is fine in a warm-up.
      const value = s.octaveOff !== 0 ? s.score * 2 : s.score
      if (!best || (s.heard && (!best.heard || value > best.score))) best = { ...s, score: value }
    }
    const ok = best!.heard && best!.score >= IN_TUNE
    e.marks[i] = !best!.heard ? MISSED : ok ? GOOD : OFF
    e.tally.total += 1
    if (best!.heard) e.tally.heard += 1
    if (ok) e.tally.good += 1
  }

  function tick() {
    const e = eng.current
    const c = e.cur
    if (!c) return
    const ctx = listener.ctx
    const now = ctx.currentTime
    const ex = live.current.exercises[c.exIdx]

    if (live.current.feedback && !ex.siren && !ex.unjudged) {
      // Where the singer is in the pattern, allowing for the sound reaching their ears late.
      const t = now - c.start - live.current.delay - P.detectLagSeconds
      const due = c.rep.notes.find((n) => t >= n.start - 0.1 && t < n.start + n.seconds)
      e.samples.push({ t, midi: listener.read(due?.midi).midi })
      let changed = false
      c.rep.notes.forEach((n, i) => {
        if (e.marks[i] === undefined && t > n.start + n.seconds + 0.2) {
          judge(ex, i)
          changed = true
        }
      })
      if (changed) setColours([...e.marks])
    }
    setCursor(now - c.start)

    if (!e.next && now >= c.start + c.rep.duration - 0.15) e.next = planNext()
    if (e.next && now >= (e.next === 'end' ? c.start + c.rep.duration : e.next.start)) {
      if (live.current.feedback && !ex.siren && !ex.unjudged) c.rep.notes.forEach((_, i) => e.marks[i] === undefined && judge(ex, i))
      const next = e.next
      e.next = null
      if (next === 'end') return finish()
      show(next)
    }
    raf.current = requestAnimationFrame(tick)
  }

  function begin() {
    eng.current.tally = { total: 0, heard: 0, good: 0 }
    setPaused(false)
    setMode('running')
    startExercise(0)
    raf.current = requestAnimationFrame(tick)
  }

  function finish() {
    cancelAnimationFrame(raf.current)
    const { total, heard, good } = eng.current.tally
    setSummary(
      !live.current.feedback
        ? 'There was no feedback this time, because the piano was on the phone speaker. Use earphones to see how in tune you were.'
        : total === 0 || heard < total * 0.3
          ? 'I couldn’t hear you clearly on most notes, so there is no in-tune figure this time.'
          : `In tune on ${Math.round((good / total) * 100)}% of notes.`,
    )
    recordSession({ kind: 'warmup' })
    setCursor(null)
    setMode('done')
  }

  function pause() {
    silence()
    setPaused(true)
  }

  /** Restarts the audio from a given exercise, or from the repetition that was interrupted. */
  function restart(exIdx?: number) {
    const e = eng.current
    silence()
    setPaused(false)
    if (exIdx === undefined) {
      const at = e.next && e.next !== 'end' ? e.next : e.cur!
      e.next = null
      show(schedule(at.exIdx, at.root, listener.ctx.currentTime + 0.25, true))
    } else if (exIdx >= live.current.exercises.length) {
      return finish()
    } else {
      startExercise(exIdx)
    }
    raf.current = requestAnimationFrame(tick)
  }

  function turnBack() {
    eng.current.dir = -1
    setTurning(true)
  }

  function changeSpeed(step: number) {
    const i = SPEEDS.findIndex((s) => Math.abs(s - speed) < 0.001)
    setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + step))])
  }

  function choose(id: Listening) {
    setSettings(saveSettings({ listening: id }))
  }

  if (mode === 'check' && listening !== 'speaker') {
    return (
      <TapCheck
        listener={listener}
        kind={listening}
        onDone={() => {
          setSettings(loadSettings())
          setMode('setup')
        }}
      />
    )
  }

  if (mode === 'setup' || mode === 'check') {
    const measured = listening !== 'speaker' ? settings.latency[listening] : undefined
    return (
      <section className="warmup">
        <p className="prompt">A guided warm-up fitted to your range. Sing along with the piano; nothing is scored.</p>
        <div className="routines">
          {(Object.keys(ROUTINES) as RoutineId[]).map((id) => (
            <button key={id} className={id === routineId ? 'on' : ''} onClick={() => setRoutineId(id)}>
              <b>{ROUTINES[id].name}</b>
              <span>{ROUTINES[id].minutes} min</span>
              <small>{ROUTINES[id].exercises.length} exercises</small>
            </button>
          ))}
        </div>
        <p className="detail">{exercises.map((x) => x.name).join(' · ')}</p>

        <h3>How are you listening?</h3>
        <div className="levels three" role="group" aria-label="Listening through">
          {LISTENING.map((l) => (
            <button key={l.id} className={l.id === listening ? 'on' : ''} onClick={() => choose(l.id)}>
              {l.name}
            </button>
          ))}
        </div>
        {listening === 'speaker' ? (
          <p className="detail">On the speaker the warm-up runs without feedback, because the microphone would hear the piano as well as you.</p>
        ) : (
          <div className="note">
            <p>
              Feedback is on: each note turns green or amber as you sing it.{' '}
              {measured !== undefined
                ? `Timing check done: ${Math.round(measured * 1000)} ms.`
                : `Timing check not done yet, so a typical ${Math.round(delay * 1000)} ms delay is assumed.`}
            </p>
            <button className="link" onClick={() => setMode('check')}>
              {measured !== undefined ? 'Redo the timing check' : 'Do the timing check (20 seconds)'}
            </button>
            {listener.mic && <p className="mic">Microphone in use: {listener.mic}</p>}
          </div>
        )}

        <div className="actions">
          <button className="primary" onClick={begin}>
            Start {routine.name.toLowerCase()} warm-up
          </button>
        </div>
      </section>
    )
  }

  if (mode === 'done') {
    return (
      <section className="warmup">
        <div className="stage">
          <p className="big sing">Warmed up</p>
          <p className="prompt">{summary}</p>
        </div>
        <div className="actions">
          <button className="primary" onClick={() => setMode('setup')}>
            Done
          </button>
        </div>
      </section>
    )
  }

  const ex = view ? exercises[view.exIdx] : exercises[0]
  const b = rootBounds(ex, range)
  const slide = view && cursor !== null ? Math.max(0, Math.min(1, (cursor - view.rep.lead) / (SIREN_SECONDS / speed))) : 0
  const arch = Array.from({ length: 41 }, (_, i) => `${(i / 40) * 300},${100 - 85 * Math.sin((Math.PI * i) / 40)}`).join(' ')

  return (
    <section className="warmup">
      <div className="sessionHead">
        <span>
          Exercise {done + 1} of {exercises.length}
        </span>
        <strong>{ex.name}</strong>
        <span>{routine.name}</span>
      </div>
      <div className="progress">
        <span style={{ width: `${((done + Math.min(1, eng.current.spent / budget)) / exercises.length) * 100}%` }} />
      </div>

      <div className="singOn">
        Sing <b>{ex.sing}</b>
        <small>{ex.how}</small>
      </div>

      {ex.siren ? (
        <svg className="grid siren" viewBox="-10 0 320 115" preserveAspectRatio="none" role="img" aria-label="Siren: slide from low to high and back">
          <polyline points={arch} fill="none" stroke="rgba(79,209,165,0.5)" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {view && cursor !== null && cursor >= view.rep.lead && slide < 1 && (
            <circle cx={slide * 300} cy={100 - 85 * Math.sin(Math.PI * slide)} r="7" fill="#f2b84b" />
          )}
        </svg>
      ) : (
        view && <PitchGrid notes={view.rep.notes} duration={view.rep.duration} cursor={paused ? null : cursor} colours={colours} />
      )}

      <p className="detail">
        {paused
          ? 'Paused.'
          : ex.siren
            ? `Slide from about ${midiName(range.low + ex.margin)} up to ${midiName(range.high - ex.margin)} and back.`
            : view && cursor !== null && cursor < view.rep.lead
              ? 'Listen for the chord, then sing with the piano.'
              : turning
                ? 'Turning back down from the next repeat.'
                : ex.unjudged && feedback
                  ? 'Trills and rolls aren’t judged. Just follow the piano.'
                : `Starting on ${view ? midiName(view.root) : ''}, moving ${eng.current.dir > 0 && (view?.root ?? 0) < b.max ? 'up' : 'down'} a semitone each time.`}
      </p>

      <div className="controls">
        <div className="stepper" role="group" aria-label="Speed">
          <button onClick={() => changeSpeed(-1)} disabled={speed <= SPEEDS[0] + 0.001} aria-label="Slower">
            −
          </button>
          <span>
            <b>{pct(speed)}</b>
            <small>speed</small>
          </span>
          <button onClick={() => changeSpeed(1)} disabled={speed >= SPEEDS[SPEEDS.length - 1] - 0.001} aria-label="Faster">
            +
          </button>
        </div>
        <button className="secondary turn" onClick={turnBack} disabled={paused || ex.siren || turning}>
          Too high, turn back
        </button>
      </div>

      <div className="actions">
        <button className="primary" onClick={paused ? () => restart() : pause}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <div className="row">
          <button className="secondary" onClick={() => restart(view?.exIdx ?? 0)}>
            Repeat exercise
          </button>
          <button className="secondary" onClick={() => restart((view?.exIdx ?? 0) + 1)}>
            {(view?.exIdx ?? 0) + 1 >= exercises.length ? 'Finish' : 'Skip'}
          </button>
        </div>
      </div>
    </section>
  )
}
