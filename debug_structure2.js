'use strict';
const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync(
  path.join(__dirname, 'captures', 'captures.jsonl'), 'utf8'
).split('\n').filter(l => l.trim());

function parseRaw(raw) {
  if (!raw.startsWith('4')) return null;
  return JSON.parse(raw.replace(/^\d+/, ''));
}

// 1. ACTION_COMPLETED → SHIP_FLIGHT_MISSION: what does the inner payload look like?
for (const line of lines) {
  const outer = JSON.parse(line);
  const arr = parseRaw(outer.raw);
  if (!arr) continue;
  const msg = arr[1];
  if (msg.messageType !== 'ACTION_COMPLETED') continue;
  const inner = msg.payload?.message;
  if (inner?.messageType !== 'SHIP_FLIGHT_MISSION') continue;
  const p = inner.payload;
  console.log('=== ACTION_COMPLETED > SHIP_FLIGHT_MISSION inner payload keys:', Object.keys(p));
  console.log('   segments count:', p.segments?.length);
  if (p.segments?.length > 0) {
    console.log('   first segment type:', p.segments[0].type);
    console.log('   first segment has transferEllipse:', !!p.segments[0].transferEllipse);
    console.log('   first segment keys:', Object.keys(p.segments[0]));
  }
  break;
}

// 2. ACTION_COMPLETED → SYSTEM_TRAFFIC: what does payload look like?
for (const line of lines) {
  const outer = JSON.parse(line);
  const arr = parseRaw(outer.raw);
  if (!arr) continue;
  const msg = arr[1];
  if (msg.messageType !== 'ACTION_COMPLETED') continue;
  const inner = msg.payload?.message;
  if (inner?.messageType !== 'SYSTEM_TRAFFIC') continue;
  const p = inner.payload;
  console.log('\n=== ACTION_COMPLETED > SYSTEM_TRAFFIC inner payload keys:', Object.keys(p));
  if (p.flights) console.log('   flights count:', p.flights.length);
  if (p.flight) console.log('   has single flight, segments:', p.flight.segments?.length);
  break;
}

// 3. SYSTEM_TRAFFIC_SHIP segment detail
for (const line of lines) {
  const outer = JSON.parse(line);
  const arr = parseRaw(outer.raw);
  if (!arr) continue;
  const msg = arr[1];
  if (msg.messageType !== 'SYSTEM_TRAFFIC_SHIP') continue;
  const seg = msg.payload?.segment;
  console.log('\n=== SYSTEM_TRAFFIC_SHIP segment keys:', Object.keys(seg || {}));
  console.log('   type:', seg?.type);
  console.log('   has transferEllipse:', !!seg?.transferEllipse);
  console.log('   departure.timestamp:', seg?.departure?.timestamp);
  console.log('   arrival.timestamp:', seg?.arrival?.timestamp);
  if (seg?.transferEllipse) {
    console.log('   transferEllipse.startPosition:', seg.transferEllipse.startPosition);
    console.log('   transferEllipse.targetPosition:', seg.transferEllipse.targetPosition);
  }
  console.log('   origin lines entity types:', seg?.origin?.lines?.map(l => l.entity?._type));
  console.log('   destination lines entity types:', seg?.destination?.lines?.map(l => l.entity?._type));
  break;
}

// 4. Count SYSTEM_TRAFFIC_SHIP segment types and transferEllipse presence
const stsCounts = {};
let stsWithTE = 0, stsWithoutTE = 0;
for (const line of lines) {
  const outer = JSON.parse(line);
  const arr = parseRaw(outer.raw);
  if (!arr) continue;
  if (arr[1].messageType !== 'SYSTEM_TRAFFIC_SHIP') continue;
  const seg = arr[1].payload?.segment;
  if (!seg) continue;
  stsCounts[seg.type] = (stsCounts[seg.type] || 0) + 1;
  if (seg.transferEllipse) stsWithTE++; else stsWithoutTE++;
}
console.log('\n=== SYSTEM_TRAFFIC_SHIP segment type counts:', stsCounts);
console.log('   with transferEllipse:', stsWithTE, '  without:', stsWithoutTE);
