import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnnouncement } from '../src/announcer-rubric.js';

const FIXTURE = {
  icao24: 'a1b2c3',
  callsign: 'SWA1234',
  operator: 'Southwest Airlines',
  altitude_ft: 15000,
  speed_mph: 380,
  heading: 90,
};

describe('announcer-rubric — global', () => {
  it('passes a clean ATC-like line', () => {
    const text =
      'Southwest 737, passing through flight level two eight zero, heading 090 degrees.';
    const r = evaluateAnnouncement(text, 'atc', FIXTURE);
    assert.equal(r.pass, true, r.failures.join('; '));
  });

  it('fails empty and junk', () => {
    assert.equal(evaluateAnnouncement('', 'atc').pass, false);
    assert.equal(evaluateAnnouncement('....', 'atc').pass, false);
    assert.equal(evaluateAnnouncement('short', 'atc').pass, false);
  });

  it('fails assistant preamble', () => {
    const r = evaluateAnnouncement(
      "Okay, here's the call: American 123 at 3000 feet heading 270.",
      'atc',
      FIXTURE
    );
    assert.equal(r.pass, false);
    assert.ok(r.failures.some((f) => f.includes('preamble')));
  });

  it('fails markdown', () => {
    const r = evaluateAnnouncement(
      '- Bullet at 5000 feet heading 180 degrees.',
      'atc',
      FIXTURE
    );
    assert.equal(r.pass, false);
  });

  it('fails too long', () => {
    const r = evaluateAnnouncement('x'.repeat(501) + ' at 5000 feet heading 090.', 'atc');
    assert.equal(r.pass, false);
  });
});

describe('announcer-rubric — atc', () => {
  it('fails without altitude cue', () => {
    const r = evaluateAnnouncement(
      'Southwest 737 heading 090 degrees and tracking east.',
      'atc',
      FIXTURE
    );
    assert.equal(r.pass, false);
    assert.ok(r.failures.some((f) => f.includes('altitude')));
  });

  it('fails without heading cue', () => {
    const r = evaluateAnnouncement(
      'Southwest 737 at flight level 280 at 400 knots.',
      'atc',
      FIXTURE
    );
    assert.equal(r.pass, false);
    assert.ok(r.failures.some((f) => f.includes('heading')));
  });

  it('fails too many sentences', () => {
    const r = evaluateAnnouncement(
      'One. Two. Three. Four thousand feet heading 090.',
      'atc',
      FIXTURE
    );
    assert.equal(r.pass, false);
  });
});

describe('announcer-rubric — trivia', () => {
  it('passes with operator and enough words', () => {
    const text =
      'Southwest Airlines flight SWA1234 cruises overhead at 15000 feet going 380 mph toward its next destination with a full cabin today.';
    const r = evaluateAnnouncement(text, 'trivia', FIXTURE);
    assert.equal(r.pass, true, r.failures.join('; '));
  });

  it('fails with too few words', () => {
    const text = 'SWA1234 at 15000 feet.';
    const r = evaluateAnnouncement(text, 'trivia', FIXTURE);
    assert.equal(r.pass, false);
    assert.ok(r.failures.some((f) => f.includes('12 words')));
  });

  it('fails when flight not referenced', () => {
    const text =
      'The weather is nice today with many clouds in the sky and birds flying past the window slowly.';
    const r = evaluateAnnouncement(text, 'trivia', { ...FIXTURE, callsign: null, operator: null });
    assert.equal(r.pass, false);
  });
});

describe('announcer-rubric — dramatic', () => {
  it('passes one long evocative sentence', () => {
    const text =
      'A silver ghost threads the moonlit veil at thirty thousand feet, bound for shores unseen.';
    const r = evaluateAnnouncement(text, 'dramatic', FIXTURE);
    assert.equal(r.pass, true, r.failures.join('; '));
  });

  it('fails when too short', () => {
    const r = evaluateAnnouncement('Short. Too.', 'dramatic', FIXTURE);
    assert.equal(r.pass, false);
  });
});

describe('announcer-rubric — kids', () => {
  it('passes short excited line', () => {
    const text =
      'Wow, a huge airplane is flying high in the sky over your house at 500 miles per hour!';
    const r = evaluateAnnouncement(text, 'kids', FIXTURE);
    assert.equal(r.pass, true, r.failures.join('; '));
  });

  it('fails too many words', () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const text = `${words} plane sky flying`;
    const r = evaluateAnnouncement(text, 'kids', FIXTURE);
    assert.equal(r.pass, false);
  });

  it('fails alarming word', () => {
    const text =
      'There is an emergency but the airplane is still flying in the sky fast today!';
    const r = evaluateAnnouncement(text, 'kids', FIXTURE);
    assert.equal(r.pass, false);
  });

  it('fails without plane/sky reference', () => {
    const text = 'It goes very fast and makes a loud sound up above you right now!';
    const r = evaluateAnnouncement(text, 'kids', FIXTURE);
    assert.equal(r.pass, false);
  });
});

describe('announcer-rubric — unknown style', () => {
  it('defaults to atc rules', () => {
    const text =
      'United 441, maintaining 8000 feet, heading 270 degrees, cleared as filed.';
    const r = evaluateAnnouncement(text, 'unknown-style', FIXTURE);
    assert.equal(r.pass, true, r.failures.join('; '));
  });
});
