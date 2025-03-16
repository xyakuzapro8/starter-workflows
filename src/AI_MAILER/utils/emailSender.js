const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('./logger');
const { processEmail } = require('./emailProcessor');

// Create transporter with improved settings
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure || false,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass
  },
  // Add these settings to prevent ECONNRESET errors
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 60000
});

/**
 * Send an email
 * @param {Object} options - Email options
 * @returns {Promise<Object>} - Result object
 */
async function sendEmail(options) {
  const {
    to,
    subject,
    body,
    from = config.smtp.defaultFrom || 'noreply@squ.com',
    enableTracking = false,
    enableObfuscation = false,
  } = options;
  
  // Validate required fields
  if (!to) {
    logger.error('Missing recipient email');
    return { success: false, error: 'Missing recipient email' };
  }
  
  if (!subject) {
    logger.error('Missing email subject');
    return { success: false, error: 'Missing email subject' };
  }
  
  if (!body) {
    logger.error('Missing email body');
    return { success: false, error: 'Missing email body' };
  }
  
  try {
    logger.info(`Sending email to ${to}`);
    
    // Process the email content with minimal options
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const processedHtml = processEmail(body, {
      recipient: to,
      messageId,
      enableTracking,
      enableObfuscation,
    });
    
    // Create minimal email options to avoid large headers
    const mailOptions = {
      from,
      to,
      subject,
      html: processedHtml,
      // Use minimal headers
      headers: {
        'X-Mailer': 'AI-Mailer',
        'Message-ID': `<${messageId}@yourdomain.com>`,
      }
    };
    
    // Verify SMTP connection
    try {
      await transporter.verify();
      logger.info('SMTP transport verified and ready to send emails');
    } catch (verifyError) {
      logger.error(`SMTP verification failed: ${verifyError.message}`);
      return { success: false, error: `SMTP connection failed: ${verifyError.message}` };
    }
    
    // Send the email with retry logic
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        logger.debug('About to call sendEmail function');
        const info = await transporter.sendMail(mailOptions);
        logger.debug('After calling sendEmail function');
        
        logger.info(`Email sent successfully: ${info.messageId}`);
        return {
          success: true,
          messageId: info.messageId,
          response: info.response
        };
      } catch (sendError) {
        retryCount++;
        if (retryCount <= maxRetries) {
          logger.warn(`Email send failed, retrying (${retryCount}/${maxRetries}): ${sendError.message}`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        } else {
          throw sendError; // Throw after max retries
        }
      }
    }
  } catch (error) {
    logger.error(`Error sending email to ${to}: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { sendEmail };