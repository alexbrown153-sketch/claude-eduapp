// Entry point: top-level app state and screen routing. Wires storage,
// pacing, session engine, and question bank together with the ui.js
// rendering layer.

import { Storage, TOPICS } from './storage.js';
import { computeTodaysPlan } from './pacing.js';
import { startSession, pickNextQuestion, recordAnswer, isSessionComplete, finishSession } from './session.js';
import * as ui from './ui.js';

const state = {
  meta: null,
  mastery: null,
  plan: null,
  session: null,
  currentQuestion: null,
  questionStartTime: null,
  timerInterval: null,
};

function loadState() {
  state.meta = Storage.getMeta();
  state.mastery = Storage.getMastery();
  state.plan = computeTodaysPlan(new Date(), state.meta, state.mastery, TOPICS);
}

function goToStart() {
  stopTimer();
  loadState();
  ui.updateHeader(state.plan, state.meta);
  ui.renderStart(state.plan, !!Storage.getInProgress());
  ui.showScreen('start');
}

function goToProgress() {
  const mastery = Storage.getMastery();
  const meta = Storage.getMeta();
  ui.renderProgress(mastery, meta, Storage.getSessions());
  ui.showScreen('progress');
}

function beginSession({ lengthType, lengthValue, topicFocus }) {
  state.session = startSession({
    topicWeighting: state.plan.topicWeighting,
    topicFocus,
    lengthType,
    lengthValue,
    mode: state.plan.phase,
  });
  ui.showScreen('question');
  startTimerIfNeeded();
  nextQuestion();
}

function resumeSession() {
  const raw = Storage.getInProgress();
  state.session = { ...raw, usedWordProblemIds: new Set(raw.usedWordProblemIds) };
  ui.showScreen('question');
  startTimerIfNeeded();
  nextQuestion();
}

function startTimerIfNeeded() {
  stopTimer();
  if (!state.plan.timerVisible || state.session.lengthType !== 'minutes') return;
  const endAt = state.session.startedAt + state.session.lengthValue * 60 * 1000;
  ui.updateTimer(endAt - Date.now());
  state.timerInterval = setInterval(() => {
    ui.updateTimer(Math.max(0, endAt - Date.now()));
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function nextQuestion() {
  state.currentQuestion = pickNextQuestion(state.session, state.mastery);
  state.questionStartTime = Date.now();
  ui.renderHud(state.session, state.plan);
  ui.renderQuestion(state.currentQuestion);
}

function onCheck() {
  const answer = ui.getCurrentAnswer(state.currentQuestion.answerType);
  const timeMs = Date.now() - state.questionStartTime;
  const { correct } = recordAnswer(state.session, state.mastery, state.currentQuestion, answer, timeMs);
  ui.renderHud(state.session, state.plan);
  ui.renderFeedback(correct, state.currentQuestion.explanation, state.currentQuestion.correctAnswer);
}

function onNext() {
  if (isSessionComplete(state.session)) {
    stopTimer();
    const { entry, meta } = finishSession(state.session, state.meta);
    state.meta = meta;
    ui.updateHeader(state.plan, state.meta);
    ui.renderSummary(entry);
    ui.showScreen('summary');
  } else {
    nextQuestion();
  }
}

ui.bindStartHandlers({
  onStart: () => {
    const length = ui.getSelectedLength();
    const topicFocus = ui.getSelectedTopic();
    beginSession({ lengthType: length.type, lengthValue: length.value, topicFocus });
  },
  onResume: resumeSession,
  onGotoProgress: goToProgress,
});

ui.bindQuestionHandlers({ onCheck, onNext });

ui.bindSummaryHandlers({
  onRestart: goToStart,
  onGotoProgress: goToProgress,
});

ui.bindProgressHandlers({ onBack: goToStart });

goToStart();
