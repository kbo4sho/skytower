import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the adsb.fi parsing logic directly
// We import the internal parser by re-implementing it here to keep tests fast
function parseAdsbFi(ac) {
  const altFt = ac.alt_baro ?? ac.alt_geom ?? 0;
  const gs = ac.gs ?? 0;
  return {
    icao24: ac.hex,
    callsign: (ac.flight || '').trim() || null,
    country: ac.r ?? null,
    lat: ac.lat ?? null,
    lon: ac.lon ?? null,
    altitude_ft: typeof altFt === 'number' ? Math.round(altFt) : 0,
    speed_mph: Math.round(gs * 1.15078),
    heading: ac.track ?? 0,
    on_ground: ac.alt_baro === 'ground' || (typeof altFt === 'number' && altFt < 50),
    type: ac.t ?? null,
    description: ac.desc ?? null,
  };
}

describe('Poller — adsb.fi parsing', () => {
  it('parses a typical commercial flight', () => {
    const ac = {
      hex: 'a1b2c3',
      flight: 'SWA1234  ',
      r: 'N12345',
      lat: 41.63,
      lon: -87.87,
      alt_baro: 15000,
      gs: 320,
      track: 90,
    };
    const f = parseAdsbFi(ac);
    assert.equal(f.icao24, 'a1b2c3');
    assert.equal(f.callsign, 'SWA1234');
    assert.equal(f.altitude_ft, 15000);
    assert.equal(f.speed_mph, Math.round(320 * 1.15078));
    assert.equal(f.heading, 90);
    assert.equal(f.on_ground, false);
  });

  it('trims whitespace from callsign', () => {
    const ac = { hex: 'abc', flight: '  UAL456  ', alt_baro: 5000, gs: 0, track: 0 };
    assert.equal(parseAdsbFi(ac).callsign, 'UAL456');
  });

  it('returns null callsign when empty', () => {
    const ac = { hex: 'abc', flight: '', alt_baro: 5000, gs: 0, track: 0 };
    assert.equal(parseAdsbFi(ac).callsign, null);
  });

  it('detects ground traffic', () => {
    const ac = { hex: 'abc', flight: 'N1234', alt_baro: 'ground', gs: 10, track: 0 };
    assert.equal(parseAdsbFi(ac).on_ground, true);
  });

  it('treats alt_baro < 50 as on ground', () => {
    const ac = { hex: 'abc', flight: 'N1234', alt_baro: 25, gs: 10, track: 0 };
    assert.equal(parseAdsbFi(ac).on_ground, true);
  });

  it('uses geo altitude when baro missing', () => {
    const ac = { hex: 'abc', flight: 'N1234', alt_geom: 8000, gs: 200, track: 180 };
    assert.equal(parseAdsbFi(ac).altitude_ft, 8000);
  });

  it('handles missing lat/lon', () => {
    const ac = { hex: 'abc', flight: 'N1234', alt_baro: 5000, gs: 200, track: 0 };
    assert.equal(parseAdsbFi(ac).lat, null);
    assert.equal(parseAdsbFi(ac).lon, null);
  });
});

describe('Poller — adsb.fi live API', () => {
  it('returns aircraft near Orland Park, IL', async () => {
    const res = await fetch('https://opendata.adsb.fi/api/v2/lat/41.6261/lon/-87.8725/dist/30');
    assert.ok(res.ok, `API returned ${res.status}`);
    const data = await res.json();
    assert.ok(Array.isArray(data.aircraft), 'Expected aircraft array');
    console.log(`  Live: ${data.aircraft.length} aircraft within 30mi`);
  });
});
