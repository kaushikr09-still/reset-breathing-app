(() => {
  const TECHNIQUES = {
    box: {
      name: 'Box Breath',
      closing: "That's it. Carry this focus into what's next.",
      durations: [2, 4, 8],
      defaultMinutes: 4,
      phases: [
        { label: 'Inhale', speech: 'Breathe in', seconds: 4, circleClass: 'expand' },
        { label: 'Hold', speech: 'Hold', seconds: 4, circleClass: 'expand' },
        { label: 'Exhale', speech: 'Breathe out', seconds: 4, circleClass: '' },
        { label: 'Hold', speech: 'Hold', seconds: 4, circleClass: '' },
      ],
    },
    '478': {
      name: 'The Wind-Down',
      closing: "That's it for today. Let your body settle into rest.",
      durations: [2, 4, 8],
      defaultMinutes: 4,
      phases: [
        { label: 'Inhale', speech: 'Breathe in', seconds: 4, circleClass: 'expand' },
        { label: 'Hold', speech: 'Hold', seconds: 7, circleClass: 'expand' },
        { label: 'Exhale', speech: 'Breathe out', seconds: 8, circleClass: '' },
      ],
    },
    sigh: {
      name: 'The Instant Calm',
      closing: "That's it. Notice how much lighter that feels.",
      durations: [1, 5],
      defaultMinutes: 1,
      phases: [
        { label: 'Breathe in', speech: 'Breathe in', seconds: 4, circleClass: 'expand-half' },
        { label: 'More', speech: 'More', seconds: 1.5, circleClass: 'expand' },
        { label: 'Sigh it all out', speech: 'Sigh it all out', seconds: 8, circleClass: '' },
      ],
    },
  };

  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
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
  let currentPhases = TECHNIQUES.box.phases;
  let phaseIndex = 0;
  let phaseTimeoutId = null;
  let countdownIntervalId = null;
  let secondsRemaining = 0;
  let isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';

  function updateMuteButton() {
    muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    muteBtn.setAttribute('aria-pressed', String(isMuted));
    muteBtn.setAttribute('aria-label', isMuted ? 'Unmute narration' : 'Mute narration');
  }

  function speak(text) {
    if (isMuted || !synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.9;
    synth.speak(utterance);
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
      option.addEventListener('click', () => startSession(techniqueId, minutes));
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

  function applyPhase(phase) {
    phaseLabel.textContent = phase.label;
    circle.style.setProperty('--phase-duration', `${phase.seconds}s`);
    circle.className = 'circle' + (phase.circleClass ? ' ' + phase.circleClass : '');
    speak(phase.speech);
  }

  function runPhase() {
    if (secondsRemaining <= 0) {
      endSession(true);
      return;
    }
    const phase = currentPhases[phaseIndex % currentPhases.length];
    applyPhase(phase);
    phaseIndex += 1;
    phaseTimeoutId = setTimeout(runPhase, phase.seconds * 1000);
  }

  function startCountdown() {
    timerLabel.textContent = formatTime(secondsRemaining);
    countdownIntervalId = setInterval(() => {
      secondsRemaining -= 1;
      if (secondsRemaining < 0) secondsRemaining = 0;
      timerLabel.textContent = formatTime(secondsRemaining);
      if (secondsRemaining <= 0) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      }
    }, 1000);
  }

  function startSession(techniqueId, minutes) {
    currentTechniqueId = techniqueId;
    currentPhases = TECHNIQUES[techniqueId].phases;
    phaseIndex = 0;
    secondsRemaining = minutes * 60;
    showScreen(sessionScreen);
    circle.className = 'circle';
    // Force a layout flush so the reset state is committed as a rendered
    // frame before the first phase's transition starts. Without this, the
    // circle was still invisible moments earlier (the screen fade hadn't
    // started), so the browser has no "before" frame to animate from and
    // the first phase snaps instantly instead of transitioning.
    void circle.offsetWidth;
    runPhase();
    startCountdown();
  }

  function endSession(completed) {
    if (phaseTimeoutId) clearTimeout(phaseTimeoutId);
    if (countdownIntervalId) clearInterval(countdownIntervalId);
    phaseTimeoutId = null;
    countdownIntervalId = null;
    if (synth) synth.cancel();
    if (completed) {
      recordStreakCompletion();
      doneMessage.textContent = TECHNIQUES[currentTechniqueId].closing;
      renderStreak(doneStreakLabel);
    }
    showScreen(completed ? doneScreen : homeScreen);
  }

  if (!synth) {
    muteBtn.style.display = 'none';
  } else {
    updateMuteButton();
  }

  startBtn.addEventListener('click', () => showScreen(selectScreen));
  restartBtn.addEventListener('click', () => showScreen(selectScreen));
  selectBackBtn.addEventListener('click', () => showScreen(homeScreen));
  durationBackBtn.addEventListener('click', () => showScreen(selectScreen));
  techniqueCards.forEach((card) => {
    card.addEventListener('click', () => showDurationScreen(card.dataset.technique));
  });
  stopBtn.addEventListener('click', () => endSession(false));
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(MUTE_STORAGE_KEY, String(isMuted));
    updateMuteButton();
    if (isMuted && synth) synth.cancel();
  });
})();
