import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, '../dashboard');

export function createServer(state) {
  const app = express();
  app.use(express.json());

  // Serve TTS audio files generated for Sonos playback
  app.get('/tts/:filename', (req, res) => {
    const filePath = state.getTTSFile(req.params.filename);
    if (!filePath) return res.status(404).send('Not found');
    res.sendFile(filePath);
  });

  app.use(express.static(DASHBOARD_DIR));

  // GET /api/config
  app.get('/api/config', (req, res) => {
    try {
      res.json(state.getConfig());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/config
  app.post('/api/config', (req, res) => {
    try {
      const incoming = req.body;
      if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Invalid config body' });
      }
      // Merge with existing config to prevent partial overwrites
      const current = state.getConfig();
      const merged = { ...current, ...incoming,
        location: { ...current.location, ...(incoming.location || {}) },
        filters: { ...current.filters, ...(incoming.filters || {}) },
        quietHours: { ...current.quietHours, ...(incoming.quietHours || {}) },
      };
      state.saveConfig(merged);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/flights
  app.get('/api/flights', (req, res) => {
    res.json({
      overhead: state.getOverheadFlights(),
      recent: state.getRecentFlights(),
    });
  });

  // GET /api/speakers
  app.get('/api/speakers', (req, res) => {
    res.json(state.getSpeakers());
  });

  // POST /api/test
  app.post('/api/test', async (req, res) => {
    try {
      await state.triggerTest();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
