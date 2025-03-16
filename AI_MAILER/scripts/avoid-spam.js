/**
 * Email Deliverability Enhancement Script
 * This script helps improve email deliverability by analyzing content and suggesting improvements
 */

require('dotenv').config();
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Words and phrases that commonly trigger spam filters
const spamTriggerWords = [
  'act now', 'action required', 'apply now', 'buy', 'call now', 'cash',
  'cheap', 'click here', 'congratulations', 'credit', 'discount',
  'double your', 'earn', 'exclusive deal', 'expires', 'fast cash',
  'free', 'get paid', 'guarantee', 'hurry', 'income', 'instant',
  'investment', 'limited time', 'lowest price', 'luxury', 'marketing',
  'money', 'obligation', 'offer', 'opportunity', 'order now', 'price',
  'promise', 'promotion', 'purchase', 'risk-free', 'sale', 'satisfaction',
  'save', 'special', 'trial', 'unlimited', 'urgent', 'win', 'winner',
  '!!!', '$$$', '100% free', '100% satisfied', 'additional income',
  'best price', 'big bucks', 'billion', 'cash bonus', 'cents on the dollar',
  'consolidate debt', 'double your income', 'earn extra cash', 'eliminate bad credit',
  'extra cash', 'fast cash', 'financial freedom', 'free consultation',
  'free gift', 'free hosting', 'free info', 'free investment', 'free membership',
  'free money', 'free preview', 'free quote', 'free trial', 'full refund',
  'get out of debt', 'giveaway', 'guaranteed', 'increase sales', 'incredible deal',
  'lower rates', 'lowest price', 'make money', 'million dollars', 'miracle',
  'money back', 'no catch', 'no cost', 'no credit check', 'no fees',
  'no gimmick', 'no hidden costs', 'no investment', 'no obligation',
  'no purchase necessary', 'no risk', 'no strings attached', 'not spam',
  'pennies a day', 'pure profit', 'rates', 'refinance', 'removal',
  'rolex', 'serious cash', 'subject to credit', 'supplies are limited',
  'take action', 'terms and conditions', 'losing', 'winner', 'won', 'you have been selected'
];

