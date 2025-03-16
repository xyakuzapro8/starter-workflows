/**
 * Email Validator and Spam Score Checker
 * This tool helps you analyze your emails for spam triggers
 */

const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Common spam trigger words
const spamTriggerWords = [
  'urgent', 'emergency', 'act now', 'action required', 'winner', 'congratulations',
  'free', 'guarantee', 'cash', 'credit', 'income', 'million', 'billion',
  'discount', 'offer', 'limited time', 'promotion', 'bonus', 
  'viagra', 'pharmacy', 'medicine', 'pills', 'prescription',
  'casino', 'lottery', 'prize', 'won', 'winning', 'debt', 'investment',
  'please help', 'donation', 'charity', 'nigeria', 'prince', 'bank transfer',
  'risk-free', 'satisfaction guaranteed', 'unlimited', 'miracle', 'cure', 'weight loss',
  '!!!', '$$$', '100%', 'best price', 'order now', 'click here', 'apply now', 'call now'
];

// Spam patterns (regex)
const spamPatterns = [
  /[A-Z]{5,}/g, // Five or more consecutive capital letters
  /!{2,}/g, // Two or more consecutive exclamation marks
  /\${2,}/g, // Two or more consecutive dollar signs
  /\d+%\s+off/gi, // Percentage off
  /^subject:.+!/im, // Subject line with exclamation mark
  /\bfree\b.{0,20}\boffer\b/i, // "Free" near "offer"
  /\bunsubscribe\b/i, // Unsubscribe text (often triggers spam filters if not properly formatted)
];

/**
 * Analyze an HTML email for spam triggers
 * @param {string} htmlContent - The HTML content of the email
 * @param {string} subject - The email subject
 * @returns {Object} - Analysis results
 */
