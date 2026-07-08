'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CAPTURES_FILE = path.join(__dirname, 'captures', 'captures.jsonl');
const OUTPUT_FILE = path.join(__dirname, 'captures', 'extracted_positions.csv');

const CSV_HEADER = 'naturalId,type,timestamp_ms,x,y,z,position_role,source_message_type,stlFuelConsumption,semiMajorAxis,eccentricity,inclination,rightAscension';

const skipCounts = {};
function countSkip(reason) {
  skipCounts[reason] = (skipCounts[reason] || 0) + 1;
}

const seen = new Set();
const rows = [];
const bodyStats = {};

function bumpStat(naturalId, role) {
  if (!bodyStats[naturalId]) bodyStats[naturalId] = { origin: 0, dest: 0, to_fuel: 0, ldg_fuel: 0 };
  if (role === 'origin_start')  bodyStats[naturalId].origin++;
  else if (role === 'dest_target')  bodyStats[naturalId].dest++;
  else if (role === 'to_fuel_only') bodyStats[naturalId].to_fuel++;
  else if (role === 'ldg_fuel_only') bodyStats[naturalId].ldg_fuel++;
}

function getEntityFromLines(lines) {
  if (!Array.isArray(lines)) return null;
  let planet = null, station = null;
  for (const line of lines) {
    const e = line.entity;
    if (!e) continue;
    if (e._type === 'planet'  && !planet)  planet  = e;
    if (e._type === 'station' && !station) station = e;
  }
  if (planet)  return { naturalId: planet.naturalId,  type: 'planet'  };
  if (station) return { naturalId: station.naturalId, type: 'station' };
  return null;
}

function getOrbitFromLines(lines) {
  if (!Array.isArray(lines)) return {};
  for (const line of lines) {
    if (line.type === 'ORBIT' && line.orbit) {
      const o = line.orbit;
      return {
        semiMajorAxis: o.semiMajorAxis ?? '',
        eccentricity:  o.eccentricity  ?? '',
        inclination:   o.inclination   ?? '',
        rightAscension: o.rightAscension ?? '',
      };
    }
  }
  return {};
}

function addRow(naturalId, type, timestamp_ms, x, y, z, role, sourceType, stlFuel, orbit) {
  const key = `${naturalId}|${timestamp_ms}|${role}`;
  if (seen.has(key)) return;
  seen.add(key);
  bumpStat(naturalId, role);

  const fuel = (stlFuel === null || stlFuel === undefined) ? '' : stlFuel;
  rows.push([
    naturalId, type, timestamp_ms,
    x, y, z,
    role, sourceType, fuel,
    orbit.semiMajorAxis ?? '',
    orbit.eccentricity  ?? '',
    orbit.inclination   ?? '',
    orbit.rightAscension ?? '',
  ].join(','));
}

function processSegment(seg, sourceType) {
  const st   = seg.type;
  const te   = seg.transferEllipse;
  const fuel = seg.stlFuelConsumption;
  const depTs = seg.departure?.timestamp;
  const arrTs = seg.arrival?.timestamp;

  if (st === 'TAKE_OFF') {
    const entity = getEntityFromLines(seg.origin?.lines);
    if (!entity) { countSkip('no_entity_take_off'); return; }
    addRow(entity.naturalId, entity.type, depTs, '', '', '', 'to_fuel_only', sourceType, fuel, {});

  } else if (st === 'LANDING') {
    const entity = getEntityFromLines(seg.destination?.lines);
    if (!entity) { countSkip('no_entity_landing'); return; }
    addRow(entity.naturalId, entity.type, depTs, '', '', '', 'ldg_fuel_only', sourceType, fuel, {});

  } else if (st === 'TRANSIT') {
    if (!te) { countSkip('transit_null_te'); return; }
    const originEntity = getEntityFromLines(seg.origin?.lines);
    const destEntity   = getEntityFromLines(seg.destination?.lines);
    const originOrbit  = getOrbitFromLines(seg.origin?.lines);
    const destOrbit    = getOrbitFromLines(seg.destination?.lines);
    const sp = te.startPosition;
    const tp = te.targetPosition;
    if (originEntity && sp) {
      addRow(originEntity.naturalId, originEntity.type, depTs,
        sp.x, sp.y, sp.z ?? 0, 'origin_start', sourceType, fuel, originOrbit);
    }
    if (destEntity && tp) {
      addRow(destEntity.naturalId, destEntity.type, arrTs,
        tp.x, tp.y, tp.z ?? 0, 'dest_target', sourceType, fuel, destOrbit);
    }

  } else if (st === 'DEPARTURE') {
    if (!te) { countSkip('departure_null_te'); return; }
    const originEntity = getEntityFromLines(seg.origin?.lines);
    const originOrbit  = getOrbitFromLines(seg.origin?.lines);
    const sp = te.startPosition;
    if (originEntity && sp) {
      addRow(originEntity.naturalId, originEntity.type, depTs,
        sp.x, sp.y, sp.z ?? 0, 'origin_start', sourceType, fuel, originOrbit);
    }

  } else if (st === 'APPROACH') {
    if (!te) { countSkip('approach_null_te'); return; }
    const destEntity = getEntityFromLines(seg.destination?.lines);
    const destOrbit  = getOrbitFromLines(seg.destination?.lines);
    const tp = te.targetPosition;
    if (destEntity && tp) {
      addRow(destEntity.naturalId, destEntity.type, arrTs,
        tp.x, tp.y, tp.z ?? 0, 'dest_target', sourceType, fuel, destOrbit);
    }

  } else if (st === 'JUMP' || st === 'CHARGE' || st === 'LOCK' || st === 'JUMP_GATEWAY' || st === 'DECAY') {
    countSkip(`skipped_${st.toLowerCase()}`);

  } else {
    console.warn(`[WARN] Unexpected segment type: "${st}" — skipping`);
    countSkip(`unexpected_segment_type_${st}`);
  }
}

