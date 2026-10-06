# Lighthouse Morse

Two screens talk over the internet. The **laptop** shows the night scene at
Trincomalee bay — a lighthouse whose lamp flashes Morse. The **phone** is the
signal key: Dot, Dash and Space.

## Run it

1. Serve this folder over HTTP:
   - VS Code: right-click `index.html` → *Open with Live Server* (install the free
     *Live Server* extension if needed), **or**
   - With Node installed: `node test/serve.js` → <http://localhost:8080>, **or**
   - Quick check: double-clicking `index.html` usually works too (Chrome/Edge).
2. The laptop page shows **ROOM TRIN-XXXX** (top left).
3. Scan the QR shown in the laptop scene to open the phone page with the current
  room code already filled in. Alternatively, open `phone.html`, enter the
  laptop's room code, and press **Join**.
4. Press **Dot** three times → the lighthouse flashes three short flashes.

The QR uses the address currently open on the laptop. For a phone on the same
Wi-Fi, open the laptop page using its LAN address (not `localhost` or
`127.0.0.1`); the phone must be able to reach that address.

**Cross-network test** (phone on mobile data, laptop on Wi-Fi): host this folder
free — GitHub Pages or Netlify (both free, no credit card) — and open the URL on
both devices, entering the same room code.

## Three-key mode

| Step | Expected |
|---|---|
| Press **Dot** ×3 on the phone | Three short flashes on the laptop, within ~1 s each |
| Press **Dash** | One long flash (3× longer than a dot) |
| Press **Space** | The Morse pattern becomes an English letter |
| Press **Send** | The current English word is translated into Tamil and Sinhala |
| Phone status line | Shows a measured round-trip time (RTT) in ms |

The laptop shows the decoded message as it is entered and keeps the Morse
pattern visible for checking. An unsupported pattern appears as `?` instead of
being silently discarded.

## How the two screens talk

MQTT over secure WebSocket through the **free HiveMQ public broker** — no
account, no credit card, no server of our own. Both pages stay pinned to the
same broker: switching brokers independently would split a room and lose the
link. Each page retries HiveMQ after a disconnection. The phone publishes a
tiny JSON message; the laptop subscribes to the same topic.

```json
{ "room": "TRIN-4821", "id": "m…", "type": "dot", "sentAt": 1770000000123 }
```

| Broker | URL | Cost |
|---|---|---|
| HiveMQ public | `wss://broker.hivemq.com:8884/mqtt` | Free, no signup |

`link.js` retries the shared broker automatically. Topic: `lighthouse/<room>`
so other teams on demo day can't collide with you. The laptop **acks** every
signal so the phone can show a real measured round-trip time.

## Files

| File | Role |
|---|---|
| `index.html` + `scene.css` + `scene.js` | Laptop: night scene, lamp flashes, signal readout |
| `phone.html` + `phone.css` + `phone.js` | Phone: three-key and one-key modes, alphabet cheat sheet, RTT |
| `link.js` | Shared MQTT link (connect, room, publish, ack, retries) |
| `morse.js` | International Morse decoder for letters and digits |
| `test/morse-test.js` | Local decoder test for SOS, HELLO, letters, and digits |
| `test/broker-test.js` | Node loopback test: publishes 3 dots, expects 3 flashes |
| `test/serve.js` | Tiny static server for local testing |

## Test the link without a browser

```
powershell -ExecutionPolicy Bypass -File test\broker-test.ps1
```

This connects two MQTT clients through the real public broker, sends
`dot ×3, dash, space`, acks each one and prints one-way + round-trip times.
**Latest validation: 5/5 received, avg one-way 166 ms, avg round-trip 353 ms —
PASS, well under 1 second.** Exits `0` on PASS.

(If you have Node.js installed there is also `test/broker-test.js`:
`cd test && npm install mqtt && node broker-test.js`.)

`test/js-check.ps1` syntax-checks the browser JS files with the built-in
JScript engine; `test/ws-diag.ps1` diagnoses WebSocket/TLS connectivity.

## Verification status

- [x] Windows JavaScript syntax check for `link.js`, `morse.js`, `scene.js`, and `phone.js`
- [x] Decoder checked in-browser: `SOS`, `HELLO`, digits, and invalid patterns
- [x] Three-key phone-to-laptop live test: Dot ×3 decoded as `S`
- [x] Silver live test: `HELLO` decoded and translated to Tamil and Sinhala
- [x] Gold live test: one-button short/long presses and pauses decoded `SOS`
- [x] MQTT broker loopback: 5/5 signals acknowledged, 353 ms average RTT
- [ ] Test with a physical phone on mobile data and laptop on a separate network
- [ ] Have fluent Tamil and Sinhala readers confirm translation accuracy

The Node-based `test/morse-test.js` was not run because Node.js is not installed
in the current environment; equivalent decoder cases were checked in the browser.

## One-key mode

On the phone, choose **ONE KEY**. Release the round button in less than 350 ms
for a dot; hold it for 350 ms or longer for a dash. No extra key is needed for
letter or word boundaries: pause 0.8 seconds between letters and 1.7 seconds
after a word. The phone sends those boundaries automatically. Try this mode on
the actual device before the demo, since touch timing varies by person.

## Translations

Completed words use Google's keyless Chrome translation endpoint for
English-to-Tamil and English-to-Sinhala. It needs an internet connection and no
credit card, but this public endpoint is unofficial and may change or
rate-limit. English is kept visible if a translation fails. The app rejects
responses that do not contain the requested language's script, but that cannot
detect a wrong meaning. Check the Tamil and Sinhala output with fluent readers
before presenting it. Live API checks covered `HELLO`, `thank you`, `help`, and
the sample name `KUMARAN`.

## Levels

- [x] **Bronze** — three buttons, lamp flashes within a second
- [x] **Silver code** — decode letters ("HELLO") + request translations in both languages
- [ ] **Silver translation QA** — confirm output is accurate and natural with fluent readers
- [x] **Gold** — one round button (short tap = dot, long hold = dash), automatic
  letter/word pauses, phone flashes in time with the lighthouse

## Free services used (no credit card anywhere)

- **HiveMQ public MQTT broker** — the message link
- Static hosting (GitHub Pages / Netlify) — free, for cross-network play
- **Google Chrome translation endpoint** — keyless English-to-Tamil and English-to-Sinhala
