'use strict';

const assert = require('assert');
const MorseCodec = require('../morse.js');

function decodeWord(patterns) {
  return patterns.map((pattern) => MorseCodec.decode(pattern)).join('');
}

assert.strictEqual(decodeWord(['...', '---', '...']), 'SOS');
assert.strictEqual(decodeWord(['....', '.', '.-..', '.-..', '---']), 'HELLO');
assert.strictEqual(decodeWord(['-..', '.-', '-.--']), 'DAY');
assert.strictEqual(MorseCodec.decode('-----'), '0');
assert.strictEqual(MorseCodec.decode('.----'), '1');
assert.strictEqual(MorseCodec.decode('.-.-.-'), null);
assert.strictEqual(MorseCodec.decode(''), null);
console.log('PASS: Morse letters, words, digits, and invalid sequences');