import { useState } from 'react'
import type { Range } from './audio/drills'
import { LEVEL_ORDER, LEVELS, PATH, specFor, STAGES, type LevelId } from './audio/levels'
import type { Listener } from './audio/listener'
import { stars } from './audio/scoring'
import Session, { type SessionResult, type SessionVerdict } from './Session'
import { levelUnlocked, loadProgress, recordSession, stageUnlocked } from './storage'

/** A stage number, or 'test' for the level test. */
type Pick = number | 'test'

const pct = (speed: number) => `${Math.round(speed * 100)}%`

/** The guided path: four levels of eight stages, each unlocked by passing the one before. */
export default function Home({
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
  const [progress, setProgress] = useState(loadProgress)
  const [active, setActive] = useState<Pick | null>(null)
  const [run, setRun] = useState(0)
  const L = LEVELS[level]
  const open = levelUnlocked(progress, level)
  const idx = LEVEL_ORDER.indexOf(level)
  const nextLevel = LEVEL_ORDER[idx + 1] as LevelId | undefined

  function start(pick: Pick) {
    setActive(pick)
    setRun((r) => r + 1)
  }

  function finish(pick: Pick, r: SessionResult): SessionVerdict {
    const isTest = pick === 'test'
    const outcome = recordSession({ kind: isTest ? 'test' : 'stage', level, stage: isTest ? undefined : pick, score: r.score, speed: r.speed })
    setProgress(loadProgress())
    if (!outcome.counted) {
      return {
        message: `Saved as practice at ${pct(r.speed)} speed. ${isTest ? 'The level test' : 'A stage'} only counts at 100% speed or faster.`,
      }
    }
    if (!outcome.passed) {
      return { message: `You need an average of ${PATH.pass}% to pass. You got ${r.score}%, so have another go.` }
    }
    if (isTest) {
      if (!nextLevel) return { message: 'Level test passed. That is every level done. Free practice and faster speeds are still there to push you.' }
      return {
        message: `Level test passed. ${LEVELS[nextLevel].name} is ${outcome.newlyUnlocked ? 'now unlocked' : 'unlocked'}.`,
        nextLabel: `Go to ${LEVELS[nextLevel].name}`,
        onNext: () => {
          onLevel(nextLevel)
          setActive(null)
        },
      }
    }
    if (pick < STAGES[level].length - 1) {
      return {
        message: `Stage passed. Stage ${pick + 2} is ${outcome.newlyUnlocked ? 'now unlocked' : 'unlocked'}.`,
        nextLabel: `Stage ${pick + 2}: ${STAGES[level][pick + 1].name}`,
        onNext: () => start(pick + 1),
      }
    }
    return {
      message: 'Stage passed. That is every stage of this level. The level test is next.',
      nextLabel: 'Take the level test',
      onNext: () => start('test'),
    }
  }

  if (active !== null) {
    const isTest = active === 'test'
    return (
      <Session
        key={`${level}-${active}-${run}`}
        listener={listener}
        range={range}
        title={isTest ? `${L.name} level test` : `${L.name} ${active + 1}: ${STAGES[level][active].name}`}
        spec={specFor(level, isTest ? undefined : active)}
        level={L}
        rounds={isTest ? PATH.testRounds : PATH.stageRounds}
        allowRetry={!isTest}
        liveLocked={isTest && level === 'expert'}
        onFinish={(r) => finish(active, r)}
        onExit={() => setActive(null)}
      />
    )
  }

  const passed = progress.stages[level].filter((s) => s >= PATH.pass).length

  return (
    <section className="path">
      <div className="levels" role="group" aria-label="Level">
        {LEVEL_ORDER.map((id) => (
          <button key={id} className={id === level ? 'on' : ''} onClick={() => onLevel(id)}>
            {LEVELS[id].name}
            {!levelUnlocked(progress, id) && ' 🔒'}
          </button>
        ))}
      </div>

      <p className="detail">
        {open
          ? `${passed} of ${STAGES[level].length} stages passed. A stage is ${PATH.stageRounds} rounds; an average of ${PATH.pass}% opens the next one.`
          : `Locked. Pass the ${LEVELS[LEVEL_ORDER[idx - 1]].name} level test to open this level.`}
      </p>

      <ol className="stages">
        {STAGES[level].map((s, i) => {
          const best = progress.stages[level][i]
          const unlocked = stageUnlocked(progress, level, i)
          return (
            <li key={i}>
              <button onClick={() => start(i)} disabled={!unlocked}>
                <span className="num">{i + 1}</span>
                <span className="name">{s.name}</span>
                <span className="best">
                  {!unlocked ? '🔒' : best > 0 ? (
                    <>
                      {best}% <i>{'★'.repeat(stars(best))}</i>
                    </>
                  ) : (
                    'Start'
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <button className="primary test" onClick={() => start('test')} disabled={!open}>
        {L.name} level test
        <small>
          {progress.tests[level] > 0 ? `Best ${progress.tests[level]}% · ` : ''}
          {PATH.testRounds} rounds, no retries{nextLevel ? `. Passing opens ${LEVELS[nextLevel].name}; you can take it at any time to skip ahead.` : '.'}
        </small>
      </button>
    </section>
  )
}
