/**
 * Deterministic rubric checks for announcement text (no LLM judges).
 * Used by tests; optional runtime use via evaluateAnnouncement.
 */

const PREAMBLE = /^(okay|here'?s|sure|of course|i'll|let me|below is|this is)\b/i;

function countSentences(text) {
  const parts = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasMarkdown(text) {
  return /`|\*\*|^\s*#|^\s*[-*]\s/m.test(text);
}

function hasSentenceLikeEnding(text) {
  const t = text.trim();
  return /[.!?]/.test(t) || t.length >= 15;
}

function globalChecks(text, failures) {
  if (!text || typeof text !== 'string') {
    failures.push('empty or non-string');
    return;
  }
  const t = text.trim();
  if (t.length < 10) failures.push('too short (<10 chars)');
  if (/^[.\s\u2026*]+$/u.test(t)) failures.push('junk-only punctuation/whitespace');
  if (t.length > 500) failures.push('too long (>500 chars)');
  if (PREAMBLE.test(t)) failures.push('assistant preamble');
  if (hasMarkdown(t)) failures.push('markdown or list markers');
  if (!hasSentenceLikeEnding(t)) failures.push('no sentence punctuation and fragment too short');
}

function atcChecks(text, failures) {
  const n = countSentences(text);
  if (n < 1 || n > 2) failures.push(`atc: expected 1–2 sentences, got ${n}`);

  const hasAlt = /(flight level|FL\s*\d|\d+\s*(feet|ft))\b/i.test(text);
  if (!hasAlt) failures.push('atc: missing altitude/flight level/feet');

  const hasHeading =
    /\b(heading|track)\b/i.test(text) ||
    /\b\d{1,3}\s*degrees?\b/i.test(text);
  if (!hasHeading) failures.push('atc: missing heading/track/degrees');
}

function flightMentioned(text, flight) {
  const lower = text.toLowerCase();
  if (flight.operator && flight.operator.length >= 2) {
    const op = flight.operator.toLowerCase();
    if (lower.includes(op) || lower.includes(op.slice(0, Math.min(6, op.length)))) return true;
  }
  if (flight.callsign && flight.callsign.length >= 2) {
    const cs = flight.callsign.toUpperCase();
    const prefix = cs.replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (prefix.length >= 2 && text.toUpperCase().includes(prefix)) return true;
  }
  if (/(feet|mph|altitude|knots)\b/i.test(text)) return true;
  return false;
}

function triviaChecks(text, flight, failures) {
  const n = countSentences(text);
  if (n < 1 || n > 3) failures.push(`trivia: expected 1–3 sentences, got ${n}`);
  if (wordCount(text) < 12) failures.push('trivia: need at least 12 words');
  if (!flightMentioned(text, flight)) {
    failures.push('trivia: must reference flight (operator/callsign) or altitude/speed');
  }
}

function dramaticChecks(text, failures) {
  const n = countSentences(text);
  if (n < 1 || n > 2) failures.push(`dramatic: expected 1–2 sentences, got ${n}`);
  if (text.trim().length < 40) failures.push('dramatic: line too short (<40 chars)');
}

const SCARY = /\b(crash|emergency|hijack|bomb|explosion|mayday)\b/i;

function kidsChecks(text, failures) {
  const n = countSentences(text);
  if (n < 1 || n > 2) failures.push(`kids: expected 1–2 sentences, got ${n}`);
  if (wordCount(text) > 35) failures.push('kids: too many words (>35)');
  if (SCARY.test(text)) failures.push('kids: alarming word');
  if (!/\b(plane|airplanes?|aircraft|flying|sky)\b/i.test(text)) {
    failures.push('kids: missing plane/sky/flying reference');
  }
}

/**
 * @param {string} text - Final announcement after announcer post-processing
 * @param {string} style - atc | trivia | dramatic | kids
 * @param {object} [flight] - Optional flight object for trivia relevance checks
 * @returns {{ pass: boolean, failures: string[] }}
 */
export function evaluateAnnouncement(text, style, flight = {}) {
  const failures = [];
  globalChecks(text, failures);
  if (failures.length) return { pass: false, failures };

  const s = style === 'trivia' || style === 'dramatic' || style === 'kids' ? style : 'atc';

  switch (s) {
    case 'atc':
      atcChecks(text, failures);
      break;
    case 'trivia':
      triviaChecks(text, flight, failures);
      break;
    case 'dramatic':
      dramaticChecks(text, failures);
      break;
    case 'kids':
      kidsChecks(text, failures);
      break;
    default:
      atcChecks(text, failures);
  }

  return { pass: failures.length === 0, failures };
}
