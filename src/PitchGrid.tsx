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
  /** Live feedback while singing: how steadily each note is being held (0 to 1), and which were nailed. */
  fx?: NoteFx
}

export type NoteFx = { glow: number[]; nailed: boolean[] }

const BURST_SECONDS = 0.6
const SPARKS = ['#ffd166', '#ff8fd0', '#b79bff', '#7dffd0']

const MIN_ROWS = 9

export default function PitchGrid({ notes, duration, cursor, trace, colours, fx }: Props) {
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
      // Quick notes get a thinner gap so they stay visible.
      const gap = x(n.start + n.seconds) - x(n.start) > 10 ? 1.5 : 0.5
      const x0 = x(n.start) + gap
      const x1 = x(n.start + n.seconds) - gap
      const active = cursor !== null && cursor >= n.start && cursor < n.start + n.seconds
      // A note held steadily in tune glows brighter; one already sung keeps some of its glow.
      const glow = colours ? 0 : (fx?.glow[i] ?? 0) * (active ? 1 : 0.6)
      g.fillStyle = colours?.[i] ?? (active ? '#4fd1a5' : 'rgba(79,209,165,0.35)')
      if (glow > 0) {
        g.fillStyle = `rgb(${79 + 70 * glow}, ${209 + 46 * glow}, ${165 + 55 * glow})`
        g.shadowColor = '#7dffd0'
        g.shadowBlur = 22 * glow
      }
      g.beginPath()
      g.roundRect(x0, y(n.midi) - barH / 2, x1 - x0, barH, 5)
      g.fill()
      g.shadowBlur = 0
      const label = midiName(n.midi)
      g.font = '600 11px system-ui, sans-serif'
      if (g.measureText(label).width < x1 - x0 - 6) {
        g.fillStyle = colours?.[i] || active || glow > 0.3 ? '#06261c' : 'rgba(255,255,255,0.9)'
        g.textAlign = 'center'
        g.fillText(label, (x0 + x1) / 2, y(n.midi))
        g.textAlign = 'left'
      }
    })

    // A burst of colour as a nailed note ends.
    if (fx && !colours && cursor !== null) {
      notes.forEach((n, i) => {
        const p = (cursor - n.start - n.seconds) / BURST_SECONDS
        if (!fx.nailed[i] || p < 0 || p >= 1) return
        const x0 = x(n.start)
        const x1 = x(n.start + n.seconds)
        const cx = (x0 + x1) / 2
        const cy = y(n.midi)
        const ease = 1 - (1 - p) ** 3
        const grow = 16 * ease
        g.globalAlpha = 1 - p
        g.strokeStyle = '#ffd166'
        g.lineWidth = 3 * (1 - p) + 1
        g.beginPath()
        g.roundRect(x0 - grow, cy - barH / 2 - grow, x1 - x0 + grow * 2, barH + grow * 2, 5 + grow)
        g.stroke()
        const reach = (x1 - x0) / 2 + 34
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + i
          const d = 0.35 + 0.65 * ease
          g.fillStyle = SPARKS[k % SPARKS.length]
          g.beginPath()
          g.arc(cx + Math.cos(a) * reach * d, cy + Math.sin(a) * (barH / 2 + 30) * d, 3.5 * (1 - p) + 1, 0, Math.PI * 2)
          g.fill()
        }
        g.globalAlpha = 1
      })
    }

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
  }, [notes, duration, cursor, trace, colours, fx])

  return <canvas ref={ref} className="grid" aria-label={`Notes: ${notes.map((n) => midiName(n.midi)).join(', ')}`} />
}
