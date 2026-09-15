// DOM rendering + event wiring for the 4 screens. Contains no business logic —
// app.js decides what happens; this module only reads/writes the DOM.

import { PHASE_LABELS } from './pacing.js';

const TOPIC_LABELS = {
  arithmetic: 'Arithmetic',
  fdp: 'Fractions / %',
  geometry: 'Geometry',
  wordProblems: 'Word problems',
  ratio: 'Ratio & proportion',
  algebra: 'Algebra',
  dataHandling: 'Data handling',
};

const el = (id) => document.getElementById(id);

let numericBuffer = '';
let mcqSelected = null;

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  el(`screen-${name}`).classList.add('active');
}

export function updateHeader(plan, meta) {
  el('header-countdown').textContent = plan.daysRemaining >= 0
    ? `${plan.daysRemaining} day${plan.daysRemaining === 1 ? '' : 's'} to go`
    : 'Exam day!';
  el('header-points').textContent = `⭐ ${meta.totalPoints || 0}`;
}

// ---------- Start screen ----------

// The preset length buttons (10/20 questions, 5/10 min) won't always exactly
// match a pacing-plan suggestion (e.g. 12 or 15 questions) — fall back to the
// closest preset of the same type so a button is always selected.
function selectClosestLengthButton(suggestion) {
  const buttons = [...document.querySelectorAll('#length-choices .choice-btn')];
  let best = buttons.find((b) => b.dataset.lengthType === suggestion.type
    && Number(b.dataset.lengthValue) === suggestion.value);
  if (!best) {
    const sameType = buttons.filter((b) => b.dataset.lengthType === suggestion.type);
    const pool = sameType.length ? sameType : buttons;
    best = pool.reduce((closest, b) => {
      const diff = Math.abs(Number(b.dataset.lengthValue) - suggestion.value);
      const closestDiff = Math.abs(Number(closest.dataset.lengthValue) - suggestion.value);
      return diff < closestDiff ? b : closest;
    });
  }
  buttons.forEach((b) => b.classList.toggle('selected', b === best));
}

export function renderStart(plan, hasInProgress) {
  el('focus-phase').textContent = PHASE_LABELS[plan.phase] || 'Practice';
  el('focus-tone').textContent = plan.framingTone;

  selectClosestLengthButton(plan.sessionLengthSuggestion);
  document.querySelectorAll('#topic-choices .choice-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === 0);
  });

  el('resume-btn').hidden = !hasInProgress;
}

export function getSelectedLength() {
  const btn = document.querySelector('#length-choices .choice-btn.selected');
  return { type: btn.dataset.lengthType, value: Number(btn.dataset.lengthValue) };
}

export function getSelectedTopic() {
  const btn = document.querySelector('#topic-choices .choice-btn.selected');
  return btn.dataset.topic || null;
}

export function bindStartHandlers({ onStart, onResume, onGotoProgress }) {
  document.querySelectorAll('#length-choices .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#length-choices .choice-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  document.querySelectorAll('#topic-choices .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#topic-choices .choice-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  el('start-btn').addEventListener('click', onStart);
  el('resume-btn').addEventListener('click', onResume);
  el('goto-progress-btn').addEventListener('click', onGotoProgress);
}

// ---------- Question screen ----------

export function renderHud(session, plan) {
  const count = session.lengthType === 'questions'
    ? `Q${session.questions.length + 1} / ${session.lengthValue}`
    : `Q${session.questions.length + 1}`;
  el('hud-progress').textContent = count;
  el('hud-score').textContent = `⭐ ${session.score}`;
  el('hud-streak').textContent = session.streak > 1 ? `🔥 ${session.streak}` : '';
  el('hud-timer').hidden = !plan.timerVisible || session.lengthType !== 'minutes';
}

export function updateTimer(remainingMs) {
  const timerEl = el('hud-timer');
  if (timerEl.hidden) return;
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  timerEl.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
}

export function renderQuestion(question) {
  el('feedback-panel').hidden = true;
  el('check-btn').hidden = false;
  el('check-btn').disabled = false;

  el('question-prompt').textContent = question.prompt;

  numericBuffer = '';
  mcqSelected = null;
  el('numeric-display').innerHTML = '&nbsp;';
  el('text-input').value = '';

  el('answer-numeric').hidden = question.answerType !== 'numeric';
  el('answer-text').hidden = question.answerType !== 'text';
  el('answer-mcq').hidden = question.answerType !== 'mcq';

  if (question.answerType === 'mcq') {
    const mcqEl = el('answer-mcq');
    mcqEl.innerHTML = '';
    question.choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice;
      btn.dataset.value = choice;
      btn.addEventListener('click', () => {
        mcqEl.querySelectorAll('.choice-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        mcqSelected = choice;
      });
      mcqEl.appendChild(btn);
    });
  }

  if (question.answerType === 'text') {
    el('text-input').focus();
  }
}

