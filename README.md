# SkyTower

SkyTower is a self-hosted flight announcement system that monitors aircraft flying over your location and speaks live announcements through your Sonos speakers. It polls real-time flight data from the OpenSky Network, generates spoken commentary using a local Ollama LLM, and delivers it over your home audio system — no cloud accounts, no subscriptions, no API keys required.

---

## Requirements

- **Node.js 24.22.1+**
- **[Ollama](https://ollama.ai)** running locally with a model pulled (e.g. `ollama pull llama3`)
- **Sonos** speakers on the same local network
- Internet access (for OpenSky Network API)

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd skytower
npm install

# 2. Edit your location and preferences
nano config.json

# 3. Run
npm start
```

Open the dashboard at **http://localhost:3000**

---

## Docker Quick Start

```bash
# Start Ollama + SkyTower
docker compose up -d

# Pull the LLM model (one-time)
docker exec skytower-ollama ollama pull llama3

# View logs
docker compose logs -f skytower
```

> **Note:** Sonos speaker discovery requires network access via mDNS/SSDP. The Docker Compose file uses `network_mode: host` for this reason. This works on Linux. On macOS/Windows Docker Desktop, run SkyTower directly with `npm start` for Sonos support.

---

## Config Reference

Edit `config.json` to configure SkyTower:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `location.lat` | number | `41.8781` | Your latitude |
| `location.lon` | number | `-87.6298` | Your longitude |
| `radiusMiles` | number | `20` | Detection radius in miles |
| `pollIntervalSeconds` | number | `30` | How often to poll OpenSky |
| `announcementStyle` | string | `"atc"` | Announcement voice style (see below) |
| `ollamaModel` | string | `"llama3"` | Ollama model to use |
| `ollamaUrl` | string | `"http://localhost:11434"` | Ollama API URL |
| `sonosRooms` | array | `[]` | Room names to announce to (empty = all) |
| `quietHours.start` | string | `"22:00"` | Start of quiet hours (24h format) |
| `quietHours.end` | string | `"07:00"` | End of quiet hours |
| `filters.commercialOnly` | boolean | `false` | Only announce commercial flights |
| `filters.minAltitudeFt` | number | `0` | Minimum altitude filter |
| `filters.maxAltitudeFt` | number | `999999` | Maximum altitude filter |
| `dedupeWindowMinutes` | number | `30` | Don't re-announce same aircraft within this window |

---

## Announcement Styles

| Style | Description | Example |
|-------|-------------|---------|
| `atc` | Formal air traffic controller callout | *"American four forty seven, heavy, passing through flight level two eight zero."* |
| `trivia` | Conversational with one interesting fact | *"That's United 523 cruising at 35,000 feet — United flies to over 200 destinations worldwide."* |
| `dramatic` | Cinematic noir narrator | *"Another silver ghost slices the darkened sky at thirty-eight thousand feet, destination unknown."* |
| `kids` | Simple and excited for children | *"A huge airplane just flew over your house! It's going 550 miles per hour — super fast!"* |

You can change the style at any time from the dashboard without restarting.

---

## Dashboard

The web dashboard at `http://localhost:3000` shows:

- **Overhead Now** — live table of aircraft currently in your radius
- **Recent Flights** — last 20 detected flights with timestamps
- **Config** — edit all settings with live save (no restart needed)
- **Speakers** — discovered Sonos speakers and test broadcast button

---

## How It Works

1. **Poller** fetches state vectors from the [OpenSky Network API](https://opensky-network.org/apidoc/) every 30 seconds (free, no auth required)
2. Aircraft within your configured radius are filtered and deduplicated
3. Flight data is sent to **Ollama** which generates a short spoken announcement in your chosen style
4. The announcement is delivered to your **Sonos** speakers via direct UPnP SOAP calls
5. Quiet hours are respected — no announcements during sleep hours

---

## Contributing

Pull requests welcome. The codebase is intentionally simple — no TypeScript, no build step, vanilla JS dashboard. Keep it that way.

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Open a PR with a clear description

Please test against a real OpenSky response before submitting changes to the poller.
