import { useEffect, useRef, useState } from 'react'
import type { Listener } from './audio/listener'
import { midiName, readNote, type NoteReading } from './audio/notes'
import { TUNING } from './audio/tuning'

type Hint = 'silent' | 'unclear' | 'ok'
type Point = { t: number; midi: number | null }

const GRAPH_RANGE = 7 // semitones shown above and below the centre

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

export default function Tuner({ listener }: { listener: Listener }) {
  const [note, setNote] = useState<NoteReading | null>(null)
  const [hint, setHint] = useState<Hint>('silent')
  const [level, setLevel] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const history: Point[] = []
    let centre = 57 // A3, until a first note is heard
    let lastUi = 0
    let raf = 0
    const tick = () => {
      const r = listener.read()
      const now = performance.now()
      history.push({ t: now, midi: r.midi })
      while (history.length && now - history[0].t > TUNING.historySeconds * 1000) history.shift()
      if (r.midi !== null) centre += (Math.round(r.midi) - centre) * 0.05
      if (canvasRef.current) drawGraph(canvasRef.current, history, now, centre)
      if (now - lastUi > 80) {
        lastUi = now
        setNote(r.midi === null ? null : readNote(r.midi))
        setHint(r.midi !== null ? 'ok' : r.loud ? 'unclear' : 'silent')
        setLevel(r.level)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [listener])

  const cents = note ? Math.round(note.cents) : 0
  const inTune = note !== null && Math.abs(note.cents) <= TUNING.inTuneCents
  const verdict = !note ? '' : inTune ? 'In tune' : cents < 0 ? 'A little flat' : 'A little sharp'

  return (
    <section className="tuner">
      <div className={`note ${note ? (inTune ? 'good' : 'off') : 'none'}`}>{note ? note.name : '–'}</div>
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
    </section>
  )
}
