/**
 * SMTP Connection Checker
 * Utility to diagnose SMTP connection issues
 */
const nodemailer = require('nodemailer');
const dns = require('dns');
const logger = require('./logger');
const config = require('../config');

/**
 * Verify SMTP connection and authentication
 * @returns {Promise<Object>} Result of SMTP verification
 */
async function verifySmtpConnection() {
  try {
    console.log('\n=== SMTP Connection Diagnostic ===');
    console.log(`Testing connection to ${config.smtp.host}:${config.smtp.port} (secure: ${config.smtp.secure})`);
    
    // Check DNS resolution first
    try {
      const addresses = await dns.promises.resolve(config.smtp.host);
      console.log(`✓ DNS resolution successful: ${config.smtp.host} -> ${addresses.join(', ')}`);
    } catch (dnsError) {
      console.error(`✗ DNS resolution failed: ${dnsError.message}`);
      console.error('  This suggests network connectivity or DNS issues');
    }
    
    // Create transporter with debug enabled
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      },
      debug: true, // Enable debug output
      logger: true  // Log to console
    });
    
    console.log('Attempting to verify SMTP connection...');
    const verifyResult = await transporter.verify();
    console.log('✓ SMTP connection verified successfully!');
    
    // Test sending a simple message to yourself
    console.log('Attempting to send a test email...');
    
    const messageId = `test-${Date.now()}@${config.smtp.host}`;
    const info = await transporter.sendMail({
      from: `"SMTP Test" <${config.smtp.user}>`,
      to: config.smtp.user, // Send to self
      subject: `SMTP Test ${new Date().toISOString()}`,
      text: "This is a test email to verify SMTP functionality",
      messageId: messageId,
      headers: {
        'X-Test-Header': 'smtp-diagnostic'
      }
    });
    
    console.log(`✓ Test email sent successfully!`);
    console.log(`  Message ID: ${info.messageId}`);
    console.log(`  Response: ${info.response}`);
    
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error(`✗ SMTP verification failed: ${error.message}`);
    
    // Provide more specific diagnosis
    if (error.code === 'ECONNREFUSED') {
      console.error('  Connection was refused. Check if the SMTP server is running and the port is correct.');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('  Connection timed out. This could be due to network issues or firewall blocking.');
    } else if (error.code === 'EAUTH') {
      console.error('  Authentication failed. Check your username and password.');
    } else if (error.responseCode >= 500) {
      console.error(`  SMTP server rejected the request: ${error.response}`);
    }
    
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

// Export the verification function
module.exports = { verifySmtpConnection };

// If this script is run directly, execute verification
if (require.main === module) {
  verifySmtpConnection()
    .then(result => {
      if (result.success) {
        console.log('SMTP Diagnostic completed successfully');
        process.exit(0);
      } else {
        console.error('SMTP Diagnostic failed');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Unexpected error during SMTP diagnostic:', err);
      process.exit(1);
    });
}
