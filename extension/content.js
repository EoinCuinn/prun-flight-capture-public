(function () {
  const NativeWebSocket = window.WebSocket;
  const FILTERS = ['SHIP_FLIGHT_MISSION', 'SYSTEM_TRAFFIC', 'transferEllipse'];

  console.log('[PrUn Capture] WebSocket hook active');

  window.WebSocket = function PrUnWebSocket(url, protocols) {
    const ws = protocols !== undefined
      ? new NativeWebSocket(url, protocols)
      : new NativeWebSocket(url);

    ws.addEventListener('message', function (event) {
      console.log('[PrUn Capture] WS message:', typeof event.data, typeof event.data === 'string' ? event.data.substring(0, 100) : '(binary)');
      if (typeof event.data === 'string' && FILTERS.some(f => event.data.includes(f))) {
        chrome.runtime.sendMessage({ type: 'capture', raw: event.data }, function () {
          // consume lastError so Chrome doesn't surface it if the SW is dormant
          void chrome.runtime.lastError;
        });
      }
    });

    return ws;
  };

  window.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
  window.WebSocket.OPEN      = NativeWebSocket.OPEN;
  window.WebSocket.CLOSING   = NativeWebSocket.CLOSING;
  window.WebSocket.CLOSED    = NativeWebSocket.CLOSED;
  window.WebSocket.prototype = NativeWebSocket.prototype;
})();
