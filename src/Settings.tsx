import { useEffect, useState } from 'react'
import type { Range } from './audio/drills'
import type { Listener } from './audio/listener'
import { midiName } from './audio/notes'
import { playNote, setSound, SOUNDS, type SoundId } from './audio/player'
import { FEEDBACK_URL } from './config'
import { canInstall, install, isInstalled, onInstallChange } from './install'
import { loadSettings, resetProgress, saveSettings } from './storage'
import TapCheck from './TapCheck'

/** Note sound, live line, earphone timing, range, pitch check and reset. */
export default function Settings({
  listener,
  range,
  onRange,
  onTuner,
  onHelp,
}: {
  listener: Listener
  range: Range | null
  onRange: () => void
  onTuner: () => void
  onHelp: () => void
}) {
  const [, redraw] = useState(0)
  useEffect(() => onInstallChange(() => redraw((n) => n + 1)), [])
  const [settings, setSettings] = useState(loadSettings)
  const [check, setCheck] = useState<'wired' | 'bluetooth' | null>(null)
  const [wiped, setWiped] = useState(false)

  function chooseSound(id: SoundId) {
    setSound(id)
    setSettings(saveSettings({ sound: id }))
    // Play three notes from the middle of the range so the sound can be heard.
    const mid = range ? Math.round((range.low + range.high) / 2) : 60
    const t = listener.ctx.currentTime + 0.05
    ;[0, 4, 7].forEach((step, i) => playNote(listener.ctx, mid + step, t + i * 0.45, 0.45, { legato: true }))
  }

  function reset() {
    if (!window.confirm('Delete all saved progress and history on this phone? Your range and settings are kept. This cannot be undone.')) return
    resetProgress()
    setWiped(true)
  }

  if (check) {
    return (
      <TapCheck
        listener={listener}
        kind={check}
        onDone={() => {
          setSettings(loadSettings())
          setCheck(null)
        }}
      />
    )
  }

  const ms = (v?: number) => (v === undefined ? 'not measured' : `${Math.round(v * 1000)} ms`)

  return (
    <section className="settings">
      <h3>Note sound</h3>
      <div className="levels two" role="group" aria-label="Note sound">
        {SOUNDS.map((s) => (
          <button key={s.id} className={s.id === settings.sound ? 'on' : ''} onClick={() => chooseSound(s.id)}>
            {s.name}
          </button>
        ))}
      </div>

      <h3>While you sing</h3>
      <button
        className={`switch wide ${settings.live ? 'on' : ''}`}
        onClick={() => setSettings(saveSettings({ live: !settings.live }))}
        aria-pressed={settings.live}
      >
        <i />
        Live pitch line {settings.live ? 'on' : 'off'}
      </button>
      <p className="detail left">Draws your pitch on the grid as you sing. You can also switch it on each practice screen.</p>

      <h3>Count-in</h3>
      <div className="levels two" role="group" aria-label="Count-in">
        {(['short', 'extended'] as const).map((id) => (
          <button key={id} className={id === settings.countIn ? 'on' : ''} onClick={() => setSettings(saveSettings({ countIn: id }))}>
            {id === 'short' ? 'Short' : 'Extended'}
          </button>
        ))}
      </div>
      <p className="detail left">
        {settings.countIn === 'short'
          ? 'When the notes end with one beat left in the bar, you get a single click on 4 and sing straight away.'
          : 'When the notes end with one beat left in the bar, you get that click and a full bar more: 4, 1, 2, 3, 4.'}{' '}
        Other drills are the same either way.
      </p>

      <h3>Earphone timing</h3>
      <div className="rows">
        <button className="rowBtn" onClick={() => setCheck('wired')}>
          Wired earphones <span>{ms(settings.latency.wired)} ›</span>
        </button>
        <button className="rowBtn" onClick={() => setCheck('bluetooth')}>
          Bluetooth earphones <span>{ms(settings.latency.bluetooth)} ›</span>
        </button>
      </div>
      <p className="detail left">Used for warm-up feedback, where you sing at the same time as the piano.</p>

      <h3>Your voice</h3>
      <div className="rows">
        <button className="rowBtn" onClick={onRange}>
          Range test <span>{range ? `${midiName(range.low)}–${midiName(range.high)}` : 'not set'} ›</span>
        </button>
        <button className="rowBtn" onClick={onTuner}>
          Pitch check <span>see the note you are singing ›</span>
        </button>
      </div>

      <h3>The app</h3>
      <div className="rows">
        <button className="rowBtn" onClick={onHelp}>
          How it works <span>›</span>
        </button>
        {canInstall() && (
          <button className="rowBtn" onClick={() => void install()}>
            Install on this phone <span>adds an icon to your home screen ›</span>
          </button>
        )}
        {FEEDBACK_URL && (
          <a className="rowBtn" href={FEEDBACK_URL} target="_blank" rel="noreferrer">
            Send feedback <span>a short form ›</span>
          </a>
        )}
      </div>
      {!canInstall() && (
        <p className="detail left">
          {isInstalled()
            ? 'Installed. It also works with no internet.'
            : 'To install, open Chrome’s ⋮ menu and choose “Add to Home screen”. After the first visit the app also works with no internet.'}
        </p>
      )}

      <h3>Progress</h3>
      <div className="rows">
        <button className="rowBtn danger" onClick={reset} disabled={wiped}>
          {wiped ? 'Progress deleted' : 'Reset progress'}
        </button>
      </div>
    </section>
  )
}
