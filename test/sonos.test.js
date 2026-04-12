import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

const KOKORO_MODEL = '/Users/kevinbolander/kokoro/kokoro-v1.0.onnx';
const KOKORO_VOICES = '/Users/kevinbolander/kokoro/voices-v1.0.bin';

describe('Kokoro TTS', () => {
  it('model files exist', () => {
    assert.ok(existsSync(KOKORO_MODEL), `Missing model: ${KOKORO_MODEL}`);
    assert.ok(existsSync(KOKORO_VOICES), `Missing voices: ${KOKORO_VOICES}`);
  });

  const voices = { atc: 'am_adam', trivia: 'af_sky', dramatic: 'am_echo', kids: 'af_nicole' };

  for (const [style, voice] of Object.entries(voices)) {
    it(`generates WAV for style "${style}" (voice: ${voice})`, async () => {
      const outPath = join(tmpdir(), `test_${style}_${Date.now()}.wav`);
      const cmd = `python3.12 -c '
import sys; sys.path.insert(0, "/opt/homebrew/lib/python3.12/site-packages")
from kokoro_onnx import Kokoro
import soundfile as sf
k = Kokoro("${KOKORO_MODEL}", "${KOKORO_VOICES}")
samples, sr = k.create("Test announcement for style ${style}.", voice="${voice}", speed=1.0, lang="en-us")
sf.write("${outPath}", samples, sr)
'`;
      await execAsync(cmd);
      assert.ok(existsSync(outPath), `WAV not created for style "${style}"`);
      await unlink(outPath);
    });
  }
});

describe('Sonos UPnP', () => {
  it('Kitchen speaker responds to UPnP query', async () => {
    const res = await fetch('http://192.168.68.53:1400/xml/device_description.xml');
    assert.ok(res.ok, `Kitchen speaker not reachable: ${res.status}`);
    const text = await res.text();
    assert.ok(text.includes('Sonos'), 'Expected Sonos device description');
  });
});
