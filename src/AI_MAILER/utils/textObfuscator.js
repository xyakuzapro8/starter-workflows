const patterns = require('./obfuscationPatterns');

/**
 * Class for obfuscating text content in emails
 */
class TextObfuscator {
  /**
   * Obfuscate a simple text string
   * @param {string} text - Text to obfuscate
   * @param {string} level - Obfuscation level (low, medium, high)
   * @returns {string} - Obfuscated text
   */
  obfuscateText(text, level = 'medium') {
    if (!text) return text;
    
    // Define obfuscation probability based on level
    const probability = {
      'low': 0.2,
      'medium': 0.5,
      'high': 0.8
    }[level] || 0.5;
    
    // Split text into words and process each
    const words = text.split(/(\s+)/);
    
    return words.map(word => {
      // Skip whitespace
      if (/^\s+$/.test(word)) return word;
      
      // Skip URLs
      if (/^https?:\/\//i.test(word)) return word;
      
      // Skip email addresses
      if (/\S+@\S+\.\S+/.test(word)) return word;
      
      // Apply obfuscation based on probability
      if (Math.random() < probability) {
        return patterns.obfuscateWord(word);
      }
      
      return word;
    }).join('');
  }
  
  /**
   * Apply HTML-based obfuscation to a paragraph
   * @param {string} text - Original paragraph text
   * @param {string} level - Obfuscation level (low, medium, high)
   * @returns {string} - HTML with obfuscated text
   */
  obfuscateParagraph(text, level = 'medium') {
    if (!text) return text;
    
    // First, do basic text obfuscation
    let result = this.obfuscateText(text, level);
    
    // Define transformation probability based on level
    const probability = {
      'low': 0.3,
      'medium': 0.5,
      'high': 0.8
    }[level] || 0.5;
    
    // Apply paragraph-level transformations based on probability
    if (Math.random() < probability) {
      // Generate a random CSS class
      const cssClass = patterns.generateRandomCssClass();
      
      // Apply the class to a wrapper span
      result = `<span class="${cssClass.className}" style="display:inline;">${result}</span>`;
      
      // Add the CSS to the beginning of the result
      result = `<style>${cssClass.css}</style>${result}`;
    }
    
    return result;
  }
  
  /**
   * Create honeypot content that's hidden from humans but visible to bots
   * @returns {string} - HTML with hidden content
   */
  createHoneypotContent() {
    const honeypotTexts = [
      'Click here for more information',
      'Special offer inside',
      'Open this for a discount',
      'Free trial available',
      'Urgent offer expires today'
    ];
    
    const text = patterns.getRandomItem(honeypotTexts);
    const randId = patterns.generateRandomString(8);
    
    return `
      <div id="hp-${randId}" style="position:absolute; left:-9999px; top:-9999px; opacity:0.01; height:1px; overflow:hidden;">
        ${text} <a href="https://honeypot-${randId}.example.com">click here</a>
      </div>
    `;
  }
  
  /**
   * Obfuscate all text in an HTML document
   * @param {string} html - Original HTML
   * @param {string} level - Obfuscation level (low, medium, high)
   * @returns {string} - Obfuscated HTML
   */
  obfuscateHtml(html, level = 'medium') {
    // Simple regex-based approach (for complex HTML, use a parser like cheerio)
    
    // Obfuscate text within paragraph tags
    html = html.replace(/<p[^>]*>(.*?)<\/p>/gi, (match, p1) => {
      return match.replace(p1, this.obfuscateText(p1, level));
    });
    
    // Obfuscate text within heading tags
    html = html.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, (match, p1) => {
      return match.replace(p1, this.obfuscateText(p1, level));
    });
    
    // Obfuscate text within span tags
    html = html.replace(/<span[^>]*>(.*?)<\/span>/gi, (match, p1) => {
      return match.replace(p1, this.obfuscateText(p1, level));
    });
    
    // Obfuscate text within div tags
    html = html.replace(/<div[^>]*>(.*?)<\/div>/gi, (match, p1) => {
      // Don't process nested tags
      if (/<[a-z][\s\S]*>/i.test(p1)) return match;
      return match.replace(p1, this.obfuscateText(p1, level));
    });
    
    // Add honeypot if high level obfuscation
    if (level === 'high') {
      const bodyEnd = html.lastIndexOf('</body>');
      if (bodyEnd !== -1) {
        html = html.substring(0, bodyEnd) + this.createHoneypotContent() + html.substring(bodyEnd);
      }
    }
    
    return html;
  }
}

module.exports = new TextObfuscator();
