#!/usr/bin/env node
const dotenv = require('dotenv');
const axios = require('axios');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Setup readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Get the correct port from .env or use defaults
const PORT = process.env.PORT || 3000;
const API_URL = `http://localhost:${PORT}/api/send-email`;

// Email templates directory
const TEMPLATES_DIR = path.join(__dirname, 'templates');

const config = require('./config');

// Use centralized config instead of hardcoded values
const BATCH_SIZE = config.batch?.size || 10; // Default to 10 if not configured
const MIN_BATCH_DELAY = config.batch?.minDelay || 30000;
const MAX_BATCH_DELAY = config.batch?.maxDelay || 60000;

// Check if server is running
async function checkServerStatus() {
  try {
    // Try to ping the server at both the specified port and common fallback ports
    const ports = [PORT, 3000, 4000];
    // Try different health endpoint paths since servers might use different conventions
    const healthPaths = ['/health', '/api/health', '/', '/api'];
    
    console.log('Checking for running server...');
    
    for (const port of ports) {
      for (const healthPath of healthPaths) {
        try {
          const healthEndpoint = `http://localhost:${port}${healthPath}`;
          console.log(`Trying ${healthEndpoint}...`);
          const response = await axios.get(healthEndpoint, { timeout: 3000 });
          
          // If we get here, the server responded
          console.log(`Server found running on port ${port} at endpoint ${healthPath}`);
          
          // If we find a server, update the API URL to use this port
          global.API_URL = `http://localhost:${port}/api/send-email`;
          return true;
        } catch (err) {
          // Only log detailed errors for connection failures, not 404s
          if (!err.response && err.code !== 'ECONNREFUSED') {
            console.log(`Error connecting to ${port}${healthPath}: ${err.code || err.message}`);
          }
          // Continue to the next endpoint silently
        }
      }
      console.log(`No server found on port ${port}, trying next...`);
    }
    
    console.error('No running server found on any port. Please make sure the server is started.');
    return false;
  } catch (error) {
    console.error(`Unexpected error checking server status: ${error.message}`);
    return false;
  }
}

// Generate a unique pattern for this batch to improve inbox placement
function generateUniquePattern() {
  const timestamp = Date.now().toString();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomString}`;
}

// Sleep function with random delay
async function sleep(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  console.log(`Waiting for ${(delay/1000).toFixed(1)} seconds before next batch...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Get available templates
function getAvailableTemplates() {
  try {
    if (fs.existsSync(TEMPLATES_DIR)) {
      return fs.readdirSync(TEMPLATES_DIR)
        .filter(file => file.endsWith('.html'))
        .map(file => file.replace('.html', ''));
    }
    return [];
  } catch (error) {
    console.error('Error reading templates directory:', error.message);
    return [];
  }
}

// Load template content
function loadTemplate(templateName) {
  try {
    const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
    if (fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath, 'utf-8');
    }
    return null;
  } catch (error) {
    console.error('Error loading template:', error.message);
    return null;
  }
}

