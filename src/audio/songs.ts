// Songs brought in by the singer: cutting a tune into phrases and turning each phrase into a round.

import type { Drill, DrillNote, Range } from './drills'
import { toMelody, type MidiFile, type RawNote } from './midi'

export type Song = {
  id: string
  name: string
  /** Quarter notes per minute. */
  bpm: number
  barBeats: number
  /** Length of one beat, in quarter notes. */
  beatQ: number
  /** The tune: [start, length, pitch], times in quarter notes from the start of the file. */
  notes: [number, number, number][]
  /** Where each phrase starts, as positions in `notes`. Always begins with 0. */
  cuts: number[]
  /** Semitones the singer moved the tune by hand, on top of the automatic fit. */
  nudge: number
  /** Best score for each phrase, in step with `cuts`; null when not yet sung. */
  best: (number | null)[]
}

/** Longest phrase the automatic cutter leaves, in bars. */
const MAX_BARS = 4
/** Notes shorter than this (seconds) are scored together with their neighbours. */
const QUICK_NOTE = 0.2

const endQ = (n: [number, number, number]) => n[0] + n[1]

/** Best place to cut the notes from `a` up to (not including) `b` in two: the start of the second half. */
function bestCut(notes: Song['notes'], a: number, b: number, beatQ: number, barQ: number): number {
  const from = notes[a][0]
  const len = endQ(notes[b - 1]) - from
  let best = -1
  let bestScore = -Infinity
  for (let i = a + 1; i < b; i++) {
    const pos = (notes[i][0] - from) / len
    if (b - a > 3 && (pos < 0.25 || pos > 0.75)) continue
    const bar = notes[i][0] / barQ
    const onBar = Math.abs(bar - Math.round(bar)) < 0.02
    // A long note or a breath before the cut, a bar line at it, and near the middle are all good.
    const score = notes[i][0] - notes[i - 1][0] + (onBar ? beatQ : 0) - Math.abs(pos - 0.5) * beatQ
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best > 0 ? best : a + Math.ceil((b - a) / 2)
}

/** Cuts a tune into phrases: at rests of a beat or more, then anything over four bars is cut again. */
export function autoCuts(notes: Song['notes'], beatQ: number, barBeats: number): number[] {
  const barQ = beatQ * barBeats
  const maxQ = barQ * MAX_BARS
  const rests = [0]
  for (let i = 1; i < notes.length; i++) if (notes[i][0] - endQ(notes[i - 1]) >= beatQ - 0.01) rests.push(i)

  const cuts: number[] = []
  const split = (a: number, b: number) => {
    if (b - a < 4 || endQ(notes[b - 1]) - notes[a][0] <= maxQ + 0.01) {
      cuts.push(a)
      return
    }
    const m = bestCut(notes, a, b, beatQ, barQ)
    split(a, m)
    split(m, b)
  }
  rests.forEach((a, i) => split(a, rests[i + 1] ?? notes.length))

  // A scrap of one or two notes joins the phrase before it when the two still fit in four bars.
  const out = [0]
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i]
    const b = cuts[i + 1] ?? notes.length
    const prev = out[out.length - 1]
    if (b - a <= 2 && endQ(notes[b - 1]) - notes[prev][0] <= maxQ + 0.01) continue
    out.push(a)
  }
  return out
}

export function makeSong(name: string, file: MidiFile, part: number): Song {
  const notes = toMelody(file.parts[part].notes).map((n: RawNote): [number, number, number] => [
    Math.round(n.q * 960) / 960,
    Math.round(n.len * 960) / 960,
    n.midi,
  ])
  const cuts = autoCuts(notes, file.beatQ, file.barBeats)
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    bpm: Math.round(file.bpm * 100) / 100,
    barBeats: file.barBeats,
    beatQ: file.beatQ,
    notes,
    cuts,
    nudge: 0,
    best: cuts.map(() => null),
  }
}

/** The phrases as [first note, one past the last note]. */
export function phrases(song: Song): [number, number][] {
  return song.cuts.map((a, i) => [a, song.cuts[i + 1] ?? song.notes.length])
}

/** Joins phrase `i` with the one after it. */
export function joinNext(song: Song, i: number): Song {
  if (i < 0 || i >= song.cuts.length - 1) return song
  const cuts = song.cuts.filter((_, k) => k !== i + 1)
  const best = song.best.filter((_, k) => k !== i + 1)
  best[i] = null
  return { ...song, cuts, best }
}

