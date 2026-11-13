import type { DrillNote } from './drills'
import type { DrillScore } from './scoring'

export type ScoredRound = { notes: DrillNote[]; result: DrillScore }

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length

/** One plain-language tip from a session's rounds: the clearest habit that showed up. */
export function sessionTip(rounds: ScoredRound[]): string {
  const all = rounds.flatMap((r) => r.result.notes.map((score, i) => ({ score, note: r.notes[i] })))
  if (!all.length) return ''
  const heard = all.filter((x) => x.score.heard)
  if (heard.length < all.length * 0.7) {
    return 'Many notes weren’t heard. Sing a little louder, on an open “ah”, and start right after the fourth click.'
  }
  if (heard.filter((x) => x.score.octaveOff !== 0).length >= heard.length * 0.25) {
    return 'Several notes came out an octave away. Before you sing, listen for how high or low the piano is.'
  }

  // Pitch habits, from notes sung on (or near) the right note.
  const tuned = heard.filter((x) => !x.score.run && x.score.octaveOff === 0 && Math.abs(x.score.cents) < 100)
  const edge = (pickTop: boolean) =>
    rounds
      .filter((r) => r.notes.length >= 2)
      .map((r) => {
        const target = (pickTop ? Math.max : Math.min)(...r.notes.map((n) => n.midi))
        const s = r.result.notes[r.notes.findIndex((n) => n.midi === target)]
        return s.heard && !s.run && s.octaveOff === 0 && Math.abs(s.cents) < 100 ? s.cents : null
      })
      .filter((c): c is number => c !== null)
  const tops = edge(true)
  const bottoms = edge(false)
  if (tops.length >= 3 && mean(tops) < -15) {
    return 'You tend to go flat on the top note. Think of the high note before you reach it, and aim just above it.'
  }
  if (bottoms.length >= 3 && mean(bottoms) > 15) {
    return 'You tend to go sharp on the lowest note. Let the low note settle; don’t push it.'
  }
  if (tuned.length >= 3) {
    const m = mean(tuned.map((x) => x.score.cents))
    if (m < -12) return 'You tend to sing a little flat. Aim slightly above each note.'
    if (m > 12) return 'You tend to sing a little sharp. Relax into each note; don’t reach for it.'
  }

  const offset = mean(rounds.map((r) => r.result.offset))
  if (offset > 0.15) return 'You tend to come in late. Breathe in on the third click and start on the beat after the fourth.'
  if (offset < -0.15) return 'You tend to come in early. Wait for the beat after the fourth click.'

  const runs = heard.filter((x) => x.score.run)
  if (runs.length >= 4 && mean(runs.map((x) => x.score.score)) < 60) {
    return 'The runs were smudged. Slow them down with the speed control, then build back up.'
  }
  const held = tuned.filter((x) => x.note.seconds >= 1)
  if (held.length >= 3 && mean(held.map((x) => x.score.steadiness)) < 0.6) {
    return 'Your long notes wander. Pick the pitch, then keep your breath even to hold it still.'
  }
  return 'No clear habit showed up: your misses were spread evenly. Nicely balanced singing.'
}
