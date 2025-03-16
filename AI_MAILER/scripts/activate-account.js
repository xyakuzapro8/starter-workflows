/**
 * Account Activation Checker
 * This script helps diagnose inactive SMTP account issues
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const axios = require('axios').default;
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// SMTP settings from environment
const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || '465');
const secure = process.env.SMTP_SECURE !== 'false';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

// Domain information
const domain = user.split('@')[1];

console.log('===== SMTP ACCOUNT ACTIVATION TOOL =====');
console.log(`Account: ${user}`);
console.log(`Host: ${host}:${port}`);
console.log(`Domain: ${domain}`);

/**
 * Test SMTP authentication 
 */
async function testSmtpAuth() {
  console.log('\nTesting SMTP authentication...');
  
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    debug: false,
    logger: true
  });
  
  try {
    await transporter.verify();
    console.log('✅ SMTP authentication successful!');
    return true;
  } catch (err) {
    console.log(`❌ SMTP authentication failed: ${err.message}`);
    
    // Check specifically for inactive account
    if (err.message.includes('not active')) {
      console.log('\n🚨 ACCOUNT INACTIVE DETECTED 🚨');
      console.log('Your SMTP account needs to be activated before you can send emails.');
      return false;
    }
    
    return false;
  }
}

/**
 * Check domain setup
 */
async function checkDomain() {
  console.log('\nChecking domain setup...');
  
  try {
    // Check domain registration
    console.log(`Testing DNS for ${domain}...`);
    const dnsPromise = new Promise((resolve, reject) => {
      require('dns').lookup(domain, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });
    
    const ipAddress = await dnsPromise;
    console.log(`✅ Domain resolves to ${ipAddress}`);
    
    // Check for domain setup in hosting provider
    console.log('\nChecking for common hosting control panels:');
    const controlPanels = [
      `https://${host}/cpanel`,
      `https://${host}/plesk`,
      `https://${host}/webmail`,
      `https://${host}:2083`,
      `https://${host}:8443`
    ];
    
    for (const panel of controlPanels) {
      try {
        console.log(`Checking ${panel}...`);
        await axios.head(panel, { 
          timeout: 5000,
          validateStatus: () => true
        });
        console.log(`✅ Control panel may be available at: ${panel}`);
      } catch (error) {
        // Ignore errors
      }
    }
    
    return true;
  } catch (err) {
    console.log(`❌ Domain check failed: ${err.message}`);
    return false;
  }
}

/**
 * Show activation instructions
 */
function showInstructions() {
  console.log('\n===== HOW TO ACTIVATE YOUR SMTP ACCOUNT =====');
  console.log('Based on the error "[E2] Your account is not active", here are the steps to fix it:');
  console.log('\n1. Contact your hosting provider (exclusivehosting.net)');
  console.log('   - Provide them with your account details');
  console.log('   - Ask them to activate your email account');
  console.log('   - Mention you\'re getting error "[E2] Your account is not active"');
  
  console.log('\n2. Check if you need to complete account verification');
  console.log('   - Some providers send a verification email');
  console.log('   - Check the inbox of an alternate email you provided during setup');
  
  console.log('\n3. Check if billing is required');
  console.log('   - Some hosting providers require payment before activating services');
  
  console.log('\n4. Access your hosting control panel');
  console.log('   - Try accessing: https://mail.exclusivehosting.net/cpanel');
  console.log('   - Or: https://mail.exclusivehosting.net:2083');
  console.log('   - Look for Email Accounts section and check status');
  
  console.log('\n5. Alternative solution:');
  console.log('   - Consider using a transactional email service like:');
  console.log('   - SendGrid, Mailgun, Amazon SES, or Postmark');
  console.log('   - These services offer free tiers and are reliable for sending emails');
  
  console.log('\n6. Check for domain setup requirements:');
  console.log('   - Make sure proper MX records are set up for your domain');
  console.log('   - Verify SPF, DKIM, and DMARC records are configured');
}

/**
 * Check for alternative SMTP providers
 */
function suggestAlternatives() {
  console.log('\n===== ALTERNATIVE EMAIL SENDING SOLUTIONS =====');
  console.log('While you wait for account activation, consider these alternatives:');
  
  console.log('\n1. SendGrid (https://sendgrid.com)');
  console.log('   - Free tier: 100 emails/day');
  console.log('   - Great deliverability and simple API');
  console.log('   - Example settings:');
  console.log('     SMTP_HOST=smtp.sendgrid.net');
  console.log('     SMTP_PORT=587');
  console.log('     SMTP_USER=apikey');
  console.log('     SMTP_PASS=your_sendgrid_api_key');
  
  console.log('\n2. Mailgun (https://mailgun.com)');
  console.log('   - Free tier: 5,000 emails/month for 3 months');
  console.log('   - Simple API and good analytics');
  
  console.log('\n3. SMTP2GO (https://www.smtp2go.com)');
  console.log('   - Free tier: 1,000 emails/month');
  console.log('   - Easy setup with SMTP relay');
  
  console.log('\n4. Amazon SES (https://aws.amazon.com/ses)');
  console.log('   - Very inexpensive ($0.10 per 1,000 emails)');
  console.log('   - High deliverability and scalability');
  
  console.log('\nTo integrate any of these services, just update your .env file with their credentials');
}

/**
 * Main function
 */
async function main() {
  const authWorks = await testSmtpAuth();
  
  if (authWorks) {
    console.log('\n✅ Your SMTP account appears to be active and working!');
    
    // Offer to send a test email
    const sendTest = await new Promise(resolve => {
      rl.question('\nWould you like to send a test email to verify? (y/n): ', answer => 
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
          host,
          port,
          secure,
          auth: { user, pass }
        });
        
        const info = await transporter.sendMail({
          from: user,
          to: recipient,
          subject: 'SMTP Account Activation Test',
          text: 'This is a test email to verify your SMTP account is active.',
          html: '<p>This is a test email to verify your SMTP account is active.</p>'
        });
        
        console.log(`\n✅ Test email sent! Message ID: ${info.messageId}`);
      } catch (error) {
        console.log(`\n❌ Failed to send test email: ${error.message}`);
      }
    }
  } else {
    // If authentication failed, check domain
    await checkDomain();
    
    // Show activation instructions
    showInstructions();
    
    // Ask if they want to see alternatives
    const showAlts = await new Promise(resolve => {
      rl.question('\nWould you like to see alternative email sending solutions? (y/n): ', answer => 
        resolve(answer.toLowerCase() === 'y')
      );
    });
    
    if (showAlts) {
      suggestAlternatives();
    }
  }
  
  rl.close();
}

// Run the script
main().catch(error => {
  console.error(`\nUnexpected error: ${error.message}`);
  rl.close();
});
