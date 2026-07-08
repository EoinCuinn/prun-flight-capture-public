'use strict';
const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync(
  path.join(__dirname, 'captures', 'captures.jsonl'), 'utf8'
).split('\n').filter(l => l.trim());

let found = 0;

for (const line of lines) {
  if (found >= 2) break;
  let outer;
  try { outer = JSON.parse(line); } catch { continue; }
  const raw = outer.raw;
  if (!raw.startsWith('4')) continue;

  let arr;
  try { arr = JSON.parse(raw.replace(/^\d+/, '')); } catch { continue; }

  const outerMsg = arr[1];
  // DECAY segments appear in SYSTEM_TRAFFIC ships
  if (outerMsg.messageType === 'ACTION_COMPLETED') {
    const inner = outerMsg.payload?.message;
    if (inner?.messageType !== 'SYSTEM_TRAFFIC') continue;
    for (const ship of (inner.payload?.ships ?? [])) {
      if (ship.segment?.type === 'DECAY') {
        console.log(`\n=== DECAY segment #${++found} (from SYSTEM_TRAFFIC) ===`);
        console.log(JSON.stringify(ship.segment, null, 2));
        if (found >= 2) break;
      }
    }
  } else if (outerMsg.messageType === 'SYSTEM_TRAFFIC_SHIP') {
    if (outerMsg.payload?.segment?.type === 'DECAY') {
      console.log(`\n=== DECAY segment #${++found} (from SYSTEM_TRAFFIC_SHIP) ===`);
      console.log(JSON.stringify(outerMsg.payload.segment, null, 2));
    }
  }
}

console.log(`\nTotal DECAY segments shown: ${found}`);
