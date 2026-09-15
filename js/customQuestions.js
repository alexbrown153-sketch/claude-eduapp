// Parses and validates a user-uploaded JSON file of hand-written questions
// (roadmap item: seed question generation from an uploaded sample set).
// Valid rows are normalized to the same question shape questionBank.js
// produces, so the rest of the app can't tell them apart from generated ones.

const VALID_ANSWER_TYPES = ['numeric', 'text', 'mcq'];

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
    if (item.correctAnswer === undefined || item.correctAnswer === null || item.correctAnswer === '') {
      problems.push('correctAnswer is required');
    }
    if (item.answerType === 'mcq') {
      if (!Array.isArray(item.choices) || item.choices.length < 2) {
        problems.push('mcq questions need a choices array with 2+ options');
      } else if (!item.choices.map(String).includes(String(item.correctAnswer))) {
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
        correctAnswer: String(item.correctAnswer),
        choices: item.answerType === 'mcq' ? item.choices.map(String) : null,
        explanation: item.explanation || '',
      });
    }
  });

  return { valid, errors };
}
