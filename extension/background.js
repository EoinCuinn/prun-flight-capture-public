// Must match PORT in server.js and the localhost permission in manifest.json
const SERVER_PORT = 5274;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'capture') return;

  fetch(`http://localhost:${SERVER_PORT}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: message.raw, captureType: message.captureType || 'default' })
  })
    .then(res => {
      if (!res.ok) console.warn('[prun-capture] server returned', res.status);
    })
    .catch(err => console.warn('[prun-capture] server unreachable:', err.message));
});
