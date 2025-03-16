/**
 * Email HTML Entity Fixer
 * Fixes issues with double-encoded HTML entities in email content
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ask question helper
function ask(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

/**
 * Decode HTML entities into their character equivalents
 * @param {string} html - HTML content with encoded entities
 * @returns {string} - Decoded HTML
 */
function decodeHtmlEntities(html) {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Fix double-encoded HTML entities in email content
 * @param {string} htmlContent - Input HTML
 * @returns {string} - Fixed HTML
 */
function fixHtmlEntities(htmlContent) {
  try {
    // First check if the content needs fixing
    if (!htmlContent.includes('&lt;') && !htmlContent.includes('&gt;')) {
      console.log('No HTML entity issues detected.');
      return htmlContent;
    }
    
    console.log('Found HTML entity issues, fixing...');
    
    // First pass - decode at string level
    const preProcessed = decodeHtmlEntities(htmlContent);
    
    // Second pass - use Cheerio for specific elements
    const $ = cheerio.load(preProcessed);
    
    // Fix issues in ai-content specifically
    $('.ai-content').each((i, el) => {
      let content = $(el).html();
      
      // Check if content still has encoded entities
      if (content && (content.includes('&lt;') || content.includes('&gt;'))) {
        content = decodeHtmlEntities(content);
        $(el).html(content);
      }
    });
    
    // Also handle other divs that might contain encoded HTML
    $('div, td').each((i, el) => {
      const content = $(el).html();
      
      // Only fix if the content looks like HTML but is encoded
      if (content && 
          (content.includes('&lt;div') || 
           content.includes('&lt;p') || 
           content.includes('&lt;ul'))) {
        
        $(el).html(decodeHtmlEntities(content));
      }
    });
    
    return $.html();
  } catch (error) {
    console.error(`Error fixing HTML entities: ${error.message}`);
    return htmlContent;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('===== HTML ENTITY FIXER =====');
  console.log('This script fixes issues with double-encoded HTML entities in emails\n');
  
  // Get input file
  const filePath = await ask('Enter path to HTML file: ');
  
  try {
    // Read file
    const htmlContent = await fs.readFile(filePath, 'utf8');
    console.log(`Read ${htmlContent.length} characters from file`);
    
    // Fix HTML entities
    const fixedHtml = fixHtmlEntities(htmlContent);
    
    // Save fixed content
    const outputPath = path.join(path.dirname(filePath), 'fixed-entities-email.html');
    await fs.writeFile(outputPath, fixedHtml, 'utf8');
    
    console.log(`\nFixed HTML saved to: ${outputPath}`);
    
    // Report if changes were made
    if (fixedHtml.length !== htmlContent.length) {
      console.log(`\nChanges made: Original ${htmlContent.length} characters → Fixed ${fixedHtml.length} characters`);
    } else {
      console.log('\nNo significant changes were needed');
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  fixHtmlEntities,
  decodeHtmlEntities
};