export function getCurrentAnswer(answerType) {
  if (answerType === 'numeric') return numericBuffer;
  if (answerType === 'mcq') return mcqSelected || '';
  return el('text-input').value;
}

export function bindQuestionHandlers({ onCheck, onNext }) {
  document.querySelectorAll('.key').forEach((key) => {
    key.addEventListener('click', () => {
      const k = key.dataset.key;
      if (k === 'back') {
        numericBuffer = numericBuffer.slice(0, -1);
      } else if (k === '.' && numericBuffer.includes('.')) {
        // ignore extra decimal point
      } else {
        numericBuffer += k;
      }
      el('numeric-display').textContent = numericBuffer || ' ';
    });
  });
  el('check-btn').addEventListener('click', onCheck);
  el('next-btn').addEventListener('click', onNext);
}

export function renderFeedback(correct, explanation, correctAnswer) {
  el('check-btn').hidden = true;
  const panel = el('feedback-panel');
  panel.hidden = false;
  panel.classList.toggle('correct', correct);
  panel.classList.toggle('incorrect', !correct);
  el('feedback-result').textContent = correct ? 'Correct! 🎉' : `Not quite — the answer was ${correctAnswer}`;
  el('feedback-explanation').textContent = explanation;
}

// ---------- Summary screen ----------

export function renderSummary(entry) {
  const { summary } = entry;
  const accuracyPct = Math.round(summary.accuracy * 100);
  const avgSec = Math.round(summary.avgTimeMs / 1000);
  const topics = [...new Set(entry.questions.map((q) => TOPIC_LABELS[q.topic] || q.topic))].join(', ');

  el('summary-card').innerHTML = `
    <div class="summary-row"><span class="label">Score</span><span class="value">${summary.correctCount} / ${summary.totalQuestions}</span></div>
    <div class="summary-row"><span class="label">Accuracy</span><span class="value">${accuracyPct}%</span></div>
    <div class="summary-row"><span class="label">Avg. time / question</span><span class="value">${avgSec}s</span></div>
    <div class="summary-row"><span class="label">Topics practiced</span><span class="value">${topics || '—'}</span></div>
    <div class="summary-row"><span class="label">Points earned</span><span class="value">⭐ ${summary.pointsEarned}</span></div>
    <div class="summary-row"><span class="label">Best streak</span><span class="value">🔥 ${summary.bestStreak}</span></div>
  `;
}

export function bindSummaryHandlers({ onRestart, onGotoProgress }) {
  el('summary-restart-btn').addEventListener('click', onRestart);
  el('summary-progress-btn').addEventListener('click', onGotoProgress);
}

// ---------- Progress screen ----------

export function renderProgress(mastery, meta, sessions) {
  el('streak-banner').textContent = meta.currentStreakDays > 0
    ? `🔥 ${meta.currentStreakDays} day streak — total ⭐ ${meta.totalPoints || 0} points`
    : `Total ⭐ ${meta.totalPoints || 0} points — start today's streak!`;

  const barsEl = el('mastery-bars');
  barsEl.innerHTML = '';
  Object.keys(mastery).forEach((topic) => {
    const rec = mastery[topic];
    const pct = Math.round(rec.masteryScore * 100);
    const row = document.createElement('div');
    row.className = 'mastery-row';
    row.innerHTML = `
      <div class="mastery-label"><span>${TOPIC_LABELS[topic] || topic}</span><span>${pct}%</span></div>
      <div class="mastery-track"><div class="mastery-fill" style="width:${pct}%"></div></div>
    `;
    barsEl.appendChild(row);
  });

  const historyEl = el('session-history');
  historyEl.innerHTML = '';
  const recent = [...sessions].reverse().slice(0, 10);
  if (recent.length === 0) {
    historyEl.innerHTML = '<p class="empty-state">No sessions yet — get started above!</p>';
  } else {
    recent.forEach((s) => {
      const dateStr = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const accuracyPct = Math.round(s.summary.accuracy * 100);
      const row = document.createElement('div');
      row.className = 'session-history-row';
      row.innerHTML = `<span>${dateStr}</span><span class="value">${s.summary.correctCount}/${s.summary.totalQuestions} (${accuracyPct}%)</span>`;
      historyEl.appendChild(row);
    });
  }
}

export function bindProgressHandlers({ onBack }) {
  el('progress-back-btn').addEventListener('click', onBack);
}
