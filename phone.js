/* Lighthouse Morse — phone key logic (Bronze)
   Three buttons publish dot / dash / space over MQTT; Send and Reset too.
   The phone flashes and vibrates in time with each signal it sends. */
(function () {
  'use strict';
  var link = window.LighthouseLink;
  var DOT_MS = 180;
  var DASH_MS = 540;
  var DASH_HOLD_MS = 350;
  var LETTER_PAUSE_MS = 800;
  var WORD_PAUSE_MS = 1700;

  var flashEl = document.getElementById('flash');
  var connDot = document.getElementById('connDot');
  var connText = document.getElementById('connText');
  var rttEl = document.getElementById('rtt');
  var roomInput = document.getElementById('roomInput');
  var btnJoin = document.getElementById('btnJoin');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  var oneButtonMode = false;
  var letterTimer = null;
  var wordTimer = null;
  var pressStartedAt = null;
  var ignoreClickUntil = 0;

  var requestedRoom = new URLSearchParams(window.location.search).get('room');
  if (requestedRoom) link.setRoom(requestedRoom);
  roomInput.value = link.getRoom();

  /* ---------- helpers ---------- */
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  link.on('status', function (state, detail) {
    connDot.className = 'dot ' + state;
    if (state === 'connected') connText.textContent = 'online · ' + detail;
    else if (state === 'connecting') connText.textContent = 'connecting · ' + detail;
    else if (state === 'reconnecting') connText.textContent = 'reconnecting…';
    else connText.textContent = 'offline · ' + detail;
    if (state !== 'connected') rttEl.textContent = '—';
  });

  /* ---------- round-trip measurement via acks ---------- */
  var pending = {};
  var pendingCount = 0;
  link.on('message', function (msg) {
    if (msg.type !== 'ack') return;
    if (!(msg.ackId in pending)) return;
    var rtt = Date.now() - (msg.origSentAt || pending[msg.ackId]);
    rttEl.textContent = rtt + ' ms';
    delete pending[msg.ackId];
    pendingCount--;
  });

  function remember(id, sentAt) {
    if (pendingCount > 60) { pending = {}; pendingCount = 0; }
    pending[id] = sentAt;
    pendingCount++;
  }

  /* ---------- local feedback: screen flash + vibration ---------- */
  function localFeedback(ms) {
    flashEl.style.transition = 'none';
    flashEl.style.opacity = '0.30';
    if (navigator.vibrate) {
      try { navigator.vibrate(ms >= 400 ? [70, 50, 70] : 45); } catch (e) {}
    }
    setTimeout(function () {
      flashEl.style.transition = 'opacity 130ms ease-out';
      flashEl.style.opacity = '0';
    }, ms);
  }

  function press(el) {
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 120);
  }

  function send(type, ms) {
    var msg = link.publish(type);
    if (!msg) { toast('Not connected yet — check the room code'); return; }
    remember(msg.id, msg.sentAt);
    localFeedback(ms);
    return true;
  }

  /* ---------- buttons ---------- */
  var btnDot = document.getElementById('btnDot');
  var btnDash = document.getElementById('btnDash');
  var btnSpace = document.getElementById('btnSpace');
  var btnSend = document.getElementById('btnSend');
  var btnReset = document.getElementById('btnReset');
  var btnTap = document.getElementById('btnTap');
  var keys = document.getElementById('keys');
  var btnClassicMode = document.getElementById('btnClassicMode');
  var btnOneMode = document.getElementById('btnOneMode');
  var modeInstructions = document.getElementById('modeInstructions');

  function clearPauseTimers() {
    if (letterTimer) clearTimeout(letterTimer);
    if (wordTimer) clearTimeout(wordTimer);
    letterTimer = null;
    wordTimer = null;
  }

  function schedulePauseBoundaries() {
    clearPauseTimers();
    letterTimer = setTimeout(function () {
      letterTimer = null;
      if (oneButtonMode) send('space', 60);
    }, LETTER_PAUSE_MS);
    wordTimer = setTimeout(function () {
      wordTimer = null;
      if (oneButtonMode && send('send', 140)) toast('Word sent after pause');
    }, WORD_PAUSE_MS);
  }

  function setMode(useOneButton) {
    oneButtonMode = useOneButton;
    clearPauseTimers();
    keys.classList.toggle('one-key', oneButtonMode);
    document.body.classList.toggle('one-button-mode', oneButtonMode);
    btnDot.hidden = oneButtonMode;
    btnDash.hidden = oneButtonMode;
    btnSpace.hidden = oneButtonMode;
    btnTap.hidden = !oneButtonMode;
    btnSend.hidden = oneButtonMode;
    btnClassicMode.classList.toggle('selected', !oneButtonMode);
    btnOneMode.classList.toggle('selected', oneButtonMode);
    btnClassicMode.setAttribute('aria-pressed', String(!oneButtonMode));
    btnOneMode.setAttribute('aria-pressed', String(oneButtonMode));
    modeInstructions.textContent = oneButtonMode
      ? 'Tap briefly for a dot; hold 350 ms or longer for a dash. Pause 0.8 s between letters and 1.7 s between words.'
      : 'Tap Dot / Dash to build a letter. Space ends the letter; Send ends the word.';
  }

  function beginPress() {
    if (pressStartedAt !== null) return;
    clearPauseTimers();
    pressStartedAt = Date.now();
    btnTap.classList.add('pressed');
  }

  function finishPress(isKeyboard) {
    if (pressStartedAt === null) return;
    var heldMs = Date.now() - pressStartedAt;
    pressStartedAt = null;
    btnTap.classList.remove('pressed');
    var isDash = heldMs >= DASH_HOLD_MS;
    send(isDash ? 'dash' : 'dot', isDash ? DASH_MS : DOT_MS);
    schedulePauseBoundaries();
    ignoreClickUntil = Date.now() + 500;
  }

  btnDot.addEventListener('click', function () { press(btnDot); send('dot', DOT_MS); });
  btnDash.addEventListener('click', function () { press(btnDash); send('dash', DASH_MS); });
  btnSpace.addEventListener('click', function () { press(btnSpace); send('space', 60); });
  btnSend.addEventListener('click', function () {
    if (send('send', 140)) toast('Word sent');
  });
  btnClassicMode.addEventListener('click', function () { setMode(false); });
  btnOneMode.addEventListener('click', function () { setMode(true); });

  btnTap.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    event.preventDefault();
    beginPress();
    try { btnTap.setPointerCapture(event.pointerId); } catch (e) {}
  });
  btnTap.addEventListener('pointerup', function (event) {
    event.preventDefault();
    finishPress(false);
  });
  btnTap.addEventListener('pointercancel', function () {
    pressStartedAt = null;
    btnTap.classList.remove('pressed');
    if (oneButtonMode) schedulePauseBoundaries();
  });
  btnTap.addEventListener('lostpointercapture', function () {
    if (pressStartedAt !== null) {
      pressStartedAt = null;
      btnTap.classList.remove('pressed');
      if (oneButtonMode) schedulePauseBoundaries();
    }
  });
  btnTap.addEventListener('keydown', function (event) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat) return;
    beginPress();
  });
  btnTap.addEventListener('keyup', function (event) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    finishPress(true);
  });
  btnTap.addEventListener('click', function (event) {
    if (event.detail !== 0 || Date.now() < ignoreClickUntil || pressStartedAt !== null) return;
    ignoreClickUntil = Date.now() + 500;
    if (send('dot', DOT_MS)) schedulePauseBoundaries();
  });

  btnReset.addEventListener('click', function () {
    clearPauseTimers();
    pressStartedAt = null;
    btnTap.classList.remove('pressed');
    if (send('reset', 60)) toast('Cleared');
  });

  /* ---------- room join ---------- */
  btnJoin.addEventListener('click', function () {
    var r = link.setRoom(roomInput.value);
    roomInput.value = r;
    roomInput.blur();
    toast('Joined room ' + r);
  });
  roomInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') btnJoin.click();
  });

  /* ---------- keep the screen awake during play ---------- */
  if ('wakeLock' in navigator) {
    try {
      var wlReq = navigator.wakeLock.request('screen');
      /* avoid .catch — rejected by older engines; two-arg then works everywhere */
      if (wlReq && wlReq.then) wlReq.then(function () {}, function () {});
    } catch (e) {}
  }

  link.connect();
})();
