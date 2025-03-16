/**
 * SMTP Authentication Check Utility
 * A simple script to test SMTP authentication
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

// SMTP settings from environment
const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || '465');
const secure = process.env.SMTP_SECURE !== 'false';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

console.log('===== SMTP AUTHENTICATION CHECK =====');
console.log(`Testing connection to ${host}:${port} (secure: ${secure})`);
console.log(`Username: ${user}`);
console.log(`Password: ${'*'.repeat(pass ? pass.length : 0)}`);

// Create a transporter with debug options
const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  debug: true, // Enable debug output
  logger: true // Log to console
});

// Test the connection
transporter.verify()
  .then(() => {
    console.log('\n✅ SMTP Authentication successful!');
    process.exit(0);
  })
  .catch(err => {
    console.error(`\n❌ SMTP Authentication failed: ${err.message}`);
    
    if (err.message.includes('535')) {
      console.log('\nThis suggests your username or password is incorrect.');
      console.log('Check your credentials and try again.');
    } else if (err.message.includes('timeout')) {
      console.log('\nConnection timed out. The server might be down or blocking your connection.');
    } else if (err.message.includes('certificate')) {
      console.log('\nThere is an issue with the SSL/TLS certificate.');
    }
    
    process.exit(1);
  });
