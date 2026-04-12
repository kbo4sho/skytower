import fetch from 'node-fetch';

const STYLE_PROMPTS = {
  atc: (f) =>
    `Write one ATC radio callout sentence for: callsign ${f.callsign || f.icao24}, altitude ${f.altitude_ft} feet, speed ${f.speed_mph} mph, heading ${Math.round(f.heading)} degrees. Example: "American 737, passing through flight level 280, heading 090."`,

  trivia: (f) =>
    `Write one or two sentences about ${f.callsign || f.icao24} flying overhead at ${f.altitude_ft} feet going ${f.speed_mph} mph. Include one interesting aviation fact.`,

  dramatic: (f) =>
    `Write one dramatic cinematic sentence about a plane flying at ${f.altitude_ft} feet at ${f.speed_mph} mph overhead. Make it mysterious and evocative.`,

  kids: (f) =>
    `Write one excited sentence for a young child about ${f.callsign ? 'a ' + f.callsign + ' airplane' : 'an airplane'} flying over their house at ${f.altitude_ft} feet going ${f.speed_mph} miles per hour.`,
};

export function createAnnouncer(initialConfig) {
  let config = { ...initialConfig };

  async function generate(flight) {
    const style = config.announcementStyle || 'atc';
    const promptFn = STYLE_PROMPTS[style] || STYLE_PROMPTS.atc;
    const prompt = promptFn(flight);

    const url = `${config.ollamaUrl}/api/generate`;
    const body = {
      model: config.ollamaModel || 'llama3',
      prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 100,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error ${res.status}: ${text}`);
    }

    const data = await res.json();
    let text = (data.response || '').trim();

    // Strip verbose preamble ("Here's a...", "Okay, here's...", etc.)
    // Extract the first quoted string if present
    const quotedMatch = text.match(/["\u201c\u201d]([^"\u201c\u201d]{10,})["\u201c\u201d]/);
    if (quotedMatch) {
      text = quotedMatch[1].trim();
    } else {
      // Strip leading meta-commentary lines
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const contentLine = lines.find(l =>
        !l.match(/^(okay|here'?s|sure|of course|i'll|let me|below is|this is)/i)
      );
      if (contentLine) text = contentLine;
    }

    // Filter junk responses
    if (!text || text.length < 10 || /^[.\s\u2026*]+$/.test(text)) {
      console.warn(`[announcer] Junk response from LLM: "${text}"`);
      return null;
    }
    console.log(`[announcer] Generated: "${text.substring(0, 80)}"`);
    return text;
  }

  function updateConfig(newConfig) {
    config = { ...newConfig };
  }

  return { generate, updateConfig };
}
