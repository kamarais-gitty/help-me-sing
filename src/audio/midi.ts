// Reads a standard MIDI file into plain note lists. Times are in quarter notes from the start of the file.

export type RawNote = { q: number; len: number; midi: number }

export type MidiPart = { name: string; notes: RawNote[]; low: number; high: number }

export type MidiFile = {
  /** Quarter notes per minute. */
  bpm: number
  /** Beats in a bar, and the length of one beat in quarter notes. */
  barBeats: number
  beatQ: number
  parts: MidiPart[]
}

/** Notes closer together than this (in quarter notes) count as one chord. */
const CHORD_Q = 0.06
/** Notes shorter than this after tidying are dropped. */
const MIN_Q = 1 / 16

/**
 * One note at a time: the top note of each chord, and each note cut short where the next begins.
 */
export function toMelody(notes: RawNote[]): RawNote[] {
  const sorted = [...notes].sort((a, b) => a.q - b.q || b.midi - a.midi)
  const out: RawNote[] = []
  for (const n of sorted) {
    const last = out[out.length - 1]
    if (last && n.q - last.q < CHORD_Q) {
      if (n.midi > last.midi) out[out.length - 1] = { ...n, q: last.q }
      continue
    }
    if (last) last.len = Math.min(last.len, n.q - last.q)
    out.push({ ...n })
  }
  return out.filter((n) => n.len >= MIN_Q)
}

export function parseMidi(buf: ArrayBuffer): MidiFile {
  const d = new DataView(buf)
  let p = 0
  const need = (n: number) => {
    if (p + n > d.byteLength) throw new Error('This MIDI file is cut short or damaged.')
  }
  const u8 = () => (need(1), d.getUint8(p++))
  const u16 = () => (need(2), (p += 2), d.getUint16(p - 2))
  const u32 = () => (need(4), (p += 4), d.getUint32(p - 4))
  const tag = () => String.fromCharCode(u8(), u8(), u8(), u8())
  const vlq = () => {
    let v = 0
    for (let i = 0; i < 4; i++) {
      const b = u8()
      v = (v << 7) | (b & 0x7f)
      if (!(b & 0x80)) break
    }
    return v
  }

  if (d.byteLength < 14 || tag() !== 'MThd') throw new Error('This is not a MIDI file.')
  const headerLen = u32()
  u16() // format
  u16() // track count; the chunks are simply read until the file ends
  const division = u16()
  if (division & 0x8000 || division === 0) throw new Error('This MIDI file uses a timing format the app cannot read.')
  p = 8 + headerLen

  const tempos: { tick: number; bpm: number }[] = []
  const sigs: { tick: number; num: number; den: number }[] = []
  const parts = new Map<string, { track: number; ch: number; name: string; notes: RawNote[] }>()
  let track = 0

  while (p + 8 <= d.byteLength) {
    const id = tag()
    const len = u32()
    const end = Math.min(p + len, d.byteLength)
    if (id !== 'MTrk') {
      p = end
      continue
    }
    let tick = 0
    let status = 0
    let name = ''
    const open = new Map<number, number[]>()
    const mine: string[] = []
    while (p < end) {
      tick += vlq()
      let b = u8()
      if (b < 0x80) {
        if (!status) throw new Error('This MIDI file is damaged.')
        p--
        b = status
      } else if (b < 0xf0) {
        status = b
      }
      if (b === 0xff) {
        const type = u8()
        const n = vlq()
        need(n)
        if (type === 0x51 && n === 3) {
          const us = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2)
          if (us > 0) tempos.push({ tick, bpm: 60000000 / us })
        } else if (type === 0x58 && n >= 2) {
          sigs.push({ tick, num: d.getUint8(p), den: 2 ** d.getUint8(p + 1) })
        } else if (type === 0x03 && !name) {
          name = Array.from({ length: n }, (_, i) => String.fromCharCode(d.getUint8(p + i)))
            .join('')
            .trim()
        }
        p += n
      } else if (b === 0xf0 || b === 0xf7) {
        p += vlq()
      } else if (b >= 0xf0) {
        // System messages that should not be in a file; skip the byte.
      } else {
        const kind = b & 0xf0
        const ch = b & 0x0f
        if (kind === 0xc0 || kind === 0xd0) {
          u8()
          continue
        }
        const d1 = u8()
        const d2 = u8()
        if (kind !== 0x90 && kind !== 0x80) continue
        const key = ch * 128 + d1
        if (kind === 0x90 && d2 > 0) {
          open.set(key, [...(open.get(key) ?? []), tick])
        } else {
          const start = open.get(key)?.shift()
          if (start === undefined || ch === 9) continue // channel 10 is drums
          const id2 = `${track}:${ch}`
          if (!parts.has(id2)) {
            parts.set(id2, { track, ch, name: '', notes: [] })
            mine.push(id2)
          }
          parts.get(id2)!.notes.push({ q: start / division, len: Math.max(1, tick - start) / division, midi: d1 })
        }
      }
    }
    for (const id2 of mine) parts.get(id2)!.name = name
    p = end
    track++
  }

  const list = [...parts.values()].filter((x) => x.notes.length > 0)
  if (!list.length) throw new Error('No notes were found in this MIDI file.')
  const firstTick = Math.min(...list.map((x) => Math.min(...x.notes.map((n) => n.q)))) * division
  const atStart = <T extends { tick: number }>(items: T[]): T | undefined => {
    const sorted = [...items].sort((a, b) => a.tick - b.tick)
    return sorted.filter((x) => x.tick <= firstTick).pop() ?? sorted[0]
  }
  const sig = atStart(sigs) ?? { num: 4, den: 4 }
  // Six-eight and its relatives are felt in dotted beats: two, three or four to the bar.
  const compound = sig.den === 8 && sig.num % 3 === 0 && sig.num > 3
  const multi = (x: { track: number }) => list.filter((y) => y.track === x.track).length > 1

  return {
    bpm: atStart(tempos)?.bpm ?? 120,
    barBeats: compound ? sig.num / 3 : sig.num,
    beatQ: compound ? 1.5 : 4 / sig.den,
    parts: list.map((x, i) => {
      const pitches = x.notes.map((n) => n.midi)
      return {
        name: (x.name || `Part ${i + 1}`) + (multi(x) ? ` (channel ${x.ch + 1})` : ''),
        notes: x.notes.sort((a, b) => a.q - b.q),
        low: Math.min(...pitches),
        high: Math.max(...pitches),
      }
    }),
  }
}
