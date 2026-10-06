/* Lighthouse Morse — laptop scene logic
  Listens for phone signals, decodes words, and displays translations. */
(function () {
  'use strict';
  var DOT_MS = 180;
  var DASH_MS = 540;
  var TRANSLATION_URL = 'https://clients5.google.com/translate_a/t';

  var lamp = document.getElementById('lamp');
  var beam = document.getElementById('beam');
  var doneEl = document.getElementById('done');
  var currentEl = document.getElementById('current');
  var morseEl = document.getElementById('morseInput');
  var hintEl = document.getElementById('hint');
  var roomEl = document.getElementById('roomCode');
  var connDot = document.getElementById('connDot');
  var connText = document.getElementById('connText');
  var lastSigEl = document.getElementById('lastSignal');
  var btnNewRoom = document.getElementById('btnNewRoom');
  var phoneQr = document.getElementById('phoneQr');
  var phoneQrLink = document.getElementById('phoneQrLink');
  var qrRoomCode = document.getElementById('qrRoomCode');
  var trEn = document.getElementById('trEn');
  var trTa = document.getElementById('trTa');
  var trSi = document.getElementById('trSi');

  /* ---------- stars ---------- */
  var starBox = document.getElementById('stars');
  for (var i = 0; i < 90; i++) {
    var s = document.createElement('i');
    s.style.left = (Math.random() * 100) + '%';
    s.style.top = (Math.random() * 60) + '%';
    var size = 1 + Math.random() * 2;
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.animationDelay = (Math.random() * 4) + 's';
    s.style.animationDuration = (2.5 + Math.random() * 3) + 's';
    starBox.appendChild(s);
  }

  /* ---------- lamp flash queue (so rapid presses never overlap) ---------- */
  var queue = [];
  var busy = false;
  function flash(ms) {
    queue.push(ms);
    runQueue();
  }
  function runQueue() {
    if (busy || !queue.length) return;
    busy = true;
    var ms = queue.shift();
    lamp.classList.add('on');
    beam.classList.add('on');
    setTimeout(function () {
      lamp.classList.remove('on');
      beam.classList.remove('on');
      setTimeout(runQueue, 70);
    }, ms);
  }

  /* ---------- decoded signal stream ---------- */
  var completedWords = [];
  var currentWord = '';
  var currentMorse = '';

  function translationLine(language) {
    if (!completedWords.length) return '—';
    return completedWords.map(function (word) {
      if (word[language]) return word[language];
      return word.translationState === 'loading' ? 'Translating…' : 'Unavailable';
    }).join(' / ');
  }

  function render() {
    doneEl.textContent = completedWords.map(function (word) { return word.english; }).join(' ');
    currentEl.textContent = currentWord;
    morseEl.textContent = currentMorse || '—';
    trEn.textContent = completedWords.length
      ? completedWords.map(function (word) { return word.english; }).join(' ')
      : '—';
    trTa.textContent = translationLine('ta');
    trSi.textContent = translationLine('si');
  }

  function endLetter() {
    if (!currentMorse) return true;
    var letter = MorseCodec.decode(currentMorse);
    currentWord += letter || '?';
    currentMorse = '';
    return Boolean(letter);
  }

  function endWord() {
    var valid = endLetter();
    if (!currentWord) return null;
    var word = { english: currentWord, ta: '', si: '', translationState: 'loading' };
    completedWords.push(word);
    currentWord = '';
    render();
    translateWord(word);
    return { valid: valid };
  }

  function hasTargetScript(text, language) {
    return language === 'ta' ? /[\u0B80-\u0BFF]/.test(text) : /[\u0D80-\u0DFF]/.test(text);
  }

  function translateText(text, language) {
    var params = new URLSearchParams();
    params.set('client', 'dict-chrome-ex');
    params.set('sl', 'en');
    params.set('tl', language);
    params.set('q', text);
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 9000);

    return fetch(TRANSLATION_URL + '?' + params.toString(), { signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('Translation service returned HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        var translated = Array.isArray(data) ? data.join(' ').trim() : '';
        if (!translated || !hasTargetScript(translated, language)) {
          throw new Error('Translation service did not return a translation');
        }
        return translated;
      })
      .then(function (translated) {
        clearTimeout(timeout);
        return translated;
      }, function (error) {
        clearTimeout(timeout);
        throw error;
      });
  }

  function translateWord(word) {
    Promise.all([
      translateText(word.english, 'ta').then(function (value) { return value; }, function () { return ''; }),
      translateText(word.english, 'si').then(function (value) { return value; }, function () { return ''; })
    ]).then(function (translations) {
      word.ta = translations[0];
      word.si = translations[1];
      word.translationState = word.ta && word.si ? 'ready' : 'error';
      render();
      if (word.translationState === 'ready') {
        hint('Unverified machine translations received. Please check Tamil and Sinhala before sharing.');
      } else {
        hint('English is saved, but a translation failed. Check the connection; English is still available.');
      }
    });
  }

  var lastAt = 0;
  function hint(t) { hintEl.textContent = t; }

  function updatePairingQr() {
    var phoneUrl = new URL('phone.html', window.location.href);
    phoneUrl.searchParams.set('room', LighthouseLink.getRoom());
    phoneQrLink.href = phoneUrl.toString();
    qrRoomCode.textContent = LighthouseLink.getRoom();
    phoneQr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' +
      encodeURIComponent(phoneUrl.toString());
  }

  /* ---------- status / room ---------- */
  LighthouseLink.on('status', function (state, detail) {
    connDot.className = 'dot ' + state;
    if (state === 'connected') connText.textContent = 'online · ' + detail;
    else if (state === 'connecting') connText.textContent = 'connecting · ' + detail;
    else if (state === 'reconnecting') connText.textContent = 'reconnecting…';
    else connText.textContent = 'offline · ' + detail;
  });

  roomEl.textContent = LighthouseLink.getRoom();
  updatePairingQr();
  btnNewRoom.addEventListener('click', function () {
    roomEl.textContent = LighthouseLink.makeRoom();
    updatePairingQr();
    render();
    hint('New room on this screen — enter the new code on the phone.');
  });

  /* ---------- messages from the phone ---------- */
  LighthouseLink.on('message', function (msg) {
    if (msg.type === 'ack') return;
    var result;
    if (msg.type === 'dot') { flash(DOT_MS); currentMorse += '.'; }
    else if (msg.type === 'dash') { flash(DASH_MS); currentMorse += '-'; }
    else if (msg.type === 'space') {
      if (!endLetter()) hint('Unknown Morse pattern. Check the cheat sheet and try again.');
    }
    else if (msg.type === 'send') {
      result = endWord();
      if (!result) hint('No decoded letters to send yet.');
      else if (!result.valid) hint('Word sent with an unknown letter shown as ?.');
      else hint('Word complete. Translating to Tamil and Sinhala…');
    }
    else if (msg.type === 'reset') {
      completedWords = [];
      currentWord = '';
      currentMorse = '';
      render();
      hint('Cleared — ready for a new message.');
    }
    else return;

    render();
    lastAt = Date.now();

    /* acknowledge so the phone can measure round-trip time */
    LighthouseLink.publish('ack', { ackId: msg.id, origSentAt: msg.sentAt });
  });

  setInterval(function () {
    if (!lastAt) return;
    var sec = Math.round((Date.now() - lastAt) / 1000);
    lastSigEl.textContent = sec < 1 ? 'just now' : sec + 's ago';
  }, 1000);

  render();
  LighthouseLink.connect();
})();
