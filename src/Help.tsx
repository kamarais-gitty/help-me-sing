import { APP_FULL_NAME } from './config'

/** Plain-language guide, reached from the More tab. */
export default function Help() {
  return (
    <section className="help">
      <h2>How it works</h2>

      <h3>A round</h3>
      <p>
        The app plays a note or a short tune while counting in fours. Clicks finish the bar, and you sing it back from the next “1”,
        following the moving line across the notes. Any sound works: “ah”, “la” or a hum.
      </p>

      <h3>Your score</h3>
      <p>
        Each note is scored on how close your pitch was, then the round gets a percentage and up to three stars (70%, 85% and 95%).
        Higher levels are stricter. With the live line on, a note glows while you hold it in tune and bursts with colour when you nail it.
      </p>

      <h3>Path and Free</h3>
      <p>
        <b>Path</b> takes you through 8 stages per level, 5 rounds each. Average 70% or more at normal speed to open the next stage. The
        level test opens the next level, and you can take it at any time. <b>Free</b> lets you pick any drill and setting; nothing is locked.
      </p>

      <h3>Speed</h3>
      <p>Slow a drill down with − to learn it. Scores below 100% speed are saved but do not unlock anything; faster than 100% earns a badge.</p>

      <h3>Warm-up</h3>
      <p>
        Sing along with the piano for 3, 5 or 10 minutes. With earphones in, each note shows whether you were in tune. On the phone
        speaker the routine still runs, without feedback.
      </p>

      <h3>Getting heard well</h3>
      <ul>
        <li>Use a quiet room. The app warns you when it is noisy.</li>
        <li>Hold the phone 20 to 30 cm from your mouth.</li>
        <li>Sing at a normal, steady volume. Very quiet, breathy notes are hard to hear.</li>
        <li>If low notes show up an octave high, redo the range test under More.</li>
      </ul>

      <h3>Use it like an app</h3>
      <p>
        Under More, choose “Install on this phone”, or open Chrome’s ⋮ menu and choose “Add to Home screen”. After the first visit it
        also works with no internet.
      </p>

      <h3>Privacy</h3>
      <p>Your voice is analysed on this phone as you sing and then discarded. Nothing is recorded or sent anywhere. Scores stay on this phone.</p>

      <h3>Credits</h3>
      <p className="detail left">
        {APP_FULL_NAME}. Piano recordings: Salamander Grand Piano by Alexander Holm, used under the Creative Commons Attribution 3.0
        licence, retuned to each note for this app.
      </p>
    </section>
  )
}
