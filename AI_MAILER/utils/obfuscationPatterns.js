/**
 * Collection of obfuscation patterns to help evade detection systems
 */

// Common anti-spam trigger words and their obfuscated alternatives
const triggerWordAlternatives = {
  "free": ["f‌r‌e‌e", "f⁠r⁠e⁠e", "f\u200Cree", "fr\u200Dee"],
  "money": ["m‌o‌n‌e‌y", "m⁠o⁠n⁠e⁠y", "mo\u200Cney", "m\u200Doney"],
  "offer": ["o‌f‌f‌e‌r", "o⁠f⁠f⁠e⁠r", "of\u200Cfer", "off\u200Der"],
  "save": ["s‌a‌v‌e", "s⁠a⁠v⁠e", "sa\u200Cve", "s\u200Dave"],
  "discount": ["d‌i‌s‌c‌o‌u‌n‌t", "d⁠i⁠s⁠c⁠o⁠u⁠n⁠t", "dis\u200Ccount", "disc\u200Dount"],
  "urgent": ["u‌r‌g‌e‌n‌t", "u⁠r⁠g⁠e⁠n⁠t", "ur\u200Cgent", "urg\u200Dent"],
  "buy now": ["b‌u‌y n‌o‌w", "b⁠u⁠y n⁠o⁠w", "bu\u200Cy now", "buy n\u200Dow"],
  "guaranteed": ["g‌u‌a‌r‌a‌n‌t‌e‌e‌d", "g⁠u⁠a⁠r⁠a⁠n⁠t⁠e⁠e⁠d", "gua\u200Cranteed", "guaran\u200Dteed"],
  "limited time": ["l‌i‌m‌i‌t‌e‌d t‌i‌m‌e", "l⁠i⁠m⁠i⁠t⁠e⁠d t⁠i⁠m⁠e", "limi\u200Cted time", "limited t\u200Dime"]
};

// Alternative characters that look similar to regular ones but have different Unicode values
const characterSubstitutions = {
  "a": ["а", "ａ", "ⓐ", "𝐚", "𝑎", "𝒂", "𝓪", "𝔞", "𝕒", "𝖆", "𝖺", "𝗮", "𝘢", "𝙖", "𝚊"],
  "b": ["Ь", "ｂ", "ⓑ", "𝐛", "𝑏", "𝒃", "𝓫", "𝔟", "𝕓", "𝖇", "𝖻", "𝗯", "𝘣", "𝙗", "𝚋"],
  "c": ["с", "ｃ", "ⓒ", "𝐜", "𝑐", "𝒄", "𝓬", "𝔠", "𝕔", "𝖈", "𝖼", "𝗰", "𝘤", "𝙘", "𝚌"],
  "e": ["е", "ｅ", "ⓔ", "𝐞", "𝑒", "𝒆", "𝓮", "𝔢", "𝕖", "𝖊", "𝖾", "𝗲", "𝘦", "𝙚", "𝚎"],
  "o": ["о", "ｏ", "ⓞ", "𝐨", "𝑜", "𝒐", "𝓸", "𝔬", "𝕠", "𝖔", "𝗈", "𝗼", "𝘰", "𝙤", "𝚘"]
};

// Zero-width characters that can be inserted between regular characters
const zeroWidthChars = [
  '\u200B', // Zero Width Space
  '\u200C', // Zero Width Non-Joiner
  '\u200D', // Zero Width Joiner
  '\uFEFF', // Zero Width No-Break Space
  '\u2060'  // Word Joiner
];

// HTML entities that can be used instead of regular characters
const htmlEntities = {
  'a': ['&#97;', '&#x61;'],
  'b': ['&#98;', '&#x62;'],
  'c': ['&#99;', '&#x63;'],
  'd': ['&#100;', '&#x64;'],
  'e': ['&#101;', '&#x65;'],
  'f': ['&#102;', '&#x66;'],
  'g': ['&#103;', '&#x67;'],
  'h': ['&#104;', '&#x68;'],
  'i': ['&#105;', '&#x69;'],
  'j': ['&#106;', '&#x6a;'],
  'k': ['&#107;', '&#x6b;'],
  'l': ['&#108;', '&#x6c;'],
  'm': ['&#109;', '&#x6d;'],
  'n': ['&#110;', '&#x6e;'],
  'o': ['&#111;', '&#x6f;'],
  'p': ['&#112;', '&#x70;'],
  'q': ['&#113;', '&#x71;'],
  'r': ['&#114;', '&#x72;'],
  's': ['&#115;', '&#x73;'],
  't': ['&#116;', '&#x74;'],
  'u': ['&#117;', '&#x75;'],
  'v': ['&#118;', '&#x76;'],
  'w': ['&#119;', '&#x77;'],
  'x': ['&#120;', '&#x78;'],
  'y': ['&#121;', '&#x79;'],
  'z': ['&#122;', '&#x7a;']
};