function processFlightSegments(flight, sourceType) {
  const segments = flight.segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    countSkip('zero_segment_flight');
    return;
  }
  for (const seg of segments) {
    processSegment(seg, sourceType);
  }
}

function handleMessage(msg) {
  const mt      = msg.messageType;
  const payload = msg.payload;

  if (mt === 'SHIP_FLIGHT_FLIGHTS') {
    if (!Array.isArray(payload?.flights)) { countSkip('no_flights_array'); return; }
    for (const flight of payload.flights) {
      processFlightSegments(flight, 'SHIP_FLIGHT_FLIGHTS');
    }

  } else if (mt === 'SHIP_FLIGHT_MISSION') {
    // payload IS the flight object: {missionId, segments, ...}
    processFlightSegments(payload, 'SHIP_FLIGHT_MISSION');

  } else if (mt === 'SHIP_FLIGHT_FLIGHT') {
    // Single in-progress flight update; payload IS the flight object, same shape as SHIP_FLIGHT_FLIGHTS entries
    processFlightSegments(payload, 'SHIP_FLIGHT_FLIGHT');

  } else if (mt === 'SYSTEM_TRAFFIC') {
    // Bulk snapshot: payload.ships[], each may have a single segment
    const ships = payload?.ships;
    if (!Array.isArray(ships)) { countSkip('no_ships_array'); return; }
    for (const ship of ships) {
      if (!ship.segment) continue; // docked, no position data
      processSegment(ship.segment, 'SYSTEM_TRAFFIC_SHIP');
    }

  } else if (mt === 'SYSTEM_TRAFFIC_SHIP') {
    // Per-ship incremental update
    if (!payload?.segment) { countSkip('system_traffic_ship_no_segment'); return; }
    processSegment(payload.segment, 'SYSTEM_TRAFFIC_SHIP');

  } else if (mt === 'SYSTEM_TRAFFIC_SHIP_REMOVED') {
    countSkip('system_traffic_ship_removed');

  } else {
    countSkip(`unknown_message_type_${mt}`);
  }
}

async function main() {
  let linesRead = 0;
  let linesParsed = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(CAPTURES_FILE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    linesRead++;

    let outer;
    try { outer = JSON.parse(line); } catch {
      countSkip('malformed_outer_json');
      continue;
    }

    const raw = outer.raw;
    if (typeof raw !== 'string') { countSkip('missing_raw'); continue; }

    let innerMsg;
    try {
      if (raw.trimStart().startsWith('{')) {
        // Plain JSON (Phase 1 smoke-test line)
        innerMsg = JSON.parse(raw);
      } else {
        // Socket.IO frame: strip leading digits, parse array
        const arr = JSON.parse(raw.replace(/^\d+/, ''));
        if (!Array.isArray(arr) || arr[0] !== 'event') {
          countSkip('not_event_array');
          continue;
        }
        const outerMsg = arr[1];
        if (!outerMsg?.messageType) { countSkip('no_outer_message_type'); continue; }

        if (outerMsg.messageType === 'ACTION_COMPLETED') {
          innerMsg = outerMsg.payload?.message;
          if (!innerMsg) { countSkip('no_inner_message'); continue; }
        } else {
          // Direct message: SYSTEM_TRAFFIC_SHIP, SHIP_FLIGHT_MISSION, SYSTEM_TRAFFIC_SHIP_REMOVED
          innerMsg = outerMsg;
        }
      }
    } catch {
      countSkip('malformed_raw_json');
      continue;
    }

    if (!innerMsg?.messageType) { countSkip('no_message_type'); continue; }
    linesParsed++;
    handleMessage(innerMsg);
  }

  // Write CSV
  fs.writeFileSync(OUTPUT_FILE, [CSV_HEADER, ...rows].join('\n') + '\n');

  // Console report
  const linesSkipped = linesRead - linesParsed;
  const totalSkipEvents = Object.values(skipCounts).reduce((a, b) => a + b, 0);

  console.log('\n=== PrUn Flight Capture — Extraction Results ===');
  console.log(`Lines read:            ${linesRead}`);
  console.log(`Lines parsed:          ${linesParsed}`);
  console.log(`Lines failed to parse: ${linesSkipped}`);
  console.log(`\nSkip events (message/segment level): ${totalSkipEvents}`);
  for (const [reason, count] of Object.entries(skipCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log(`\nUnique rows written: ${rows.length}`);
  console.log(`Output: ${OUTPUT_FILE}`);

  console.log('\n=== Per-body breakdown ===');
  const sorted = Object.entries(bodyStats).sort((a, b) => {
    const aT = a[1].origin + a[1].dest + a[1].to_fuel + a[1].ldg_fuel;
    const bT = b[1].origin + b[1].dest + b[1].to_fuel + b[1].ldg_fuel;
    return bT - aT;
  });
  for (const [id, s] of sorted) {
    console.log(`  ${id.padEnd(12)} origin=${s.origin}  dest=${s.dest}  to_fuel=${s.to_fuel}  ldg_fuel=${s.ldg_fuel}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
