/**
 * OpenSea Email Template Fixer
 */

const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// Import logger with fallback
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
 * Clean up OpenSea email template specifically
 * @param {string} htmlContent - HTML content to clean
 * @returns {string} - Cleaned HTML content
 */
function cleanOpenSeaTemplate(htmlContent) {
  try {
    // First decode any HTML entities that might be double-encoded
    const decodeEntities = (html) => {
      return html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
    };
    
    htmlContent = decodeEntities(htmlContent);
    
    const $ = cheerio.load(htmlContent);
    
    // Fix AI content HTML entity issues
    $('.ai-content').each((i, el) => {
      let content = $(el).html();
      
      // Check if content has encoded HTML entities
      if (content && (content.includes('&lt;') || content.includes('&gt;'))) {
        // Decode the content
        content = decodeEntities(content);
        
        // Replace with properly decoded content
        $(el).html(content);
      }
    });
    
    // Store seen content to detect duplicates
    const seenParagraphs = new Set();
    const seenBenefits = new Set();
    let greetingSeen = false;
    
    // Fix duplicate greeting issue between AI content and template content
    if ($('.ai-content').length && $('.content h2').length) {
      // Check if we have both AI greetings and template greetings
      $('.ai-content p').each((i, el) => {
        const text = $(el).text().trim();
        if (text.match(/^(hello|hi|hey)\s+\w+/i)) {
          greetingSeen = true;
        }
      });
      
      // If we found AI greeting, remove template greeting
      if (greetingSeen) {
        $('.content h2').each((i, el) => {
          const text = $(el).text().trim();
          if (text.match(/^(hello|hi|hey)\s+\w+/i)) {
            $(el).remove();
          }
        });
      }
    }
    
    // Remove duplicate paragraphs between AI content and regular content
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) { // Only consider substantive paragraphs
        if (seenParagraphs.has(text)) {
          $(el).remove();
        } else {
          seenParagraphs.add(text);
        }
      }
    });
    
    // Remove duplicate benefit items (OpenSea specific)
    $('.benefit-item').each((i, el) => {
      const title = $(el).find('h3').text().trim();
      if (seenBenefits.has(title)) {
        $(el).remove();
      } else {
        seenBenefits.add(title);
      }
    });
    
    // Fix the bulletPoints.has/add issue
    const bulletPoints = new Set();
    $('li').each((i, el) => {
      const text = $(el).text().trim();
      if (bulletPoints.has(text)) {
        $(el).remove();
      } else {
        bulletPoints.add(text); // Changed from bulletPoints.has(text) to bulletPoints.add(text)
      }
    });
    
    // Clean empty containers
    $('ul').each((i, el) => {
      if ($(el).children('li').length === 0) {
        $(el).remove();
      }
    });
    
    return $.html();
  } catch (error) {
    logger.error(`Error cleaning OpenSea template: ${error.message}`);
    return htmlContent;
  }
}

/**
 * Fix problematic subject lines with unusual characters
 * @param {string} subject - Original subject line
 * @returns {string} - Fixed subject line
 */
function fixOpenSeaSubject(subject) {
  try {
    // Remove unusual Unicode characters that might cause display issues
    let cleanSubject = subject
      // Fix special Unicode blocks that often cause issues
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '') // Remove Unicode blocks beyond basic emojis
      .replace(/𝗨𝗽𝗽𝗹𝗶𝗻|𝗗𝗼𝗽|𝗥𝗮𝗱/g, function(match) {
        // Convert mathematical bold to regular characters
        return match
          .normalize('NFKD') // Normalize to decomposed form
          .replace(/[\u0300-\u036f]/g, '') // Remove combining marks
          .replace(/\uFFFD/g, ''); // Remove replacement character
      })
      .replace(/[^\x00-\x7F]/g, ''); // Remove remaining non-ASCII characters
      
    // Fix common problematic patterns in OpenSea subjects
    cleanSubject = cleanSubject
      .replace(/^\s*💫|🔥|🚨\s*/g, '') // Remove leading emojis
      .replace(/\s{2,}/g, ' '); // Fix multiple spaces
      
    // If the subject is now empty or too short, provide a default
    if (cleanSubject.length < 5) {
      cleanSubject = "OpenSea Early Access Invitation";
    }
    
    return cleanSubject.trim();
  } catch (error) {
    logger.error(`Error fixing OpenSea subject: ${error.message}`);
    return "OpenSea Early Access Invitation"; // Default if errors occur
  }
}

/**
 * Process OpenSea email for better deliverability
 * @param {Object} options - Processing options 
 * @returns {Object} - Processed email content
 */
async function processOpenSeaEmail(options = {}) {
  try {
    const { html, subject, templatePath } = options;
    
    // Get content from either direct HTML or template file
    let content = html;
    if (!content && templatePath) {
      content = await fs.readFile(templatePath, 'utf8');
    }
    
    // Clean the content
    const cleanedContent = content ? cleanOpenSeaTemplate(content) : null;
    
    // Fix the subject
    const cleanedSubject = subject ? fixOpenSeaSubject(subject) : null;
    
    return {
      html: cleanedContent,
      subject: cleanedSubject
    };
  } catch (error) {
    logger.error(`Error processing OpenSea email: ${error.message}`);
    return { html: options.html, subject: options.subject };
  }
}

module.exports = {
  cleanOpenSeaTemplate,
  fixOpenSeaSubject,
  processOpenSeaEmail
};
