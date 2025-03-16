/**
 * Email content formatter utility
 * Ensures consistent styling and formatting of email content
 */

const logger = require('./logger');

/**
 * Standardizes HTML paragraph formatting for emails
 * @param {string} content - The email content to format
 * @returns {string} - Content with standardized paragraph formatting
 */
function standardizeFormatting(content) {
  try {
    if (!content) return '';

    // Fix duplicate style attributes (common AI generation issue)
    // Look for <p style="..." style="..."> and fix it
    content = content.replace(/<p\s+style="[^"]*"\s+style="[^"]*"/g, match => {
      // Extract just the first style attribute
      const styleMatch = match.match(/<p\s+style="([^"]*)"/);
      if (styleMatch) {
        return `<p style="${styleMatch[1]}"`;  // Fixed missing closing quote
      }
      return match;
    });

    // If content already has proper HTML tags, return with FIXED style attributes
    if (/<p[^>]*>.*?<\/p>/s.test(content)) {
      return content;
    }
    
    // First clean up any AI commentary
    content = content.replace(/^(Here is|This is|Below is|I've created|I have created|Here's an email|Here's a possible).*?:/i, '');
    content = content.replace(/^.*?(without any HTML tags|formatted as plain text).*$/mi, '');
    
    // Remove any existing HTML tags for clean formatting
    content = content.replace(/<[^>]*>/g, '');
    
    // Otherwise treat as plain text and add proper formatting
    // Split by double newlines or single newlines to identify paragraphs
    const paragraphs = content
      .split(/\n\n|\n/)
      .filter(p => p.trim().length > 0)
      .map(p => p.trim());
    
    // Format each paragraph with consistent HTML styling
    return paragraphs
      .map(p => `<p style="margin-bottom: 15px; font-size: 15px; line-height: 1.6;">${p}</p>`)
      .join('\n');
  } catch (error) {
    logger.error(`Error formatting email content: ${error.message}`);
    return content; // Return original content on error
  }
}

/**
 * Cleans up AI-generated content from unwanted formats
 * @param {string} content - The content to clean
 * @returns {string} - Cleaned content
 */
function cleanupAIContent(content) {
  try {
    if (!content) return '';
    
    // Remove common AI artifacts
    let cleaned = content;
    
    // Remove email greeting/signature patterns
    cleaned = cleaned.replace(/^(Dear|Hello|Hi)\s+[\w\s]+,\s*/i, '');
    cleaned = cleaned.replace(/^\s*[Ss]ubject:.*?\n/i, '');
    cleaned = cleaned.replace(/\s*(Best|Sincerely|Regards|Thanks|Thank you|Cheers)[\s,]+.*?$/is, '');
    
    return cleaned;
  } catch (error) {
    logger.error(`Error cleaning up AI content: ${error.message}`);
    return content; // Return original content on error
  }
}

/**
 * Process email content for proper display
 * @param {string} body - The email body content
 * @param {boolean} isHtml - Whether the content is already HTML
 * @returns {string} - Properly formatted HTML content
 */
function formatEmailBody(body, isHtml = false) {
  if (!body) return '';
  
  // Clean up content and remove any meta commentary
  let cleaned = cleanupAIContent(body);
  
  // Remove any lingering HTML tags before processing
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // Split content into paragraphs
  const paragraphs = cleaned
    .split(/\n\n|\n/)
    .filter(p => p.trim().length > 0)
    .map(p => p.trim());
  
  // Format each paragraph with explicit styling
  const formattedHtml = paragraphs
    .map(p => `<p style="margin-bottom: 15px; font-size: 15px; line-height: 1.6;">${p}</p>`)
    .join('\n');
  
  return formattedHtml;
}

/**
 * Decode HTML entities that might be double-encoded
 * @param {string} html - The HTML content with encoded entities
 * @returns {string} - Decoded HTML content
 */
function decodeHtmlEntities(html) {
  if (!html) return '';
  
  // Handle actual HTML strings that should not be decoded
  if (html.includes('<p style="margin-bottom:') && !html.includes('&lt;')) {
    return html;
  }
  
  // Create a temporary element and set its content to the HTML string
  let decoded = html;
  
  // Replace common encoded entities
  decoded = decoded
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&#47;/g, '/');
  
  return decoded;
}

/**
 * Makes content more inbox-friendly by avoiding spam trigger words
 * @param {string} content - The content to process
 * @returns {string} - Inbox-friendly content
 */
function makeInboxFriendly(content) {
  if (!content) return '';
  
  let friendly = content;
  
  // Replace promotional language with more conversational alternatives
  const replacements = [
    [/\bfree\b/gi, 'complimentary'],
    [/\bmoney\b/gi, 'value'],
    [/\bcash\b/gi, 'funds'],
    [/\bargent\b/gi, 'important'],
    [/\bguaranteed\b/gi, 'assured'],
    [/\bexclusive offer\b/gi, 'special opportunity'],
    [/\blimited time\b/gi, 'for a period'],
    [/\bact now\b/gi, 'consider soon'],
    [/\b(buy|sell|offer)\b/gi, 'access'],
    [/\bclick here\b/gi, 'learn more'],
    [/\bdon't miss\b/gi, 'consider'],
    [/\bspecial\b/gi, 'unique'],
    [/\bpromot(e|ion|ional)\b/gi, 'announce'],
    [/\bmillion\b/gi, 'many'],
    [/\bdiscount\b/gi, 'benefit'],
    [/\bsave\b/gi, 'keep'],
    [/\bbonus\b/gi, 'additional'],
    [/\bwinning\b/gi, 'succeeding'],
    [/\bprice\b/gi, 'value'],
    [/\bcost\b/gi, 'investment']
  ];
  
  // Apply replacements
  replacements.forEach(([pattern, replacement]) => {
    friendly = friendly.replace(pattern, replacement);
  });
  
  return friendly;
}

module.exports = {
  formatEmailBody,
  standardizeFormatting,
  cleanupAIContent,
  makeInboxFriendly,
  decodeHtmlEntities
};
