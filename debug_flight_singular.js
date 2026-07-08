'use strict';
const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync(
  path.join(__dirname, 'captures', 'captures.jsonl'), 'utf8'
).split('\n').filter(l => l.trim());

for (const line of lines) {
  let outer;
  try { outer = JSON.parse(line); } catch { continue; }
  const raw = outer.raw;
  if (!raw.startsWith('4')) continue;

  let arr;
  try { arr = JSON.parse(raw.replace(/^\d+/, '')); } catch { continue; }

  const outerMsg = arr[1];
  if (outerMsg.messageType !== 'SHIP_FLIGHT_FLIGHT') continue;

  console.log('=== SHIP_FLIGHT_FLIGHT top-level keys:', Object.keys(outerMsg));
  console.log('payload keys:', Object.keys(outerMsg.payload ?? {}));
  console.log('\nFull message:');
  // Print full payload but cap segments array to first 1 entry to keep output readable
  const p = outerMsg.payload;
  const display = {
    ...outerMsg,
    payload: {
      ...p,
      segments: p?.segments
        ? [p.segments[0], `... (${p.segments.length} total)`]
        : p?.segments,
    }
  };
  console.log(JSON.stringify(display, null, 2));
  break;
}
