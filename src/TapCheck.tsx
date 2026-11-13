import { useEffect, useRef, useState } from 'react'
import { delayFromTaps, scheduleClicks, TAP } from './audio/calibration'
import type { Listener } from './audio/listener'
import { loadSettings, saveSettings } from './storage'

type Phase = 'intro' | 'tapping' | 'done' | 'failed'

/** The earphone timing check: tap along with eight clicks and the delay is measured and saved. */
export default function TapCheck({
  listener,
  kind,
  onDone,
}: {
  listener: Listener
  kind: 'wired' | 'bluetooth'
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [count, setCount] = useState(0)
  const [delay, setDelay] = useState(0)
  const clicks = useRef<number[]>([])
  const taps = useRef<number[]>([])
  const timer = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  function start() {
    taps.current = []
    setCount(0)
    clicks.current = scheduleClicks(listener.ctx)
    setPhase('tapping')
    const total = clicks.current[TAP.clicks - 1] - listener.ctx.currentTime + TAP.gap
    timer.current = window.setTimeout(() => {
      const d = delayFromTaps(clicks.current, taps.current)
      if (d === null) {
        setPhase('failed')
        return
      }
      saveSettings({ latency: { ...loadSettings().latency, [kind]: d } })
      setDelay(d)
      setPhase('done')
    }, total * 1000)
  }

  function tap() {
    taps.current.push(listener.ctx.currentTime)
    setCount(taps.current.length)
  }

  const name = kind === 'wired' ? 'wired earphones' : 'Bluetooth earphones'

  return (
    <section className="tapcheck">
      <h2>Timing check: {name}</h2>
      {phase === 'intro' && (
        <>
          <p className="prompt">
            Put your {name} in. You will hear {TAP.clicks} clicks. Tap the big button in time with each click, as if you were
            clapping along. This measures how late the sound reaches your ears, so warm-up feedback can allow for it.
          </p>
          <div className="actions">
            <button className="primary" onClick={start}>
              Start the clicks
            </button>
            <button className="secondary" onClick={onDone}>
              Cancel
            </button>
          </div>
        </>
      )}
      {phase === 'tapping' && (
        <button className="tapPad" onPointerDown={tap}>
          Tap
          <small>
            {count} of {TAP.clicks}
          </small>
        </button>
      )}
      {phase === 'done' && (
        <>
          <p className="big">{Math.round(delay * 1000)} ms</p>
          <p className="prompt">Saved for {name}. Under about 80 ms is typical for wired, and 150 to 300 ms for Bluetooth.</p>
          <div className="actions">
            <button className="primary" onClick={onDone}>
              Done
            </button>
            <button className="secondary" onClick={start}>
              Measure again
            </button>
          </div>
        </>
      )}
      {phase === 'failed' && (
        <>
          <p className="prompt">That didn’t give enough taps on the beat to measure. Tap once for every click, right through to the last one.</p>
          <div className="actions">
            <button className="primary" onClick={start}>
              Try again
            </button>
            <button className="secondary" onClick={onDone}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  )
}
