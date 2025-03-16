/**
 * Environment Configuration Test Tool
 * Tests all environment variables and configuration settings
 */

require('dotenv').config();
const fs = require('fs');
const nodemailer = require('nodemailer');
const config = require('./config');
const { validateConfig } = require('./utils/configLoader');

console.log('===== ENVIRONMENT CONFIGURATION TEST =====');

// Check if .env exists
function checkEnvFile() {
  try {
    const envExists = fs.existsSync('.env');
    if (envExists) {
      console.log('✅ .env file found');
      
      // Check file permissions
      const stats = fs.statSync('.env');
      console.log(`   File permissions: ${stats.mode.toString(8)}`);
      console.log(`   Last modified: ${stats.mtime}`);
      
      // Check file content (count lines)
      const content = fs.readFileSync('.env', 'utf8');
      const lines = content.split('\n').filter(line => 
        line.trim() && !line.trim().startsWith('#')
      );
      console.log(`   Contains ${lines.length} environment variables`);
    } else {
      console.log('❌ .env file not found');
    }
  } catch (error) {
    console.log(`❌ Error checking .env file: ${error.message}`);
  }
}

// Test required environment variables
function testRequiredVariables() {
  console.log('\n----- Required Environment Variables -----');
  
  const requiredVars = {
    'SMTP_HOST': process.env.SMTP_HOST,
    'SMTP_PORT': process.env.SMTP_PORT,
    'SMTP_USER': process.env.SMTP_USER,
    'SMTP_PASS': process.env.SMTP_PASS,
    'SENDER_EMAIL': process.env.SENDER_EMAIL || process.env.SMTP_FROM
  };
  
  for (const [name, value] of Object.entries(requiredVars)) {
    if (value) {
      console.log(`✅ ${name}: ${name === 'SMTP_PASS' ? '********' : value}`);
    } else {
      console.log(`❌ ${name}: Not set`);
    }
  }
}

// Test configuration validation
function testConfigValidation() {
  console.log('\n----- Configuration Validation -----');
  
  const isValid = validateConfig(config);
  
  if (isValid) {
    console.log('✅ Configuration is valid');
  } else {
    console.log('❌ Configuration has issues (see errors above)');
  }
}

// Test SMTP connection
async function testSmtpConnection() {
  console.log('\n----- SMTP Connection Test -----');
  
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    console.log('❌ SMTP configuration incomplete. Cannot test connection.');
    return;
  }
  
  try {
    console.log(`Testing connection to ${config.smtp.host}:${config.smtp.port} (secure: ${config.smtp.secure})...`);
    
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    await transporter.verify();
    console.log('✅ SMTP connection successful');
  } catch (error) {
    console.log(`❌ SMTP connection failed: ${error.message}`);
    
    // Analyze the error and provide guidance
    if (error.message.includes('greeting')) {
      console.log('   Diagnosis: Server did not respond with a proper SMTP greeting');
      console.log('   Suggestion: Try a different port (587, 465, or 25)');
    } else if (error.message.includes('auth') || error.message.includes('credentials') || error.message.includes('535')) {
      console.log('   Diagnosis: Authentication failed');
      console.log('   Suggestion: Check username and password');
    } else if (error.message.includes('certificate') || error.message.includes('self signed')) {
      console.log('   Diagnosis: SSL/TLS certificate issue');
      console.log('   Suggestion: Set SMTP_SECURE=false or use a valid certificate');
    } else if (error.message.includes('connect') || error.message.includes('ENOTFOUND')) {
      console.log('   Diagnosis: Could not connect to the server');
      console.log('   Suggestion: Check hostname and network connectivity');
    }
  }
}

// Run all tests
async function main() {
  checkEnvFile();
  testRequiredVariables();
  testConfigValidation();
  await testSmtpConnection();
  
  console.log('\n===== TEST COMPLETED =====');
}

// Execute
main().catch(console.error);