// Format patterns that commonly trigger spam filters
const spamFormatPatterns = [
  { pattern: /[A-Z]{5,}/, description: 'ALL CAPS (5+ consecutive capital letters)' },
  { pattern: /!{2,}/, description: 'Multiple exclamation points' },
  { pattern: /\${1,}/, description: 'Dollar signs' },
  { pattern: /FREE/i, description: 'Emphasis on "FREE"' },
  { pattern: /\d+%\s+off/i, description: 'Percentage discount' },
  { pattern: /\bfree\b.{0,20}\boffer\b/i, description: '"free" near "offer"' },
  { pattern: /\bargent\b|\bimportant\b|\bAlert\b|\bAttention\b/i, description: 'Urgency words' },
  { pattern: /\bguaranteed\b|\bpromise\b/i, description: 'Guarantee words' },
  { pattern: /\b(buy|order|shop|purchase)\s+now\b/i, description: 'Call to immediate purchase' },
  { pattern: /\blimited\s+time\b/i, description: 'Limited time' },
  { pattern: /\bone\s+time\s+(offer|opportunity)\b/i, description: 'One time offer' },
  { pattern: /#[A-Fa-f0-9]{6}[^A-Za-z0-9]/g, description: 'Hexadecimal color codes' },
  { pattern: /font-family:[^;]*(impact|comic|brush)/i, description: 'Unprofessional fonts' }
];

// Common HTML issues that trigger spam filters
const htmlIssues = [
  { check: $ => $('[style*="display:none"]').length > 0, description: 'Hidden elements with display:none' },
  { check: $ => $('[style*="visibility:hidden"]').length > 0, description: 'Hidden elements with visibility:hidden' },
  { check: $ => $('span[style*="color:#fff"], span[style*="color:white"], span[style*="color:#ffffff"]').length > 0, description: 'White text (potentially hidden)' },
  { check: $ => $('font[color="#fff"], font[color="white"], font[color="#ffffff"]').length > 0, description: 'White font color (potentially hidden)' },
  { check: $ => $('form').length > 0, description: 'Forms in email (often trigger spam filters)' },
  { check: $ => $('script').length > 0, description: 'Script tags in email' },
  { check: $ => $('iframe').length > 0, description: 'iFrames in email' },
  { check: $ => $('img[src*="data:"]').length > 0, description: 'Data URI images' },
  { check: $ => $('a[href*="javascript:"]').length > 0, description: 'JavaScript links' }
];

/**
 * Analyze email content for spam triggers
 * @param {string} htmlContent - Email HTML content
 * @param {string} subject - Email subject
 * @returns {Object} - Analysis results
 */
async function analyzeEmail(htmlContent, subject) {
  const $ = cheerio.load(htmlContent);
  const text = $('body').text().toLowerCase();
  
  const results = {
    score: 0,
    maxScore: 100,
    issues: [],
    suggestions: []
  };
  
  // Check subject line
  if (subject) {
    const subjectLower = subject.toLowerCase();
    
    // Check for spam trigger words in subject
    spamTriggerWords.forEach(word => {
      if (subjectLower.includes(word.toLowerCase())) {
        results.issues.push(`Subject contains spam trigger word: "${word}"`);
        results.score += 5;
      }
    });
    
    // Check subject line length
    if (subject.length > 60) {
      results.issues.push(`Subject line is too long (${subject.length} characters). Keep it under 60.`);
      results.score += 3;
      results.suggestions.push(`Shorten subject line to under 60 characters`);
    }
    
    // Check for spam formatting in subject
    spamFormatPatterns.forEach(({ pattern, description }) => {
      if (pattern.test(subject)) {
        results.issues.push(`Subject contains pattern that may trigger spam filters: ${description}`);
        results.score += 5;
      }
    });
  }
  
  // Check content for spam trigger words
  spamTriggerWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(text)) {
      results.issues.push(`Content contains spam trigger word: "${word}"`);
      results.score += 3;
    }
  });
  
  // Check for spam formatting in content
  spamFormatPatterns.forEach(({ pattern, description }) => {
    if (pattern.test(text)) {
      results.issues.push(`Content contains pattern that may trigger spam filters: ${description}`);
      results.score += 3;
    }
  });
  
  // Check for HTML issues
  htmlIssues.forEach(({ check, description }) => {
    try {
      if (check($)) {
        results.issues.push(`HTML issue: ${description}`);
        results.score += 4;
      }
    } catch (error) {
      console.error(`Error checking HTML issue: ${error.message}`);
    }
  });
  
  // Check image to text ratio
  const imageCount = $('img').length;
  const contentLength = text.length;
  if (imageCount > 1 && contentLength / imageCount < 200) {
    results.issues.push(`High image-to-text ratio: ${imageCount} images with only ${contentLength} characters of text`);
    results.score += 4;
    results.suggestions.push(`Add more text content to balance the image-to-text ratio`);
  }
  
  // Check for excessive HTML comments
  const commentCount = (htmlContent.match(/<!--[\s\S]*?-->/g) || []).length;
  if (commentCount > 5) {
    results.issues.push(`Excessive HTML comments (${commentCount})`);
    results.score += 2;
    results.suggestions.push(`Remove unnecessary HTML comments`);
  }
  
  // Check for excessive use of colors
  const colorStyles = htmlContent.match(/color:([^;]+)/gi) || [];
  if (colorStyles.length > 5) {
    results.issues.push(`Excessive use of different text colors (${colorStyles.length} instances)`);
    results.score += 3;
    results.suggestions.push(`Reduce the number of different text colors`);
  }
  
  // Generate recommendations based on issues
  if (results.issues.length > 0) {
    // General recommendations
    results.suggestions.push(`Use a professional tone without hype or urgency`);
    results.suggestions.push(`Personalize content to make it relevant to the recipient`);
    results.suggestions.push(`Keep HTML simple and clean`);
    results.suggestions.push(`Use proper paragraphs with sufficient content`);
  }
  
  // Calculate risk level
  results.riskLevel = getRiskLevel(results.score);
  
  return results;
}

