/**
 * SMTP Authentication Troubleshooter
 * This script focuses specifically on authentication issues
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Get settings from environment
const config = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: process.env.SMTP_SECURE !== 'false',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || ''
};

/**
 * Test authentication with the SMTP server
 */
async function testAuth() {
  console.log(`\nTesting SMTP authentication with server: ${config.host}:${config.port}`);
  console.log(`Username: ${config.user}`);
  console.log(`Password: ${'*'.repeat(config.pass.length)}`);
  
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    debug: true, // Enable debug output
    logger: true // Log to console
  });
  
  try {
    await transporter.verify();
    console.log('\n✅ Authentication successful!');
    return true;
  } catch (error) {
    console.log(`\n❌ Authentication failed: ${error.message}`);
    
    // Provide more specific guidance based on error
    if (error.message.includes('535')) {
      console.log('\nThis error indicates your username or password is incorrect.');
    } else if (error.message.includes('534')) {
      console.log('\nThis error suggests the server requires a more secure authentication mechanism.');
    } else if (error.message.includes('530')) {
      console.log('\nThis error indicates authentication is required but wasn\'t provided correctly.');
    }
    
    return false;
  }
}

/**
 * Update .env file with new credentials
 */
async function updateCredentials(username, password) {
  try {
    const envPath = path.join(__dirname, '../.env');
    let content = await fs.readFile(envPath, 'utf8');
    
    // Update username
    content = content.replace(/SMTP_USER=.*(\r?\n|$)/gm, `SMTP_USER=${username}$1`);
    
    // Update password
    content = content.replace(/SMTP_PASS=.*(\r?\n|$)/gm, `SMTP_PASS=${password}$1`);
    
    // Write back to file
    await fs.writeFile(envPath, content, 'utf8');
    console.log('\n✅ Credentials updated in .env file');
    
    return true;
  } catch (error) {
    console.log(`\n❌ Error updating credentials: ${error.message}`);
    return false;
  }
}

/**
 * Ask for new credentials
 */
async function promptForCredentials() {
  const username = await new Promise(resolve => {
    rl.question('\nEnter SMTP username: ', answer => resolve(answer.trim()));
  });
  
  const password = await new Promise(resolve => {
    rl.question('Enter SMTP password: ', answer => resolve(answer.trim()));
  });
  
  return { username, password };
}

/**
 * Main function
 */
async function main() {
  console.log('===== SMTP AUTHENTICATION TROUBLESHOOTER =====');
  
  // First, test with current credentials
  const initialTest = await testAuth();
  
  if (!initialTest) {
    console.log('\nIt looks like your SMTP credentials might be incorrect.');
    
    // Ask if user wants to enter new credentials
    const updateCreds = await new Promise(resolve => {
      rl.question('\nWould you like to enter new credentials? (y/n): ', answer => 
        resolve(answer.toLowerCase() === 'y')
      );
    });
    
    if (updateCreds) {
      const { username, password } = await promptForCredentials();
      
      // Update config for testing
      config.user = username;
      config.pass = password;
      
      // Test the new credentials
      console.log('\nTesting new credentials...');
      const newTest = await testAuth();
      
      if (newTest) {
        console.log('\n✅ New credentials are working!');
        
        // Update .env file
        await updateCredentials(username, password);
        
        console.log('\n📝 Instructions:');
        console.log('1. Restart your application to use the new credentials');
        console.log('2. If using pm2: run `pm2 restart all`');
      } else {
        console.log('\n❌ New credentials also failed.');
        console.log('\n📝 Next steps:');
        console.log('1. Double-check credentials with your SMTP provider');
        console.log('2. Ensure your IP is not blocked by the SMTP server');
        console.log('3. Check if your SMTP provider requires a specific port or security setting');
        console.log('4. Try an alternative SMTP service like SendGrid or Mailgun');
      }
    } else {
      console.log('\n📝 Next steps:');
      console.log('1. Contact your SMTP provider to confirm your credentials');
      console.log('2. Check if there are IP restrictions on your SMTP server');
      console.log('3. Consider trying a different SMTP service');
    }
  } else {
    console.log('\n🎉 Your SMTP authentication is working correctly!');
    
    // Offer to send a test email
    const sendTest = await new Promise(resolve => {
      rl.question('\nWould you like to send a test email? (y/n): ', answer => 
        resolve(answer.toLowerCase() === 'y')
      );
    });
    
    if (sendTest) {
      const recipient = await new Promise(resolve => {
        rl.question('Enter recipient email address: ', answer => resolve(answer.trim()));
      });
      
      console.log(`\nSending test email to ${recipient}...`);
      
      try {
        const transporter = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: {
            user: config.user,
            pass: config.pass
          },
          connectionTimeout: 30000,
          greetingTimeout: 30000,
          socketTimeout: 30000
        });
        
        const info = await transporter.sendMail({
          from: process.env.SENDER_EMAIL || config.user,
          to: recipient,
          subject: 'SMTP Authentication Test',
          text: 'This is a test email to verify SMTP authentication is working.',
          html: '<p>This is a test email to verify SMTP authentication is working.</p>'
        });
        
        console.log(`\n✅ Test email sent! Message ID: ${info.messageId}`);
      } catch (error) {
        console.log(`\n❌ Failed to send test email: ${error.message}`);
        console.log('This could indicate a different issue with your SMTP configuration.');
      }
    }
  }
  
  rl.close();
}

// Run the script
main().catch(error => {
  console.error(`\nUnexpected error: ${error.message}`);
  rl.close();
});
