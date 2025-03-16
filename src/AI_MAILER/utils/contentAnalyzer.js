const cheerio = require('cheerio');
const config = require('../config');

/**
 * Process content to replace or obfuscate banned words
 * @param {String} content - Original content
 * @returns {String} - Processed content
 */
function processBannedWords(content) {
    if (!content) return content;
    
    let processedContent = content;
    const bannedWords = config.contentConfig.bannedWords;
    const replacementMap = config.contentConfig.replacementMap;
    
    // Process each banned word
    bannedWords.forEach(word => {
        // Create a regular expression that's case insensitive and matches whole words
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        
        // If we have a replacement, use it; otherwise obfuscate
        if (replacementMap[word]) {
            processedContent = processedContent.replace(regex, replacementMap[word]);
        } else {
            // Apply random obfuscation technique
            processedContent = processedContent.replace(regex, (match) => obfuscateWord(match));
        }
    });
    
    return processedContent;
}

/**
 * Obfuscate a word using various techniques
 * @param {String} word - Word to obfuscate
 * @returns {String} - Obfuscated word
 */
function obfuscateWord(word) {
    const techniques = config.contentConfig.obfuscationTechniques;
    const technique = techniques[Math.floor(Math.random() * techniques.length)];
    
    switch (technique) {
        case 'characterInsertion':
            return characterInsertion(word);
        case 'homoglyphs':
            return replaceWithHomoglyphs(word);
        case 'wordSplitting':
            return wordSplitting(word);
        default:
            return word;
    }
}

/**
 * Insert zero-width characters between letters
 * @param {String} word - Word to process
 * @returns {String} - Word with inserted characters
 */
function characterInsertion(word) {
    // Zero-width space and zero-width non-joiner
    const invisibleChars = ['\u200B', '\u200C'];
    let result = '';
    
    for (let i = 0; i < word.length; i++) {
        result += word[i];
        if (i < word.length - 1) {
            // Insert random invisible character
            const char = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
            result += char;
        }
    }
    
    return result;
}

/**
 * Replace characters with similar-looking ones
 * @param {String} word - Word to process
 * @returns {String} - Word with homoglyphs
 */
function replaceWithHomoglyphs(word) {
    const homoglyphs = {
        'a': ['а', 'ɑ', 'α'], // Cyrillic 'a', Latin 'ɑ', Greek 'α'
        'e': ['е', 'ԑ', 'ε'], // Cyrillic 'е', Latin 'ԑ', Greek 'ε'
        'o': ['о', 'ο', 'ο'], // Cyrillic 'о', Greek 'ο', Greek 'ο'
        'i': ['і', 'і', 'ι'], // Cyrillic 'і', Ukrainian 'і', Greek 'ι'
        's': ['ѕ', 'ꜱ', 'ѕ']  // Cyrillic 'ѕ', Latin 'ꜱ', Cyrillic 'ѕ'
    };
    
    let result = '';
    for (let i = 0; i < word.length; i++) {
        const char = word[i].toLowerCase();
        if (homoglyphs[char]) {
            // Replace with random homoglyph
            const replacement = homoglyphs[char][Math.floor(Math.random() * homoglyphs[char].length)];
            result += replacement;
        } else {
            result += word[i];
        }
    }
    
    return result;
}

/**
 * Split word with zero-width space or HTML comment
 * @param {String} word - Word to split
 * @returns {String} - Split word
 */
function wordSplitting(word) {
    const midpoint = Math.floor(word.length / 2);
    const firstHalf = word.substring(0, midpoint);
    const secondHalf = word.substring(midpoint);
    
    // Use HTML comment for HTML content, otherwise zero-width space
    if (word.includes('<') || word.includes('>')) {
        return `${firstHalf}<!-- -->${secondHalf}`;
    } else {
        return `${firstHalf}\u200B${secondHalf}`;
    }
}

/**
 * Convert HTML to plain text
 * @param {String} html - HTML content
 * @returns {String} - Plain text
 */
function htmlToText(html) {
    try {
        const $ = cheerio.load(html);
        
        // Remove script and style elements
        $('script, style').remove();
        
        // Replace <br>, <p>, <div> with newlines
        $('br').replaceWith('\n');
        $('p').after('\n\n');
        $('div').after('\n');
        
        // Get text and trim
        let text = $.text().trim();
        
        // Remove extra whitespace and normalize line breaks
        text = text.replace(/\s+/g, ' ');
        text = text.replace(/\n+/g, '\n');
        
        return text;
    } catch (error) {
        console.error('HTML to text conversion error:', error.message);
        // Return text with HTML tags removed as fallback
        return html.replace(/<[^>]*>/g, '');
    }
}

module.exports = {
    processBannedWords,
    htmlToText
};
