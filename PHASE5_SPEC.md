# Phase 5 spec — append to prun-capture-extension_action-plan.md
# Slot this in after the Phase 4 section, before the Chat ↔ Code protocol section.
# Update log entry also provided at the bottom.

---

### Phase 5 — Extraction script (Code)

**Scope:** A standalone Node.js script (`extract.js`) in the `prun-flight-capture` repo root. NOT in prun-command. No new dependencies — Node built-ins only (`fs`, `readline`, `path`).

**What it does:**
1. Reads `captures/captures.jsonl` line by line
2. For each line, parses the outer `{receivedAt, raw}` wrapper
3. Parses `raw` into the inner game message — two formats must be handled:
   - **Socket.IO format (real game frames):** `raw` starts with `42["event", {"messageType":"ACTION_COMPLETED","payload":{"message":{...}}}]` — strip the numeric `42` prefix, parse the JSON array, extract `array[1].payload.message` as the inner message
   - **Plain JSON format (Phase 1 smoke-test line):** `raw` is already a JSON object `{"messageType":"...","payload":{...}}` — parse directly
4. Extracts flights from the inner message:
   - `SHIP_FLIGHT_FLIGHTS` → `payload.flights` (array)
   - `SHIP_FLIGHT_MISSION` → `[payload]` (single flight object, treat as array of one)
   - `SYSTEM_TRAFFIC_SHIP` / `SYSTEM_TRAFFIC` → `[payload.flight]` or `payload.flights` if present
5. For each flight, walks `flight.segments[]` and extracts rows based on segment type (see below)
6. Deduplicates by `(naturalId, timestamp_ms, position_role)` — same observation appearing in multiple frames counts once
7. Writes `captures/extracted_positions.csv`

**Segment handling — what to extract and skip:**

| Segment type | transferEllipse | Extract? | What to extract |
|---|---|---|---|
| TAKE_OFF | null | **YES** | `stlFuelConsumption` only (no position) — TO fuel calibration |
| TRANSIT | non-null | **YES** | `startPosition` as origin, `targetPosition` as destination, `stlFuelConsumption` |
| LANDING | null | **YES** | `stlFuelConsumption` only (no position) — LDG fuel calibration (M_landing) |
| DEPARTURE | non-null | **YES** | `startPosition` as origin (station departure position), `stlFuelConsumption` |
| APPROACH | non-null | **YES** | `targetPosition` as destination (station arrival position) |
| JUMP | null | skip | no useful data |
| CHARGE | null | skip | no useful data |

**How to extract naturalId from a location object:**

Each segment has `origin` and `destination`, each with a `lines` array. Each line has an `entity` with `naturalId` and `_type`. Priority order for selecting the naturalId to use:
1. `_type === "planet"` → use this naturalId, type = "planet"
2. `_type === "station"` → use this naturalId, type = "station"  
3. `_type === "system"` → skip — system-level IDs are not useful for position data

If no planet or station entity is found in the lines array, skip the segment entirely.

**Bonus data — orbit parameters:**

The destination `lines` array sometimes contains a third entry with `type: "ORBIT"` and an `orbit` object (`semiMajorAxis`, `eccentricity`, `inclination`, `rightAscension`, `periapsis`). Capture these when present. They are the game's own orbital parameters for that body at that moment — useful reference even though `periapsis` is always 0 in this data (that's the known bad placeholder).

**Output CSV columns:**

```
naturalId, type, timestamp_ms, x, y, z, position_role, source_message_type, stlFuelConsumption, semiMajorAxis, eccentricity, inclination, rightAscension
```

- `naturalId` — e.g. `VH-331g`, `HRT`, `VH-331a`
- `type` — `planet` or `station`
- `timestamp_ms` — `segment.departure.timestamp` for origin rows; `segment.arrival.timestamp` for destination rows; `segment.departure.timestamp` for fuel-only rows (TAKE_OFF/LANDING)
- `x`, `y`, `z` — from `transferEllipse.startPosition` (origin) or `transferEllipse.targetPosition` (destination); empty string for fuel-only rows
- `position_role` — one of: `origin_start`, `dest_target`, `to_fuel_only`, `ldg_fuel_only`
- `source_message_type` — `SHIP_FLIGHT_FLIGHTS`, `SHIP_FLIGHT_MISSION`, or `SYSTEM_TRAFFIC_SHIP`
- `stlFuelConsumption` — integer from the segment; empty string if null
- `semiMajorAxis`, `eccentricity`, `inclination`, `rightAscension` — from the ORBIT line on the relevant location if present; empty string if not

**Deduplication key:** `naturalId + "|" + timestamp_ms + "|" + position_role`

**Console output Code must print on completion:**
1. Total lines read, lines parsed, lines skipped (with skip reason counts)
2. Total unique rows written
3. Per-body breakdown: `naturalId → origin_count, dest_count, to_fuel_count, ldg_fuel_count`

This breakdown is what gets pasted to chat for verification.

**Done when:** script runs against the real `captures/captures.jsonl` without errors, produces `captures/extracted_positions.csv`, and the console breakdown + first 10 CSV rows are pasted to chat. Not done until Daniel sees real output. "No errors" is not a passing test.

**Known parsing edge cases Code must handle without coming back to chat:**
- First line of `captures.jsonl` is the Phase 1 curl smoke-test (plain JSON, no Socket.IO prefix, `SHIP_FLIGHT_MISSION` at root level with a simplified structure missing `segments`). This will produce zero rows — that is correct, not a bug. The skip counter should increment.
- Some captures may have malformed/truncated JSON if the server wrote a partial line during a crash. Catch parse errors per-line, increment skip counter, continue.
- `z` coordinate may be absent on some positions (some frames omit it). Default to `0` if missing, do not error.
- `stlFuelConsumption` may be `null` in the JSON (not just absent). Treat null and absent identically — write empty string.

**Schema surprises:** If the real file produces unexpected structures (e.g. `flights` array absent where expected, segment types not in the table above, `transferEllipse` present on a segment type listed as null above), do NOT patch around it silently. Report to chat with the exact unexpected value before proceeding.

---

## Update Log addition

```
- 2026-06-27 (chat): Phase 5 spec written. Confirmed against two real captures.jsonl lines including 
  a full SHIP_FLIGHT_FLIGHTS frame with TAKE_OFF/TRANSIT/LANDING segments and a multi-hop FTL route 
  (DEPARTURE/JUMP/CHARGE segments). LANDING stlFuelConsumption confirmed present (value: 34). 
  DEPARTURE transferEllipse confirmed present (HRT station position at t=1782428901872). 
  Extraction script to be implemented by Code — extract.js in prun-flight-capture repo root.
```
