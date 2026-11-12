import { useEffect, useRef } from 'react'
import type { DrillNote } from './audio/drills'
import { midiName } from './audio/notes'
import type { Sample } from './audio/scoring'

type Props = {
  notes: DrillNote[]
  duration: number
  /** Seconds into the drill, or null to hide the cursor. */
  cursor: number | null
  /** Pitch readings to draw over the notes, timed in drill seconds. */
  trace?: Sample[]
  /** A colour per note (after scoring); notes are neutral without it. */
  colours?: string[]
}

const MIN_ROWS = 9

export default function PitchGrid({ notes, duration, cursor, trace, colours }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
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

    // Rows: one per semitone, with room around the drill's notes.
    const pitches = notes.map((n) => n.midi)
    let lo = Math.min(...pitches) - 2
    let hi = Math.max(...pitches) + 2
    while (hi - lo + 1 < MIN_ROWS) {
      lo -= 1
      if (hi - lo + 1 < MIN_ROWS) hi += 1
    }
    const rows = hi - lo + 1
    const labelW = 34
    const pad = 8
    const rowH = (h - pad * 2) / rows
    const y = (midi: number) => pad + (hi - midi + 0.5) * rowH
    const x = (t: number) => labelW + (t / duration) * (w - labelW - pad)

    g.font = '11px system-ui, sans-serif'
    g.textBaseline = 'middle'
    for (let m = lo; m <= hi; m++) {
      const natural = !midiName(m).includes('#')
      g.strokeStyle = natural ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'
      g.beginPath()
      g.moveTo(labelW, y(m))
      g.lineTo(w - pad, y(m))
      g.stroke()
      if (natural) {
        g.fillStyle = 'rgba(255,255,255,0.45)'
        g.fillText(midiName(m), 4, y(m))
      }
    }

    // Target notes, each labelled with its name.
    const barH = Math.max(14, Math.min(28, rowH * 0.9))
    notes.forEach((n, i) => {
      const x0 = x(n.start) + 1.5
      const x1 = x(n.start + n.seconds) - 1.5
      const active = cursor !== null && cursor >= n.start && cursor < n.start + n.seconds
      g.fillStyle = colours?.[i] ?? (active ? '#4fd1a5' : 'rgba(79,209,165,0.35)')
      g.beginPath()
      g.roundRect(x0, y(n.midi) - barH / 2, x1 - x0, barH, 5)
      g.fill()
      const label = midiName(n.midi)
      g.font = '600 11px system-ui, sans-serif'
      if (g.measureText(label).width < x1 - x0 - 6) {
        g.fillStyle = colours || active ? '#06261c' : 'rgba(255,255,255,0.9)'
        g.textAlign = 'center'
        g.fillText(label, (x0 + x1) / 2, y(n.midi))
        g.textAlign = 'left'
      }
    })

    // What was sung.
    if (trace?.length) {
      g.strokeStyle = 'rgba(255,255,255,0.9)'
      g.lineWidth = 2
      g.lineJoin = 'round'
      g.lineCap = 'round'
      g.beginPath()
      let drawing = false
      for (const s of trace) {
        if (s.midi === null || s.t < 0 || s.t > duration) {
          drawing = false
          continue
        }
        const py = y(Math.max(lo - 0.5, Math.min(hi + 0.5, s.midi)))
        if (drawing) g.lineTo(x(s.t), py)
        else g.moveTo(x(s.t), py)
        drawing = true
      }
      g.stroke()
    }

    if (cursor !== null && cursor >= 0 && cursor <= duration) {
      g.strokeStyle = '#f2b84b'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x(cursor), pad / 2)
      g.lineTo(x(cursor), h - pad / 2)
      g.stroke()
    }
  }, [notes, duration, cursor, trace, colours])

  return <canvas ref={ref} className="grid" aria-label={`Notes: ${notes.map((n) => midiName(n.midi)).join(', ')}`} />
}
