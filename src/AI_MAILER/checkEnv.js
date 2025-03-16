#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

console.log('=== AI Mailer Environment Checker ===');

// Load environment variables from .env file
const envPath = path.join(__dirname, '.env');
let envLoaded = false;

try {
  if (fs.existsSync(envPath)) {
    const result = dotenv.config();
    if (result.error) {
      console.error('Error loading .env file:', result.error.message);
    } else {
      envLoaded = true;
      console.log('✓ .env file loaded successfully');
    }
  } else {
    console.error('✗ .env file not found at:', envPath);
  }
} catch (error) {
  console.error('Error checking .env file:', error.message);
}

// Check Cohere API key
const cohereKey = process.env.COHERE_API_KEY;
if (cohereKey) {
  console.log(`✓ COHERE_API_KEY found (${cohereKey.substring(0, 3)}...${cohereKey.substring(cohereKey.length-3)})`);
} else {
  console.error('✗ COHERE_API_KEY not found in environment variables');
  
  // Try reading the .env file directly to check if it's there but not being loaded
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('COHERE_API_KEY')) {
      console.log('  Note: COHERE_API_KEY exists in .env file but is not being loaded properly');
    }
  } catch (e) {
    // Ignore errors reading the file
  }
}

// Check other critical environment variables
const criticalVars = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
  'USE_AI'
];

criticalVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`✓ ${varName} found`);
  } else {
    console.warn(`? ${varName} not found or empty`);
  }
});

// Display suggestions
console.log('\n=== Suggestions ===');

if (!cohereKey) {
  console.log('1. Make sure COHERE_API_KEY is correctly set in your .env file');
  console.log('2. Try restarting the server after updating the .env file');
  console.log('3. Check that the server code is using process.env.COHERE_API_KEY to access the key');
}

if (!envLoaded) {
  console.log('- Ensure your server is properly loading the .env file using dotenv.config()');
  console.log('- The .env file should be in the root directory of your project');
}

console.log('\nRun this command to check AI service configuration in your server code:');
console.log('grep -r "COHERE_API_KEY" --include="*.js" .');
