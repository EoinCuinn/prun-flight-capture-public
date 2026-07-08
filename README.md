# PrUn Flight Capture

A small toolkit for capturing [Prosperous Universe](https://prosperousuniverse.com/)
WebSocket traffic and fitting Keplerian orbits to in‑game stations and planets.

It has two halves:

1. **A Chrome (MV3) extension** that hooks the game's WebSocket in the page's
   `MAIN` world and forwards raw frames to a local server.
2. **A tiny Node capture server** that appends those frames to a JSONL file.

A pair of processing scripts then turn the captured `SYSTEM_TRAFFIC` position
data into per‑station Keplerian orbit fits.

---

## How it works

```
PrUn client (apex.prosperousuniverse.com)
      │  WebSocket frames
      ▼
extension/content-main.js   ← installed as a MAIN-world content script,
      │                        wraps window.WebSocket to observe frames
      ▼
extension/content-bridge.js ← bridges page → extension service worker
      ▼
extension/background.js     ← POSTs each raw frame to the local server
      ▼
server.js  (http://localhost:5274/capture)
      │
      ▼
captures/captures.jsonl     ← one JSON object per line: { receivedAt, raw }
```

The frames of interest are `SYSTEM_TRAFFIC` / `SYSTEM_TRAFFIC_SHIP` (in‑system
positions of ships, planets and stations) and `SHIP_FLIGHT_MISSION` /
`SHIP_FLIGHT_FLIGHT` (flight segments).

---

## Usage

### 1. Run the capture server
```bash
npm install
npm start          # listens on http://localhost:5274, writes captures/captures.jsonl
```

### 2. Load the extension
- Open `chrome://extensions`, enable **Developer mode**.
- **Load unpacked** → select the `extension/` folder.
- Open / reload PrUn. Frames start appending to `captures/captures.jsonl`.
  The server logs a line per captured frame.

### 3. Process the captures
```bash
node extract.js        # captures/captures.jsonl -> captures/extracted_positions.csv
node fit_stations.js   # extracted_positions.csv -> Keplerian fit per station
```

`extract.js` pulls body/station positions (and orbit blocks where present) into a
flat CSV. `fit_stations.js` fits a Keplerian orbit per station: an analytical
linear fit of the unwrapped angle vs time, then a nonlinear grid refinement,
reporting mean / p90 / p95 / max position error and angular coverage.

The `debug_*.js` scripts are small standalone helpers kept for reference while
exploring the frame structure.

---

## Files

| Path | What it is |
|---|---|
| `extension/` | MV3 extension: MAIN‑world WS hook, bridge, service worker |
| `server.js` | Local capture server (Express, port 5274) |
| `extract.js` | `captures.jsonl` → `extracted_positions.csv` |
| `fit_stations.js` | Keplerian orbit fit per station from the CSV |
| `debug_*.js` | Exploratory helpers for the frame format |
| `FIOswagger.json` | Public [FNAR/FIO](https://doc.fnar.net/) API spec, for reference |
| `PHASE5_SPEC.md` | Development notes / spec |

---

## Data & privacy

Captured `.jsonl`/`.csv` files hold live in‑game traffic (including other
players' publicly‑visible ship and station positions). They are **git‑ignored on
purpose** — only the empty `captures/` folder is tracked. Don't commit capture
data or any API keys; the server needs no credentials to run.

---

## Acknowledgements

Built for the PrUn community's flight‑dynamics and ephemeris work. Thanks in
particular to **Marcus Licinius Crassus** (flight dynamics, ephemeris data) and
the wider community researchers whose datasets and cross‑checks made the orbit
fits possible.

## License

MIT — see [LICENSE](LICENSE).
