'use strict';
const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync(
  path.join(__dirname, 'captures', 'captures.jsonl'), 'utf8'
).split('\n').filter(l => l.trim());

for (const line of lines) {
  const outer = JSON.parse(line);
  const raw = outer.raw;
  if (!raw.startsWith('4')) continue;
  const arr = JSON.parse(raw.replace(/^\d+/, ''));
  const msg = arr[1];
  if (msg.messageType !== 'ACTION_COMPLETED') continue;
  const inner = msg.payload?.message;
  if (inner?.messageType !== 'SYSTEM_TRAFFIC') continue;

  const ships = inner.payload?.ships;
  console.log('Total ships in payload:', ships?.length);
  const withSegment = ships.filter(s => s.segment);
  console.log('Ships with segment:', withSegment.length);

  if (withSegment.length > 0) {
    const s = withSegment[0];
    console.log('\n--- First ship with segment ---');
    console.log('top-level keys:', Object.keys(s));
    console.log('segment keys:', Object.keys(s.segment));
    console.log('segment.type:', s.segment.type);
    console.log('has transferEllipse:', !!s.segment.transferEllipse);
    console.log('transferEllipse.startPosition:', s.segment.transferEllipse?.startPosition);
    console.log('transferEllipse.targetPosition:', s.segment.transferEllipse?.targetPosition);
    console.log('departure.timestamp:', s.segment.departure?.timestamp);
    console.log('arrival.timestamp:', s.segment.arrival?.timestamp);
    console.log('origin lines:', s.segment.origin?.lines?.map(l => `${l.entity?._type}:${l.entity?.naturalId}`));
    console.log('destination lines:', s.segment.destination?.lines?.map(l => `${l.entity?._type}:${l.entity?.naturalId}`));
    console.log('stlFuelConsumption:', s.segment.stlFuelConsumption);

    const segTypes = {};
    withSegment.forEach(s => { segTypes[s.segment.type] = (segTypes[s.segment.type]||0)+1; });
    console.log('\nSegment type breakdown across in-flight ships:', segTypes);
  }
  break;
}
