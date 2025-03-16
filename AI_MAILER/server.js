/**
 * Main server file for AI Mailer
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const config = require('./config');
const configLoader = require('./utils/configLoader');
const aiMailer = require('./aiMailer');
const cohereAI = require('./utils/cohereAI');
const emailFormatter = require('./utils/emailFormatter');
const { renderTemplate } = require('./utils/templating');

// Validate configuration before starting
configLoader.initConfig(config);

const app = express();
const PORT = config.server.port || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Add this helper function at an appropriate place in the file
function safelyAccessConfig(configPath, defaultValue = null) {
  try {
    const paths = configPath.split('.');
    let current = config;
    
    for (const path of paths) {
      if (current === undefined || current === null) {
        return defaultValue;
      }
      current = current[path];
    }
    
    return current !== undefined ? current : defaultValue;
  } catch (error) {
    console.error(`Error accessing config path ${configPath}:`, error.message);
    return defaultValue;
  }
}

// Add this helper function to verify if the email was actually sent
async function sendEmailWithRetryAndVerify(options) {
  try {
    const start = Date.now();
    logger.info(`Attempting to send email to ${options.to}`);
    
    // Try sending up to 3 times
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await aiMailer.sendEmail(options);
        const timeTaken = Date.now() - start;
        
        logger.info(`Email sent successfully on attempt ${attempt} in ${timeTaken}ms (ID: ${result.messageId || 'unknown'})`);
        return result;
      } catch (err) {
        logger.error(`Send attempt ${attempt} failed: ${err.message}`);
        
        // Only retry on certain error types
        if (err.code === 'ESOCKET' || err.code === 'ETIMEDOUT') {
          logger.info(`Retrying in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Don't retry for auth errors or other permanent failures
          throw err;
        }
      }
    }
    
    throw new Error('Failed after 3 retry attempts');
  } catch (error) {
    logger.error(`All email sending attempts failed: ${error.message}`);
    throw error;
  }
}

// API routes
app.post('/api/send-email', async (req, res) => {
  try {
    // Extract key data from request
    const {
      to: recipient, 
      subject, 
      body, 
      contentPrompt, 
      subjectPrompt, 
      generateUnique,
      templateName,
      recipientData,
      preserveGeneratedContent = true,
      obfuscate = false // Turn off obfuscation by default to prevent HTML encoding issues
    } = req.body;
    
    // Validate recipient
    if (!recipient) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipient email address (to) is required' 
      });
    }
    
    // Set default template from env config
    const actualTemplateName = templateName || safelyAccessConfig('defaultEmail.templateName', 'default');
    
    // Set default subject from env config
    let actualSubject = subject;
    if (!actualSubject && !subjectPrompt) {
      actualSubject = safelyAccessConfig('defaultEmail.subject', 'OpenSea NFT Waitlist');
    }
    
    // If AI generation is requested
    if ((generateUnique || safelyAccessConfig('defaultEmail.useAI', false)) && (contentPrompt || subjectPrompt)) {
      logger.info(`Generating unique content for ${recipient}`);
      
      try {
        // Generate subject if prompt is provided
        let emailSubject = actualSubject;
        if (subjectPrompt) {
          emailSubject = await cohereAI.generateSubject(subjectPrompt);
          logger.info(`Generated subject: ${emailSubject}`);
        }
        
        // Generate body if prompt is provided
        let emailBody = body;
        if (contentPrompt) {
          // Get plain text content from Cohere AI
          const plainTextContent = await cohereAI.generateEmailBody(contentPrompt);
          
          // Log the raw generated content for debugging
          logger.info(`Raw generated content: ${plainTextContent.substring(0, 100)}...`);
          
          // Replace any remaining [Recipient] placeholders with the actual name or "there"
          const recipientName = (req.body.recipientData && req.body.recipientData.name) || 
                               (recipient && recipient.split('@')[0]) || 
                               'there';
          
          const cleanedContent = plainTextContent
            // Replace [Recipient] placeholder if it still exists
            .replace(/\[Recipient\]/g, recipientName)
            // Replace generic "Hello," with personalized greeting if needed
            .replace(/^Hello,/i, `Hello ${recipientName},`);
            
          // Clean up and partition the raw text into paragraphs
          const cleanedParagraphs = cleanedContent
            .split(/\n\n|\n/)
            .filter(p => p.trim().length > 0)
            .map(p => p.trim())
            // Filter out any lingering meta commentary
            .filter(p => !p.match(/^(here is|this is|below is|i've|i have|here's)/i));
            
          // Format paragraphs with clean HTML - only ONE style attribute per paragraph  
          emailBody = cleanedParagraphs
            .map(p => `<p style="margin-bottom: 15px; font-size: 15px; line-height: 1.6;">${p}</p>`)
            .join('\n');
          
          logger.info(`Email body formatted with recipient name: ${recipientName}`);
        }
        
        // Update the request with generated content
        req.body.subject = emailSubject;
        req.body.body = emailBody;
        
        // Flag to indicate this content was AI-generated
        req.body.isAIGenerated = true;
      } catch (aiError) {
        logger.error(`AI generation error: ${aiError.message}`);
        // Continue with original content if AI generation fails
      }
    } else if (body) {
      // Always decode HTML entities in body content
      req.body.body = emailFormatter.decodeHtmlEntities(body);
      
      // If body contains HTML tags, mark it as HTML content
      if (req.body.body.includes('<p') || req.body.body.includes('<div')) {
        req.body.isHtmlContent = true;
      }
    }
    
    // Force disable obfuscation if we have HTML content to preserve
    if (req.body.isHtmlContent || req.body.isAIGenerated) {
      req.body.obfuscate = false;
    }
    
    // Use actual template name
    req.body.templateName = actualTemplateName;
    req.body.subject = req.body.subject || actualSubject;
    
    // Add inbox-friendly metadata 
    req.body.priority = 'high';
    req.body.importance = 'high';
    req.body.category = 'primary';
    req.body.precedence = 'bulk';
    
    // Update to use the retry function
    const result = await sendEmailWithRetryAndVerify({
      to: recipient,
      templateName: actualTemplateName,
      preserveGeneratedContent: preserveGeneratedContent,
      isAIGenerated: req.body.isAIGenerated,
      isHtmlContent: req.body.isHtmlContent,
      // Pass other options
      ...req.body
    });
    
    // Ensure we have a tracking ID in the response
    if (result.success && !result.emailId) {
      result.emailId = Date.now().toString();
    }
    
    res.json(result);
  } catch (error) {
    logger.error(`API error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get templates
app.get('/api/templates', async (req, res) => {
  try {
    const result = await aiMailer.getTemplates();
    res.json(result);
  } catch (error) {
    logger.error(`Template API error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Redirect handler for protected links
app.get('/r/:linkId', (req, res) => {
  try {
    const { linkId } = req.params;
    const encodedUrl = req.query.d;
    
    if (!encodedUrl) {
      return res.status(400).send('Invalid link');
    }
    
    // Decode the URL
    const originalUrl = Buffer.from(decodeURIComponent(encodedUrl), 'base64').toString('utf8');
    
    // Log the click
    logger.info(`Link clicked: ${linkId} -> ${originalUrl}`);
    
    // Redirect to the original URL
    res.redirect(originalUrl);
  } catch (error) {
    logger.error(`Redirect error: ${error.message}`);
    res.status(400).send('Invalid redirect link');
  }
});

// Email tracking pixel handler
app.get('/track', (req, res) => {
  try {
    const id = req.query.id;
    logger.info(`Email opened: ${id}`);
    
    // Send a 1x1 transparent GIF
    const transparent1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.send(transparent1x1);
  } catch (error) {
    logger.error(`Tracking error: ${error.message}`);
    res.status(400).send('Invalid tracking request');
  }
});

// Forward detection handler
app.get('/track/:token', (req, res) => {
  try {
    const { token } = req.params;
    const encodedRecipient = req.query.r;
    
    logger.info(`Forward detection triggered: ${token}`);
    
    // Send a 1x1 transparent GIF
    const transparent1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.send(transparent1x1);
  } catch (error) {
    logger.error(`Forward detection error: ${error.message}`);
    res.status(400).send('Invalid request');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: process.env.npm_package_version || '1.0.0',
    time: new Date().toISOString()
  });
});

// Add endpoint to test SMTP connection
app.get('/api/smtp-check', async (req, res) => {
  try {
    logger.info('Testing SMTP connection from API endpoint');
    const transporter = await aiMailer.createTransporter();
    const verifyResult = await transporter.verify();
    res.json({ success: true, message: 'SMTP connection successful', details: verifyResult });
  } catch (error) {
    logger.error(`SMTP check API error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: {
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure
      }
    });
  }
});

// Start server
app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Using SMTP server: ${config.smtp.host}:${config.smtp.port}`);
  logger.info(`Sender email: ${config.sender.email}`);
  console.log(`AI Mailer server started on port ${PORT}`);
  
  // Verify services at startup
  try {
    // Check if API key is configured
    if (!config.cohere.apiKey) {
      logger.warn('Cohere API key not configured. AI generation will use fallbacks.');
    } else {
      logger.info(`Cohere AI module loaded successfully with API key ${config.cohere.apiKey.substring(0, 3)}...`);
    }
    
    // Test SMTP connection on startup
    try {
      const transporter = await aiMailer.createTransporter();
      await transporter.verify();
      logger.info('SMTP connection successful on startup');
    } catch (smtpError) {
      logger.error(`SMTP connection check failed on startup: ${smtpError.message}`);
      console.error(`SMTP Error: ${smtpError.message}`);
    }
  } catch (error) {
    logger.error(`Error loading modules: ${error.message}`);
  }
});

// Export for testing
module.exports = app;