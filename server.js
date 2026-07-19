const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5274;
const CAPTURES_DIR = path.join(__dirname, 'captures');
const CAPTURE_FILE       = path.join(CAPTURES_DIR, 'captures.jsonl');
const SHIP_FIND_FILE     = path.join(CAPTURES_DIR, 'ship_find_data.jsonl');
const TEST_FLIGHT_FILE   = path.join(CAPTURES_DIR, 'test_flight_requests.jsonl');
const BLUEPRINT_FILE     = path.join(CAPTURES_DIR, 'blueprint_data.jsonl');

if (!fs.existsSync(CAPTURES_DIR)) {
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}

app.use(express.json({ limit: '50mb' }));

// CORS — extension service worker sends from chrome-extension:// origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/capture', (req, res) => {
  if (!req.body || typeof req.body.raw !== 'string') {
    return res.status(400).json({ error: 'missing or non-string raw field' });
  }
  const captureType = req.body.captureType || 'default';
  const line = JSON.stringify({ receivedAt: new Date().toISOString(), raw: req.body.raw }) + '\n';

  let targetFile;
  if (captureType === 'ship_find_data') {
    targetFile = SHIP_FIND_FILE;
  } else if (captureType === 'test_flight_request') {
    targetFile = TEST_FLIGHT_FILE;
  } else if (captureType === 'blueprint_data') {
    targetFile = BLUEPRINT_FILE;
  } else {
    targetFile = CAPTURE_FILE;
  }

  fs.appendFileSync(targetFile, line);
  console.log(`[capture:${captureType}] ${new Date().toISOString()}  ${req.body.raw.length} chars`);
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Capture server listening on http://localhost:${PORT}`);
  console.log(`Writing to ${CAPTURE_FILE}`);
});
