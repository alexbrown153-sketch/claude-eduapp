// Parses and validates a user-uploaded JSON file of hand-written questions
// (roadmap item: seed question generation from an uploaded sample set).
// Valid rows are normalized to the same question shape questionBank.js
// produces, so the rest of the app can't tell them apart from generated ones.
//
// correctAnswer is optional: if a row omits it, answerSolver.js tries to
// determine it from the prompt (exact for a computable expression, a
// best-effort keyword guess otherwise). Rows tagged answerSource other than
// 'given' get surfaced as a count in the upload summary so they can be
// spot-checked — see renderCustomQuestionsPanel in ui.js.

import { determineAnswer } from './answerSolver.js';

const VALID_ANSWER_TYPES = ['numeric', 'text', 'mcq'];

function hasValue(v) {
  return v !== undefined && v !== null && v !== '';
}

export function parseAndValidate(jsonText, validTopics) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    return { valid: [], errors: ['File is not valid JSON.'] };
  }
  if (!Array.isArray(data)) {
    return { valid: [], errors: ['Expected a JSON array of question objects.'] };
  }

  const valid = [];
  const errors = [];

  data.forEach((item, i) => {
    const problems = [];
    if (!item || typeof item !== 'object') {
      errors.push(`Row ${i + 1}: not an object.`);
      return;
    }
    if (!item.topic || !validTopics.includes(item.topic)) {
      problems.push(`topic must be one of: ${validTopics.join(', ')}`);
    }
    const tier = Number(item.difficulty);
    if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
      problems.push('difficulty must be an integer 1-5');
    }
    if (!item.prompt || typeof item.prompt !== 'string') {
      problems.push('prompt is required');
    }
    if (!VALID_ANSWER_TYPES.includes(item.answerType)) {
      problems.push('answerType must be numeric, text, or mcq');
    }

    let correctAnswer = item.correctAnswer;
    let answerSource = 'given';
    if (!hasValue(correctAnswer) && item.prompt && typeof item.prompt === 'string') {
      const determined = determineAnswer(item.prompt);
      if (determined) {
        correctAnswer = determined.answer;
        answerSource = determined.confidence;
      }
    }
    if (!hasValue(correctAnswer)) {
      problems.push('correctAnswer is required (could not be automatically determined from the prompt)');
    }

    if (item.answerType === 'mcq') {
      if (!Array.isArray(item.choices) || item.choices.length < 2) {
        problems.push('mcq questions need a choices array with 2+ options');
      } else if (hasValue(correctAnswer) && !item.choices.map(String).includes(String(correctAnswer))) {
        problems.push('choices must include the correctAnswer');
      }
    }

    if (problems.length) {
      errors.push(`Row ${i + 1}: ${problems.join('; ')}`);
    } else {
      valid.push({
        topic: item.topic,
        subtopic: item.subtopic || 'custom',
        difficulty: tier,
        prompt: item.prompt,
        answerType: item.answerType,
        correctAnswer: String(correctAnswer),
        choices: item.answerType === 'mcq' ? item.choices.map(String) : null,
        explanation: item.explanation || '',
        answerSource,
      });
    }
  });

  return { valid, errors };
}
