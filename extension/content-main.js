(function () {
  console.log('[PrUn Capture] WebSocket hook active');

  const FILTERS = ['SHIP_FLIGHT_MISSION', 'SYSTEM_TRAFFIC', 'transferEllipse'];

  // Capture native addEventListener before our Proxy touches anything
  const NativeAEL = WebSocket.prototype.addEventListener;

  window.WebSocket = new Proxy(WebSocket, {
    construct(Target, args) {
      const ws = new Target(...args);

      return new Proxy(ws, {
        get(target, prop) {
          // Return our wrapping addEventListener so message listeners get hooked
          if (prop === 'addEventListener') {
            return function (type, listener, options) {
              if (type === 'message' && typeof listener === 'function') {
                const orig = listener;
                listener = function (event) {
                  if (typeof event.data === 'string' &&
                      FILTERS.some(f => event.data.includes(f))) {
                    window.postMessage({ type: 'prun-capture', raw: event.data }, '*');
                  }
                  return orig.apply(this, arguments);
                };
              }
              return NativeAEL.call(target, type, listener, options);
            };
          }
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, prop, value) {
          // Also hook onmessage property assignment in case Socket.IO uses it
          if (prop === 'onmessage' && typeof value === 'function') {
            const orig = value;
            target.onmessage = function (event) {
              if (typeof event.data === 'string' &&
                  FILTERS.some(f => event.data.includes(f))) {
                window.postMessage({ type: 'prun-capture', raw: event.data }, '*');
              }
              return orig.apply(this, arguments);
            };
            return true;
          }
          return Reflect.set(target, prop, value);
        }
      });
    }
  });
})();
