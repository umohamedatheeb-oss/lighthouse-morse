/* Lighthouse Morse — broker loopback test (no browser needed).
   Simulates: phone publishes dots/dashes → public broker → laptop receives
   and acks → phone measures round-trip time.
   Run:  npm install mqtt && node broker-test.js
   Exits 0 on PASS, 1 on FAIL. */
'use strict';
const mqtt = require('mqtt');

const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt'
];
const room = 'TRIN-TEST' + Math.floor(Math.random() * 900 + 100);
const topic = 'lighthouse/' + room;
const DUR = { dot: 180, dash: 540, space: 0, send: 0 };

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(url, {
      reconnectPeriod: 0,
      connectTimeout: 5000,
      clientId: 'lh-test-' + Math.random().toString(36).slice(2, 8)
    });
    const guard = setTimeout(() => {
      try { c.end(true); } catch (e) {}
      reject(new Error('timeout connecting to ' + url));
    }, 7000);
    c.once('connect', () => { clearTimeout(guard); resolve(c); });
    c.once('error', (err) => {
      clearTimeout(guard);
      try { c.end(true); } catch (e) {}
      reject(err);
    });
  });
}

async function pickBroker() {
  for (const url of BROKERS) {
    try {
      const probe = await connectClient(url);
      try { probe.end(true); } catch (e) {}
      return url;
    } catch (e) {
      console.log('  ' + url + ' failed: ' + e.message);
    }
  }
  throw new Error('no public broker reachable');
}

(async () => {
  console.log('Lighthouse Morse — broker loopback test');
  const url = await pickBroker();
  console.log('  broker: ' + url);
  console.log('  room:   ' + room);

  const laptop = await connectClient(url);   // the big screen
  const phone = await connectClient(url);    // the signal key
  laptop.subscribe(topic, { qos: 0 });
  phone.subscribe(topic, { qos: 0 });

  const received = [];
  const acks = [];
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });

  laptop.on('message', (t, payload) => {
    if (t !== topic) return;
    const msg = JSON.parse(payload.toString());
    if (msg.type === 'ack') return;               // ignore our own acks
    received.push(msg);
    const ms = DUR[msg.type] !== undefined ? DUR[msg.type] : '?';
    console.log('  laptop: flash "' + msg.type + '" (' + ms + ' ms)  #' + received.length);
    laptop.publish(topic, JSON.stringify({
      room, id: 'a' + Date.now() + Math.random().toString(36).slice(2, 5),
      type: 'ack', ackId: msg.id, origSentAt: msg.sentAt
    }));
    if (received.length >= 5) finish();
  });

  phone.on('message', (t, payload) => {
    if (t !== topic) return;
    const msg = JSON.parse(payload.toString());
    if (msg.type !== 'ack') return;
    const rtt = Date.now() - msg.origSentAt;
    acks.push(rtt);
    console.log('  phone : ack round-trip ' + rtt + ' ms');
  });

  const script = ['dot', 'dot', 'dot', 'dash', 'space'];
  let i = 0;
  (function next() {
    if (i >= script.length) return;
    const type = script[i++];
    setTimeout(() => {
      phone.publish(topic, JSON.stringify({
        room,
        id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
        type,
        sentAt: Date.now()
      }));
      next();
    }, i === 1 ? 0 : 450);
  })();

  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error('timed out — only ' + received.length + '/5 arrived')), 25000)
  );
  await Promise.race([done, timeout]);

  const avg = acks.length ? Math.round(acks.reduce((a, b) => a + b, 0) / acks.length) : NaN;
  const pass = received.length === 5 && acks.length === 5 && avg < 1000;
  console.log('received ' + received.length + '/5 signals, avg round-trip ' + avg + ' ms');
  console.log(pass ? 'PASS — link works, well under 1 second' : 'FAIL');
  try { laptop.end(true); } catch (e) {}
  try { phone.end(true); } catch (e) {}
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('FAIL: ' + e.message);
  process.exit(1);
});