async function analyzeEmail(htmlContent, subject) {
  const results = {
    score: 0,
    maxPossibleScore: 100,
    issues: [],
    htmlIssues: [],
    subjectIssues: [],
    recommendations: []
  };
  
  // Load HTML into cheerio
  const $ = cheerio.load(htmlContent);
  
  // Get text content
  const textContent = $('body').text().toLowerCase();
  
  // Check subject for spam triggers
  if (subject) {
    const subjectLower = subject.toLowerCase();
    
    // Check for spam trigger words in subject
    spamTriggerWords.forEach(word => {
      if (subjectLower.includes(word.toLowerCase())) {
        results.subjectIssues.push(`Subject contains spam trigger word: "${word}"`);
        results.score += 5;
      }
    });
    
    // Check for spam patterns in subject
    spamPatterns.forEach(pattern => {
      if (pattern.test(subject)) {
        results.subjectIssues.push(`Subject matches spam pattern: ${pattern}`);
        results.score += 7;
      }
    });
    
    // Check subject length
    if (subject.length > 60) {
      results.subjectIssues.push(`Subject line is too long (${subject.length} characters). Keep it under 60.`);
      results.score += 3;
    }
    
    // Check for special characters in subject
    if (/[*$#%!+]/.test(subject)) {
      results.subjectIssues.push(`Subject contains special characters that may trigger spam filters`);
      results.score += 4;
    }
    
    // Check for emojis
    if (/[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(subject)) {
      results.subjectIssues.push(`Subject contains emojis which may trigger spam filters`);
      results.score += 3;
    }
  }
  
  // Check content for spam triggers
  spamTriggerWords.forEach(word => {
    if (textContent.includes(word.toLowerCase())) {
      results.issues.push(`Content contains spam trigger word: "${word}"`);
      results.score += 3;
    }
  });
  
  // Check for spam patterns in content
  spamPatterns.forEach(pattern => {
    if (pattern.test(textContent)) {
      results.issues.push(`Content matches spam pattern: ${pattern}`);
      results.score += 4;
    }
  });
  
  // Check HTML structure
  if (htmlContent.includes('<style') && htmlContent.match(/<style/g).length > 3) {
    results.htmlIssues.push(`Too many style tags (${htmlContent.match(/<style/g).length})`);
    results.score += 3;
  }
  
  // Check image/text ratio
  const imageCount = $('img').length;
  const textLength = textContent.length;
  if (imageCount > 3 && textLength / imageCount < 100) {
    results.htmlIssues.push(`High image-to-text ratio (${imageCount} images, ${textLength} characters)`);
    results.score += 5;
  }
  
  // Check for excessive HTML comments
  const commentCount = (htmlContent.match(/<!--[\s\S]*?-->/g) || []).length;
  if (commentCount > 5) {
    results.htmlIssues.push(`Excessive HTML comments (${commentCount})`);
    results.score += 2;
  }
  
  // Check for invisible text
  if ($('[style*="display:none"], [style*="visibility:hidden"], [style*="opacity:0"]').length > 0) {
    results.htmlIssues.push(`Contains potentially hidden text (may be legitimate, but check usage)`);
    results.score += 4;
  }
  
  // Generate recommendations
  if (results.subjectIssues.length > 0) {
    results.recommendations.push(`Revise the subject line to avoid spam triggers`);
  }
  
  if (results.issues.filter(issue => issue.includes('spam trigger word')).length > 0) {
    results.recommendations.push(`Replace spam trigger words with alternatives`);
  }
  
  if (results.score > 20) {
    results.recommendations.push(`Simplify HTML structure and reduce complexity`);
  }
  
  if (results.score > 30) {
    results.recommendations.push(`Consider a complete rewrite with plain, straightforward language`);
  }
  
  return results;
}

/**
 * Get template files from templates directory
 */
async function getTemplateFiles() {
  try {
    const templatesDir = path.join(__dirname, '../templates');
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
  console.log('===== EMAIL SPAM ANALYZER =====');
  console.log('This tool analyzes email templates for potential spam triggers\n');

  // Get template files
  const templateFiles = await getTemplateFiles();
  if (templateFiles.length === 0) {
    console.log('No template files found');
    rl.close();
    return;
  }

  // List templates
  console.log('Available templates:');
  templateFiles.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });

  // Get user selection
  const templateIndex = await new Promise(resolve => {
    rl.question('\nEnter template number to analyze (or press Enter to analyze all): ', answer => {
      if (!answer.trim()) return resolve(-1); // Analyze all
      const index = parseInt(answer.trim()) - 1;
      if (isNaN(index) || index < 0 || index >= templateFiles.length) {
        console.log('Invalid selection. Will analyze all templates.');
        return resolve(-1);
      }
      return resolve(index);
    });
  });

  // Get test subject
  const subject = await new Promise(resolve => {
    rl.question('\nEnter a test subject line (or press Enter for default): ', answer => {
      if (!answer.trim()) return resolve('OpenSea Information');
      return resolve(answer.trim());
    });
  });

  console.log('\nAnalyzing email template(s) for spam triggers...');

  if (templateIndex === -1) {
    // Analyze all templates
    for (const file of templateFiles) {
      await analyzeTemplate(file, subject);
    }
  } else {
    // Analyze selected template
    await analyzeTemplate(templateFiles[templateIndex], subject);
  }

  rl.close();
}

/**
 * Analyze a specific template
 */
async function analyzeTemplate(fileName, subject) {
  try {
    console.log(`\n----- Analyzing ${fileName} -----`);
    
    const filePath = path.join(__dirname, '../templates', fileName);
    const content = await fs.readFile(filePath, 'utf8');
    
    const results = await analyzeEmail(content, subject);
    
    console.log(`\nSpam Score: ${results.score}/${results.maxPossibleScore}`);
    console.log('Risk Level:', getRiskLevel(results.score));
    
    if (results.subjectIssues.length > 0) {
      console.log('\nSubject Issues:');
      results.subjectIssues.forEach(issue => console.log(`- ${issue}`));
    }
    
    if (results.issues.length > 0) {
      console.log('\nContent Issues:');
      results.issues.forEach(issue => console.log(`- ${issue}`));
    }
    
    if (results.htmlIssues.length > 0) {
      console.log('\nHTML Issues:');
      results.htmlIssues.forEach(issue => console.log(`- ${issue}`));
    }
    
    if (results.recommendations.length > 0) {
      console.log('\nRecommendations:');
      results.recommendations.forEach(rec => console.log(`- ${rec}`));
    }
    
    console.log('\nEstimated Delivery:');
    if (results.score < 10) {
      console.log('✅ Likely to be delivered to inbox');
    } else if (results.score < 30) {
      console.log('⚠️ May be delivered to promotions tab or filtered');
    } else {
      console.log('❌ Likely to be caught by spam filters');
    }
  } catch (error) {
    console.error(`Error analyzing template ${fileName}: ${error.message}`);
  }
}

/**
 * Get risk level based on score
 */
function getRiskLevel(score) {
  if (score < 10) return 'Low';
  if (score < 20) return 'Moderate';
  if (score < 30) return 'High';
  return 'Very High';
}

// Run the main function
main().catch(console.error);
