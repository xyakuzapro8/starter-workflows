/**
 * Email Verification Tool
 * This tool helps verify that your sender email is properly configured
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const dns = require('dns');
const { promisify } = require('util');
const config = require('./config');

// Promisify DNS functions
const resolveMxPromise = promisify(dns.resolveMx);
const lookupPromise = promisify(dns.lookup);

console.log('===== EMAIL VERIFICATION TOOL =====');
console.log(`Testing sender email: ${config.sender.email}\n`);

async function main() {
  try {
    // 1. Check if the domain exists
    const domain = config.sender.email.split('@')[1];
    console.log(`Checking domain: ${domain}`);
    
    try {
      const addressInfo = await lookupPromise(domain);
      console.log(`✅ Domain exists: ${domain} -> ${addressInfo.address}`);
    } catch (err) {
      console.log(`❌ Domain does not exist or cannot be resolved: ${err.message}`);
      return;
    }
    
    // 2. Check MX records for the domain
    console.log('\nChecking MX records...');
    try {
      const mxRecords = await resolveMxPromise(domain);
      console.log('✅ MX records found:');
      mxRecords.forEach(record => {
        console.log(`   - ${record.exchange} (priority: ${record.priority})`);
      });
    } catch (err) {
      console.log(`❌ No MX records found: ${err.message}`);
      console.log('   This domain cannot receive emails, which may indicate it\'s not properly set up');
    }
    
    // 3. Test SMTP connection
    console.log('\nTesting SMTP connection...');
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
    
    try {
      await transporter.verify();
      console.log('✅ SMTP connection successful');
    } catch (err) {
      console.log(`❌ SMTP connection failed: ${err.message}`);
      return;
    }
    
    // 4. Send a test email to verify sender
    console.log('\nWould you like to send a test email to verify the sender? (y/n)');
    process.stdin.once('data', async (data) => {
      const input = data.toString().trim().toLowerCase();
      
      if (input === 'y' || input === 'yes') {
        // Ask for recipient
        console.log('\nEnter your email address to receive the test:');
        process.stdin.once('data', async (recipientData) => {
          const recipient = recipientData.toString().trim();
          
          if (!recipient.includes('@')) {
            console.log('❌ Invalid email address');
            process.exit(0);
          }
          
          console.log(`\nSending test email to ${recipient}...`);
          
          try {
            const info = await transporter.sendMail({
              from: `"${config.sender.name}" <${config.sender.email}>`,
              to: recipient,
              subject: "Email Verification Test",
              text: "This is a test email to verify that your sender email is working correctly.",
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                  <h2>Email Verification Test</h2>
                  <p>This is a test email to verify that your sender email is working correctly.</p>
                  <p>Sender: ${config.sender.email}</p>
                  <p>Time: ${new Date().toISOString()}</p>
                </div>
              `
            });
            
            console.log(`✅ Test email sent: ${info.messageId}`);
            console.log(`✅ If you don't receive the email, check your spam folder`);
            console.log('✅ If the email is rejected, your SMTP server may require domain verification');
            process.exit(0);
          } catch (err) {
            console.log(`❌ Failed to send test email: ${err.message}`);
            
            if (err.message.includes('sender address not confirmed')) {
              console.log('\nSUGGESTION:');
              console.log('The error indicates that your sender email domain has not been verified.');
              console.log('1. Make sure you own the domain in your sender email');
              console.log('2. Verify the domain with your SMTP provider');
              console.log('3. If using a shared hosting provider, contact them to allow sending from this domain');
              console.log('4. Alternatively, use an email address from a domain that matches your SMTP server');
            }
            
            process.exit(1);
          }
        });
      } else {
        console.log('Verification canceled');
        process.exit(0);
      }
    });
    
  } catch (err) {
    console.log(`Error during verification: ${err.message}`);
    process.exit(1);
  }
}

main();