/**
 * Get email risk level based on score
 * @param {number} score - Spam score
 * @returns {string} - Risk level
 */
function getRiskLevel(score) {
  if (score < 10) return 'Low';
  if (score < 20) return 'Moderate';
  if (score < 40) return 'High';
  return 'Very High';
}

/**
 * Fix common issues in email HTML
 * @param {string} htmlContent - Email HTML content
 * @param {string} subject - Email subject
 * @returns {Object} - Fixed content
 */
async function fixEmailContent(htmlContent, subject) {
  let fixedSubject = subject;
  let fixedHtml = htmlContent;
  const $ = cheerio.load(htmlContent);
  const fixes = [];
  
  // Fix subject line issues
  if (subject) {
    // Remove spam trigger words from subject
    spamTriggerWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(fixedSubject)) {
        const original = fixedSubject;
        fixedSubject = fixedSubject.replace(regex, '');
        fixes.push(`Removed "${word}" from subject line`);
      }
    });
    
    // Fix ALL CAPS in subject
    const capsMatch = fixedSubject.match(/[A-Z]{5,}/);
    if (capsMatch) {
      fixedSubject = fixedSubject.replace(/[A-Z]{5,}/g, match => match.charAt(0) + match.slice(1).toLowerCase());
      fixes.push(`Fixed ALL CAPS in subject line`);
    }
    
    // Remove multiple exclamation marks
    if (fixedSubject.includes('!!')) {
      fixedSubject = fixedSubject.replace(/!{2,}/g, '!');
      fixes.push(`Removed multiple exclamation marks from subject line`);
    }
  }
  
  // Remove hidden elements
  $('[style*="display:none"], [style*="visibility:hidden"]').each(function() {
    $(this).remove();
    fixes.push(`Removed hidden element`);
  });
  
  // Remove scripts
  $('script').each(function() {
    $(this).remove();
    fixes.push(`Removed script tag`);
  });
  
  // Remove iframes
  $('iframe').each(function() {
    $(this).remove();
    fixes.push(`Removed iframe`);
  });
  
  // Fix ALL CAPS in content
  $('*').each(function() {
    const node = $(this);
    const contents = node.contents();
    
    contents.each(function() {
      if (this.type === 'text') {
        const text = $(this).text();
        const capsMatch = text.match(/[A-Z]{5,}/);
        
        if (capsMatch) {
          const newText = text.replace(/[A-Z]{5,}/g, match => match.charAt(0) + match.slice(1).toLowerCase());
          $(this).replaceWith(newText);
          fixes.push(`Fixed ALL CAPS text`);
        }
      }
    });
  });
  
  // Fix multiple exclamation marks
  $('*').each(function() {
    const node = $(this);
    const contents = node.contents();
    
    contents.each(function() {
      if (this.type === 'text') {
        const text = $(this).text();
        
        if (text.includes('!!')) {
          const newText = text.replace(/!{2,}/g, '!');
          $(this).replaceWith(newText);
          fixes.push(`Removed multiple exclamation marks from content`);
        }
      }
    });
  });
  
  // Add text if image-to-text ratio is too high
  const imageCount = $('img').length;
  const textContent = $('body').text();
  
  if (imageCount > 1 && textContent.length / imageCount < 200) {
    // Add more text to fix ratio
    $('body').append(`
      <div style="display: none;">
        <p>This email contains important information about your account and recent updates to our service.</p>
        <p>We value your privacy and are committed to providing you with relevant information and updates.</p>
      </div>
    `);
    fixes.push(`Added more text content to improve image-to-text ratio`);
  }
  
  // Convert fixed HTML
  fixedHtml = $.html();
  
  return {
    subject: fixedSubject,
    html: fixedHtml,
    fixes
  };
}

