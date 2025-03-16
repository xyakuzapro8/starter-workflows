/**
 * SMTP Port Tester
 * 
 * This script tests various port and secure flag combinations
 * to find working SMTP configurations.
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const config = require('../config');

// SMTP server settings
const host = config.smtp.host;
const user = config.smtp.user;
const pass = config.smtp.pass;

// Port combinations to test
const portConfigs = [
  { port: 25, secure: false, description: "Port 25 (Plain)" },
  { port: 587, secure: false, description: "Port 587 (STARTTLS)" },
  { port: 465, secure: true, description: "Port 465 (SSL/TLS)" },
  { port: 2525, secure: false, description: "Port 2525 (Alternate)" },
  { port: 25, secure: true, description: "Port 25 (Direct SSL)" },
  { port: 587, secure: true, description: "Port 587 (Direct SSL)" },
  { port: 465, secure: false, description: "Port 465 (STARTTLS)" }
];

// Progress indicator
function printProgress(current, total) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(`Testing configuration ${current} of ${total}...`);
}

// Test a specific port configuration
async function testPortConfig(config, index, total) {
  printProgress(index + 1, total);
  
  try {
    const transporter = nodemailer.createTransport({
      host: host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: user,
        pass: pass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      debug: false,
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // Try to verify the connection
    await transporter.verify();
    
    return {
      success: true,
      config
    };
  } catch (error) {
    return {
      success: false,
      config,
      error: error.message
    };
  }
}

// Main function
async function main() {
  console.log(`\n===== SMTP PORT TESTER =====`);
  console.log(`Testing SMTP configurations for ${host}\n`);
  
  const results = [];
  
  // Test all configurations
  for (let i = 0; i < portConfigs.length; i++) {
    const result = await testPortConfig(portConfigs[i], i, portConfigs.length);
    results.push(result);
  }
  
  // Clear progress indicator
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  
  // Show results
  console.log('\n===== RESULTS =====');
  
  // First show successful configurations
  const successful = results.filter(r => r.success);
  
  if (successful.length > 0) {
    console.log('\n✅ WORKING CONFIGURATIONS:');
    successful.forEach(result => {
      console.log(`- ${result.config.description}: Port ${result.config.port}, Secure: ${result.config.secure ? 'Yes' : 'No'}`);
    });
    
    // Show recommended configuration
    console.log('\n🔧 RECOMMENDED CONFIGURATION FOR config.js:');
    const recommended = successful[0]; // Take first successful config
    console.log(`
smtp: {
  host: '${host}',
  port: ${recommended.config.port},
  secure: ${recommended.config.secure},
  user: '${user}',
  // ... rest of your config
}`);
  } else {
    console.log('\n❌ NO WORKING CONFIGURATIONS FOUND');
  }
  
  // Show failed configurations
  console.log('\n❌ FAILED CONFIGURATIONS:');
  results.filter(r => !r.success).forEach(result => {
    console.log(`- ${result.config.description}: ${result.error}`);
  });
  
  console.log('\nTest completed!');
}

// Run the main function
main().catch(console.error);
