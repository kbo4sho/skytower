// SkyTower Dashboard

const REFRESH_INTERVAL = 15000;

// DOM refs
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const overheadCount = document.getElementById('overhead-count');
const historyCount = document.getElementById('history-count');
const flightsTbody = document.getElementById('flights-tbody');
const historyTbody = document.getElementById('history-tbody');
const speakersList = document.getElementById('speakers-list');
const configMsg = document.getElementById('config-msg');
const testMsg = document.getElementById('test-msg');

// Config inputs
const cfgLat = document.getElementById('cfg-lat');
const cfgLon = document.getElementById('cfg-lon');
const cfgRadius = document.getElementById('cfg-radius');
const cfgInterval = document.getElementById('cfg-interval');
const cfgStyle = document.getElementById('cfg-style');
const cfgModel = document.getElementById('cfg-model');
const cfgQuietStart = document.getElementById('cfg-quiet-start');
const cfgQuietEnd = document.getElementById('cfg-quiet-end');
const cfgMinAlt = document.getElementById('cfg-min-alt');
const cfgMaxAlt = document.getElementById('cfg-max-alt');
const cfgCommercialOnly = document.getElementById('cfg-commercial-only');
const cfgRooms = document.getElementById('cfg-rooms');

// Utilities
function fmtTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function heading2str(deg) {
  if (deg == null) return '—';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8] + ` ${Math.round(deg)}°`;
}

function setStatus(state, text) {
  statusDot.className = `dot dot--${state}`;
  statusText.textContent = text;
}

// Flights
async function refreshFlights() {
  try {
    const res = await fetch('/api/flights');
    if (!res.ok) throw new Error(res.statusText);
    const { overhead, recent } = await res.json();

    setStatus('active', `Last update ${fmtTime(new Date().toISOString())}`);

    renderOverhead(overhead || []);
    renderHistory(recent || []);
  } catch (err) {
    setStatus('error', `Error: ${err.message}`);
  }
}

function renderOverhead(flights) {
  overheadCount.textContent = flights.length;
  if (flights.length === 0) {
    flightsTbody.innerHTML = '<tr class="empty-row"><td colspan="6">No aircraft overhead</td></tr>';
    return;
  }
  flightsTbody.innerHTML = flights.map((f) => `
    <tr>
      <td class="callsign">${f.callsign || f.icao24}</td>
      <td class="altitude">${f.altitude_ft?.toLocaleString() ?? '—'}</td>
      <td class="speed">${f.speed_mph ?? '—'}</td>
      <td>${heading2str(f.heading)}</td>
      <td class="country">${f.country || '—'}</td>
      <td>${f.distance_miles != null ? f.distance_miles : '—'}</td>
    </tr>
  `).join('');
}

function renderHistory(flights) {
  historyCount.textContent = flights.length;
  if (flights.length === 0) {
    historyTbody.innerHTML = '<tr class="empty-row"><td colspan="5">No flights recorded yet</td></tr>';
    return;
  }
  historyTbody.innerHTML = flights.map((f) => `
    <tr>
      <td class="callsign">${f.callsign || f.icao24}</td>
      <td class="altitude">${f.altitude_ft?.toLocaleString() ?? '—'}</td>
      <td class="speed">${f.speed_mph ?? '—'}</td>
      <td class="country">${f.country || '—'}</td>
      <td class="spotted">${fmtTime(f.spotted_at)}</td>
    </tr>
  `).join('');
}

// Speakers
async function refreshSpeakers() {
  try {
    const res = await fetch('/api/speakers');
    if (!res.ok) throw new Error(res.statusText);
    const speakers = await res.json();

    if (speakers.length === 0) {
      speakersList.innerHTML = '<li class="empty">No speakers found</li>';
    } else {
      speakersList.innerHTML = speakers.map((s) => `
        <li>
          <span class="speaker-dot"></span>
          <span class="speaker-name">${s.name}</span>
          <span class="speaker-host">${s.host}</span>
        </li>
      `).join('');
    }
  } catch (err) {
    speakersList.innerHTML = `<li class="empty">Error: ${err.message}</li>`;
  }
}

// Config
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(res.statusText);
    const cfg = await res.json();
    populateConfigForm(cfg);
  } catch (err) {
    showMsg(configMsg, `Failed to load config: ${err.message}`, 'err');
  }
}

function populateConfigForm(cfg) {
  cfgLat.value = cfg.location?.lat ?? '';
  cfgLon.value = cfg.location?.lon ?? '';
  cfgRadius.value = cfg.radiusMiles ?? '';
  cfgInterval.value = cfg.pollIntervalSeconds ?? '';
  cfgStyle.value = cfg.announcementStyle ?? 'atc';
  cfgModel.value = cfg.ollamaModel ?? '';
  cfgQuietStart.value = cfg.quietHours?.start ?? '';
  cfgQuietEnd.value = cfg.quietHours?.end ?? '';
  cfgMinAlt.value = cfg.filters?.minAltitudeFt ?? '';
  cfgMaxAlt.value = cfg.filters?.maxAltitudeFt ?? '';
  cfgCommercialOnly.checked = cfg.filters?.commercialOnly ?? false;
  cfgRooms.value = (cfg.sonosRooms || []).join(', ');
}

function readConfigForm() {
  return {
    location: {
      lat: parseFloat(cfgLat.value),
      lon: parseFloat(cfgLon.value),
    },
    radiusMiles: parseInt(cfgRadius.value, 10),
    pollIntervalSeconds: parseInt(cfgInterval.value, 10),
    announcementStyle: cfgStyle.value,
    announcementStyles: ['atc', 'trivia', 'dramatic', 'kids'],
    ollamaModel: cfgModel.value,
    ollamaUrl: 'http://localhost:11434',
    sonosRooms: cfgRooms.value
      ? cfgRooms.value.split(',').map((r) => r.trim()).filter(Boolean)
      : [],
    quietHours: {
      start: cfgQuietStart.value,
      end: cfgQuietEnd.value,
    },
    filters: {
      commercialOnly: cfgCommercialOnly.checked,
      privateJetsOnly: false,
      minAltitudeFt: parseInt(cfgMinAlt.value, 10) || 0,
      maxAltitudeFt: parseInt(cfgMaxAlt.value, 10) || 999999,
    },
    dedupeWindowMinutes: 30,
  };
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg msg--${type}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'msg';
  }, 4000);
}

// Event handlers
document.getElementById('save-config-btn').addEventListener('click', async () => {
  try {
    const cfg = readConfigForm();
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    showMsg(configMsg, 'Config saved.', 'ok');
  } catch (err) {
    showMsg(configMsg, `Save failed: ${err.message}`, 'err');
  }
});

document.getElementById('refresh-speakers-btn').addEventListener('click', () => {
  speakersList.innerHTML = '<li class="empty">Scanning...</li>';
  refreshSpeakers();
});

document.getElementById('test-btn').addEventListener('click', async () => {
  const btn = document.getElementById('test-btn');
  btn.disabled = true;
  btn.textContent = '▶ SENDING...';
  try {
    const res = await fetch('/api/test', { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    showMsg(testMsg, 'Broadcast sent.', 'ok');
  } catch (err) {
    showMsg(testMsg, `Error: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ TEST BROADCAST';
  }
});

// Init
(async function init() {
  setStatus('idle', 'Loading...');
  await Promise.all([loadConfig(), refreshFlights(), refreshSpeakers()]);
  setInterval(refreshFlights, REFRESH_INTERVAL);
})();
