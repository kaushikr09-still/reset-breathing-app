(() => {
  // Each phase's duration is fixed and physiologically correct for its
  // technique, independent of how long its spoken audio cue takes to play.
  const TECHNIQUES = {
    box: {
      name: 'Box Breath',
      closing: "That's it. Carry this focus into what's next.",
      durations: [2, 4, 8],
      defaultMinutes: 4,
      phases: [
        { label: 'Inhale', audioKey: 'breatheIn', seconds: 4, circleClass: 'expand' },
        { label: 'Hold', audioKey: 'hold', seconds: 4, circleClass: 'expand' },
        { label: 'Exhale', audioKey: 'breatheOut', seconds: 4, circleClass: '' },
        { label: 'Hold', audioKey: 'hold', seconds: 4, circleClass: '' },
      ],
    },
    '478': {
      name: 'The Wind-Down',
      closing: "That's it for today. Let your body settle into rest.",
      durations: [2, 4, 8],
      defaultMinutes: 4,
      phases: [
        { label: 'Inhale', audioKey: 'breatheIn', seconds: 4, circleClass: 'expand' },
        { label: 'Hold', audioKey: 'hold', seconds: 7, circleClass: 'expand' },
        { label: 'Exhale', audioKey: 'breatheOut', seconds: 8, circleClass: '' },
      ],
    },
    sigh: {
      name: 'The Instant Calm',
      closing: "That's it. Notice how much lighter that feels.",
      durations: [1, 5],
      defaultMinutes: 1,
      phases: [
        { label: 'Breathe in', audioKey: 'breatheIn', seconds: 4, circleClass: 'expand-half' },
        { label: 'One more in', audioKey: 'oneMoreIn', seconds: 1.5, circleClass: 'expand' },
        { label: 'Breathe out fully', audioKey: 'breatheOutFully', seconds: 8, circleClass: '' },
      ],
    },
  };

  const INTRO_TEXT = "Let's begin. Settle into a comfortable position, and let your shoulders drop.";
  const OUTRO_TEXT = 'Well done. Notice how you feel, before you carry on.';

  const AUDIO_FILES = {
    intro: 'audio/intro.mp3',
    breatheIn: 'audio/breathe-in.mp3',
    hold: 'audio/hold.mp3',
    breatheOut: 'audio/breathe-out.mp3',
    oneMoreIn: 'audio/one-more-in.mp3',
    breatheOutFully: 'audio/breathe-out-fully.mp3',
    outro: 'audio/outro.mp3',
  };

  // Used only for intro/outro when muted, as a reasonable silent pause in
  // place of the voiceover.
  const FALLBACK_SECONDS = { intro: 3, outro: 3 };

  // Pause after intro finishes, before the first breathing phase begins,
  // so there's time to actually settle in rather than "breathe in" starting
  // almost immediately. The shape stays static/idle throughout this pause.
  const POST_INTRO_PAUSE_MS = 2000;

  // --- Supabase ------------------------------------------------------
  // Anonymous auth + session logging. Entirely best-effort: if Supabase
  // is unreachable or misconfigured, breathing sessions still run exactly
  // as before — only the logging/insights layer is affected, silently.
  const SUPABASE_URL = 'https://uhjoozsoiyylkphujaqb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoam9venNvaXl5bGtwaHVqYXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0OTQ2MjAsImV4cCI6MjEwNDA3MDYyMH0.2-l5bJOm36RatISVOOFwU8Ow5ZIorV3iIH2uWfKnm3I';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Resolved once an anonymous session exists (either restored from a
  // prior visit, or freshly created). Awaited before any insert/query so
  // those never race the initial sign-in.
  const authReady = (async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) console.warn('Anonymous sign-in failed:', error.message);
      }
    } catch (err) {
      console.warn('Auth check failed:', err);
    }
  })();

  async function recordSession(techniqueId, durationSeconds, stressBefore, stressAfter) {
    try {
      await authReady;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { error } = await sb.from('sessions').insert({
        user_id: user.id,
        technique: techniqueId,
        duration_seconds: durationSeconds,
        stress_before: stressBefore,
        stress_after: stressAfter,
      });
      if (error) console.warn('Could not record session:', error.message);
    } catch (err) {
      console.warn('Could not record session:', err);
    }
  }

  async function fetchSessions() {
    await authReady;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];
    const { data, error } = await sb
      .from('sessions')
      .select('technique, stress_before, stress_after')
      .eq('user_id', user.id);
    if (error) throw error;
    return data || [];
  }

  const MUTE_STORAGE_KEY = 'boxBreathMuted';
  const STREAK_STORAGE_KEY = 'boxBreathStreak';
  const ORDINAL_WORDS = [
    '', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
    'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth',
    'Eighteenth', 'Nineteenth', 'Twentieth',
  ];

  const homeScreen = document.getElementById('home-screen');
  const selectScreen = document.getElementById('select-screen');
  const durationScreen = document.getElementById('duration-screen');
  const sessionScreen = document.getElementById('session-screen');
  const doneScreen = document.getElementById('done-screen');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const restartBtn = document.getElementById('restart-btn');
  const circle = document.getElementById('circle');
  const phaseLabel = document.getElementById('phase-label');
  const timerLabel = document.getElementById('timer-label');
  const muteBtn = document.getElementById('mute-btn');
  const doneMessage = document.getElementById('done-message');
  const doneStreakLabel = document.getElementById('done-streak-label');
  const techniqueCards = document.querySelectorAll('.technique-card');
  const durationTitle = document.getElementById('duration-title');
  const durationList = document.getElementById('duration-list');
  const selectBackBtn = document.getElementById('select-back-btn');
  const durationBackBtn = document.getElementById('duration-back-btn');
  const insightsLink = document.getElementById('insights-link');
  const checkinScreen = document.getElementById('checkin-screen');
  const checkinPrompt = document.getElementById('checkin-prompt');
  const checkinScale = document.getElementById('checkin-scale');
  const checkinSkipBtn = document.getElementById('checkin-skip-btn');
  const insightsScreen = document.getElementById('insights-screen');
  const insightsBackBtn = document.getElementById('insights-back-btn');
  const insightsContent = document.getElementById('insights-content');

  let currentTechniqueId = 'box';
  let isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  let sessionToken = 0;
  let countdownIntervalId = null;
  let wakeLock = null;

  const audioElements = {};
  Object.keys(AUDIO_FILES).forEach((key) => {
    const audio = new Audio(AUDIO_FILES[key]);
    audio.preload = 'auto';
    audio.load();
    audioElements[key] = audio;
  });

  // Breathing-phase cues: each one plays in full, every time its phase
  // occurs, in every cycle, for the whole session — fire-and-forget, never
  // blocking or influencing phase timing. A cue is allowed to keep playing
  // even after its own phase's fixed duration has elapsed and the next
  // phase has already started (e.g. The Instant Calm's "one more in" clip
  // is slightly longer than its 1.5s phase), since it must never be cut
  // off partway through. Tracked as a set, not a single reference, because
  // more than one can legitimately be in flight briefly.
  const firedAudio = new Set();

  function stopAllFiredAudio() {
    firedAudio.forEach((audio) => {
      audio.pause();
      audio.onended = null;
    });
    firedAudio.clear();
  }

  function playCueFireAndForget(key) {
    if (isMuted) return;
    const audio = audioElements[key];
    audio.currentTime = 0;
    firedAudio.add(audio);
    audio.onended = () => firedAudio.delete(audio);
    const playPromise = audio.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => firedAudio.delete(audio));
    }
  }

  // Fixed-length delay used for the intro->phases pause and for each
  // breathing phase's own duration. Only Stop cancels this; muting does
  // not, since phase timing is independent of audio.
  let delayResolve = null;
  let delayTimeoutId = null;

  function wait(ms) {
    return new Promise((resolve) => {
      delayResolve = resolve;
      delayTimeoutId = setTimeout(() => {
        delayTimeoutId = null;
        delayResolve = null;
        resolve();
      }, ms);
    });
  }

  function cancelDelay() {
    if (delayTimeoutId) {
      clearTimeout(delayTimeoutId);
      delayTimeoutId = null;
    }
    if (delayResolve) {
      const resolve = delayResolve;
      delayResolve = null;
      resolve();
    }
  }

  // Intro/outro: these are voiceovers meant to be heard in full, not tied
  // to a fixed physiological duration, so we wait for the clip to finish
  // (or a generous safety timeout, or a fixed pause if muted). Tracked
  // separately from the breathing-phase cues above since these are always
  // singular (never overlapping) and are awaited rather than fire-and-forget.
  let awaitedAudioEl = null;
  let cueResolve = null;
  let cueTimeoutId = null;
  let cueSafetyTimeoutId = null;

  function clearCueSafetyTimeout() {
    if (cueSafetyTimeoutId) {
      clearTimeout(cueSafetyTimeoutId);
      cueSafetyTimeoutId = null;
    }
  }

  function playAndWait(key) {
    return new Promise((resolve) => {
      cueResolve = resolve;
      if (isMuted) {
        cueTimeoutId = setTimeout(() => {
          cueTimeoutId = null;
          cueResolve = null;
          resolve();
        }, (FALLBACK_SECONDS[key] || 3) * 1000);
        return;
      }
      const audio = audioElements[key];
      awaitedAudioEl = audio;
      audio.currentTime = 0;
      audio.onended = () => {
        awaitedAudioEl = null;
        clearCueSafetyTimeout();
        cueResolve = null;
        resolve();
      };
      const playPromise = audio.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {
          awaitedAudioEl = null;
          clearCueSafetyTimeout();
          cueResolve = null;
          resolve();
        });
      }
      // Safety net in case a browser silently stalls playback and never
      // fires 'ended'. These are longer voiceover clips, so a generous
      // fixed ceiling is enough margin without needing to know the exact
      // expected duration in advance.
      cueSafetyTimeoutId = setTimeout(() => {
        cueSafetyTimeoutId = null;
        if (awaitedAudioEl === audio) {
          awaitedAudioEl.pause();
          awaitedAudioEl.onended = null;
          awaitedAudioEl = null;
        }
        if (cueResolve === resolve) {
          cueResolve = null;
          resolve();
        }
      }, 15000);
    });
  }

  function cancelCue() {
    if (awaitedAudioEl) {
      awaitedAudioEl.pause();
      awaitedAudioEl.onended = null;
      awaitedAudioEl = null;
    }
    if (cueTimeoutId) {
      clearTimeout(cueTimeoutId);
      cueTimeoutId = null;
    }
    clearCueSafetyTimeout();
    if (cueResolve) {
      const resolve = cueResolve;
      cueResolve = null;
      resolve();
    }
  }

  // --- Screen wake lock ----------------------------------------------
  // Keeps the screen from dimming/locking during an active session. Not
  // supported in every browser, and the browser can revoke it on its own
  // (e.g. switching apps) — both are handled silently, the app works the
  // same either way, just without this feature when unavailable.

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (err) {
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    const lock = wakeLock;
    wakeLock = null;
    try {
      await lock.release();
    } catch (err) {
      // Already released or unreleasable — nothing to do.
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeLock && sessionScreen.classList.contains('visible')) {
      requestWakeLock();
    }
  });

  // --- UI helpers --------------------------------------------------------

  function updateMuteButton() {
    muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    muteBtn.setAttribute('aria-pressed', String(isMuted));
    muteBtn.setAttribute('aria-label', isMuted ? 'Unmute narration' : 'Mute narration');
  }

  function showScreen(screen) {
    [homeScreen, selectScreen, durationScreen, checkinScreen, sessionScreen, doneScreen, insightsScreen].forEach((s) => s.classList.remove('visible'));
    screen.classList.add('visible');
  }

  function showDurationScreen(techniqueId) {
    const technique = TECHNIQUES[techniqueId];
    durationTitle.textContent = technique.name;
    durationList.innerHTML = '';
    technique.durations.forEach((minutes) => {
      const isDefault = minutes === technique.defaultMinutes;
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'duration-option' + (isDefault ? ' is-default' : '');
      const value = document.createElement('span');
      value.className = 'duration-value';
      value.textContent = `${minutes} min`;
      option.appendChild(value);
      if (isDefault) {
        const note = document.createElement('span');
        note.className = 'duration-note';
        note.textContent = 'Usual length';
        option.appendChild(note);
      }
      option.addEventListener('click', async () => {
        const stressBefore = await showCheckIn('How stressed do you feel right now?');
        runSession(techniqueId, minutes, stressBefore);
      });
      durationList.appendChild(option);
    });
    showScreen(durationScreen);
  }

  // A quiet, always-skippable 1-10 stress check-in, shown before a session
  // starts and again after it ends. Tapping a number both answers and
  // advances — there's no separate submit step. Returns a promise that
  // resolves with the chosen number, or null if skipped.
  let checkInResolve = null;

  const CHECKIN_END_LABELS = { 1: '1 · Calm', 10: '10 · Very stressed' };

  for (let n = 1; n <= 10; n += 1) {
    const item = document.createElement('div');
    item.className = 'checkin-item';

    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'checkin-option';
    option.textContent = String(n);
    option.addEventListener('click', () => {
      if (checkInResolve) {
        const resolve = checkInResolve;
        checkInResolve = null;
        resolve(n);
      }
    });
    item.appendChild(option);

    const label = document.createElement('span');
    label.className = 'checkin-item-label';
    if (CHECKIN_END_LABELS[n]) label.textContent = CHECKIN_END_LABELS[n];
    item.appendChild(label);

    checkinScale.appendChild(item);
  }

  checkinSkipBtn.addEventListener('click', () => {
    if (checkInResolve) {
      const resolve = checkInResolve;
      checkInResolve = null;
      resolve(null);
    }
  });

  function showCheckIn(promptText) {
    return new Promise((resolve) => {
      checkInResolve = resolve;
      checkinPrompt.textContent = promptText;
      showScreen(checkinScreen);
    });
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function ordinalLabel(n) {
    if (n >= 1 && n < ORDINAL_WORDS.length) return ORDINAL_WORDS[n];
    const j = n % 10;
    const k = n % 100;
    if (j === 1 && k !== 11) return `${n}st`;
    if (j === 2 && k !== 12) return `${n}nd`;
    if (j === 3 && k !== 13) return `${n}rd`;
    return `${n}th`;
  }

  function recordStreakCompletion() {
    const today = new Date();
    const todayKey = dateKey(today);
    const yesterdayKey = dateKey(new Date(today.getTime() - 24 * 60 * 60 * 1000));
    const stored = JSON.parse(localStorage.getItem(STREAK_STORAGE_KEY) || 'null');

    let streak = 1;
    if (stored) {
      if (stored.date === todayKey) {
        streak = stored.streak;
      } else if (stored.date === yesterdayKey) {
        streak = stored.streak + 1;
      }
    }

    localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify({ date: todayKey, streak }));
  }

  function renderStreak(targetLabel) {
    const stored = JSON.parse(localStorage.getItem(STREAK_STORAGE_KEY) || 'null');
    if (!stored) {
      targetLabel.classList.add('hidden');
      return;
    }
    const today = new Date();
    const todayKey = dateKey(today);
    const yesterdayKey = dateKey(new Date(today.getTime() - 24 * 60 * 60 * 1000));
    if (stored.date !== todayKey && stored.date !== yesterdayKey) {
      targetLabel.classList.add('hidden');
      return;
    }
    targetLabel.textContent = stored.streak >= 2
      ? `${ordinalLabel(stored.streak)} day in a row`
      : 'First day of many';
    targetLabel.classList.remove('hidden');
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function startCountdownDisplay(totalSeconds, startTime, token) {
    timerLabel.textContent = formatTime(totalSeconds);
    countdownIntervalId = setInterval(() => {
      if (token !== sessionToken) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
        return;
      }
      const elapsed = (performance.now() - startTime) / 1000;
      const remaining = Math.max(0, Math.ceil(totalSeconds - elapsed));
      timerLabel.textContent = formatTime(remaining);
      if (remaining <= 0) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      }
    }, 250);
  }

  function stopCountdownDisplay() {
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
  }

  function completeSession(durationSeconds, stressBefore, stressAfter) {
    releaseWakeLock();
    recordStreakCompletion();
    recordSession(currentTechniqueId, durationSeconds, stressBefore, stressAfter);
    doneMessage.textContent = TECHNIQUES[currentTechniqueId].closing;
    renderStreak(doneStreakLabel);
    showScreen(doneScreen);
  }

  // --- Session sequencing ------------------------------------------------
  // Sequence: static idle -> intro -> brief pause -> breathing cycles for
  // the chosen duration -> static idle -> outro -> completion screen.

  async function runSession(techniqueId, minutes, stressBefore) {
    const token = ++sessionToken;
    currentTechniqueId = techniqueId;
    const technique = TECHNIQUES[techniqueId];

    showScreen(sessionScreen);
    circle.className = 'circle idle';
    document.body.classList.remove('breathing-expand');
    phaseLabel.textContent = INTRO_TEXT;
    timerLabel.textContent = '';
    requestWakeLock();

    await playAndWait('intro');
    if (token !== sessionToken) return;

    await wait(POST_INTRO_PAUSE_MS);
    if (token !== sessionToken) return;

    circle.classList.remove('idle');
    void circle.offsetWidth;

    const totalMs = minutes * 60 * 1000;
    const cycleStart = performance.now();
    startCountdownDisplay(minutes * 60, cycleStart, token);

    // Check the time budget only between full cycles, never mid-cycle, so
    // a cycle that's already begun always plays all of its phases through
    // to its own natural last phase instead of being cut off partway.
    while (token === sessionToken && performance.now() - cycleStart < totalMs) {
      for (let i = 0; i < technique.phases.length; i += 1) {
        const phase = technique.phases[i];
        phaseLabel.textContent = phase.label;
        circle.style.setProperty('--phase-duration', `${phase.seconds}s`);
        circle.className = 'circle' + (phase.circleClass ? ' ' + phase.circleClass : '');
        // Mirror the same phase state onto <body>, purely so the ambient
        // background (a separate element, not a descendant of the circle)
        // can pulse in sync too. Purely presentational — doesn't affect
        // circle/audio timing.
        document.body.style.setProperty('--phase-duration', `${phase.seconds}s`);
        document.body.classList.toggle('breathing-expand', !!phase.circleClass);
        playCueFireAndForget(phase.audioKey);
        await wait(phase.seconds * 1000);
        if (token !== sessionToken) return;
      }
    }
    const durationSeconds = Math.round((performance.now() - cycleStart) / 1000);
    stopCountdownDisplay();
    if (token !== sessionToken) return;

    circle.className = 'circle idle';
    document.body.classList.remove('breathing-expand');
    void circle.offsetWidth;
    phaseLabel.textContent = OUTRO_TEXT;
    timerLabel.textContent = '';

    await playAndWait('outro');
    if (token !== sessionToken) return;

    const stressAfter = await showCheckIn('How do you feel now?');
    if (token !== sessionToken) return;

    completeSession(durationSeconds, stressBefore, stressAfter);
  }

  function stopSession() {
    sessionToken += 1;
    cancelDelay();
    cancelCue();
    stopAllFiredAudio();
    stopCountdownDisplay();
    releaseWakeLock();
    document.body.classList.remove('breathing-expand');
    showScreen(homeScreen);
  }

  // Translates a raw average stress-drop number into plain, warm language.
  // The underlying math is unchanged — only the display is decimal-free
  // and never shows a signed number, since this should read as relatable
  // rather than clinical.
  function phraseForDrop(drop) {
    if (drop >= 3) return 'Helps you a lot';
    if (drop >= 1) return 'Helps you feel calmer';
    if (drop > 0) return 'Helps a little';
    if (drop === 0) return 'About the same, either way';
    return 'Not much difference yet';
  }

  function overallHeadline(drop) {
    return drop > 0
      ? 'You usually feel calmer after a session.'
      : 'Keep going — a few more sessions will show your pattern more clearly.';
  }

  function renderInsights(sessions) {
    const total = sessions.length;
    insightsContent.innerHTML = '';

    const totalLine = document.createElement('p');
    totalLine.className = 'insights-total';
    totalLine.textContent = `You've shown up ${total} time${total === 1 ? '' : 's'}.`;
    insightsContent.appendChild(totalLine);

    if (total < 3) {
      const empty = document.createElement('p');
      empty.className = 'insights-empty';
      empty.textContent = 'Not enough data yet.';
      insightsContent.appendChild(empty);
      return;
    }

    const pairs = sessions.filter((s) => s.stress_before != null && s.stress_after != null);

    if (pairs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'insights-empty';
      empty.textContent = 'No stress check-ins recorded yet.';
      insightsContent.appendChild(empty);
      return;
    }

    const avgDrop = (list) => list.reduce((sum, s) => sum + (s.stress_before - s.stress_after), 0) / list.length;

    const byTechnique = {};
    pairs.forEach((s) => {
      if (!byTechnique[s.technique]) byTechnique[s.technique] = [];
      byTechnique[s.technique].push(s);
    });
    const techniqueAverages = Object.keys(byTechnique).map((techniqueId) => ({
      name: TECHNIQUES[techniqueId] ? TECHNIQUES[techniqueId].name : techniqueId,
      count: byTechnique[techniqueId].length,
      drop: avgDrop(byTechnique[techniqueId]),
    }));

    // The single most useful takeaway, but only when it's actually
    // trustworthy: both techniques being compared need at least 2
    // sessions each (so one noisy data point can't "win"), and the gap
    // between the best and next-best needs to be meaningfully large
    // (not just noise). Otherwise this is skipped entirely rather than
    // showing a standout claim that contradicts a "keep going" headline.
    const MIN_SESSIONS_TO_COMPARE = 2;
    const MIN_MEANINGFUL_GAP = 1.5;
    const qualifying = techniqueAverages.filter((t) => t.count >= MIN_SESSIONS_TO_COMPARE);
    if (qualifying.length >= 2) {
      const sorted = [...qualifying].sort((a, b) => b.drop - a.drop);
      if (sorted[0].drop - sorted[1].drop >= MIN_MEANINGFUL_GAP) {
        const highlight = document.createElement('p');
        highlight.className = 'insights-highlight';
        highlight.textContent = `${sorted[0].name} works best for you`;
        insightsContent.appendChild(highlight);
      }
    }

    const headline = document.createElement('p');
    headline.className = 'insights-headline';
    headline.textContent = overallHeadline(avgDrop(pairs));
    insightsContent.appendChild(headline);

    const breakdown = document.createElement('div');
    breakdown.className = 'insights-breakdown';
    techniqueAverages.forEach(({ name, drop }) => {
      const row = document.createElement('div');
      row.className = 'insights-row';
      const rowName = document.createElement('span');
      rowName.className = 'insights-row-name';
      rowName.textContent = name;
      const rowPhrase = document.createElement('span');
      rowPhrase.className = 'insights-row-phrase';
      rowPhrase.textContent = phraseForDrop(drop);
      row.appendChild(rowName);
      row.appendChild(rowPhrase);
      breakdown.appendChild(row);
    });
    insightsContent.appendChild(breakdown);
  }

  async function loadInsights() {
    insightsContent.innerHTML = '<p class="insights-loading">Loading&hellip;</p>';
    try {
      const sessions = await fetchSessions();
      renderInsights(sessions);
    } catch (err) {
      console.warn('Could not load insights:', err);
      insightsContent.innerHTML = '<p class="insights-empty">Could not load insights right now.</p>';
    }
  }

  // --- Wiring --------------------------------------------------------

  updateMuteButton();

  startBtn.addEventListener('click', () => showScreen(selectScreen));
  restartBtn.addEventListener('click', () => showScreen(selectScreen));
  selectBackBtn.addEventListener('click', () => showScreen(homeScreen));
  durationBackBtn.addEventListener('click', () => showScreen(selectScreen));
  techniqueCards.forEach((card) => {
    card.addEventListener('click', () => showDurationScreen(card.dataset.technique));
  });
  stopBtn.addEventListener('click', stopSession);
  insightsLink.addEventListener('click', () => {
    showScreen(insightsScreen);
    loadInsights();
  });
  insightsBackBtn.addEventListener('click', () => showScreen(homeScreen));
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(MUTE_STORAGE_KEY, String(isMuted));
    updateMuteButton();
    if (isMuted) {
      stopAllFiredAudio();
      // If mid-intro/outro, skip ahead now that there's nothing to hear.
      // Does not touch delayResolve, so an in-progress breathing phase's
      // fixed timing is left completely undisturbed.
      if (cueResolve) cancelCue();
    }
  });
})();
