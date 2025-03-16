/**
 * SMTP Connection Tester
 * Utility to test and diagnose SMTP connection issues
 */

const nodemailer = require('nodemailer');
const net = require('net');
const logger = require('./logger');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

/**
 * Test basic TCP connection to SMTP server
 * @param {string} host - SMTP host
 * @param {number} port - SMTP port
 * @returns {Promise<boolean>} - Connection success
 */
async function testTcpConnection(host, port) {
  return new Promise((resolve) => {
    logger.info(`Testing TCP connection to ${host}:${port}...`);
    
    const socket = net.createConnection(port, host);
    let resolved = false;
    
    socket.setTimeout(10000); // 10 second timeout
    
    socket.on('connect', () => {
      logger.info(`TCP connection to ${host}:${port} successful`);
      if (!resolved) {
        resolved = true;
        socket.end();
        resolve(true);
      }
    });
    
    socket.on('timeout', () => {
      logger.error(`TCP connection to ${host}:${port} timed out`);
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
    
    socket.on('error', (err) => {
      logger.error(`TCP connection to ${host}:${port} failed: ${err.message}`);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
  });
}

/**
 * Test SMTP connection with authentication
 * @param {Object} smtpConfig - SMTP configuration
 * @returns {Promise<boolean>} - Connection success
 */
async function testSmtpConnection(smtpConfig = config.smtp) {
  try {
    logger.info(`Testing SMTP connection to ${smtpConfig.host}:${smtpConfig.port}...`);
    
    // Create transporter with debug logging
    const transportOptions = {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure || false,
      auth: {
        user: smtpConfig.auth ? smtpConfig.auth.user : smtpConfig.user,
        pass: smtpConfig.auth ? smtpConfig.auth.pass : smtpConfig.pass
      },
      connectionTimeout: 45000,    // Extended timeout
      greetingTimeout: 45000,      // Extended timeout
      socketTimeout: 45000,        // Extended timeout for slow connections
      debug: true,                 // Enable debug logging
      logger: true,               // Enable console logging
      tls: {
        rejectUnauthorized: false  // Don't fail on self-signed certs
      }
    };
    
    // Log the auth credentials (password masked)
    logger.info(`Using auth: ${transportOptions.auth.user} / ${'*'.repeat(transportOptions.auth.pass.length)}`);
    
    const transporter = nodemailer.createTransport(transportOptions);
    
    // Test connection with timeout
    const result = await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SMTP verification timeout')), 45000)
      )
    ]);
    
    logger.info('SMTP connection and authentication successful');
    return true;
  } catch (error) {
    logger.error(`SMTP connection test failed: ${error.message}`);
    
    // Provide specific diagnostic information for authentication failures
    if (error.message.includes('535') || error.message.includes('Authentication failed')) {
      logger.error('Authentication error detected. Possible causes:');
      logger.error('1. Incorrect username or password');
      logger.error('2. Account restrictions or IP limitations');
      logger.error('3. SMTP provider requires a specific authentication method');
      logger.error('Try running the scripts/smtp-auth-fix.js utility');
    } else if (error.message.includes('timeout')) {
      logger.error('Connection timeout. Possible causes:');
      logger.error('1. SMTP server is down or unreachable');
      logger.error('2. Firewall is blocking the connection');
      logger.error('3. Network connectivity issues');
    }
    
    return false;
  }
}

/**
 * Send a test email
 * @param {string} recipient - Test recipient email
 * @param {Object} smtpConfig - SMTP configuration
 * @returns {Promise<Object>} - Result object
 */
async function sendTestEmail(recipient, smtpConfig = config.smtp) {
  try {
    logger.info(`Sending test email to ${recipient}...`);
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure || false,
      auth: {
        user: smtpConfig.auth ? smtpConfig.auth.user : smtpConfig.user,
        pass: smtpConfig.auth ? smtpConfig.auth.pass : smtpConfig.pass
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false // For testing purposes
      }
    });
    
    // Send test email
    const info = await transporter.sendMail({
      from: `"SMTP Tester" <${smtpConfig.user}>`,
      to: recipient,
      subject: 'SMTP Test Email',
      text: 'This is a test email to verify SMTP configuration.',
      html: '<p>This is a test email to verify SMTP configuration.</p>'
    });
    
    logger.info(`Test email sent: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    logger.error(`Test email sending failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send a simple test email to verify SMTP functionality
 */
async function sendSimpleTestMail(recipient) {
  try {
    logger.info(`Sending simple test email to ${recipient}`);
    
    // Create ultra-simple transporter with minimal options
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      },
      connectionTimeout: 60000,   // 60 seconds
      greetingTimeout: 30000,     // 30 seconds
      socketTimeout: 60000,       // 60 seconds
      debug: true,                // Enable debug output
      logger: true                // Log to console
    });
    
    // Create bare minimum plain text email
    const mailOptions = {
      from: `"SMTP Test" <${config.smtp.user}>`,
      to: recipient,
      subject: 'SMTP Test Email',
      text: 'This is a simple test email to verify SMTP connection.',
      html: '<p>This is a simple test email to verify SMTP connection.</p>'
    };
    
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    
    logger.info(`Test email sent successfully: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    logger.error(`Failed to send test email: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verify the SMTP connection without sending an email
 */
async function verifyConnection() {
  try {
    logger.info('Verifying SMTP connection...');
    
    // Create basic transporter with minimal options
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      },
      connectionTimeout: 30000,   // 30 seconds
      greetingTimeout: 20000,     // 20 seconds
      tls: {
        rejectUnauthorized: false // Accept self-signed certs
      }
    });
    
    // Verify connection
    await transporter.verify();
    
    logger.info('SMTP connection verified successfully');
    return { success: true };
  } catch (error) {
    logger.error(`SMTP connection verification failed: ${error.message}`);
    return { 
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  testTcpConnection,
  testSmtpConnection,
  sendTestEmail,
  sendSimpleTestMail,
  verifyConnection
};
