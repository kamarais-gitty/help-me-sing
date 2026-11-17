import { useEffect, useRef, useState } from 'react'
import type { Drill, Range } from './audio/drills'
import { LEVELS, type LevelId } from './audio/levels'
import type { Listener } from './audio/listener'
import { parseMidi, toMelody, type MidiFile } from './audio/midi'
import { midiName } from './audio/notes'
import { makeBus, playNote, type Bus } from './audio/player'
import { fitShift, joinNext, makeSong, phraseDrill, phrases, phraseSeconds, songFromFile, songToFile, splitPhrase, type Song } from './audio/songs'
import Session from './Session'
import { loadSongs, recordSession, saveSongs } from './storage'

const MAX_FILE_BYTES = 3_000_000
const PREVIEW_SECONDS = 12
const WEAK_BELOW = 70

type Practice = { key: number; indices: number[]; drills: Drill[]; repeat: boolean }

const cleanName = (file: string) =>
  file
    .replace(/\.(mid|midi|json|singgood)$/gi, '')
    .replace(/\.singgood$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Song'

/** Songs the singer has brought in, cut into phrases to rehearse one at a time. */
export default function Songs({ listener, range, level }: { listener: Listener; range: Range; level: LevelId }) {
  const [songs, setSongs] = useState<Song[]>(loadSongs)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ name: string; file: MidiFile } | null>(null)
  const [practice, setPractice] = useState<Practice | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [hearing, setHearing] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const bus = useRef<Bus | null>(null)
  const timer = useRef(0)
  const L = LEVELS[level]

  const hush = () => {
    clearTimeout(timer.current)
    bus.current?.kill()
    bus.current = null
    setHearing(null)
  }
  useEffect(() => hush, [])

  function store(next: Song[]) {
    setSongs(next)
    if (!saveSongs(next)) setError('This phone would not save the song. Its storage for this app may be full; delete a song and try again.')
  }

  /** Changes one song, always starting from what is saved, so a score is never lost to an older copy. */
  function change(id: string, fn: (s: Song) => Song) {
    setSongs((now) => {
      const next = now.map((s) => (s.id === id ? fn(s) : s))
      saveSongs(next)
      return next
    })
  }

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    try {
      if (f.size > MAX_FILE_BYTES) throw new Error('That file is too large to be a tune. Choose a MIDI file.')
      const buf = await f.arrayBuffer()
      const head = new Uint8Array(buf.slice(0, 4))
      if (String.fromCharCode(...head) === 'MThd') {
        setPending({ name: cleanName(f.name), file: parseMidi(buf) })
        return
      }
      const song = songFromFile(new TextDecoder().decode(buf))
      store([...songs, song])
      setOpenId(song.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be read.')
    }
  }

  function hearPart(i: number) {
    hush()
    if (!pending || hearing === i) return
    const ctx = listener.ctx
    const b = makeBus(ctx)
    bus.current = b
    const tune = toMelody(pending.file.parts[i].notes)
    const secQ = 60 / pending.file.bpm
    const t0 = ctx.currentTime + 0.1
    for (const n of tune) {
      const at = (n.q - tune[0].q) * secQ
      if (at > PREVIEW_SECONDS) break
      playNote(ctx, n.midi, t0 + at, n.len * secQ, { legato: true, dest: b.node })
    }
    setHearing(i)
    timer.current = window.setTimeout(hush, (PREVIEW_SECONDS + 1.5) * 1000)
  }

  function usePart(i: number) {
    if (!pending) return
    hush()
    const song = makeSong(pending.name, pending.file, i)
    store([...songs, song])
    setPending(null)
    setOpenId(song.id)
  }

  async function send(song: Song) {
    const file = new File([songToFile(song)], `${song.name}.singgood.json`, { type: 'application/json' })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: song.name })
        return
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const chooser = <input ref={input} type="file" hidden onChange={picked} />

  // Choosing which part of a MIDI file is the tune
  if (pending) {
    return (
      <section className="songs">
        <button
          className="link back"
          onClick={() => {
            hush()
            setPending(null)
          }}
        >
          ‹ Cancel
        </button>
        <label className="field">
          Song name
          <input value={pending.name} maxLength={80} onChange={(e) => setPending({ ...pending, name: e.target.value })} />
        </label>
        <h3>Which part is the tune?</h3>
        <p className="detail left">Listen to each part and pick the one you want to sing. Where a part plays chords, the top note is used.</p>
        <div className="rows">
          {pending.file.parts.map((p, i) => (
            <div className="partRow" key={i}>
              <div>
                <b>{p.name}</b>
                <small>
                  {p.notes.length} notes · {midiName(p.low)} to {midiName(p.high)}
                </small>
              </div>
              <button className="secondary" onClick={() => hearPart(i)}>
                {hearing === i ? 'Stop' : 'Hear'}
              </button>
              <button className="primary" onClick={() => usePart(i)} disabled={!pending.name.trim()}>
                Use
              </button>
            </div>
          ))}
        </div>
      </section>
    )
  }

  const song = songs.find((s) => s.id === openId) ?? null

  // Singing
  if (song && practice) {
    return (
      <Session
        key={practice.key}
        listener={listener}
        range={range}
        title={song.name}
        spec={L}
        level={L}
        rounds={practice.repeat ? null : practice.drills.length}
        drills={practice.drills}
        onScore={(index, score) => {
          const phrase = practice.indices[index % practice.indices.length]
          change(song.id, (s) => ({ ...s, best: s.best.map((b, k) => (k === phrase ? Math.max(b ?? 0, score) : b)) }))
        }}
        onFinish={(r) => {
          recordSession({ kind: 'song', score: r.score, speed: r.speed })
          return { message: r.score >= WEAK_BELOW ? 'Nicely done.' : 'Keep going: the weak phrases are marked on the song’s page.' }
        }}
        onExit={() => setPractice(null)}
      />
    )
  }

  // One song
  if (song) {
    const list = phrases(song)
    const auto = fitShift(song, range)
    const shift = auto + song.nudge
    const pitches = song.notes.map((n) => n[2] + shift)
    const outside = Math.min(...pitches) < range.low || Math.max(...pitches) > range.high
    const scored = song.best.filter((b): b is number => b !== null)
    const weak = list.map((_, i) => i).filter((i) => song.best[i] !== null && song.best[i]! < WEAK_BELOW)
    const start = (indices: number[], repeat = false) =>
      setPractice({
        key: Date.now(),
        indices,
        repeat,
        drills: indices.map((i) => phraseDrill(song, list[i][0], list[i][1], shift, `Phrase ${i + 1} of ${list.length}`)),
      })
    const beats = Math.round(song.bpm / song.beatQ)

    return (
      <section className="songs">
        <button
          className="link back"
          onClick={() => {
            setEditing(false)
            setOpenId(null)
          }}
        >
          ‹ Songs
        </button>
        <h2>{song.name}</h2>
        <p className="detail left">
          {list.length} {list.length === 1 ? 'phrase' : 'phrases'} · {beats} beats a minute · {song.barBeats} beats in a bar
          {scored.length > 0 && ` · average best ${Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)}%`}
        </p>

        <div className="controls">
          <div className="stepper" role="group" aria-label="Key">
            <button onClick={() => change(song.id, (s) => ({ ...s, nudge: s.nudge - 1 }))} disabled={song.nudge <= -12} aria-label="Lower">
              −
            </button>
            <span>
              <b>{shift === 0 ? 'Original key' : `${Math.abs(shift)} ${Math.abs(shift) === 1 ? 'note' : 'notes'} ${shift > 0 ? 'up' : 'down'}`}</b>
              <small>
                {midiName(Math.min(...pitches))} to {midiName(Math.max(...pitches))}
              </small>
            </span>
            <button onClick={() => change(song.id, (s) => ({ ...s, nudge: s.nudge + 1 }))} disabled={song.nudge >= 12} aria-label="Higher">
              +
            </button>
          </div>
        </div>
        {outside && <p className="warn">Some notes are outside the range you set. Use − and + to move the song, or sing what you can.</p>}

        <div className="actions">
          <button className="primary" onClick={() => start(list.map((_, i) => i))}>
            Sing the whole song
          </button>
          {weak.length > 0 && (
            <button className="secondary" onClick={() => start(weak)}>
              Practise the {weak.length} weak {weak.length === 1 ? 'phrase' : 'phrases'}
            </button>
          )}
        </div>

        <h3>Phrases</h3>
        <p className="detail left">
          {editing ? 'Split a phrase that is too long, or join one to the next. Changing a phrase clears its score.' : 'Tap a phrase to practise it on repeat.'}
        </p>
        <div className="rows">
          {list.map(([a, b], i) =>
            editing ? (
              <div className="partRow" key={i}>
                <div>
                  <b>Phrase {i + 1}</b>
                  <small>
                    {b - a} notes · {Math.round(phraseSeconds(song, a, b))} s
                  </small>
                </div>
                <button className="secondary" onClick={() => change(song.id, (s) => splitPhrase(s, i))} disabled={b - a < 2}>
                  Split
                </button>
                <button className="secondary" onClick={() => change(song.id, (s) => joinNext(s, i))} disabled={i === list.length - 1}>
                  Join next
                </button>
              </div>
            ) : (
              <button className="rowBtn" key={i} onClick={() => start([i], true)}>
                Phrase {i + 1}
                <span className={song.best[i] === null ? '' : song.best[i]! >= WEAK_BELOW ? 'good' : 'weak'}>
                  {b - a} notes · {song.best[i] === null ? 'not sung yet' : `best ${song.best[i]}%`} ›
                </span>
              </button>
            ),
          )}
        </div>

        <div className="rows">
          <button className="rowBtn" onClick={() => setEditing(!editing)}>
            {editing ? 'Done changing phrases' : 'Change where the phrases are cut'} <span>›</span>
          </button>
          <button className="rowBtn" onClick={() => void send(song)}>
            Send this song to someone <span>with its phrases ›</span>
          </button>
          <button
            className="rowBtn danger"
            onClick={() => {
              if (!window.confirm(`Delete “${song.name}” from this phone?`)) return
              store(songs.filter((s) => s.id !== song.id))
              setEditing(false)
              setOpenId(null)
            }}
          >
            Delete this song
          </button>
        </div>
        <p className="detail left">Scored at {L.name} strictness, the level chosen on the Path and Free tabs.</p>
      </section>
    )
  }

  // The list
  return (
    <section className="songs">
      {chooser}
      <p className="detail left">
        Bring in the tune of a song as a MIDI file, and rehearse it a phrase at a time. The app plays each phrase, you sing it back, with
        the words if you like.
      </p>
      {songs.length > 0 && (
        <div className="rows">
          {songs.map((s) => {
            const sung = s.best.filter((b) => b !== null).length
            return (
              <button className="rowBtn" key={s.id} onClick={() => setOpenId(s.id)}>
                {s.name}
                <span>
                  {sung} of {s.cuts.length} phrases sung ›
                </span>
              </button>
            )
          })}
        </div>
      )}
      <button className="primary" onClick={() => input.current?.click()}>
        Add a song
      </button>
      {error && <p className="error">{error}</p>}
      <p className="detail left">
        Choose a MIDI file (.mid) or a song file someone sent you from this app. The file is read on this phone and is not sent anywhere.
        Only add music you have the right to use.
      </p>
    </section>
  )
}
