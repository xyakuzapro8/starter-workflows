/**
 * Email Content Cleaner
 * Command-line tool to clean up email content
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const { cleanEmailContent, cleanSubjectLine } = require('./fix-email-content');

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
 * Fix encoding issues with HTML entities in an email
 * @param {string} htmlContent - HTML content with potential encoding issues
 * @returns {string} - Fixed HTML content
 */
function fixEncodingIssues(htmlContent) {
  try {
    // Check for encoded HTML tags in content
    if (htmlContent.includes('&lt;div') || htmlContent.includes('&lt;p')) {
      console.log('Detected HTML encoding issues, fixing...');
      
      // Replace common HTML entities
      return htmlContent
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
    }
    
    return htmlContent;
  } catch (error) {
    console.error(`Error fixing encoding issues: ${error.message}`);
    return htmlContent;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('===== EMAIL CONTENT CLEANER =====');
  
  // Get input - either file or direct input
  const inputType = await ask('Clean from [1] file or [2] direct input? (1/2): ');
  
  let htmlContent = '';
  let subject = '';
  
  if (inputType === '1') {
    // Get file path
    const filePath = await ask('Enter path to HTML file: ');
    try {
      htmlContent = await fs.readFile(filePath, 'utf8');
      console.log(`Read ${htmlContent.length} characters from file`);
    } catch (error) {
      console.error(`Error reading file: ${error.message}`);
      rl.close();
      return;
    }
  } else {
    // Get direct input
    console.log('Enter HTML content (end with Ctrl+D on Linux/Mac or Ctrl+Z on Windows):');
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    htmlContent = chunks.join('');
  }
  
  // Get subject line
  subject = await ask('Enter email subject line (optional): ');
  
  // Clean content
  try {
    console.log('\nCleaning content...');
    
    // First fix any encoding issues
    htmlContent = fixEncodingIssues(htmlContent);
    
    // Check if this looks like an OpenSea email for specialized cleaning
    const isOpenSea = htmlContent.includes('OpenSea') || 
                     htmlContent.includes('NFT') || 
                     htmlContent.includes('opensea-static') ||
                     (subject && (subject.includes('OpenSea') || subject.includes('NFT')));
    
    let cleanedHtml, cleanedSubject;
    
    if (isOpenSea) {
      console.log('Detected OpenSea template, applying specialized cleaning...');
      const openSeaFixer = require('./fix-opensea-template');
      const result = await openSeaFixer.processOpenSeaEmail({
        html: htmlContent,
        subject: subject
      });
      
      cleanedHtml = result.html;
      cleanedSubject = result.subject;
    } else {
      // Use standard cleaning
      console.log('Applying standard content cleaning...');
      cleanedHtml = cleanEmailContent(htmlContent);
      cleanedSubject = subject ? cleanSubjectLine(subject) : '';
    }
    
    // Generate output file name
    const outputPath = path.join(__dirname, '..', 'cleaned-email.html');
    await fs.writeFile(outputPath, cleanedHtml, 'utf8');
    
    // Show results
    console.log('\n===== RESULTS =====');
    
    if (subject) {
      console.log('Original subject:', subject);
      console.log('Cleaned subject:', cleanedSubject);
    }
    
    console.log(`\nOriginal size: ${htmlContent.length} characters`);
    console.log(`Cleaned size: ${cleanedHtml.length} characters`);
    console.log(`Reduction: ${Math.round((htmlContent.length - cleanedHtml.length) / htmlContent.length * 100)}%`);
    
    console.log(`\nCleaned content saved to: ${outputPath}`);
    console.log('\nDone!');
  } catch (error) {
    console.error(`Error cleaning content: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}
