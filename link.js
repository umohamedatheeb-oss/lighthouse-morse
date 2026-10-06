/* Lighthouse Morse — shared link layer (both screens load this).
   Transport: MQTT over secure WebSocket on one free public broker.
   Both screens must use the same broker for a room to communicate. */
(function () {
  'use strict';

  var BROKER = { name: 'HiveMQ', url: 'wss://broker.hivemq.com:8884/mqtt' };
  var K_ROOM = 'lh-room';

  var client = null;
  var connected = false;
  var subTopic = null;
  var retryTimer = null;
  var handlers = { message: null, status: null };
  var seenIds = {};
  var seenList = [];
  var room = null;

  function status(state, detail) {
    try { if (handlers.status) handlers.status(state, detail); } catch (e) {}
  }

  function rand(n) {
    var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }

  function getRoom() {
    if (room) return room;
    var r = null;
    try { r = localStorage.getItem(K_ROOM); } catch (e) {}
    if (!r || !/^[A-Z0-9-]{2,12}$/.test(r)) {
      r = 'TRIN-' + rand(4);
      try { localStorage.setItem(K_ROOM, r); } catch (e) {}
    }
    room = r;
    return room;
  }

  function topic() { return 'lighthouse/' + getRoom(); }

  function setRoom(r) {
    r = String(r || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
    if (!r) return getRoom();
    room = r;
    try { localStorage.setItem(K_ROOM, r); } catch (e) {}
    if (client && connected) {
      var nt = topic();
      if (subTopic && subTopic !== nt) {
        try { client.unsubscribe(subTopic); } catch (e) {}
        subTopic = null;
      }
      if (!subTopic) {
        try { client.subscribe(nt, { qos: 0 }); subTopic = nt; } catch (e) {}
      }
    }
    return room;
  }

  function makeRoom() { return setRoom('TRIN-' + rand(4)); }

  function scheduleRetry(ms) {
    if (retryTimer) return;
    retryTimer = setTimeout(function () { retryTimer = null; connect(); }, ms);
  }

  function forget(c) {
    if (client === c) { client = null; connected = false; subTopic = null; }
    try { c.end(true); } catch (e) {}
  }

  function connect() {
    if (typeof mqtt === 'undefined') {
      status('error', 'MQTT library not loaded — check the internet connection');
      scheduleRetry(8000);
      return;
    }
    if (client) return;

    var b = BROKER;
    var done = false;
    status('connecting', b.name);

    var c;
    try {
      c = mqtt.connect(b.url, {
        reconnectPeriod: 0,       /* we manage retries ourselves */
        connectTimeout: 5000,
        keepalive: 30,
        clientId: 'lighthouse-' + rand(8)
      });
    } catch (e) { scheduleRetry(300); return; }
    client = c;

    var guard = setTimeout(function () {
      if (done) return;
      done = true;
      forget(c);
      scheduleRetry(400);
    }, 6500);

    c.on('connect', function () {
      if (done) return;
      done = true;
      clearTimeout(guard);
      connected = true;
      subTopic = topic();
      try { c.subscribe(subTopic, { qos: 0 }); } catch (e) {}
      status('connected', b.name);
    });

    c.on('message', function (t, payload) {
      if (t !== topic()) return;
      var msg;
      try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
      if (!msg || !msg.id) return;
      if (seenIds[msg.id]) return;
      seenIds[msg.id] = 1;
      seenList.push(msg.id);
      if (seenList.length > 400) delete seenIds[seenList.shift()];
      try { if (handlers.message) handlers.message(msg); } catch (e) {}
    });

    c.on('error', function (err) {
      if (!done) {
        done = true;
        clearTimeout(guard);
        forget(c);
        scheduleRetry(400);
      } else {
        status('reconnecting', String((err && err.message) || err));
      }
    });

    c.on('close', function () {
      if (client !== c) return;
      if (!done) {
        done = true;
        clearTimeout(guard);
        forget(c);
        scheduleRetry(400);
        return;
      }
      if (connected) {
        connected = false;
        status('reconnecting', 'connection lost');
        forget(c);
        scheduleRetry(1500);
      }
    });
  }

  function publish(type, extra) {
    if (!connected || !client) return null;
    var msg = {
      room: getRoom(),
      id: 'm' + Date.now().toString(36) + rand(5),
      type: type,
      sentAt: Date.now()
    };
    if (extra) {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
    }
    try { client.publish(topic(), JSON.stringify(msg)); return msg; } catch (e) { return null; }
  }

  window.LighthouseLink = {
    connect: connect,
    publish: publish,
    getRoom: getRoom,
    setRoom: setRoom,
    makeRoom: makeRoom,
    isConnected: function () { return connected; },
    on: function (evt, fn) {
      if (evt === 'message' || evt === 'status') handlers[evt] = fn;
    }
  };
})();