/** Cuts phrase `i` in two at the most natural place. */
export function splitPhrase(song: Song, i: number): Song {
  const [a, b] = phrases(song)[i]
  if (b - a < 2) return song
  const m = bestCut(song.notes, a, b, song.beatQ, song.beatQ * song.barBeats)
  const cuts = [...song.cuts.slice(0, i + 1), m, ...song.cuts.slice(i + 1)]
  const best = [...song.best.slice(0, i), null, null, ...song.best.slice(i + 1)]
  return { ...song, cuts, best }
}

/**
 * How far to move the tune (semitones) so it sits in the singer's range: by whole octaves when
 * that fits, otherwise by the smallest move that fits, otherwise centred.
 */
export function fitShift(song: Song, range: Range): number {
  const pitches = song.notes.map((n) => n[2])
  const lo = Math.min(...pitches)
  const hi = Math.max(...pitches)
  const fits = (k: number) => lo + k >= range.low && hi + k <= range.high
  for (const k of [0, 12, -12, 24, -24, 36, -36]) if (fits(k)) return k
  for (let k = 1; k < 12; k++) {
    if (fits(-k)) return -k
    if (fits(k)) return k
  }
  return Math.round((range.low + range.high - lo - hi) / 2)
}

/** Seconds a phrase lasts at normal speed, from its first note to the end of its last. */
export function phraseSeconds(song: Song, a: number, b: number): number {
  return ((endQ(song.notes[b - 1]) - song.notes[a][0]) * 60) / song.bpm
}

/** One phrase as a round, moved by `shift` semitones. Time 0 is the start of the bar the phrase begins in. */
export function phraseDrill(song: Song, a: number, b: number, shift: number, label: string): Drill {
  const secQ = 60 / song.bpm
  const barQ = song.beatQ * song.barBeats
  const first = song.notes[a][0]
  // A phrase that starts part-way through a bar keeps its place in that bar.
  let bar = Math.floor(first / barQ + 0.01) * barQ
  if (first - bar < 0.02) bar = first
  const notes: DrillNote[] = song.notes.slice(a, b).map(([q, len, midi]) => {
    const n: DrillNote = { midi: midi + shift, start: (q - bar) * secQ, seconds: len * secQ }
    if (n.seconds < QUICK_NOTE) n.run = true
    return n
  })
  const beatSeconds = song.beatQ * secQ
  return {
    type: 'melody',
    key: '',
    notes,
    noteSeconds: beatSeconds,
    duration: (endQ(song.notes[b - 1]) - bar) * secQ,
    beatSeconds,
    barBeats: song.barBeats,
    lead: (first - bar) * secQ,
    label,
    legato: true,
  }
}

// Sending a prepared song to someone else

const FILE_MARK = 'sing-good-song'

export function songToFile(song: Song): string {
  const { name, bpm, barBeats, beatQ, notes, cuts } = song
  return JSON.stringify({ app: FILE_MARK, version: 1, song: { name, bpm, barBeats, beatQ, notes, cuts } })
}

/** Reads a song file made by `songToFile`. Throws a plain-language error when it is not one. */
export function songFromFile(text: string): Song {
  let data: { app?: string; song?: Partial<Song> }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This file is not a MIDI file or a Sing Good song.')
  }
  const s = data?.song
  const okNote = (n: unknown) => Array.isArray(n) && n.length === 3 && n.every((x) => typeof x === 'number' && Number.isFinite(x))
  if (data?.app !== FILE_MARK || !s || !Array.isArray(s.notes) || !s.notes.length || !s.notes.every(okNote)) {
    throw new Error('This file is not a MIDI file or a Sing Good song.')
  }
  const bpm = Number(s.bpm) > 0 ? Number(s.bpm) : 120
  const barBeats = Number(s.barBeats) > 0 ? Math.round(Number(s.barBeats)) : 4
  const beatQ = Number(s.beatQ) > 0 ? Number(s.beatQ) : 1
  const notes = s.notes as Song['notes']
  const given = Array.isArray(s.cuts) ? [...new Set(s.cuts.filter((c) => Number.isInteger(c) && c > 0 && c < notes.length))].sort((x, y) => x - y) : null
  const cuts = given ? [0, ...given] : autoCuts(notes, beatQ, barBeats)
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: String(s.name || 'Song').slice(0, 80),
    bpm,
    barBeats,
    beatQ,
    notes,
    cuts,
    nudge: 0,
    best: cuts.map(() => null),
  }
}
