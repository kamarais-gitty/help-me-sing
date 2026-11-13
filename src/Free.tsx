import { useEffect, useMemo, useRef, useState } from 'react'
import type { Range } from './audio/drills'
import { DRILL_NAMES, LEVEL_ORDER, LEVELS, type DrillSpec, type DrillType, type LevelId } from './audio/levels'
import type { Listener } from './audio/listener'
import Session from './Session'
import { recordSession } from './storage'

const TYPES = Object.keys(DRILL_NAMES) as DrillType[]
const LENGTHS = [2, 1.5, 1, 0.75, 0.5, 0.35, 0.25]
const SHARES = [0.5, 0.7, 0.9, 1]
const JUMPS: [number, string][] = [
  [4, 'A third'],
  [7, 'A fifth'],
  [12, 'An octave'],
  [16, 'More than an octave'],
]
/** Types that set their own rhythm, so the note-length choice becomes the length of a beat. */
const OWN_COUNT: DrillType[] = ['held', 'arpeggioHold', 'shortRun', 'turn', 'riff']

/** Free practice: every drill type and setting open, nothing unlocked or locked. */
export default function Free({
  listener,
  range,
  level,
  onLevel,
}: {
  listener: Listener
  range: Range
  level: LevelId
  onLevel: (level: LevelId) => void
}) {
  const L = LEVELS[level]
  const [type, setType] = useState<DrillType | 'any'>('any')
  const [count, setCount] = useState(0) // 0 = the level's usual number
  const [length, setLength] = useState(0) // 0 = the level's usual length
  const [share, setShare] = useState(0)
  const [jump, setJump] = useState(0)
  const [open, setOpen] = useState(false)
  const scores = useRef<{ score: number; speed: number }[]>([])
  const levelRef = useRef(level)
  levelRef.current = level

  // Free rounds are saved to history as one entry when you leave or change level.
  function bank() {
    const s = scores.current
    if (!s.length) return
    recordSession({
      kind: 'free',
      level: levelRef.current,
      score: Math.round(s.reduce((sum, r) => sum + r.score, 0) / s.length),
      speed: Math.min(...s.map((r) => r.speed)),
    })
    scores.current = []
  }
  useEffect(() => bank, [])

  const spec = useMemo<DrillSpec>(
    () => ({
      types: type === 'any' ? L.types : [type],
      notes: count ? [count, count] : L.notes,
      noteSeconds: length ? [length, length] : L.noteSeconds,
      rhythmBeat: length ? [Math.max(0.5, Math.min(1, length)), Math.max(0.5, Math.min(1, length))] : L.rhythmBeat,
      rangeShare: share || L.rangeShare,
      maxJump: jump || L.maxJump,
    }),
    [L, type, count, length, share, jump],
  )

  function changeLevel(id: LevelId) {
    bank()
    onLevel(id)
  }

  const summary = [
    type === 'any' ? 'Any drill' : DRILL_NAMES[type],
    count ? `${count} notes` : null,
    length ? `${length} s notes` : null,
    share ? `${Math.round(share * 100)}% of range` : null,
    jump ? `jumps to ${JUMPS.find((j) => j[0] === jump)?.[1].toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="free">
      <div className="levels" role="group" aria-label="Strictness">
        {LEVEL_ORDER.map((id) => (
          <button key={id} className={id === level ? 'on' : ''} onClick={() => changeLevel(id)}>
            {LEVELS[id].name}
          </button>
        ))}
      </div>

      <button className="link options" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Hide settings' : `Settings: ${summary}`}
      </button>

      {open && (
        <div className="form">
          <p className="detail">The level sets how strict the scoring is. Anything left on “Level’s usual” follows the level.</p>
          <label>
            Drill type
            <select value={type} onChange={(e) => setType(e.target.value as DrillType | 'any')}>
              <option value="any">Any from this level</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {DRILL_NAMES[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Number of notes
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={type !== 'any' && OWN_COUNT.includes(type)}>
              <option value={0}>Level’s usual</option>
              {[2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note length
            <select value={length} onChange={(e) => setLength(Number(e.target.value))}>
              <option value={0}>Level’s usual</option>
              {LENGTHS.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
          </label>
          <label>
            Part of your range
            <select value={share} onChange={(e) => setShare(Number(e.target.value))}>
              <option value={0}>Level’s usual</option>
              {SHARES.map((s) => (
                <option key={s} value={s}>
                  {s === 1 ? 'All of it' : `Middle ${Math.round(s * 100)}%`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Largest jump
            <select value={jump} onChange={(e) => setJump(Number(e.target.value))}>
              <option value={0}>Level’s usual</option>
              {JUMPS.map(([j, name]) => (
                <option key={j} value={j}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <Session
        key={level}
        listener={listener}
        range={range}
        title="Free practice"
        spec={spec}
        level={L}
        rounds={null}
        onRound={(score, speed) => scores.current.push({ score, speed })}
      />
    </div>
  )
}