// Send email in batches
async function sendEmailBatch(recipients, emailOptions) {
  const results = {
    successful: [],
    failed: []
  };

  // Create batches of BATCH_SIZE
  const batches = [];
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    batches.push(recipients.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Prepared ${batches.length} batches of ${BATCH_SIZE} emails each`);
  
  // Check if we're using AI generation
  const usingAIGeneration = emailOptions.contentPrompt && emailOptions.subjectPrompt;
  if (usingAIGeneration) {
    console.log(`Using AI to generate unique content for each recipient`);
  }
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchPattern = generateUniquePattern();
    console.log(`\nSending batch ${batchIndex + 1}/${batches.length} with pattern ${batchPattern}`);
    
    // Process each email in the batch
    for (let i = 0; i < batch.length; i++) {
      const recipient = batch[i];
      const recipientName = recipient.split('@')[0];
      
      // For AI generation, create slightly varied prompts for each recipient
      let currentOptions = { ...emailOptions };
      if (usingAIGeneration) {
        // Create unique variations of the prompts for each recipient
        const subjectVariations = [
          `For ${recipientName}: ${emailOptions.subjectPrompt}`,
          `${emailOptions.subjectPrompt} (for ${recipientName})`,
          `${emailOptions.subjectPrompt} (personalized for recipient)`,
          `Custom for ${new Date().toISOString().slice(0,10)}: ${emailOptions.subjectPrompt}`
        ];
        
        const contentVariations = [
          `Create a personalized email email content for ${recipientName} about: ${emailOptions.contentPrompt}`,
          `Write an email to ${recipientName} regarding: ${emailOptions.contentPrompt}`,
          `For recipient ${recipientName}: ${emailOptions.contentPrompt}. Make it sound personalized.`,
          `The following email is for ${recipientName}: ${emailOptions.contentPrompt}. Add a personalized greeting.`
        ];
        
        // Select a random variation
        const randomIndex = Math.floor(Math.random() * 4);
        currentOptions.subjectPrompt = subjectVariations[randomIndex];
        currentOptions.contentPrompt = contentVariations[randomIndex];
      }
      
      currentOptions = {
        ...currentOptions,
        to: recipient,
        batchId: batchPattern,
        messageIndex: `${batchIndex}-${i}`,
        timestamp: Date.now(),
        generateUnique: usingAIGeneration, // Flag to tell server to generate unique content
        preserveGeneratedContent: true,    // Ensure AI content is preserved
        recipientData: {
          name: recipientName,
          email: recipient,
          index: i
        }
      };
      
      try {
        console.log(`Sending email ${i + 1}/${batch.length} to ${recipient}${usingAIGeneration ? ' (with unique AI content)' : ''}`);
        const response = await axios.post(global.API_URL || API_URL, currentOptions);
        results.successful.push({
          email: recipient,
          messageId: response.data.messageId,
          emailId: response.data.emailId
        });
        
        // Small random delay between emails in same batch (200-700ms)
        await sleep(200, 700);
      } catch (error) {
        // Improved error handling to extract more useful information
        let errorMessage;
        if (error.response) {
          if (typeof error.response.data === 'object') {
            // Format object into a readable string
            errorMessage = JSON.stringify(error.response.data, null, 2);
          } else {
            errorMessage = error.response.data || `Status code: ${error.response.status}`;
          }
        } else {
          errorMessage = error.message;
        }
        
        results.failed.push({
          email: recipient,
          error: errorMessage
        });
        console.error(`Failed to send to ${recipient}: ${errorMessage}`);
      }
    }
    
    // Add delay between batches (except for the last batch)
    if (batchIndex < batches.length - 1) {
      await sleep(MIN_BATCH_DELAY, MAX_BATCH_DELAY);
    }
  }
  
  return results;
}

// Get recipients from a file if available
async function loadRecipientsFromFile(filePath = 'recipients.txt') {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const recipients = fileContent.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.includes('@'));
    
    if (recipients.length > 0) {
      console.log(`Loaded ${recipients.length} recipients from ${filePath}`);
      return recipients;
    } else {
      console.warn(`No valid email addresses found in ${filePath}`);
      return [];
    }
  } catch (error) {
    console.error(`Error reading recipients file: ${error.message}`);
    return [];
  }
}

// Main function to gather input and send email
async function main() {
  console.log('== AI Mailer Sending Tool ==');
  console.log('This tool will guide you through sending an email with AI content generation.\n');
  
  // Check if server is running
  const serverRunning = await checkServerStatus();
  if (!serverRunning) {
    console.error('Error: AI Mailer server is not running.');
    console.error('Please start the server first with: node server.js');
    rl.close();
    return;
  }
  
  // Check if user wants to use OpenSea waitlist template
  const useOpenSeaTemplate = await new Promise(resolve => {
    rl.question('\nUse OpenSea waitlist template? (y/n, default: y): ', answer => {
      const input = answer.trim().toLowerCase();
      resolve(input === '' || input === 'y' || input === 'yes');
    });
  });
  
  let useDefaultValues = false;
  let useAIGeneration = false; // Initialize this variable to track if we're using AI generation
  
  if (useOpenSeaTemplate) {
    useDefaultValues = await new Promise(resolve => {
      rl.question('Use default values for subject and content? (y/n, default: y): ', answer => {
        const input = answer.trim().toLowerCase();
        resolve(input === '' || input === 'y' || input === 'yes');
      });
    });
  }
  
  // Choose between recipient options
  console.log('\nSelect recipient source:');
  console.log('1. Enter recipient(s) manually');
  console.log('2. Load recipients from recipients.txt file');
  
  const recipientSource = await new Promise(resolve => {
    rl.question('Source (1 or 2): ', answer => {
      resolve(answer.trim());
    });
  });
  
  let recipients = [];
  
  if (recipientSource === '2') {
    // Load recipients from file
    recipients = await loadRecipientsFromFile('recipients.txt');
    if (recipients.length === 0) {
      console.error('No valid recipients found in recipients.txt file.');
      console.log('Please create a recipients.txt file with one email address per line.');
      rl.close();
      return;
    }
    console.log(`\nLoaded ${recipients.length} recipient(s) from file.`);
  } else {
    // Choose between single email or batch email for manual entry
    console.log('\nSelect send mode:');
    console.log('1. Send to a single recipient');
    console.log('2. Send to multiple recipients (batch mode)');
    
    const sendMode = await new Promise(resolve => {
      rl.question('Mode (1 or 2): ', answer => {
        resolve(answer.trim());
      });
    });
    
    if (sendMode === '1') {
      // Get single recipient email
      const to = await new Promise(resolve => {
        rl.question('Recipient email address: ', answer => {
          resolve(answer.trim());
        });
      });
      
      if (!to || !to.includes('@')) {
        console.error('Invalid email address.');
        rl.close();
        return;
      }
      recipients.push(to);
    } else {
      // Get multiple recipients
      console.log('\nEnter recipient email addresses (one per line). Enter a blank line when finished:');
      
      while (true) {
        const email = await new Promise(resolve => {
          rl.question('> ', answer => {
            resolve(answer.trim());
          });
        });
        
        if (!email) break;
        
        if (email.includes('@')) {
          recipients.push(email);
        } else {
          console.log('Invalid email address, please try again');
        }
      }
      
      if (recipients.length === 0) {
        console.error('No valid email addresses provided.');
        rl.close();
        return;
      }
      console.log(`\n${recipients.length} recipients added.`);
    }
  }
  
  // Set up default options if using default values
  let subject = '';
  let body = '';
  let contentPrompt = '';
  let subjectPrompt = '';
  let templateName = '';
  let mode = '2'; // Default to manual mode
  
  if (useDefaultValues) {
    templateName = config.defaultEmail?.templateName || 'opensea-waitlist';
    subject = config.defaultEmail?.subject || 'OpenSea: Join our exclusive waitlist';
    
    // Check if config.defaultEmail exists and has useAI property
    if (config.defaultEmail && config.defaultEmail.useAI) {
      // Use AI generation with default prompts
      contentPrompt = config.defaultEmail.aiPrompts?.content || 'Write an email inviting the recipient to join an exclusive OpenSea waitlist.';
      subjectPrompt = config.defaultEmail.aiPrompts?.subject || 'Create an engaging subject line for an OpenSea waitlist invitation.';
      useAIGeneration = true; // Set flag for AI generation
      mode = '1'; // Using AI generation mode
    }
    
    console.log('\nUsing OpenSea waitlist template with default values:');
    console.log(`- Template: ${templateName}`);
    console.log(`- Subject: ${subject}`);
    
    // Fixed condition check with proper null check
    if (config.defaultEmail && config.defaultEmail.useAI) {
      console.log('- Content: [Will be AI generated]');
    }
  } else {
    // Standard content selection
    console.log('\nSelect email content mode:');
    console.log('1. Use AI to generate subject and content');
    console.log('2. Enter subject and content manually');
    
      mode = await new Promise(resolve => {
        rl.question('Mode (1 or 2): ', answer => {
          resolve(answer.trim())
        })
      })
    
      if (mode === '1') {
        useAIGeneration = true
      
        // Get AI prompts
        subjectPrompt = await new Promise(resolve => {
          rl.question('\nDescribe what you want in the subject line: ', answer => {
            resolve(answer.trim())
          })
        })
      
        contentPrompt = await new Promise(resolve => {
          rl.question('\nDescribe what you want in the email content: ', answer => {
            resolve(answer.trim())
          })
        })
      } else {
        // Get manual subject and body
        subject = await new Promise(resolve => {
          rl.question('\nEmail subject: ', answer => {
            resolve(answer.trim())
          })
        })
      
        body = await new Promise(resolve => {
          rl.question('\nEmail body (HTML supported, type "\\n" for line breaks): ', answer => {
            // Replace literal \n with actual line breaks
            return resolve(answer.replace(/\\n/g, '\n'))
          })
        })
      }
    }
  
    // Check if user wants to use a template
    const templates = getAvailableTemplates()
    let template = null
  
    if (!useDefaultValues && templates.length > 0) {
      console.log('\nAvailable templates:')
      console.log('0. None (no template)')
      templates.forEach((tpl, index) => {
        console.log(`${index + 1}. ${tpl}`)
      })
    
      const templateChoice = await new Promise(resolve => {
        rl.question('Select template number: ', answer => {
          resolve(answer.trim())
        })
      })
    
      if (templateChoice !== '0' && templates[parseInt(templateChoice) - 1]) {
        const selectedTemplate = templates[parseInt(templateChoice) - 1]
        template = loadTemplate(selectedTemplate)
        templateName = selectedTemplate
        console.log(`Using template: ${selectedTemplate}`)
      }
    } else if (useDefaultValues && templateName) {
      // If using default values with a template, load it
      template = loadTemplate(templateName)
    }
  
    // Check if user wants security features
    const obfuscate = await new Promise(resolve => {
      rl.question('\nObfuscate email content to bypass filters? (y/n): ', answer => {
        resolve(answer.toLowerCase() === 'y')
      })
    })
  
    // Email options object
    const emailOptions = {
      subject,
      body,
      contentPrompt,
      subjectPrompt,
      template,
      templateName,
      obfuscate,
      preserveGeneratedContent: true  // Add this flag to preserve AI content
    }
  
    // Confirm sending
    console.log('\nReview your email:')
  
    if (recipients.length === 1) {
      console.log(`- To: ${recipients[0]}`)
    } else {
      console.log(`- To: ${recipients.length} recipients (batch mode)`)
      console.log(`- Batch size: ${BATCH_SIZE}`)
    }
  
    if (useAIGeneration || mode === '1') {
      console.log('- Subject: [Will be AI generated]')
      console.log('- Content: [Will be AI generated]')
    } else {
      console.log(`- Subject: ${subject}`)
      console.log(`- Content: ${body.length > 50 ? body.substring(0, 50) + '...' : body}`)
    }
  
    console.log(`- Template: ${template ? 'Yes' : 'No'}`)
    console.log(`- Obfuscation: ${obfuscate ? 'Yes' : 'No'}`)
  
    const confirm = await new Promise(resolve => {
      rl.question('\nSend this email? (y/n): ', answer => {
        resolve(answer.toLowerCase())
      })
    })
  
    if (confirm !== 'y') {
      console.log('Email sending canceled.')
      rl.close()
      return
    }
  
    console.log('\nSending email(s)...')
  
    try {
      if (recipients.length === 1) {
        // Send single email - FIX: Ensure recipient field is correctly named
        const recipientEmail = recipients[0]
        emailOptions.to = recipientEmail; // Make sure key is 'to' not 'recipient'
        const response = await axios.post(global.API_URL || API_URL, emailOptions)
      
        console.log('\nEmail sent successfully!')
        console.log(`Message ID: ${response.data.messageId}`)
        console.log(`Tracking ID: ${response.data.emailId}`)
      } else {
        // Send batch emails
        console.log(`\nSending ${recipients.length} emails in batches of ${BATCH_SIZE}...`)
        const results = await sendEmailBatch(recipients, emailOptions)
      
        console.log('\nEmail sending complete!')
        console.log(`Successful: ${results.successful.length}`)
        console.log(`Failed: ${results.failed.length}`)
      
        if (results.failed.length > 0) {
          console.log('\nFailed emails:')
          results.failed.forEach(failure => {
            console.log(`- ${failure.email}: ${failure.error}`)
          })
        }
      }
    } catch (error) {
      console.error('\nError sending email:')
      if (error.response) {
        console.error(error.response.data)
      } else {
        console.error(error.message)
      }
      console.error('\nIs the AI Mailer server running? Start it with: node server.js')
    }
  
    rl.close()
}

// Run the main function
main().catch(error => {
    console.error('Unexpected error:', error)
    console.error('Detailed email sending error:', error)
    console.error('Stack trace:', error.stack)
    rl.close()
})