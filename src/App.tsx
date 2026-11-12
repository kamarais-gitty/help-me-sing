import { useEffect, useRef, useState } from 'react'
import { startListener, type Listener } from './audio/listener'
import Practice from './Practice'
import Tuner from './Tuner'
import './App.css'

type Status = 'idle' | 'starting' | 'listening' | 'error'
type Tab = 'practice' | 'tuner'

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('practice')
  const [listener, setListener] = useState<Listener | null>(null)
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

  return (
    <main className="app">
      <header>
        <h1>Help Me Sing</h1>
        {listener && (
          <nav className="tabs">
            <button className={tab === 'practice' ? 'on' : ''} onClick={() => setTab('practice')}>
              Practice
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
            The app plays a note, you sing it back, and it scores how close you were. Tap start and
            allow the microphone to begin.
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

      {listener && tab === 'practice' && <Practice listener={listener} />}
      {listener && tab === 'tuner' && <Tuner listener={listener} />}
    </main>
  )
}
