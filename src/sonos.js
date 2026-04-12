import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink, writeFile } from 'fs/promises';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

const KOKORO_MODEL = '/Users/kevinbolander/kokoro/kokoro-v1.0.onnx';
const KOKORO_VOICES = '/Users/kevinbolander/kokoro/voices-v1.0.bin';

// Kokoro voices per announcement style
const STYLE_VOICES = {
  atc:      'am_adam',    // male, authoritative
  trivia:   'af_sky',     // female, friendly
  dramatic: 'am_echo',    // male, deep
  kids:     'af_nicole',  // female, warm
};

async function generateKokoroTTS(text, voice) {
  const id = Date.now();
  const outPath = join(tmpdir(), `skytower_${id}.wav`);
  const scriptPath = join(tmpdir(), `skytower_${id}.py`);

  // Write a temp Python file — avoids ALL shell escaping issues
  const script = `import sys
sys.path.insert(0, '/opt/homebrew/lib/python3.12/site-packages')
from kokoro_onnx import Kokoro
import soundfile as sf
k = Kokoro(${JSON.stringify(KOKORO_MODEL)}, ${JSON.stringify(KOKORO_VOICES)})
samples, sr = k.create(${JSON.stringify(text)}, voice=${JSON.stringify(voice)}, speed=1.0, lang='en-us')
sf.write(${JSON.stringify(outPath)}, samples, sr)
`;

  await writeFile(scriptPath, script, 'utf8');
  try {
    await execAsync(`python3.12 ${scriptPath}`);
  } finally {
    unlink(scriptPath).catch(() => {});
  }
  return outPath;
}

// Play a WAV file on Sonos via direct UPnP AVTransport HTTP call
async function playOnSonos(ip, audioUrl) {
  const setUriBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <CurrentURI>${audioUrl}</CurrentURI>
      <CurrentURIMetaData></CurrentURIMetaData>
    </u:SetAVTransportURI>
  </s:Body>
</s:Envelope>`;

  const playBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Speed>1</Speed>
    </u:Play>
  </s:Body>
</s:Envelope>`;

  const headers = {
    'Content-Type': 'text/xml; charset="utf-8"',
    'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"',
  };

  const res1 = await fetch(`http://${ip}:1400/MediaRenderer/AVTransport/Control`, {
    method: 'POST',
    headers,
    body: setUriBody,
  });

  if (!res1.ok) {
    throw new Error(`SetAVTransportURI failed: ${res1.status} ${await res1.text()}`);
  }

  const res2 = await fetch(`http://${ip}:1400/MediaRenderer/AVTransport/Control`, {
    method: 'POST',
    headers: { ...headers, SOAPACTION: '"urn:schemas-upnp-org:service:AVTransport:1#Play"' },
    body: playBody,
  });

  if (!res2.ok) {
    throw new Error(`Play failed: ${res2.status} ${await res2.text()}`);
  }
}

// Cache discovered speakers so we don't re-discover on every announcement
let speakerCache = null;
let speakerCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function discoverSpeakers() {
  if (speakerCache && Date.now() - speakerCacheTime < CACHE_TTL) return speakerCache;

  // Known subnet — scan :1400 for Sonos devices
    const subnet = '192.168.68';
  const candidates = Array.from({ length: 50 }, (_, i) => `${subnet}.${50 + i}`);

  const results = await Promise.allSettled(
    candidates.map(async (ip) => {
      const res = await fetch(`http://${ip}:1400/xml/device_description.xml`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return null;
      const text = await res.text();
      const nameMatch = text.match(/<roomName>([^<]+)<\/roomName>/);
      if (!nameMatch) return null;
      return { ip, name: nameMatch[1] };
    })
  );

  speakerCache = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
  speakerCacheTime = Date.now();
  console.log(`[sonos] Discovered: ${speakerCache.map(s => `${s.name}(${s.ip})`).join(', ')}`);
  return speakerCache;
}

async function resolveRoomIPs(roomNames) {
  const speakers = await discoverSpeakers();
  return roomNames.flatMap(room => {
    const match = speakers.find(s => s.name.toLowerCase() === room.toLowerCase());
    return match ? [match] : [];
  });
}

export function createSonos(initialConfig) {
  let config = { ...initialConfig };
  const ttsFiles = new Map();

  function getTTSFile(filename) {
    return ttsFiles.get(filename) || null;
  }

  function isQuietHours() {
    const qh = config.quietHours;
    if (!qh || !qh.start || !qh.end) return false;
    const now = new Date();
    const [sh, sm] = qh.start.split(':').map(Number);
    const [eh, em] = qh.end.split(':').map(Number);
    const current = now.getHours() * 60 + now.getMinutes();
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return start > end ? (current >= start || current < end) : (current >= start && current < end);
  }

  async function announce(text, style) {
    if (isQuietHours()) {
      console.log('[sonos] Quiet hours active, skipping.');
      return;
    }

    const announcementStyle = style || config.announcementStyle || 'atc';
    const voice = STYLE_VOICES[announcementStyle] || 'am_adam';

    console.log(`[sonos] Generating Kokoro TTS (voice: ${voice})...`);

    let audioPath;
    try {
      audioPath = await generateKokoroTTS(text, voice);
    } catch (err) {
      console.error('[sonos] Kokoro failed, falling back to macOS say:', err.message);
      const safe = text.replace(/"/g, "'");
      await execAsync(`say -v Zoe "${safe}"`);
      return;
    }

    const filename = audioPath.split('/').pop();
    ttsFiles.set(filename, audioPath);

    const port = process.env.PORT || 3100;
    const audioUrl = `http://192.168.68.50:${port}/tts/${filename}`;
    console.log(`[sonos] Audio URL: ${audioUrl}`);

    // Resolve room names from config to IPs via UPnP discovery
    const targetRooms = config.sonosRooms && config.sonosRooms.length > 0
      ? config.sonosRooms
      : ['Kitchen'];
    const targetIPs = await resolveRoomIPs(targetRooms);

    if (targetIPs.length === 0) {
      console.warn('[sonos] No speaker IPs resolved, falling back to local playback');
      await execAsync(`afplay "${audioPath}"`);
      return;
    }

    try {
      await Promise.all(targetIPs.map(({ name, ip }) =>
        playOnSonos(ip, audioUrl).then(() => console.log(`[sonos] Playing on ${name} (${ip})`)).catch(err => console.error(`[sonos] Failed on ${name}:`, err.message))
      ));
    } catch (err) {
      console.error('[sonos] Sonos UPnP play failed:', err.message);
      await execAsync(`afplay "${audioPath}"`);
    }

    setTimeout(async () => {
      ttsFiles.delete(filename);
      try { await unlink(audioPath); } catch {}
    }, 30000);
  }

  function getSpeakers() {
    return (config.sonosRooms || ['Kitchen']).map(name => ({ name }));
  }

  function updateConfig(newConfig) {
    config = { ...newConfig };
  }

  return { announce, getSpeakers, updateConfig, getTTSFile };
}
