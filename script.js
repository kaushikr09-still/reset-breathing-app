(() => {
  const TECHNIQUES = {
    box: {
      name: 'Box Breath',
      closing: "That's it. Carry this focus into what's next.",
      durations: [2, 4, 8],
      defaultMinutes: 4,
      phases: [
        { label: 'Inhale', audioKey: 'breatheIn', circleClass: 'expand' },
        { label: 'Hold', audioKey: 'hold', circleClass: 'expand' },
        { label: 'Exhale', audioKey: 'breatheOut', circleClass: '' },
        { label: 'Hold', audioKey: 'hold', circleClass: '' },
      ],
    },
    '478': {
      name: 'The Wind-Down',
      closing: "That's it for today. Let your body settle into rest.",
      durations: [2, 4, 8],
      defaultMinutes: 4,
      phases: [
        { label: 'Inhale', audioKey: 'breatheIn', circleClass: 'expand' },
        { label: 'Hold', audioKey: 'hold', circleClass: 'expand' },
        { label: 'Exhale', audioKey: 'breatheOut', circleClass: '' },
      ],
    },
    sigh: {
      name: 'The Instant Calm',
      closing: "That's it. Notice how much lighter that feels.",
      durations: [1, 5],
      defaultMinutes: 1,
      phases: [
        { label: 'Breathe in', audioKey: 'breatheIn', circleClass: 'expand-half' },
        { label: 'One more in', audioKey: 'oneMoreIn', circleClass: 'expand' },
        { label: 'Breathe out fully', audioKey: 'breatheOutFully', circleClass: '' },
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

  // Used only when audio is muted (or its real duration hasn't loaded yet),
  // so the visual animation still has a reasonable pace to run on.
  const FALLBACK_SECONDS = {
    intro: 3,
    breatheIn: 4,
    hold: 4,
    breatheOut: 4,
    oneMoreIn: 1.5,
    breatheOutFully: 8,
    outro: 3,
  };

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

  let currentTechniqueId = 'box';
  let isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  let sessionToken = 0;
  let countdownIntervalId = null;

  // --- Audio preloading -----------------------------------------------

  const audioElements = {};
  const metadataDurations = {};
  // Directly-observed real playback time (play -> ended), per cue. This is
  // the source of truth once we have it: some browsers report an
  // inaccurate `duration` from metadata for short MP3 clips, so trusting
  // only the metadata value can desync the visual from what's actually
  // heard. The measured value self-corrects from the first real play.
  const measuredDurations = {};

  Object.keys(AUDIO_FILES).forEach((key) => {
    const audio = new Audio(AUDIO_FILES[key]);
    audio.preload = 'auto';
    const captureDuration = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        metadataDurations[key] = audio.duration;
      }
    };
    audio.addEventListener('loadedmetadata', captureDuration);
    audio.addEventListener('durationchange', captureDuration);
    audio.load();
    audioElements[key] = audio;
  });

  function getCueSeconds(key) {
    const measured = measuredDurations[key];
    if (measured && isFinite(measured) && measured > 0) return measured;
    const metadata = metadataDurations[key];
    if (metadata && isFinite(metadata) && metadata > 0) return metadata;
    return FALLBACK_SECONDS[key] || 4;
  }

  // --- Cue playback with cancellation support --------------------------
  // A "cue" is either a real audio clip or, when muted, a silent timer of
  // equivalent length, so the visual pacing stays reasonable either way.

  let activeAudioEl = null;
  let activeResolve = null;
  let activeTimeoutId = null;
  let activeSafetyTimeoutId = null;
  let activePhaseSeconds = 0;
  let activePhaseStart = 0;

  function playCue(key) {
    const seconds = getCueSeconds(key);
    activePhaseSeconds = seconds;
    activePhaseStart = performance.now();
    return new Promise((resolve) => {
      activeResolve = resolve;
      if (isMuted) {
        activeTimeoutId = setTimeout(() => {
          activeTimeoutId = null;
          activeResolve = null;
          resolve();
        }, seconds * 1000);
        return;
      }
      const audio = audioElements[key];
      activeAudioEl = audio;
      const startedAt = performance.now();
      audio.currentTime = 0;
      audio.onended = () => {
        // Only trust this as the real duration if it played out naturally
        // start-to-finish, not if it was cut short by Stop or muting.
        measuredDurations[key] = (performance.now() - startedAt) / 1000;
        activeAudioEl = null;
        clearSafetyTimeout();
        activeResolve = null;
        resolve();
      };
      const playPromise = audio.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {
          activeAudioEl = null;
          clearSafetyTimeout();
          activeResolve = null;
          resolve();
        });
      }
      // Safety net: some browsers can silently stall audio playback (never
      // firing 'ended' or rejecting the play() promise) due to autoplay or
      // media-session quirks we can't detect in advance. Never let a phase
      // hang the whole session — force it forward after a generous margin
      // past the expected duration.
      activeSafetyTimeoutId = setTimeout(() => {
        activeSafetyTimeoutId = null;
        if (activeAudioEl === audio) {
          activeAudioEl.pause();
          activeAudioEl.onended = null;
          activeAudioEl = null;
        }
        if (activeResolve === resolve) {
          activeResolve = null;
          resolve();
        }
      }, Math.max(seconds * 1000 + 2000, 4000));
    });
  }

  function clearSafetyTimeout() {
    if (activeSafetyTimeoutId) {
      clearTimeout(activeSafetyTimeoutId);
      activeSafetyTimeoutId = null;
    }
  }

  function wait(ms) {
    return new Promise((resolve) => {
      activeResolve = resolve;
      activeTimeoutId = setTimeout(() => {
        activeTimeoutId = null;
        activeResolve = null;
        resolve();
      }, ms);
    });
  }

  // Stop button: cancel immediately, we're leaving the screen anyway.
  function cancelActiveCue() {
    if (activeAudioEl) {
      activeAudioEl.pause();
      activeAudioEl.onended = null;
      activeAudioEl = null;
    }
    if (activeTimeoutId) {
      clearTimeout(activeTimeoutId);
      activeTimeoutId = null;
    }
    clearSafetyTimeout();
    if (activeResolve) {
      const resolve = activeResolve;
      activeResolve = null;
      resolve();
    }
  }

  // Muting mid-cue: silence audio immediately, but let the visual keep
  // running to its originally-scheduled moment instead of jump-cutting.
  function silenceActiveCue() {
    if (!activeAudioEl) return;
    activeAudioEl.pause();
    activeAudioEl.onended = null;
    activeAudioEl = null;
    clearSafetyTimeout();
    const elapsedMs = performance.now() - activePhaseStart;
    const remainingMs = Math.max(0, activePhaseSeconds * 1000 - elapsedMs);
    const resolve = activeResolve;
    activeResolve = null;
    activeTimeoutId = setTimeout(() => {
      activeTimeoutId = null;
      resolve();
    }, remainingMs);
  }

  // --- UI helpers --------------------------------------------------------

  function updateMuteButton() {
    muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    muteBtn.setAttribute('aria-pressed', String(isMuted));
    muteBtn.setAttribute('aria-label', isMuted ? 'Unmute narration' : 'Mute narration');
  }

  function showScreen(screen) {
    [homeScreen, selectScreen, durationScreen, sessionScreen, doneScreen].forEach((s) => s.classList.remove('visible'));
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
      option.addEventListener('click', () => runSession(techniqueId, minutes));
      durationList.appendChild(option);
    });
    showScreen(durationScreen);
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

  function completeSession() {
    recordStreakCompletion();
    doneMessage.textContent = TECHNIQUES[currentTechniqueId].closing;
    renderStreak(doneStreakLabel);
    showScreen(doneScreen);
  }

  // --- Session sequencing ------------------------------------------------
  // Sequence: static idle -> intro -> brief pause -> breathing cycles for
  // the chosen duration -> static idle -> outro -> completion screen.

  async function runSession(techniqueId, minutes) {
    const token = ++sessionToken;
    currentTechniqueId = techniqueId;
    const technique = TECHNIQUES[techniqueId];

    showScreen(sessionScreen);
    circle.className = 'circle idle';
    phaseLabel.textContent = INTRO_TEXT;
    timerLabel.textContent = '';

    await playCue('intro');
    if (token !== sessionToken) return;

    await wait(800);
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
        const seconds = getCueSeconds(phase.audioKey);
        phaseLabel.textContent = phase.label;
        circle.style.setProperty('--phase-duration', `${seconds}s`);
        circle.className = 'circle' + (phase.circleClass ? ' ' + phase.circleClass : '');
        await playCue(phase.audioKey);
        if (token !== sessionToken) return;
      }
    }
    stopCountdownDisplay();
    if (token !== sessionToken) return;

    circle.className = 'circle idle';
    void circle.offsetWidth;
    phaseLabel.textContent = OUTRO_TEXT;
    timerLabel.textContent = '';

    await playCue('outro');
    if (token !== sessionToken) return;

    completeSession();
  }

  function stopSession() {
    sessionToken += 1;
    cancelActiveCue();
    stopCountdownDisplay();
    showScreen(homeScreen);
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
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(MUTE_STORAGE_KEY, String(isMuted));
    updateMuteButton();
    if (isMuted) silenceActiveCue();
  });
})();
