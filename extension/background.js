chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'capture') return;

  fetch('http://localhost:5274/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: message.raw })
  })
    .then(res => {
      if (!res.ok) console.warn('[prun-capture] server returned', res.status);
    })
    .catch(err => console.warn('[prun-capture] server unreachable:', err.message));
});
