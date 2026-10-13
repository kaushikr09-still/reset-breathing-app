# Reset

Reset is a free, ad-free guided breathing app with three exercises:

- **Calm down** — for when stress spikes
- **Focus** — before an exam, a meeting or a big call
- **Sleep** — to ease into rest

No sign-up. Live at **https://getreset.vercel.app**

## How This Was Built

Reset was built end-to-end using Claude Code as an AI pair-programmer, by someone with no prior coding experience. Development was iterative: features were implemented, tested through real usage on desktop and mobile, and debugged based on that direct testing rather than assumed correctness.

## How the app flows

1. **Home** — the title, a short tagline, a **Begin** button, and two quiet links: **Your progress** and **About**.
2. **What do you need right now?** — choose Calm down, Focus or Sleep.
3. **How long do you have?** — Calm down: 1 or 5 minutes. Focus and Sleep: 2, 4 or 8 minutes. Each length has a short caption (Quick, Recommended, Deep).
4. **Stress check-in (before)** — rate how stressed you feel, 1 to 10, or skip it.
5. **Guided session** — a spoken intro, then the breathing cycles with a circle that grows and shrinks, a countdown, and Stop and Mute buttons. A short closing line ends it.
6. **Stress check-in (after)** — rate how you feel now, or skip it.
7. **Finish screen** — your before and after ratings in plain words, "Day N · Come back tomorrow.", **Try another** and **Your progress** buttons, and, where it applies, a hint to add Reset to your home screen.
8. **Your progress** — a short plain-language summary of your own sessions.
9. **About** — what Reset is, how data is handled, and a note that it is not medical advice.

Stopping a session early returns to the home screen. Nothing is saved for a session that was stopped.

## Features

- **Narration with fixed timing.** Seven short voice clips (an intro, an outro, and one per breathing phase) were generated with [ElevenLabs](https://elevenlabs.io). How long each phase lasts is set by the technique, not by how long a clip plays:
  - Calm down: breathe in 4s, a short extra breath in 1.5s, breathe out 8s (13.5s per cycle)
  - Focus: in 4s, hold 4s, out 4s, hold 4s (16s per cycle)
  - Sleep: in 4s, hold 7s, out 8s (19s per cycle)

  A cycle that has started always finishes, so a session can run a little past its chosen length.
- **Mute.** Narration can be muted during a session. The choice is remembered on the device.
- **Installable.** A web app manifest and icons let you add Reset to your home screen and open it full screen. There is **no service worker, on purpose**, so there is no offline mode.
- **Add-to-home-screen hint.** After a finished session, Android Chrome shows an **Add** button, but only if the browser offers its install prompt (this is not guaranteed). iPhone Safari shows a line explaining Share → Add to Home Screen. Other browsers, and the installed app, show nothing. Dismissing or installing hides it for good.
- **Screen stays on.** The Wake Lock API keeps the screen awake during a session, where the browser supports it. If it does not, nothing breaks.
- **Daily streak, stored on the device.** Finishing a session on the same day keeps the streak, finishing on the next day adds one, and a gap resets it to one. It appears only on the finish screen, as "Day N".

## Backend and privacy (Supabase)

Reset uses [Supabase](https://supabase.com) for one job: saving finished sessions so the progress screen can show them.

**What is collected, per finished session:**

- an anonymous user ID
- the exercise (stored as `sigh` for Calm down, `box` for Focus, `478` for Sleep)
- the session length in seconds
- your before and after stress ratings (1–10), or empty if you skipped them
- a timestamp

**What is not collected:** a name or an email. There are no accounts, no passwords and no sign-in screen. The page includes no analytics or ad scripts.

**How it works:**

- **Anonymous sign-in.** On load, the app asks Supabase for an anonymous session. The browser keeps it, so the same ID comes back on later visits. A different browser or device gets a different ID.
- **One table, `sessions`.** Each user can only read and add their own rows, enforced by row-level security. The table and its policies are set up in the Supabase dashboard, not in this repository.
- **Public key in the code.** `script.js` contains Supabase's public (anon) key, which is meant to be public. Row-level security is what protects the data.
- **Best effort.** If Supabase cannot be reached, a session still runs. It just is not saved.

**Your progress screen.** It shows how many sessions you have finished. After three sessions it adds a short summary: whether you usually feel calmer afterwards, and for each exercise a phrase such as "Helps you feel calmer". Only sessions where you rated both before and after count. A "works best for you" line appears only when two exercises each have at least two rated sessions and a clear gap between them. There are no charts or raw numbers.

**Free-tier note.** Reset runs on Supabase's free tier, and free projects are paused after about a week of inactivity. If that happens, new sessions cannot be saved and your progress may not show until the project is restored in the Supabase dashboard. Breathing sessions still work. There is **no keep-alive job** at the moment, so a quiet week can pause the project. Check Supabase's current free-tier rules for the exact terms.

## Principles

- **Three exercises, fixed timing.** Each one follows the timing its technique calls for, not whatever suits the audio.
- **No accounts.** There is no email, password or sign-up screen. Session data goes to the database under an anonymous ID, so it is never tied to a name. Mute and streak stay on the device.
- **No notifications.** Reset never sends notifications or guilt. The finish screen invites you to come back tomorrow, once. No reminders, no streak pressure.
- **Calm by design.** One accent colour, plenty of space, serif titles and slow crossfades, so the interface does not compete with the breathing.

## How it is built

No framework and no build step. Plain HTML, CSS and JavaScript, deployed to [Vercel](https://vercel.com) automatically on every push to `main`. The only outside script is the Supabase client, loaded from a CDN in `index.html`.

A session is an async routine in `script.js` that plays the intro, waits a short pause, loops through the breathing phases until the chosen time has passed, plays the outro, then asks for the after-rating. Each new session or Stop cancels any session still running. Phase cues play without blocking the timing and are allowed to finish; the intro and outro are played in full.

**Stored on the device (localStorage):** `boxBreathMuted` (mute), `boxBreathStreak` (streak date and count), `reset_install_hint_done` (install hint dismissed).

## Files

- `index.html` — every screen, plus the page head (preview text, manifest link, Supabase script)
- `style.css` — all styling
- `script.js` — all logic: the three exercises and their timing, narration, Wake Lock, check-ins, streak, install hint, Supabase and the progress screen
- `manifest.json` — name, colours and icons for home-screen install
- `icons/icon-192.png`, `icons/icon-512.png` — app icons
- `audio/` — seven voice clips: `intro`, `breathe-in`, `hold`, `breathe-out`, `one-more-in`, `breathe-out-fully`, `outro` (`.mp3`)
- `.gitignore`, `.vercelignore` — both keep a local `.claude/` folder out of the repository and the deploy

## Run it locally

Any static file server works:

```bash
git clone https://github.com/kaushikr09-still/reset-breathing-app.git
cd reset-breathing-app
npx serve .
```

Open the printed address. The audio needs a server that supports HTTP range requests (`serve` does). The Supabase client loads from a CDN, so you need an internet connection. A local copy talks to the same Supabase project, so a finished session there is saved as a real row.