// Email-specific HTML tags and attributes to avoid pattern detection
const htmlTagVariations = {
  'span': [
    '<span style="display: inline;">',
    '<span class="t">',
    '<span aria-hidden="false">',
    '<span dir="ltr">',
    '<span translate="no">'
  ],
  'div': [
    '<div style="display: inline;">',
    '<div class="x">',
    '<div aria-hidden="false">',
    '<div translate="no">'
  ],
  'font': [
    '<font face="Arial">',
    '<font style="font-family: inherit;">',
    '<font data-x="y">'
  ]
};

// CSS styles to use in style attributes
const cssStyleVariations = [
  'letter-spacing: normal;',
  'text-transform: none;',
  'font-variant: normal;',
  'text-decoration: none;',
  'font-style: normal;',
  'font-weight: normal;',
  'visibility: visible;',
  'opacity: 1;',
  'display: inline;'
];

// Comment variations to insert between content
const commentVariations = [
  '<!-- -->',
  '<!-- x -->',
  '<!--[if !mso]><!--><!--<![endif]-->',
  '<!-- %random% -->',
  '<!-- %timestamp% -->'
];

// Random strings to use as HTML attribute values or class names
function generateRandomString(length = 5) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Function to get a random item from an array
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Obfuscate a word using various techniques
function obfuscateWord(word) {
  // Check if it's a known trigger word
  const lowerWord = word.toLowerCase();
  if (triggerWordAlternatives[lowerWord]) {
    return getRandomItem(triggerWordAlternatives[lowerWord]);
  }

  // Otherwise use character-by-character obfuscation with 30% chance
  if (Math.random() < 0.3) {
    let result = '';
    for (let i = 0; i < word.length; i++) {
      const char = word[i].toLowerCase();
      if (characterSubstitutions[char] && Math.random() < 0.5) {
        // Use a character substitution
        result += getRandomItem(characterSubstitutions[char]);
      } else if (htmlEntities[char] && Math.random() < 0.3) {
        // Use an HTML entity
        result += getRandomItem(htmlEntities[char]);
      } else {
        // Use original character, possibly with a zero-width character
        result += word[i];
        if (Math.random() < 0.2 && i < word.length - 1) {
          result += getRandomItem(zeroWidthChars);
        }
      }
    }
    return result;
  }

  // Split the word with HTML tags (20% chance)
  if (Math.random() < 0.2 && word.length > 3) {
    const midPoint = Math.floor(word.length / 2);
    const tagType = getRandomItem(Object.keys(htmlTagVariations));
    const tagHtml = getRandomItem(htmlTagVariations[tagType]);
    
    return word.substring(0, midPoint) + tagHtml + word.substring(midPoint) + `</${tagType}>`;
  }

  // Insert random comments (10% chance)
  if (Math.random() < 0.1 && word.length > 3) {
    const midPoint = Math.floor(word.length / 2);
    let comment = getRandomItem(commentVariations);
    if (comment.includes('%random%')) {
      comment = comment.replace('%random%', generateRandomString());
    }
    if (comment.includes('%timestamp%')) {
      comment = comment.replace('%timestamp%', Date.now());
    }
    
    return word.substring(0, midPoint) + comment + word.substring(midPoint);
  }
  
  // Default to original word
  return word;
}

// Generate a CSS class with random properties
function generateRandomCssClass() {
  const className = `c${generateRandomString(6)}`;
  const properties = [];
  
  // Add 2-4 random CSS properties
  const numProperties = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numProperties; i++) {
    properties.push(getRandomItem(cssStyleVariations));
  }
  
  return {
    className: className,
    css: `.${className} { ${properties.join(' ')} }`
  };
}

module.exports = {
  triggerWordAlternatives,
  characterSubstitutions,
  zeroWidthChars,
  htmlEntities,
  htmlTagVariations,
  cssStyleVariations,
  commentVariations,
  obfuscateWord,
  generateRandomString,
  getRandomItem,
  generateRandomCssClass
};
