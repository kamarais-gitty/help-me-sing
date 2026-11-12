import { useEffect, useRef, useState } from 'react'
import type { Range } from './audio/drills'
import type { LevelId } from './audio/levels'
import { startListener, type Listener } from './audio/listener'
import Practice from './Practice'
import RangeTest from './RangeTest'
import { loadLevel, loadRange, saveLevel, saveRange } from './storage'
import Tuner from './Tuner'
import './App.css'

type Status = 'idle' | 'starting' | 'listening' | 'error'
type Tab = 'practice' | 'range' | 'tuner'

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('practice')
  const [listener, setListener] = useState<Listener | null>(null)
  const [range, setRange] = useState<Range | null>(loadRange)
  const [level, setLevel] = useState<LevelId>(loadLevel)
  const listenerRef = useRef<Listener | null>(null)

  useEffect(() => () => listenerRef.current?.stop(), [])

  async function start() {
    setStatus('starting')
    setError('')
    try {
      const l = await startListener()
      listenerRef.current = l
      setListener(l)
      setStatus('listening')
      // First visit: find the singer's range before any drills.
      if (!range) setTab('range')
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
    setTab('practice')
  }

  function changeLevel(l: LevelId) {
    saveLevel(l)
    setLevel(l)
  }

  return (
    <main className="app">
      <header>
        <h1>Help Me Sing</h1>
        {listener && (
          <nav className="tabs">
            <button className={tab === 'practice' ? 'on' : ''} onClick={() => setTab('practice')} disabled={!range}>
              Practice
            </button>
            <button className={tab === 'range' ? 'on' : ''} onClick={() => setTab('range')}>
              Range
            </button>
            <button className={tab === 'tuner' ? 'on' : ''} onClick={() => setTab('tuner')}>
              Pitch check
            </button>
          </nav>
        )}
      </header>

      {!listener && (
        <section className="intro">
          <p>
            The app plays a few notes, you sing them back, and it scores how close you were. Tap start
            and allow the microphone to begin.
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

      {listener && tab === 'practice' && range && (
        <Practice
          key={`${range.low}-${range.high}`}
          listener={listener}
          range={range}
          level={level}
          onLevel={changeLevel}
          onRedoRange={() => setTab('range')}
        />
      )}
      {listener && tab === 'range' && <RangeTest listener={listener} initial={range} onDone={rangeDone} />}
      {listener && tab === 'tuner' && <Tuner listener={listener} />}
    </main>
  )
}
