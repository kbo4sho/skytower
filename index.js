import { createPoller } from './src/poller.js';
import { createAnnouncer } from './src/announcer.js';
import { createSonos } from './src/sonos.js';
import { createServer } from './src/server.js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.CONFIG_PATH || resolve(__dirname, 'config.json');

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

async function main() {
  console.log('SkyTower starting...');

  let config = loadConfig();

  const sonos = createSonos(config);
  const announcer = createAnnouncer(config);
  const poller = createPoller(config);

  // Rolling history of recent flights
  const recentFlights = [];
  const MAX_HISTORY = 20;

  // Announce queue — process one at a time to avoid flooding Sonos
  const announceQueue = [];
  let announcing = false;

  async function processQueue() {
    if (announcing || announceQueue.length === 0) return;
    announcing = true;
    const flight = announceQueue.shift();
    try {
      const text = await announcer.generate(flight);
      if (text) {
        console.log(`[announcer] "${text.substring(0, 80)}"`); 
        await sonos.announce(text, config.announcementStyle);
      } else {
        console.warn('[announcer] Empty response from LLM, skipping.');
      }
    } catch (err) {
      console.error(`[error] Failed to announce:`, err.message);
    }
    announcing = false;
    // Small gap between announcements
    setTimeout(processQueue, 3000);
  }

  poller.on('newFlight', (flight) => {
    const callsign = flight.callsign || flight.icao24;
    console.log(`[poller] New flight: ${callsign} at ${flight.altitude_ft}ft`);

    recentFlights.unshift({ ...flight, spotted_at: new Date().toISOString() });
    if (recentFlights.length > MAX_HISTORY) recentFlights.pop();

    // Only queue if not already backed up (max 3 queued)
    if (announceQueue.length < 3) {
      announceQueue.push(flight);
      processQueue();
    }
  });

  const state = {
    getConfig: loadConfig,
    reloadConfig() {
      config = loadConfig();
      poller.updateConfig(config);
      announcer.updateConfig(config);
      sonos.updateConfig(config);
    },
    saveConfig(newConfig) {
      const oldStyle = config.announcementStyle;
      writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
      this.reloadConfig();
      // Style changed — clear dedupe so next poll triggers fresh announcements
      if (newConfig.announcementStyle && newConfig.announcementStyle !== oldStyle) {
        console.log(`[config] Style changed to "${newConfig.announcementStyle}" — clearing dedupe cache`);
        poller.clearSeen();
      }
    },
    getRecentFlights: () => recentFlights,
    getOverheadFlights: () => poller.getOverheadFlights(),
    getSpeakers: () => sonos.getSpeakers(),
    getTTSFile: (filename) => sonos.getTTSFile(filename),
    triggerTest: () => sonos.announce('Test broadcast from SkyTower.'),
  };

  const server = createServer(state);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`SkyTower dashboard → http://localhost:${PORT}`);
  });

  poller.start();
  console.log('Listening for flights...');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

// node-sonos uses UDP discovery which throws an uncaught error when the socket closes
// Catch it to prevent crash
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING') {
    // Sonos re-discovery timer fired after socket closed — harmless, ignore
    return;
  }
  console.error('Uncaught exception:', err);
  process.exit(1);
});
