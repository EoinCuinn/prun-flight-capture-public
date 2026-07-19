(function () {
  console.log('[PrUn Capture] WebSocket hook active');

  // Incoming: general flight/traffic captures → captures.jsonl
  const FILTERS = ['SHIP_FLIGHT_MISSION', 'SYSTEM_TRAFFIC', 'transferEllipse'];
  // Outgoing: blueprint tester requests → test_flight_requests.jsonl
  const OUTGOING_FILTERS = ['SHIP_FLIGHT_CALCULATE_TEST_FLIGHT'];

  // Capture native addEventListener before our Proxy touches anything
  const NativeAEL = WebSocket.prototype.addEventListener;

  function handleIncoming(data) {
    if (typeof data !== 'string') return;
    let captureType = null;
    // Ship data types checked first — avoids double-capture if payload also contains transferEllipse
    if (data.includes('SHIP_FIND_DATA') || data.includes('"SHIP_DATA"') || data.includes('"SHIP_SHIPS"')) {
      captureType = 'ship_find_data';
    } else if (data.includes('"BLUEPRINT_BLUEPRINTS"')) {
      captureType = 'blueprint_data';
    } else if (FILTERS.some(f => data.includes(f))) {
      captureType = 'default';
    }
    if (captureType) {
      window.postMessage({ type: 'prun-capture', raw: data, captureType }, '*');
    }
  }

  function handleOutgoing(data) {
    if (typeof data !== 'string') return;
    if (OUTGOING_FILTERS.some(f => data.includes(f))) {
      window.postMessage({ type: 'prun-capture', raw: data, captureType: 'test_flight_request' }, '*');
    }
  }

  window.WebSocket = new Proxy(WebSocket, {
    construct(Target, args) {
      const ws = new Target(...args);

      return new Proxy(ws, {
        get(target, prop) {
          // Hook addEventListener so incoming message listeners are intercepted
          if (prop === 'addEventListener') {
            return function (type, listener, options) {
              if (type === 'message' && typeof listener === 'function') {
                const orig = listener;
                listener = function (event) {
                  handleIncoming(event.data);
                  return orig.apply(this, arguments);
                };
              }
              return NativeAEL.call(target, type, listener, options);
            };
          }
          // Hook send to intercept outgoing messages
          if (prop === 'send') {
            return function (data) {
              handleOutgoing(data);
              return target.send.call(target, data);
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
              handleIncoming(event.data);
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
