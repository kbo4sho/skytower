import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createAnnouncer } from '../src/announcer.js';

const MOCK_FLIGHT = {
  icao24: 'a1b2c3',
  callsign: 'SWA1234',
  country: 'United States',
  lat: 41.63,
  lon: -87.87,
  altitude_ft: 15000,
  speed_mph: 380,
  heading: 90,
  on_ground: false,
  distance_miles: 5.2,
};

const BASE_CONFIG = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'gemma3:1b',
  announcementStyle: 'atc',
};

describe('Announcer — style prompts', () => {
  const styles = ['atc', 'trivia', 'dramatic', 'kids'];

  for (const style of styles) {
    it(`generates a non-empty announcement for style: ${style}`, async () => {
      const announcer = createAnnouncer({ ...BASE_CONFIG, announcementStyle: style });
      const text = await announcer.generate(MOCK_FLIGHT);
      assert.ok(text, `Expected non-null response for style "${style}"`);
      assert.ok(text.length >= 10, `Response too short for style "${style}": "${text}"`);
      assert.ok(!/^[.\s…]+$/.test(text), `Junk response for style "${style}": "${text}"`);
      console.log(`  [${style}] "${text}"`);
    });
  }
});

describe('Announcer — edge cases', () => {
  it('handles flight with no callsign', async () => {
    const announcer = createAnnouncer(BASE_CONFIG);
    const flight = { ...MOCK_FLIGHT, callsign: null };
    const text = await announcer.generate(flight);
    assert.ok(text === null || text.length >= 10, 'Should return valid text or null for no-callsign flight');
  });

  it('updateConfig changes announcement style', async () => {
    const announcer = createAnnouncer({ ...BASE_CONFIG, announcementStyle: 'atc' });
    announcer.updateConfig({ ...BASE_CONFIG, announcementStyle: 'kids' });
    const text = await announcer.generate(MOCK_FLIGHT);
    assert.ok(text === null || text.length >= 10);
  });
});
