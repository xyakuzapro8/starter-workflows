/**
 * SMTP Connection Fixer
 * This script diagnoses SMTP connection issues and suggests fixes
 */

require('dotenv').config();
const net = require('net');
const dns = require('dns');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// SMTP settings to test
const smtpConfigs = [
  { port: 465, secure: true, protocol: "SSL/TLS" },
  { port: 587, secure: false, protocol: "STARTTLS" },
  { port: 25, secure: false, protocol: "Plain" },
  { port: 2525, secure: false, protocol: "Alternate" },
  { port: 26, secure: false, protocol: "Alternate" },
  { port: 2526, secure: false, protocol: "Alternate" },
  { port: 465, secure: false, protocol: "Non-standard" },
];

// Common SMTP providers and their settings
const knownProviders = {
  'gmail.com': { host: 'smtp.gmail.com', port: 587, secure: false },
  'yahoo.com': { host: 'smtp.mail.yahoo.com', port: 587, secure: false },
  'hotmail.com': { host: 'smtp.office365.com', port: 587, secure: false },
  'outlook.com': { host: 'smtp.office365.com', port: 587, secure: false },
  'aol.com': { host: 'smtp.aol.com', port: 587, secure: false },
  'zoho.com': { host: 'smtp.zoho.com', port: 587, secure: false },
};

async function main() {
  console.log('===== SMTP CONNECTION FIXER =====\n');
  
  // Get current settings from .env
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = process.env.SMTP_PORT;
  const smtpSecure = process.env.SMTP_SECURE === 'true';
  
  console.log('Current SMTP Configuration:');
  console.log(`Host: ${smtpHost}`);
  console.log(`Port: ${smtpPort}`);
  console.log(`Secure: ${smtpSecure}`);
  console.log(`User: ${smtpUser}`);
  console.log(`Pass: ${'*'.repeat(smtpPass ? smtpPass.length : 0)}`);
  
  // Step 1: DNS lookup on host
  console.log('\nStep 1: Checking DNS for SMTP host...');
  let ipAddress;
  try {
    ipAddress = await new Promise((resolve, reject) => {
      dns.lookup(smtpHost, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });
    console.log(`✅ DNS lookup successful: ${smtpHost} resolves to ${ipAddress}`);
  } catch (error) {
    console.log(`❌ DNS lookup failed: ${error.message}`);
    console.log('This indicates the hostname might be incorrect or DNS issues.');
    await checkForAlternativeSettings();
    return;
  }
  
  // Step 2: Try to establish a TCP connection
  console.log(`\nStep 2: Testing TCP connection to ${smtpHost}:${smtpPort}...`);
  try {
    await testTcpConnection(smtpHost, parseInt(smtpPort));
    console.log(`✅ TCP connection successful to ${smtpHost}:${smtpPort}`);
  } catch (error) {
    console.log(`❌ TCP connection failed: ${error.message}`);
    console.log('This could indicate a firewall issue or incorrect port.');
    
    // Try other common SMTP ports
    console.log('\nAttempting to find a working port...');
    
    let found = false;
    for (const config of smtpConfigs) {
      console.log(`Testing ${smtpHost}:${config.port} (${config.protocol})...`);
      try {
        await testTcpConnection(smtpHost, config.port);
        console.log(`✅ Connection to port ${config.port} successful!`);
        found = true;
        
        const answer = await askQuestion(`\nWould you like to update your configuration to use port ${config.port} with secure=${config.secure}? (y/n): `);
        if (answer.toLowerCase() === 'y') {
          await updateEnvFile({
            SMTP_PORT: config.port.toString(),
            SMTP_SECURE: config.secure.toString()
          });
          console.log(`\nConfiguration updated to use port ${config.port} with secure=${config.secure}`);
        }
        break;
      } catch (err) {
        console.log(`❌ Port ${config.port} is not available`);
      }
    }
    
    if (!found) {
      console.log('\n❌ Could not find a working port for this SMTP server.');
      await checkForAlternativeSettings();
      return;
    }
  }
  
  // Step 3: Test SMTP authentication
  console.log('\nStep 3: Testing SMTP authentication...');
  try {
    const testResult = await testSmtpAuth(smtpHost, parseInt(smtpPort), smtpSecure, smtpUser, smtpPass);
    console.log('✅ SMTP authentication successful!');
  } catch (error) {
    console.log(`❌ SMTP authentication failed: ${error.message}`);
    
    if (error.message.includes('credentials') || error.message.includes('535')) {
      console.log('This indicates incorrect username or password.');
    } else if (error.message.includes('certificate')) {
      console.log('This indicates an SSL/TLS certificate issue.');
      
      const answer = await askQuestion('Would you like to disable TLS certificate validation? (y/n): ');
      if (answer.toLowerCase() === 'y') {
        await updateEnvFile({ SMTP_REJECT_UNAUTHORIZED: 'false' });
        console.log('\nConfiguration updated to ignore certificate validation');
      }
    }
  }
  
  console.log('\n===== DIAGNOSTIC COMPLETE =====');
  console.log('If you still have connection issues, you might need to:');
  console.log('1. Check if your ISP is blocking outgoing SMTP connections');
  console.log('2. Verify your SMTP server credentials with your provider');
  console.log('3. Try using an API-based email service like SendGrid or Mailgun');
  
  rl.close();
}

async function testTcpConnection(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, host);
    let timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    }, 5000);
    
    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve();
    });
    
    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function testSmtpAuth(host, port, secure, user, pass) {
  return new Promise((resolve, reject) => {
    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: secure,
      auth: {
        user: user,
        pass: pass
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      tls: {
        rejectUnauthorized: false
      }
    });
    
    transporter.verify((error, success) => {
      if (error) {
        reject(error);
      } else {
        resolve(success);
      }
    });
  });
}

async function checkForAlternativeSettings() {
  const emailDomain = process.env.SMTP_USER.split('@')[1];
  
  // Check if we know the correct settings for this email domain
  if (knownProviders[emailDomain]) {
    const provider = knownProviders[emailDomain];
    console.log(`\nWe found recommended settings for ${emailDomain}:`);
    console.log(`Host: ${provider.host}`);
    console.log(`Port: ${provider.port}`);
    console.log(`Secure: ${provider.secure}`);
    
    const answer = await askQuestion('Would you like to update your configuration with these settings? (y/n): ');
    if (answer.toLowerCase() === 'y') {
      await updateEnvFile({
        SMTP_HOST: provider.host,
        SMTP_PORT: provider.port.toString(),
        SMTP_SECURE: provider.secure.toString()
      });
      console.log('\nConfiguration updated with recommended settings');
    }
  } else {
    console.log(`\nNo predefined settings available for ${emailDomain}.`);
    console.log('Consider checking with your email provider for the correct SMTP settings.');
  }
}

async function updateEnvFile(changes) {
  try {
    const envFilePath = path.join(__dirname, '..', '.env');
    let content = await fs.readFile(envFilePath, 'utf8');
    
    // Apply each change
    for (const [key, value] of Object.entries(changes)) {
      // Check if key already exists
      const regex = new RegExp(`^${key}=.*`, 'm');
      if (regex.test(content)) {
        // Replace existing value
        content = content.replace(regex, `${key}=${value}`);
      } else {
        // Add new key-value pair
        content += `\n${key}=${value}`;
      }
    }
    
    // Write changes back to file
    await fs.writeFile(envFilePath, content);
    return true;
  } catch (error) {
    console.error(`Error updating .env file: ${error.message}`);
    return false;
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Run the main function
main().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  rl.close();
});
