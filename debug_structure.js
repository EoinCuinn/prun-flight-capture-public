'use strict';
const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync(
  path.join(__dirname, 'captures', 'captures.jsonl'), 'utf8'
).split('\n').filter(l => l.trim());

const outerTypeCounts = {};
const innerTypeCounts = {};
const surprises = [];

for (let i = 0; i < lines.length; i++) {
  let outer;
  try { outer = JSON.parse(lines[i]); } catch { continue; }
  const raw = outer.raw;

  if (!raw.startsWith('4')) {
    outerTypeCounts['(plain-json)'] = (outerTypeCounts['(plain-json)'] || 0) + 1;
    continue;
  }

  let arr;
  try { arr = JSON.parse(raw.replace(/^\d+/, '')); } catch { outerTypeCounts['(parse-error)'] = (outerTypeCounts['(parse-error)'] || 0) + 1; continue; }

  const outerMsg = arr[1];
  const outerType = outerMsg?.messageType ?? '(no messageType)';
  outerTypeCounts[outerType] = (outerTypeCounts[outerType] || 0) + 1;

  if (outerType === 'ACTION_COMPLETED') {
    const innerType = outerMsg?.payload?.message?.messageType ?? '(no inner type)';
    innerTypeCounts[innerType] = (innerTypeCounts[innerType] || 0) + 1;
  }

  // Check SYSTEM_TRAFFIC_SHIP payload structure
  if (outerType === 'SYSTEM_TRAFFIC_SHIP' && !surprises.some(s => s.type === 'SYSTEM_TRAFFIC_SHIP')) {
    const p = outerMsg.payload;
    surprises.push({
      type: 'SYSTEM_TRAFFIC_SHIP',
      payloadKeys: Object.keys(p || {}),
      segmentType: p?.segment?.type,
      hasSegments: !!p?.segments,
      hasFlight: !!p?.flight,
      hasFlights: !!p?.flights,
    });
  }

  // Check SHIP_FLIGHT_MISSION direct payload
  if (outerType === 'SHIP_FLIGHT_MISSION' && !surprises.some(s => s.type === 'SHIP_FLIGHT_MISSION_direct')) {
    const p = outerMsg.payload;
    surprises.push({
      type: 'SHIP_FLIGHT_MISSION_direct',
      payloadKeys: Object.keys(p || {}),
      segmentsCount: p?.segments?.length,
      firstSegType: p?.segments?.[0]?.type,
    });
  }

  // SYSTEM_TRAFFIC_SHIP_REMOVED
  if (outerType === 'SYSTEM_TRAFFIC_SHIP_REMOVED' && !surprises.some(s => s.type === 'SYSTEM_TRAFFIC_SHIP_REMOVED')) {
    const p = outerMsg.payload;
    surprises.push({ type: 'SYSTEM_TRAFFIC_SHIP_REMOVED', payloadKeys: Object.keys(p || {}) });
  }
}

console.log('=== Outer message types ===');
console.log(outerTypeCounts);
console.log('\n=== Inner types (inside ACTION_COMPLETED) ===');
console.log(innerTypeCounts);
console.log('\n=== Structure surprises ===');
console.log(JSON.stringify(surprises, null, 2));
