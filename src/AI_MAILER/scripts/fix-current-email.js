/**
 * Fix Current Email
 * A one-time script to fix the specific email with duplicated content
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const readline = require('readline');

// Create readline interface for user interaction
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
 * Fix the specific OpenSea email with duplicated content
 */
async function fixOpenSeaEmail(htmlContent, subject) {
  try {
    const $ = cheerio.load(htmlContent);
    
    // Fix 1: Remove duplicate greeting
    console.log('Step 1: Removing duplicate greeting...');
    let aiContentGreeting = false;
    
    $('.ai-content p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.match(/^(hello|hi|hey)\s+\w+/i)) {
        aiContentGreeting = true;
      }
    });
    
    if (aiContentGreeting) {
      $('.content h2').each((i, el) => {
        const text = $(el).text().trim();
        if (text.match(/^(hello|hi|hey)\s+\w+/i)) {
          $(el).remove();
          console.log('  - Removed duplicate "Hey adamlorde8" heading');
        }
      });
    }
    
    // Fix 2: Remove duplicate benefit sections
    console.log('Step 2: De-duplicating benefits sections...');
    
    // Store all benefit items from the AI content section
    const aiBenefits = new Set();
    $('.ai-content li').each((i, el) => {
      aiBenefits.add($(el).text().trim());
    });
    
    // Check for duplicate benefits in the template section
    let templatesRemoved = 0;
    $('.benefit-item').each((i, el) => {
      const benefitText = $(el).find('.benefit-text').text().trim();
      
      // Check if any AI benefit contains the template benefit text
      let isDuplicate = false;
      aiBenefits.forEach(aiBenefit => {
        if (aiBenefit.includes(benefitText) || benefitText.includes(aiBenefit)) {
          isDuplicate = true;
        }
      });
      
      if (isDuplicate) {
        $(el).remove();
        templatesRemoved++;
      }
    });
    console.log(`  - Removed ${templatesRemoved} duplicate benefit items`);
    
    // Fix 3: Move the AI content after the main greeting for better flow
    console.log('Step 3: Organizing content for better flow...');
    if ($('.ai-content').length && $('.content p').first().length) {
      const aiContent = $('.ai-content').clone();
      $('.ai-content').remove();
      aiContent.insertAfter($('.content p').first());
      console.log('  - Reorganized AI content for better flow');
    }
    
    // Fix 4: Remove excessive emoji from paragraphs
    console.log('Step 4: Cleaning up excessive emoji...');
    $('p').each((i, el) => {
      const html = $(el).html();
      const emojiCount = (html.match(/[\u{1F300}-\u{1F6FF}]/gu) || []).length;
      
      if (emojiCount > 1) {
        // Keep only the first emoji
        const newHtml = html.replace(/([\u{1F300}-\u{1F6FF}])(.*?)([\u{1F300}-\u{1F6FF}])/gu, '$1$2');
        $(el).html(newHtml);
      }
    });
    
    // Fix 5: Fix the problematic subject
    console.log('Step 5: Fixing problematic subject line...');
    let fixedSubject = subject
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '') // Remove problematic Unicode
      .replace(/𝗨𝗽𝗽𝗹𝗶𝗻|𝗗𝗼𝗽|𝗥𝗮𝗱/g, '') // Remove math block characters
      .replace(/[^\x00-\x7F]/g, ''); // Remove non-ASCII
      
    if (fixedSubject.trim().length < 5) {
      fixedSubject = "OpenSea Early Access Invitation";
    }
    
    console.log(`  - Original subject: ${subject}`);
    console.log(`  - Fixed subject: ${fixedSubject}`);
    
    return {
      html: $.html(),
      subject: fixedSubject
    };
  } catch (error) {
    console.error(`Error fixing email: ${error.message}`);
    return { html: htmlContent, subject };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n===== OPENSEA EMAIL FIXER =====\n');
  console.log('This script will fix the OpenSea email with duplicated content.');
  
  // Get the input file path
  const filePath = await ask('Enter the path to the HTML email file: ');
  
  try {
    // Read the file
    const htmlContent = await fs.readFile(filePath, 'utf8');
    console.log(`Read ${htmlContent.length} characters from file.`);
    
    // Get the subject
    const subject = await ask('Enter the problematic subject line: ');
    
    // Fix the email
    console.log('\nFixing email content...');
    const { html: fixedHtml, subject: fixedSubject } = await fixOpenSeaEmail(htmlContent, subject);
    
    // Save the fixed email
    const outputPath = path.join(path.dirname(filePath), 'fixed-opensea-email.html');
    await fs.writeFile(outputPath, fixedHtml, 'utf8');
    
    console.log(`\nFixed email saved to: ${outputPath}`);
    console.log(`Fixed subject: ${fixedSubject}`);
    
    // Save the fixed subject to a text file for reference
    const subjectPath = path.join(path.dirname(filePath), 'fixed-subject.txt');
    await fs.writeFile(subjectPath, fixedSubject, 'utf8');
    console.log(`Fixed subject saved to: ${subjectPath}`);
    
    console.log('\nDONE!');
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the main function
main().catch(console.error);
