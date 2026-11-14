import { useEffect, useRef, useState } from 'react'
import type { Range } from './audio/drills'
import type { LevelId } from './audio/levels'
import { startListener, type Listener } from './audio/listener'
import { loadPiano, setSound } from './audio/player'
import { APP_FULL_NAME, APP_NAME } from './config'
import Help from './Help'
import { keepAwake } from './install'
import Free from './Free'
import Home from './Home'
import Progress from './Progress'
import RangeTest from './RangeTest'
import Settings from './Settings'
import { loadLevel, loadRange, loadSettings, saveLevel, saveRange } from './storage'
import Tuner from './Tuner'
import Warmup from './Warmup'
import './App.css'

type Status = 'idle' | 'starting' | 'listening' | 'error'
type Tab = 'path' | 'free' | 'warmup' | 'progress' | 'more'
/** Screens reached from the More tab. */
type Sub = 'settings' | 'range' | 'tuner' | 'help'

const TABS: { id: Tab; name: string }[] = [
  { id: 'path', name: 'Path' },
  { id: 'free', name: 'Free' },
  { id: 'warmup', name: 'Warm-up' },
  { id: 'progress', name: 'Progress' },
  { id: 'more', name: 'More' },
]

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('path')
  const [sub, setSub] = useState<Sub>('settings')
  const [listener, setListener] = useState<Listener | null>(null)
  const [range, setRange] = useState<Range | null>(loadRange)
  const [level, setLevel] = useState<LevelId>(loadLevel)
  const listenerRef = useRef<Listener | null>(null)

  useEffect(() => {
    setSound(loadSettings().sound)
    return () => listenerRef.current?.stop()
  }, [])

  async function start() {
    setStatus('starting')
    setError('')
    try {
      const l = await startListener()
      listenerRef.current = l
      void loadPiano(l.ctx)
      keepAwake()
      setListener(l)
      setStatus('listening')
    } catch (e) {
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

  function rangeDone(r: Range) {
    saveRange(r)
    setRange(r)
    setSub('settings')
    setTab('path')
  }

  function changeLevel(l: LevelId) {
    saveLevel(l)
    setLevel(l)
  }

  function go(t: Tab) {
    setTab(t)
    setSub('settings')
  }

  // First visit: find the singer's range before anything else.
  const needRange = listener && !range
  const rangeKey = range ? `${range.low}-${range.high}` : 'none'

  return (
    <main className="app">
      <header>
        {listener ? (
          <h1 className="brand">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
            Sing <span>Good</span>
          </h1>
        ) : (
          <div className="hero">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
            <h1 aria-label={APP_FULL_NAME}>
              School for Kids Who Can’t <span>Sing Good</span>
            </h1>
          </div>
        )}
        {listener && range && (
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
                {t.name}
              </button>
            ))}
          </nav>
        )}
      </header>

      {!listener && (
        <section className="intro">
          <p>
            {APP_NAME} plays a few notes, you sing them back, and it scores how close you were. Tap start and allow the microphone to
            begin.
          </p>
          <button className="primary" onClick={start} disabled={status === 'starting'}>
            {status === 'starting' ? 'Starting…' : 'Start'}
          </button>
          {error && <p className="error">{error}</p>}
          <p className="privacy">
            Your voice is analysed on this device and never recorded or sent anywhere.
          </p>
        </section>
      )}

      {needRange && <RangeTest listener={listener} initial={null} onDone={rangeDone} />}

      {listener && range && (
        <>
          {tab === 'path' && <Home key={rangeKey} listener={listener} range={range} level={level} onLevel={changeLevel} />}
          {tab === 'free' && <Free key={rangeKey} listener={listener} range={range} level={level} onLevel={changeLevel} />}
          {tab === 'warmup' && <Warmup key={rangeKey} listener={listener} range={range} />}
          {tab === 'progress' && <Progress />}
          {tab === 'more' && sub === 'settings' && (
            <Settings listener={listener} range={range} onRange={() => setSub('range')} onTuner={() => setSub('tuner')} onHelp={() => setSub('help')} />
          )}
          {tab === 'more' && sub !== 'settings' && (
            <button className="link back" onClick={() => setSub('settings')}>
              ‹ Back
            </button>
          )}
          {tab === 'more' && sub === 'range' && <RangeTest listener={listener} initial={range} onDone={rangeDone} />}
          {tab === 'more' && sub === 'tuner' && <Tuner listener={listener} />}
          {tab === 'more' && sub === 'help' && <Help />}
        </>
      )}
    </main>
  )
}
