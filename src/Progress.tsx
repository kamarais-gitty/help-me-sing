import { LEVEL_ORDER, LEVELS, PATH, STAGES } from './audio/levels'
import { levelUnlocked, loadHistory, loadProgress, streak } from './storage'

const KIND = { stage: 'Stage', test: 'Level test', free: 'Free practice', warmup: 'Warm-up' } as const

/** Scores per level, best scores at each speed, practice streak and the recent trend. */
export default function Progress() {
  const progress = loadProgress()
  const history = loadHistory()
  const scoredSessions = history.filter((h) => h.kind !== 'warmup' && h.score !== undefined)
  const recent = scoredSessions.slice(-20)
  const days = streak(history)

  return (
    <section className="progressPage">
      <div className="stats">
        <div>
          <b>{days}</b>
          <span>day{days === 1 ? '' : 's'} in a row</span>
        </div>
        <div>
          <b>{scoredSessions.length}</b>
          <span>sessions</span>
        </div>
        <div>
          <b>{progress.warmups}</b>
          <span>warm-ups</span>
        </div>
      </div>

      <h3>Recent scores</h3>
      {recent.length ? (
        <div className="trend" role="img" aria-label={`Recent scores: ${recent.map((r) => r.score).join(', ')}`}>
          {recent.map((r, i) => (
            <span
              key={i}
              className={(r.score ?? 0) >= PATH.pass ? 'good' : 'off'}
              style={{ height: `${Math.max(4, r.score ?? 0)}%` }}
              title={`${KIND[r.kind]}: ${r.score}%`}
            />
          ))}
        </div>
      ) : (
        <p className="detail">Nothing yet. Finish a stage on the Path and it will show here.</p>
      )}

      {LEVEL_ORDER.map((id) => {
        const stages = progress.stages[id]
        const passed = stages.filter((s) => s >= PATH.pass).length
        const speeds = Object.entries(progress.bestBySpeed[id]).sort((a, b) => Number(a[0]) - Number(b[0]))
        return (
          <div className="levelCard" key={id}>
            <div className="levelHead">
              <strong>
                {LEVELS[id].name}
                {!levelUnlocked(progress, id) && ' 🔒'}
              </strong>
              <span>
                {passed} of {STAGES[id].length} stages
                {progress.tests[id] > 0 && ` · test ${progress.tests[id]}%`}
              </span>
            </div>
            <div className="dots">
              {stages.map((s, i) => (
                <span key={i} className={s >= PATH.pass ? 'good' : s > 0 ? 'off' : ''} title={`Stage ${i + 1}: ${s ? `${s}%` : 'not tried'}`}>
                  {s > 0 ? s : i + 1}
                </span>
              ))}
            </div>
            {speeds.length > 0 && (
              <p className="detail left">
                Best by speed: {speeds.map(([k, v]) => `${k}% → ${v}%`).join(' · ')}
              </p>
            )}
          </div>
        )
      })}

      {history.length > 0 && (
        <>
          <h3>Recent</h3>
          <ul className="recent">
            {history
              .slice(-8)
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  <span>
                    {new Date(h.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {KIND[h.kind]}
                    {h.level && ` · ${LEVELS[h.level].name}`}
                    {h.stage !== undefined && ` ${h.stage + 1}`}
                    {h.speed !== undefined && h.speed !== 1 && ` · ${Math.round(h.speed * 100)}% speed`}
                  </span>
                  <b>{h.score !== undefined ? `${h.score}%` : '✓'}</b>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  )
}
