import EventEmitter from 'events';
import fetch from 'node-fetch';

// Degrees per mile (approximate)
const DEG_PER_MILE = 0.0145;

// Haversine distance in miles between two lat/lon points
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Parse an adsb.fi aircraft object into our internal format
function parseAdsbFi(ac) {
  const altFt = ac.alt_baro ?? ac.alt_geom ?? 0;
  const gs = ac.gs ?? 0; // ground speed in knots
  return {
    icao24: ac.hex,
    callsign: (ac.flight || '').trim() || null,
    country: ac.r ?? null,  // registration prefix (not country, but useful)
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

export function createPoller(initialConfig) {
  const emitter = new EventEmitter();
  let config = { ...initialConfig };
  let timer = null;

  // icao24 → timestamp of last announcement
  const seen = new Map();

  // Currently overhead flights
  let overheadFlights = [];

  function getBoundingBox() {
    const { lat, lon } = config.location;
    const r = config.radiusMiles * DEG_PER_MILE;
    return {
      lamin: lat - r,
      lomin: lon - r,
      lamax: lat + r,
      lomax: lon + r,
    };
  }

  async function poll() {
    const { lat, lon } = config.location;
    const url = `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${config.radiusMiles}`;

    let aircraft;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        console.warn(`[poller] adsb.fi returned ${res.status}`);
        return;
      }
      const data = await res.json();
      aircraft = data.aircraft || [];
      console.log(`[poller] adsb.fi: ${aircraft.length} aircraft, checking dedupe...`);
    } catch (err) {
      console.warn(`[poller] Fetch error: ${err.message}`);
      return;
    }
    const states = aircraft;
    const { radiusMiles, dedupeWindowMinutes, filters } = config;
    const now = Date.now();
    const dedupeMs = dedupeWindowMinutes * 60 * 1000;

    const currentOverhead = [];

    for (const sv of states) {
      const flight = parseAdsbFi(sv);

      // Must have position
      if (flight.lat == null || flight.lon == null) continue;

      // Skip ground traffic
      if (flight.on_ground) continue;

      // Check actual circle radius
      const dist = haversine(lat, lon, flight.lat, flight.lon);
      if (dist > radiusMiles) continue;

      // Apply filters
      if (filters.minAltitudeFt && flight.altitude_ft < filters.minAltitudeFt) continue;
      if (filters.maxAltitudeFt && flight.altitude_ft > filters.maxAltitudeFt) continue;

      if (filters.commercialOnly) {
        // Commercial flights typically have ICAO callsigns (letters + digits)
        if (!flight.callsign || !/^[A-Z]{2,3}\d/.test(flight.callsign)) continue;
      }

      currentOverhead.push(flight);

      // Dedupe check
      const lastSeen = seen.get(flight.icao24);
      if (lastSeen && now - lastSeen < dedupeMs) continue;

      seen.set(flight.icao24, now);
      emitter.emit('newFlight', { ...flight, distance_miles: Math.round(dist * 10) / 10 });
    }

    overheadFlights = currentOverhead;

    // Clean up old dedupe entries
    for (const [icao, ts] of seen.entries()) {
      if (now - ts > dedupeMs * 2) seen.delete(icao);
    }
  }

  function start() {
    if (timer) return;
    poll();
    timer = setInterval(poll, config.pollIntervalSeconds * 1000);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function updateConfig(newConfig) {
    const wasRunning = timer !== null;
    stop();
    config = { ...newConfig };
    if (wasRunning) start();
  }

  function getOverheadFlights() {
    return overheadFlights;
  }

  return {
    on: (event, handler) => emitter.on(event, handler),
    start,
    stop,
    updateConfig,
    getOverheadFlights,
  };
}
