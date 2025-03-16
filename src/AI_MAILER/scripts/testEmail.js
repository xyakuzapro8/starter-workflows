/**
 * Direct Email Testing Script
 * Used to troubleshoot email sending issues
 */
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Main function to test SMTP settings and send a test email
 */
async function main() {
  console.log('=== Email Sending Test Tool ===');
  console.log('This utility will test sending an email using your SMTP settings\n');
  
  // Get SMTP settings from .env or prompt user
  const smtpHost = process.env.SMTP_HOST || await prompt('SMTP Host: ');
  const smtpPort = parseInt(process.env.SMTP_PORT || await prompt('SMTP Port: '), 10);
  const smtpSecure = (process.env.SMTP_SECURE || await prompt('Use TLS/SSL (true/false): ')).toLowerCase() === 'true';
  const smtpUser = process.env.SMTP_USER || await prompt('SMTP Username: ');
  const smtpPass = process.env.SMTP_PASS || await prompt('SMTP Password: ', true);
  
  // Get recipient information
  const recipient = await prompt('Recipient Email: ');
  
  console.log('\nCreating SMTP transport with the following settings:');
  console.log(`- Host: ${smtpHost}`);
  console.log(`- Port: ${smtpPort}`);
  console.log(`- Secure: ${smtpSecure}`);
  console.log(`- User: ${smtpUser}`);
  console.log(`- Password: ${'*'.repeat(8)}`);
  
  try {
    // Create SMTP transporter with debug logging
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      },
      debug: true, // Enable detailed logging
      logger: true  // Log to console
    });
    
    console.log('\nVerifying SMTP connection...');
    await transporter.verify();
    console.log('SMTP connection successful!');
    
    console.log('\nSending test email...');
    const info = await transporter.sendMail({
      from: `"Test Sender" <${smtpUser}>`,
      to: recipient,
      subject: `SMTP Test Email ${new Date().toISOString()}`,
      text: "This is a test message sent from the test utility to diagnose email delivery issues.",
      html: "<h3>Test Email</h3><p>This is a test message sent from the test utility to diagnose email delivery issues.</p>",
      headers: {
        'X-Test-Header': 'email-test-utility'
      }
    });
    
    console.log('Email sent successfully!');
    console.log(`- Message ID: ${info.messageId}`);
    console.log(`- Server response: ${info.response}`);
    
    // Create a log file with the results
    const logFile = path.join(__dirname, '../email-test-log.txt');
    const logContent = `
======= EMAIL TEST RESULTS =======
Date: ${new Date().toISOString()}
SMTP Host: ${smtpHost}
SMTP Port: ${smtpPort}
SMTP Secure: ${smtpSecure}
SMTP User: ${smtpUser}
Recipient: ${recipient}
Message ID: ${info.messageId}
Server Response: ${info.response}
================================
`;
    
    fs.writeFileSync(logFile, logContent, 'utf8');
    console.log(`\nTest results saved to: ${logFile}`);
    
  } catch (error) {
    console.error('\nError sending email:');
    console.error(error);
    
    if (error.code === 'EAUTH') {
      console.error('\nAuthentication failed. Check your username and password.');
    } else if (error.code === 'ESOCKET' || error.code === 'ECONNECTION') {
      console.error('\nConnection issue. Check if the SMTP server is accessible from your network.');
      console.error('Also verify your port and TLS/SSL settings are correct.');
    } else if (error.responseCode === 550) {
      console.error('\nServer rejected the recipient address. Check if the recipient is valid.');
    } else if (error.responseCode) {
      console.error(`\nSMTP error code ${error.responseCode}: ${error.response}`);
    }
  }
  
  rl.close();
}

/**
 * Prompt for user input with optional masking for passwords
 */
function prompt(question, isPassword = false) {
  return new Promise(resolve => {
    if (isPassword) {
      // Use a more secure way to input passwords in a real application
      rl.question(question, answer => resolve(answer));
    } else {
      rl.question(question, answer => resolve(answer));
    }
  });
}

// Run the main function
main().catch(error => {
  console.error('Unexpected error:', error);
  rl.close();
});
