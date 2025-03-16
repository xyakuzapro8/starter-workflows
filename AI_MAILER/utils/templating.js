/**
 * Email template rendering utilities
 */

const fs = require('fs');
const path = require('path');
const nunjucks = require('nunjucks');
const logger = require('./logger');
const emailFormatter = require('./emailFormatter');

// Configure nunjucks
const nunjucksEnv = nunjucks.configure(path.join(__dirname, '..', 'templates'), {
  autoescape: false, // Important: Do not escape HTML in our templates
  watch: false
});

// Add a safe filter that doesn't double-escape HTML content
nunjucksEnv.addFilter('safe', function(str) {
  return new nunjucks.runtime.SafeString(str || '');
});

// Add a startswith filter to check if a string starts with a given substring
nunjucksEnv.addFilter('startswith', function(str, substr) {
  if (!str) return false;
  return str.toLowerCase().trim().startsWith(substr.toLowerCase());
});

/**
 * Render an email template with data
 * @param {string} templateName - The name of the template to render
 * @param {Object} data - Data to pass to the template
 * @returns {Promise<string>} - The rendered HTML
 */
async function renderTemplate(templateName, data = {}) {
  try {
    const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template "${templateName}" not found at ${templatePath}`);
    }
    
    // Clean up the body data before rendering if it exists
    if (data.body) {
      // Fix duplicate style attributes in paragraphs
      data.body = data.body.replace(/<p\s+style="[^"]*"\s+style="[^"]*"/g, match => {
        // Extract just the first style attribute
        const styleMatch = match.match(/<p\s+style="([^"]*)"/);
        if (styleMatch) {
          return `<p style="${styleMatch[1]}"`;
        }
        return match;
      });
      
      // Get recipient name for substitution
      const recipientName = data.recipientData?.name || 
                           (data.recipientData?.email && data.recipientData.email.split('@')[0]) || 
                           'there';
      
      // Replace any [Recipient] placeholders with the actual recipient name
      data.body = data.body.replace(/\[Recipient\]/g, recipientName);
      
      // Replace generic "Hello," with personalized greeting
      data.body = data.body.replace(/<p[^>]*>Hello,/i, `<p style="margin-bottom: 15px; font-size: 15px; line-height: 1.6;">Hello ${recipientName},`);
      
      // Remove any meta commentary lines that might have slipped through
      const cleanedParagraphs = data.body
        .split(/\n/)
        .filter(line => !line.match(/^<p[^>]*>(Here is|This is|Below is|I've created|I have created|Here's)/i))
        .join('\n');
        
      data.body = cleanedParagraphs;
    }
    
    // Render the template with clean data
    const rendered = nunjucks.render(`${templateName}.html`, data);
    
    // Check for any remaining [Recipient] placeholders and replace them
    let finalOutput = rendered;
    if (data.recipientData?.name || data.recipientData?.email) {
      const recipientName = data.recipientData.name || 
                          (data.recipientData.email && data.recipientData.email.split('@')[0]) || 
                          'there';
                          
      finalOutput = finalOutput.replace(/\[Recipient\]/g, recipientName);
    }
    
    // Log success
    logger.info(`Template "${templateName}" rendered successfully`);
    return finalOutput;
  } catch (error) {
    logger.error(`Error rendering template "${templateName}": ${error.message}`);
    throw error;
  }
}

module.exports = {
  renderTemplate,
  nunjucksEnv
};
