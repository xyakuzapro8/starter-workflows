const AIService = require('./utils/aiService');
const logger = require('./utils/logger');
const nodemailer = require('nodemailer');
const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');
require('dotenv').config();

async function sendEmail() {
  try {
    const aiService = new AIService();
    
    // Verify API key
    const isApiKeyValid = await aiService.verifyApiKey();
    if (!isApiKeyValid) {
      logger.error('Invalid API key. Exiting...');
      process.exit(1);
    }
    
    // Generate email subject and body
    const subject = await aiService.generateText('Generate an email subject');
    const body = await aiService.generateText('Generate an email body');
    
    // Log the generated content
    logger.info(`Generated Subject: ${subject}`);
    logger.info(`Generated Body: ${body}`);
    
    // Proxy configuration
    const proxy = {
      host: 'proxy.toolip.io',
      port: '31114',
      auth: {
        username: 'tl-ae239c4d71e8dd7a3a3fed81a03b2bdcc51a2d37b41cf24de08eaa950a5787f6-country-XX-session-###',
        password: 'b2a45jtifomy'
      }
    };
    
    const agent = new HttpsProxyAgent(`http://${proxy.auth.username}:${proxy.auth.password}@${proxy.host}:${proxy.port}`);
    
    // Create a Nodemailer transporter using SMTP with proxy
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_REQUIRE_TLS === 'true',
        minVersion: process.env.SMTP_TLS_MIN_VERSION,
        maxVersion: process.env.SMTP_TLS_MAX_VERSION
      },
      proxy: agent
    });
    
    // Verify the connection configuration
    await transporter.verify();
    logger.info('SMTP configuration is correct');
    
    // Define email options
    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: 'recipient@example.com', // Replace with the recipient's email address
      subject: subject,
      html: body
    };
    
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    
  } catch (error) {
    logger.error(`Error in send.js: ${error.message}`);
    throw error;
  }
}

module.exports = sendEmail;