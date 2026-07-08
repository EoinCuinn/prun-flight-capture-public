window.addEventListener('message', function (event) {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'prun-capture') return;
  chrome.runtime.sendMessage({ type: 'capture', raw: event.data.raw }, function () {
    void chrome.runtime.lastError;
  });
});
