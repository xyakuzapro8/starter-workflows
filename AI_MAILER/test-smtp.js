/**
 * SMTP Connection Test
 * This is a simplified tool to test your SMTP connection
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const net = require('net');
const dns = require('dns');
const config = require('./config');

// SMTP settings from config
const { host, port, secure, user, pass } = config.smtp;

// Main function
async function main() {
  console.log('==== SMTP CONNECTION TEST ====');
  console.log(`Testing connection to ${host}:${port} (secure: ${secure})\n`);
  
  // Step 1: DNS lookup
  console.log('Step 1: DNS lookup test...');
  try {
    const address = await new Promise((resolve, reject) => {
      dns.lookup(host, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });
    console.log(`✅ DNS lookup successful: ${host} -> ${address}\n`);
  } catch (error) {
    console.log(`❌ DNS lookup failed: ${error.message}`);
    console.log('   This might indicate the hostname is incorrect.\n');
    process.exit(1);
  }
  
  // Step 2: Basic TCP connection
  console.log('Step 2: TCP connection test...');
  try {
    await testTcpConnection(host, port);
    console.log(`✅ TCP connection successful to ${host}:${port}\n`);
  } catch (error) {
    console.log(`❌ TCP connection failed: ${error.message}`);
    console.log('   This might indicate a firewall issue or the port is incorrect.\n');
    
    // Try another common SMTP port
    const alternatePort = port === 587 ? 465 : 587;
    console.log(`   Trying alternate port ${alternatePort}...`);
    try {
      await testTcpConnection(host, alternatePort);
      console.log(`✅ TCP connection successful to ${host}:${alternatePort}`);
      console.log(`   Consider updating your configuration to use port ${alternatePort}\n`);
    } catch (altError) {
      console.log(`❌ Connection to alternate port also failed\n`);
    }
    
    // Continue to the next step anyway, as the TCP test might be blocked but SMTP could still work
  }
  
  // Step 3: SMTP Connection Test
  console.log('Step 3: SMTP connection test...');
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      tls: {
        rejectUnauthorized: false
      }
    });
    
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');
    
    // Offer to send a test email
    if (process.argv.includes('--send-test') || process.argv.includes('-t')) {
      const testAddress = process.argv[process.argv.indexOf('--send-test') + 1] || 
                          process.argv[process.argv.indexOf('-t') + 1] || 
                          'test@example.com';
      
      console.log(`Sending test email to ${testAddress}...`);
      try {
        const info = await transporter.sendMail({
          from: `"SMTP Test" <${user}>`,
          to: testAddress,
          subject: 'SMTP Test Email',
          text: 'This is a test email to verify SMTP configuration is working.',
          html: '<p>This is a test email to verify SMTP configuration is working.</p>'
        });
        console.log(`✅ Test email sent! Message ID: ${info.messageId}`);
      } catch (sendError) {
        console.log(`❌ Failed to send test email: ${sendError.message}`);
      }
    }
  } catch (error) {
    console.log(`❌ SMTP connection failed: ${error.message}\n`);
    
    // Provide diagnostics based on error message
    if (error.message.includes('auth')) {
      console.log('Diagnosis: Authentication failure');
      console.log('Suggestion: Check your username and password');
    } else if (error.message.includes('certificate') || error.message.includes('self signed')) {
      console.log('Diagnosis: TLS/SSL certificate issue');
      console.log('Suggestion: Set SMTP_SECURE=false and try port 587 with STARTTLS');
    } else if (error.message.includes('greeting never received')) {
      console.log('Diagnosis: Server greeting timeout');
      console.log('Suggestion: Try increasing greeting timeout or check if server blocks connections');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('Diagnosis: Connection refused');
      console.log('Suggestion: Verify the host and port are correct, and no firewall is blocking the connection');
    }
  }
  
  console.log('\nTest completed.');
}

// TCP Connection test helper
function testTcpConnection(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, host);
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection timeout to ${host}:${port}`));
    }, 5000);
    
    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.end();
      resolve();
    });
    
    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Run main and catch any errors
main().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
