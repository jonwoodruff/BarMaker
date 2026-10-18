# BarMaker

A self-contained, framework-independent Web Component for performing **one to eight bars of monophonic melody** into ABC notation. MIT licensed. It can be used independently of Song & Hymn; there is no Django, database, account, server API, or audio upload dependency.

## Run the standalone demo

Requires Node 20.19+ or 22.12+ (Node 24 is used for development).

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. `index.html` is the complete demo. For a production build:

```sh
npm run build
```

The build produces `dist/bar-maker.js` (ES module) and `dist/bar-maker.iife.js` (plain browser script), with abcjs and Pitchy bundled. No CDN, soundfont, or network API is used at runtime.

## Drop it into another website

```html
<script src="/assets/bar-maker.iife.js"></script>
<bar-maker meter="4/4" tempo="96" bars="2"></bar-maker>
```

Or import the ES module, which registers `<bar-maker>`:

```js
import '@jonwoodruff/bar-maker';
```

This is a local package, not yet published to npm. Until publication, install from the repository or copy the built assets. Styles are contained in Shadow DOM. Theme variables include `--bm-ink`, `--bm-paper`, `--bm-line`, and `--bm-accent`.

## Performing

1. Select an input method, meter, quarter-note tempo, bar count, and eighth- or sixteenth-note grid.
2. Press **Record performance**. The default one-bar count-in plays before capture. Audible clicks can be switched off; visual beat numbers and their position colours remain.
3. Play by holding/releasing onscreen keys, use the mapped physical keyboard keys, or sing/hum one note at a time. Rests are created when no note is held or detected.
4. Recording stops at the selected bar count. Stop can finish early, padding the remainder with rests. Cancel keeps the previous snippet.
5. Check the notation and use **Play snippet**. The ABC text is editable; playback follows that text, including rests, ties, accidentals, and tempo.
6. **Copy notes** copies just the music body for use in an existing tune. **Copy full ABC** includes meter, unit note length, tempo, and key. The host adapter can use `getInsertableABC()` to preserve these fields when appending to a song with different settings.

Tempo always means **quarter notes per minute**, including in compound meters. For example, 6/8 at quarter=90 has six eighth-note clicks per bar. The first pulse of each bar is accented. Colour is supplemented by beat numbers and a bar/beat label. The metronome schedules against the Web Audio clock, with a short look-ahead; UI animation is separate from audio scheduling.

Computer keys map chromatically from the selected range: `A W S E D F T G Y H U J K O L P ;`. After recording is started the component takes keyboard focus. Ordinary typing in its text or settings fields is never interpreted as music. Releasing focus releases held notes. Onscreen input supports pointer/touch capture. Input is monophonic: a later note replaces an overlapping earlier note.

## Voice input and pitch plugins

The default `PitchyInput` uses **Pitchy 4.1.0**, the McLeod Pitch Method, an analyser, confidence/volume gating, short stabilization, and silence-based note releases. This supports a single hummed or sung melody, not chords, polyphonic recordings, or automatic lyrics. A breath or a clear gap between repeated "doo" syllables helps distinguish two notes of the same pitch; an uninterrupted hum becomes a held note. Pitch estimation can produce octave or articulation errors, so always check/edit the result. The supported note range is C2–B6.

Microphone input requires HTTPS or localhost and asks permission only when a voice take is started. Captured audio is analysed locally and is not retained or uploaded. Use headphones or mute audible clicks to keep the microphone from hearing the metronome. Tracks and processing are stopped on cancellation, completion, denied/late permission, component removal, hidden tabs, or page exit. Audio-device startup latency and microphone latency can affect the captured rhythm; grid snapping helps, but this is not a studio transcription tool.

Replace the pitch source without changing the widget:

```js
const widget = document.querySelector('bar-maker');
widget.pitchSourceFactory = () => ({
  async start(audioContext, onFrame) {
    // Repeatedly report { frequency: Hz, clarity: 0..1, rms: 0..1,
    // time: seconds on audioContext.currentTime's clock }.
  },
  stop() {
    // Stop timers and microphone tracks, including pending permission requests.
  }
});
```

The detector must report silence (zero frequency/volume) as well as notes. Plugin frames go through the same stable-note tracker. Synthetic pitch tests verify the default detector on pure and harmonic tones; a real device/room still needs musical listening tests.

## Component API

```js
const maker = document.querySelector('bar-maker');
maker.configure({ meter: '3/4', tempo: 100, bars: 2, grid: 16, countIn: true });
await maker.record();   // uses the selected input mode
maker.stop();          // finalize a take or stop playback
maker.cancel();        // keep the previous snippet
await maker.play();
maker.getABC();
maker.getNotes();
maker.getInsertableABC(); // inline [M:...][L:...][Q:...][K:...] + music body
maker.setABC('X:1\nM:4/4\nL:1/8\nQ:1/4=96\nK:C\nC2 D2 E2 G2 |');
maker.settings;        // a copy of the capture settings
maker.state;           // idle | preparing | count-in | recording | playing
maker.addEventListener('snippet-change', ({detail}) => {
  console.log(detail.abc, detail.notes, detail.inlineABC, detail.settings);
});
```

Configure or replace output while idle. Attributes `meter`, `tempo`, `bars`, `grid`, `count-in="false"`, and `input-mode="screen|computer|microphone"` can initialize the widget. Removal releases its resources; it can be reattached. Standalone exports also include the pure music conversion functions, `PitchTracker`, `PitchyInput`, `AudioEngine`, `sequenceFromABC`, and `playABC`. `playABC(abc)` returns a stop function after playback has started.

## Tests

```sh
npm test
npm run test:browser
```

Browser tests use installed Chrome on macOS, or Playwright Chromium elsewhere (`npx playwright install chromium`). `CHROME_PATH` selects another Chrome executable. The tests start an isolated local demo server and use a **simulated microphone**, not your actual microphone. They cover onscreen and physical keys, focus safety, capture timing, count-in, cancellation, ABC rendering/playback, the pitch plugin contract, microphone cleanup, denial, and mobile layout.

## Repository and integration

This directory is intended as an independent Git repository. The surrounding SongHymnComposition site uses a generated browser build in its static assets; that build is not required to work on this component independently. From the parent website, `python3 scripts/vendor_barmaker.py` rebuilds and refreshes its static copy. Keep the MIT licence and `THIRD_PARTY.md` with redistributed builds. The MIT software licence does not change the Creative Commons policy governing songs composed on the host website.
