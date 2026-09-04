# Reset

Reset is a guided breathing web app for calming down or refocusing in a few minutes. It offers three research-backed breathing techniques, each paced with real voice narration and precise, technique-correct timing. There are no accounts, no data collection beyond a local streak count, and no notifications — the app does nothing until it's opened, and asks nothing of the user beyond a few minutes of attention.

## How This Was Built

Reset was built end-to-end using Claude Code as an AI pair-programmer, by someone with no prior coding experience. Development was iterative: features were implemented, tested through real usage on desktop and mobile, and debugged based on that direct testing rather than assumed correctness.

## Why

Reset is built around a small set of deliberate constraints rather than a growing feature list.

- **Three techniques, chosen for evidence, not novelty.** Box Breath (used in military and athletic training for steadiness), the 4-7-8 method ("The Wind-Down," commonly recommended for sleep), and the physiological sigh ("The Instant Calm," backed by Stanford research on rapid stress reduction) cover the range of situations someone might reach for a breathing exercise. Each technique's phase durations are fixed to what the technique actually specifies, not to how long a given audio clip happens to run.
- **No accounts.** Nothing is created, nothing is signed into, and nothing leaves the device. The only persisted state is a local streak count and a mute preference, both stored in the browser.
- **No push notifications.** Reset does not attempt to bring anyone back. It sits still until it's opened.
- **Calm by design.** A single accent color, generous whitespace, serif titles, and slow crossfade transitions keep the interface itself from becoming another source of stimulation. Nothing on the page competes for attention with the breathing.

## Tech Stack

Reset is intentionally dependency-free:

- **HTML, CSS, and vanilla JavaScript** — no framework, no bundler, no build step
- **Static hosting on [Vercel](https://vercel.com)**, deployed automatically on every push to `main`
- **Web Audio via native `<audio>` elements** for narration playback
- **[ElevenLabs](https://elevenlabs.io)** to generate the narration audio itself — real, natural-sounding voice rather than robotic browser text-to-speech
- **Web Wake Lock API** (`navigator.wakeLock`) to keep the screen awake during a session, with graceful degradation where unsupported
- **`localStorage`** for streak tracking and mute preference — the only persisted state, and it never leaves the browser
- **A PWA manifest and icon set** for home-screen installation as a standalone app

## Architecture

### Screens

The app is a single `index.html` page with five screens (`home`, `select`, `duration`, `session`, `done`), each a `<main>` element toggled via a `.visible` class for a crossfade transition. All screen logic — navigation, state, and rendering — lives in `script.js`; there is no router and no separate page loads.

### Audio and timing

Each technique is defined as a fixed sequence of phases (e.g. Box Breath: inhale 4s, hold 4s, exhale 4s, hold 4s — a 16-second cycle). Phase duration is driven entirely by these fixed, technique-correct values, independent of how long the corresponding voice clip takes to play. This was a deliberate design decision: earlier versions derived phase timing from audio clip length, which meant pacing varied with narration length rather than reflecting the actual technique.

Audio plays in two distinct modes:

- **Fire-and-forget cues** (each breathing phase's narration) play once per phase, every cycle, for the full session. They never block or influence phase timing, and a clip is always allowed to finish naturally even if it runs slightly past its phase's fixed boundary.
- **Awaited narration** (session intro and outro) is played in full before the app proceeds, since these are meant to be heard start to finish, with a safety timeout in case playback stalls.

A session is driven by an async state machine (`runSession`) using a cancellation token that increments on every new session start or manual stop, checked after every await, so a stale session can never continue running or racing a new one.

### Streaks

Session completion is recorded to `localStorage` as a date and a streak count. On each completion, the app compares the stored date to today: same day keeps the streak, the day before increments it, anything older resets it to one. The streak is shown only on the completion screen, never as a nag or reminder elsewhere in the app.

## Getting Started

Reset is static — no dependencies, no build step. Any local static file server will work:

```bash
git clone https://github.com/kaushikr09-still/reset-breathing-app.git
cd reset-breathing-app
npx serve .
```

Then open the printed local URL in a browser. Note that `<audio>` playback relies on HTTP Range request support, so make sure whichever local server you use supports it (most modern static servers, including `serve`, do).

## Live Site

[getreset.vercel.app](https://getreset.vercel.app)
