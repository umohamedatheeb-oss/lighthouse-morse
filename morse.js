(function (root) {
  'use strict';

  var letters = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F',
    '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L',
    '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R',
    '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X',
    '-.--': 'Y', '--..': 'Z',
    '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4',
    '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9'
  };

  var codec = {
    decode: function (sequence) {
      return Object.prototype.hasOwnProperty.call(letters, sequence) ? letters[sequence] : null;
    }
  };

  root.MorseCodec = codec;
  if (typeof module !== 'undefined' && module.exports) module.exports = codec;
})(typeof window !== 'undefined' ? window : this);