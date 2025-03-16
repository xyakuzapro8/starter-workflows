/**
 * Email Content Cleanup Utility
 * Removes duplicated content and cleans up email messages
 */

const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

// Ensure logger is properly declared with let instead of const for the fallback case
let logger;
try {
  logger = require('../utils/logger');
} catch (e) {
  logger = {
    error: (msg) => console.error(msg),
    warn: (msg) => console.warn(msg),
    info: (msg) => console.info(msg),
    debug: (msg) => console.debug(msg)
  };
}

/**
 * Decode HTML entities that might be double-encoded
 * @param {string} html - HTML content that might have encoded entities
 * @returns {string} - Decoded HTML
 */
function decodeHtmlEntities(html) {
  if (!html) return html;
  
  try {
    // Replace common HTML entities with their character equivalents
    return html
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  } catch (error) {
    logger.error(`Error decoding HTML entities: ${error.message}`);
    return html;
  }
}

/**
 * Clean up email HTML content by removing duplications and improving structure
 * @param {string} htmlContent - Raw HTML email content
 * @returns {string} - Cleaned HTML content
 */
function cleanEmailContent(htmlContent) {
  try {
    // First decode any double-encoded HTML entities
    htmlContent = decodeHtmlEntities(htmlContent);
    
    // Load HTML with Cheerio
    const $ = cheerio.load(htmlContent);

    // Fix issues in AI content specifically
    $('.ai-content').each((i, el) => {
      // Get the original HTML content
      let aiContent = $(el).html();
      
      // Check if content still has encoded entities
      if (aiContent && (aiContent.includes('&lt;') || aiContent.includes('&gt;'))) {
        // Decode and replace content
        aiContent = decodeHtmlEntities(aiContent);
        $(el).html(aiContent);
      }
    });

    // Remove duplicate greeting sections - common in AI-generated content
    const greetingTexts = new Set();
    $('.ai-content p').each((i, el) => {
      const text = $(el).text().trim().toLowerCase();
      // If it looks like a greeting and we've seen it before
      if ((text.startsWith('hello') || text.startsWith('hi') || text.startsWith('hey')) && 
          greetingTexts.has(text)) {
        $(el).remove();
      } else {
        greetingTexts.add(text);
      }
    });

    // Look for duplicate paragraphs across different sections
    const allParagraphs = new Set();
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) { // Only compare substantive paragraphs
        if (allParagraphs.has(text)) {
          $(el).remove();
        } else {
          allParagraphs.add(text);
        }
      }
    });

    // Remove duplicate feature listings/bullet points (common in OpenSea templates)
    const bulletPoints = new Set();
    $('li').each((i, el) => {
      const text = $(el).text().trim();
      if (bulletPoints.has(text)) {
        $(el).remove();
      } else {
        bulletPoints.add(text);
      }
    });

    // Clean up empty elements that might be left after removing content
    $('ul').each((i, el) => {
      if ($(el).children('li').length === 0) {
        $(el).remove();
      }
    });

    // Clean up any sections that have become empty
    $('.ai-content, div[style]').each((i, el) => {
      if ($(el).children().length === 0) {
        $(el).remove();
      }
    });

    // Return the cleaned HTML
    return $.html();
  } catch (error) {
    logger.error(`Error cleaning email content: ${error.message}`);
    return htmlContent; // Return original on error
  }
}

/**
 * Fix duplicate content in a rendered email
 * @param {string} html - Email HTML with potential duplicate content
 * @returns {string} - Deduplicated HTML
 */
function fixDuplicateContent(html) {
  try {
    const $ = cheerio.load(html);
    
    // Check for incorrect structure where aiContent AND default content both appear
    const hasAiContent = $('.ai-content').length > 0;
    const hasDefaultContent = $('div[style*="font-family:Arial,sans-serif"]').length > 0;
    
    // If both content sections are present, remove the default content
    if (hasAiContent && hasDefaultContent) {
      $('div[style*="font-family:Arial,sans-serif"]').remove();
      logger.debug('Removed default content because AI content was present');
    }
    
    // Remove any completely empty divs that might be left
    $('div').each((i, el) => {
      if ($(el).html().trim() === '') {
        $(el).remove();
      }
    });
    
    return $.html();
  } catch (error) {
    logger.error(`Failed to fix duplicate content: ${error.message}`);
    return html;
  }
}

/**
 * Clean up email subject line
 * @param {string} subject - Raw subject line
 * @returns {string} - Cleaned subject line
 */
function cleanSubjectLine(subject) {
  try {
    // Remove excessive emoji
    const emojiPattern = /[\u{1F300}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojis = subject.match(emojiPattern) || [];
    
    // Keep at most one emoji if there are any
    let cleanSubject = subject;
    if (emojis.length > 1) {
      // Remove all emojis
      cleanSubject = subject.replace(emojiPattern, '');
      // Add back the first emoji at the beginning
      cleanSubject = `${emojis[0]} ${cleanSubject.trim()}`;
    }
    
    // Remove excessive punctuation
    cleanSubject = cleanSubject
      .replace(/!{2,}/g, '!') // Multiple exclamations to single
      .replace(/"{2,}/g, '"') // Multiple quotes to single
      .replace(/"([^"]*?)"/g, '$1') // Remove unnecessary quotes
      .replace(/\s+/g, ' '); // Multiple spaces to single
      
    // Remove addressing patterns like "yes, you 👉"
    cleanSubject = cleanSubject.replace(/yes,?\s+you\s+[^\w\s]*\s*/i, '');
    
    // Improve capitalization (Title Case for Each Word)
    cleanSubject = cleanSubject.split(' ')
      .map(word => {
        // Don't capitalize certain small words unless they're at the beginning
        const smallWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by'];
        if (smallWords.includes(word.toLowerCase())) {
          return word.toLowerCase();
        }
        // Otherwise capitalize first letter
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
    
    // Ensure first character is uppercase
    cleanSubject = cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1);
    
    // Remove any trailing emoji that got cut off
    cleanSubject = cleanSubject.replace(/\s*[\u{1F300}-\u{1FAFF}]+\s*$/gu, '');
    
    return cleanSubject.trim();
  } catch (error) {
    logger.error(`Error cleaning subject: ${error.message}`);
    return subject; // Return original on error
  }
}

/**
 * Process email template before sending
 * @param {Object} options - Processing options
 * @returns {Object} - Updated email data
 */
async function processEmailTemplate(options = {}) {
  const { content, subject, templatePath } = options;
  
  // Clean the subject first
  const cleanedSubject = subject ? cleanSubjectLine(subject) : subject;
  
  // If there's direct content, clean it
  if (content) {
    const cleanedContent = cleanEmailContent(content);
    const deduplicatedContent = fixDuplicateContent(cleanedContent);
    return {
      subject: cleanedSubject,
      content: deduplicatedContent
    };
  }
  
  // If there's a template path, load and clean it
  if (templatePath) {
    try {
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const cleanedContent = cleanEmailContent(templateContent);
      const deduplicatedContent = fixDuplicateContent(cleanedContent);
      return {
        subject: cleanedSubject,
        content: deduplicatedContent
      };
    } catch (error) {
      logger.error(`Error processing template file: ${error.message}`);
      throw error;
    }
  }
  
  return { subject: cleanedSubject, content };
}

module.exports = {
  cleanEmailContent,
  cleanSubjectLine,
  processEmailTemplate,
  fixDuplicateContent,
  decodeHtmlEntities
};