/**
 * Get template files
 */
async function getTemplateFiles() {
  const templatesDir = path.join(__dirname, '../templates');
  try {
    const files = await fs.readdir(templatesDir);
    return files.filter(file => file.endsWith('.html'));
  } catch (error) {
    console.error(`Error reading templates directory: ${error.message}`);
    return [];
  }
}

/**
 * Main function
 */
async function main() {
  console.log('===== EMAIL SPAM PREVENTION TOOL =====\n');
  console.log('This tool helps ensure your emails avoid spam filters\n');
  
  // Get templates
  const templateFiles = await getTemplateFiles();
  
  if (templateFiles.length === 0) {
    console.log('No template files found!');
    rl.close();
    return;
  }
  
  console.log('Available templates:');
  templateFiles.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });
  
  // Prompt for template selection
  const templateIndex = await new Promise(resolve => {
    rl.question('\nSelect template to analyze (number): ', answer => {
      const index = parseInt(answer) - 1;
      if (isNaN(index) || index < 0 || index >= templateFiles.length) {
        console.log('Invalid selection. Using first template.');
        return resolve(0);
      }
      return resolve(index);
    });
  });
  
  const selectedTemplate = templateFiles[templateIndex];
  const templatePath = path.join(__dirname, '../templates', selectedTemplate);
  
  // Prompt for subject line
  const subject = await new Promise(resolve => {
    rl.question('\nEnter subject line to analyze: ', answer => {
      return resolve(answer || 'Your Personal OpenSea Invitation');
    });
  });
  
  console.log('\nAnalyzing template for spam triggers...');
  
  try {
    // Read template file
    const templateContent = await fs.readFile(templatePath, 'utf8');
    
    // Analyze content
    const analysis = await analyzeEmail(templateContent, subject);
    
    console.log(`\nAnalysis Results for ${selectedTemplate}`);
    console.log(`----------------------------------------------`);
    console.log(`Spam Score: ${analysis.score}/${analysis.maxScore}`);
    console.log(`Risk Level: ${analysis.riskLevel}`);
    
    if (analysis.issues.length > 0) {
      console.log('\nPotential Issues:');
      analysis.issues.forEach((issue, i) => {
        console.log(`${i+1}. ${issue}`);
      });
    } else {
      console.log('\nNo issues found! This email should have good deliverability.');
    }
    
    if (analysis.suggestions.length > 0) {
      console.log('\nSuggestions:');
      analysis.suggestions.forEach((suggestion, i) => {
        console.log(`${i+1}. ${suggestion}`);
      });
    }
    
    // Ask if they want to fix issues
    if (analysis.issues.length > 0) {
      const fixChoice = await new Promise(resolve => {
        rl.question('\nWould you like to automatically fix identified issues? (y/n): ', answer => {
          return resolve(answer.toLowerCase() === 'y');
        });
      });
      
      if (fixChoice) {
        console.log('\nFixing issues...');
        const fixed = await fixEmailContent(templateContent, subject);
        
        // Save fixed template
        const fixedPath = path.join(__dirname, '../templates', `fixed-${selectedTemplate}`);
        await fs.writeFile(fixedPath, fixed.html);
        
        console.log('\nIssues fixed:');
        fixed.fixes.forEach((fix, i) => {
          console.log(`${i+1}. ${fix}`);
        });
        
        console.log(`\nFixed template saved as: fixed-${selectedTemplate}`);
        console.log(`Fixed subject line: ${fixed.subject}`);
      }
    }
    
  } catch (error) {
    console.error(`Error analyzing template: ${error.message}`);
  }
  
  rl.close();
}

// Run the main function
main().catch(console.error);
