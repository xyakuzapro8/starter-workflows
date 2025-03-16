require('dotenv').config();
const nodemailer = require('nodemailer');
const nunjucks = require('nunjucks');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const logger = require('./utils/logger');
const config = require('./config');
const secureLinks = require('./utils/secureLinks');
const emailObfuscation = require('./utils/emailObfuscation');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const aiMailer = require('./aiMailer');

// Verify the import is correct:
console.log('In index.js - aiMailer functions available:', 
  typeof aiMailer.sendEmail === 'function');

// Create mail transporter
async function createTransport() {
  const smtpConfig = config.smtp;
  
  // Check if proxy is configured but packages are not installed
  if (config.proxy && config.proxy.enabled) {
    try {
      require('https-proxy-agent');
      require('socks-proxy-agent');
    } catch (error) {
      logger.warn('Proxy is enabled in config but the proxy support packages are not installed.');
      logger.warn('Email will be sent without proxy. To use proxy, install the required packages:');
      logger.warn('npm install https-proxy-agent socks-proxy-agent');
    }
  }
  
  let transporter = nodemailer.createTransport(smtpConfig);
  
  try {
    logger.info('Server is ready to send emails');
    await transporter.verify();
    return transporter;
  } catch (error) {
    logger.error(`SMTP connection failed: ${error.message}`);
    throw error;
  }
}

// Send email using a template
async function sendEmail(recipient, subject, templateName, data = {}) {
  try {
    // Generate unique message ID for tracking
    const messageId = uuidv4().replace(/-/g, '').substring(0, 12);
    
    // Add tracking ID and campaign info to template data
    const templateData = {
      ...data,
      recipient: recipient,
      messageId: messageId,
      campaignId: data.campaignId || `test-${Date.now()}`,
    };

    // Add secure tracking pixel if enabled
    if (config.enableTracking !== false) {
      templateData.trackingPixel = secureLinks.createTrackingPixel(messageId, {
        recipient,
        campaignId: templateData.campaignId,
        utm: data.utm
      });
    }

    // Process CTA links to make them secure if present
    if (data.ctaLink) {
      templateData.secureCtaLink = secureLinks.createSecureRedirect(
        data.ctaLink,
        messageId,
        {
          recipient,
          campaignId: templateData.campaignId,
          utm: data.utm
        }
      );
    }
    
    // Render email template
    let html = nunjucks.render(`${templateName}.html`, templateData);
    
    // Apply obfuscation techniques if enabled
    if (config.obfuscateEmails !== false) {
      html = emailObfuscation.obfuscateEmail(html, {
        level: config.obfuscationLevel || 'medium',
      });
    }
    
    // Configure email options
    const mailOptions = {
      from: `${config.sender.name} <${config.sender.email}>`,
      to: recipient,
      subject: subject,
      html: html,
      headers: {
        'X-Message-ID': messageId,
        'X-Campaign-ID': templateData.campaignId,
        'List-Unsubscribe': `<${config.unsubscribeUrl}?email=${encodeURIComponent(recipient)}>`,
        // Add headers to prevent forwarding if configured
        ...(config.preventForwarding ? {
          'X-Entity-Ref-ID': uuidv4(),
          'X-Permitted-Cross-Domain-Policies': 'none',
          'X-No-Forwarding': 'true'
        } : {})
      }
    };
    
    // Send email
    const transporter = await createTransport();
    const info = await transporter.sendMail(mailOptions);
    
    logger.info(`Email sent to ${recipient}`);
    return { success: true, messageId, info };
  } catch (error) {
    logger.error(`Failed to send email: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Demo function to test the system
async function runDemo() {
  logger.info('Starting AI Mailer demonstration');
  
  // Send a single test email
  logger.info('Sending a single test email');
  const recipient = 'xyakuzapro@gmail.com';
  logger.info(`Sending email to ${recipient}`);
  
  try {
    // Make sure we explicitly provide the 'to' field
    const result = await aiMailer.sendEmail({
      to: recipient, // Ensure 'to' field is explicitly set
      subject: 'Test Email from AI Mailer',
      body: 'This is a test email from AI Mailer.',
      templateName: 'default'
    });
    
    logger.info(`Single email result: ${result.success ? 'Success' : 'Failed'}`);
    if (result.success) {
      logger.info(`Email sent with ID: ${result.emailId}`);
    } else {
      logger.error(`Email failed: ${result.error}`);
    }
  } catch (error) {
    logger.error(`Error in demo: ${error.message}`);
  }
  
  logger.info('AI Mailer demonstration completed');
}

// Initialize express app
const app = express();

// Configure middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Simple route for checking if the server is running
app.get('/', (req, res) => {
  res.send('AI Mailer API is running');
});

// Route to send a single email
app.post('/api/send', async (req, res) => {
  try {
    const { recipient, templateName, variables } = req.body;
    
    if (!recipient || !recipient.email || !templateName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Configure the template
    const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
    
    // Check if the template exists
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ 
        success: false, 
        error: `Template '${templateName}' not found` 
      });
    }
    
    const template = {
      path: templatePath,
      subject: variables.subject || 'Message from AI Mailer'
    };
    
    // Send the email
    const result = await aiMailer.sendEmail(recipient, template, variables);
    res.json(result);
  } catch (error) {
    logger.error(`Error in /api/send: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send email: ' + error.message 
    });
  }
});

// Route to send bulk emails
app.post('/api/send-bulk', async (req, res) => {
  try {
    const { recipients, templateName, variables } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !templateName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields or empty recipients array' 
      });
    }
    
    // Send bulk emails
    const results = await aiMailer.sendBulkEmails(recipients, templateName, variables);
    res.json(results);
  } catch (error) {
    logger.error(`Error in /api/send-bulk: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send bulk emails: ' + error.message 
    });
  }
});

// Route to list available templates
app.get('/api/templates', (req, res) => {
  try {
    const templatesDir = path.join(__dirname, 'templates');
    const templates = fs.readdirSync(templatesDir)
      .filter(file => file.endsWith('.html'))
      .map(file => file.replace('.html', ''));
    
    res.json({ 
      success: true, 
      templates 
    });
  } catch (error) {
    logger.error(`Error listing templates: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to list templates: ' + error.message 
    });
  }
});

// Start the server
const PORT = config.server.port || 4000;
app.listen(PORT, () => {
  logger.info(`AI Mailer server running on port ${PORT}`);
  logger.info(`SMTP configured for: ${config.smtp.host}`);
  logger.info(`Email templates directory: ${path.join(__dirname, 'templates')}`);
});

// If this file is run directly, execute the demo
if (require.main === module) {
  // Load the server module at the end to make sure our server doesn't conflict
  runDemo().catch(err => {
    logger.error(`Demo error: ${err.message}`);
    console.error('Demo failed:', err);
  });
  
  // Import the server module
  require('./server');
}

module.exports = {
  sendEmail,
  createTransport,
  app
};
