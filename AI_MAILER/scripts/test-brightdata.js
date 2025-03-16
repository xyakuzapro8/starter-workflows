/**
 * Bright Data Proxy Test Script
 * Tests connection through Bright Data's residential proxies
 */

require('dotenv').config();
const axios = require('axios');
const { HttpProxyAgent } = require('http-proxy-agent');
const config = require('../config');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Proxy credentials from config
const proxyHost = 'brd.superproxy.io';  // Use the official hostname
const proxyPort = 22225;                // Default port for HTTP connections
const proxyUser = config.proxy.auth.username || 'brd-customer-hl_c86a3063-zone-residential_proxy1';
const proxyPass = config.proxy.auth.password || 'cg5te5wgxb8g';

// Format username for Bright Data residential proxies
function formatUsername(username, options = {}) {
  const country = options.country || 'us';
  const session = options.session || Date.now();
  
  // Format: brd-customer-[customer_id]-zone-[zone_name]-country-[country]-session-[session_id]
  // This follows Bright Data's recommended format
  if (username.includes('brd-customer')) {
    // Get the base customer ID and zone
    const parts = username.split('-zone-');
    if (parts.length !== 2) return username;
    
    const customerPart = parts[0]; // e.g., brd-customer-hl_c86a3063
    const zonePart = parts[1]; // e.g., residential_proxy1
    
    return `${customerPart}-zone-${zonePart}-country-${country}-session-${session}`;
  }
  
  return username;
}

// Test with curl (which we know works)
async function testWithCurl() {
  console.log('Testing with curl command (direct system call)...');
  
  const command = `curl -s --proxy ${proxyHost}:${proxyPort} --proxy-user ${proxyUser}:${proxyPass} -k "https://geo.brdtest.com/welcome.txt?product=resi&method=native"`;
  
  try {
    const { stdout } = await execPromise(command);
    console.log('✅ Curl test successful:');
    console.log(stdout.substring(0, 300) + '...\n');
    return true;
  } catch (error) {
    console.log(`❌ Curl test failed: ${error.message}`);
    return false;
  }
}

// Test connection through the proxy using Axios with detailed error handling
async function testProxyConnection() {
  console.log('Testing Bright Data proxy connection with Axios...');
  console.log(`Proxy: ${proxyHost}:${proxyPort}`);
  
  try {
    // Format the username properly for Bright Data
    const username = formatUsername(proxyUser, { 
      country: 'us',
      session: 'test' + Date.now().toString().slice(-6) // Dynamic session ID
    });
    
    console.log(`Using username: ${username}`);
    
    // Create proxy URL
    const proxyUrl = `http://${username}:${proxyPass}@${proxyHost}:${proxyPort}`;
    
    // Test with multiple proxy agent configurations
    let response;
    try {
      // Configure axios with proxy (method 1 - httpAgent)
      const httpAgent = new HttpProxyAgent(proxyUrl);
      console.log('Trying connection with HttpProxyAgent...');
      
      response = await axios.get('https://api.ipify.org?format=json', {
        httpsAgent: httpAgent,
        timeout: 30000,
        validateStatus: () => true // Accept any status code
      });
    } catch (err) {
      // Configure axios with proxy (method 2 - direct proxy config)
      console.log('First method failed, trying alternative axios proxy configuration...');
      
      response = await axios.get('https://api.ipify.org?format=json', {
        proxy: {
          host: proxyHost,
          port: proxyPort,
          auth: {
            username: username,
            password: proxyPass
          },
          protocol: 'http'
        },
        timeout: 30000
      });
    }
    
    console.log(`✅ Success! Your proxy IP address is: ${response.data.ip}`);
    
    // Now test the Bright Data test endpoint
    console.log('\nTesting Bright Data specific endpoint...');
    
    // Try with the curl command first, which we know works
    await testWithCurl();
    
    return true;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('No response received from server');
    }
    
    console.log('\nDebugging information:');
    console.log('1. The "Bad Port" error suggests the port configuration is incorrect');
    console.log('2. Try using port 22225 instead of 33335 for HTTP connections');
    console.log('3. For email/SMTP, use port 9000 with username format: zone-residential_proxy1-ip-country-us');
    
    return false;
  }
}

// Test SMTP connection through proxy (using correct SMTP ports)
async function testSmtpConnection() {
  console.log('\nTesting SMTP connection through Bright Data proxy...');
  console.log('NOTE: Bright Data may block SMTP on standard residential proxies');
  console.log('For SMTP, you might need their specialized Email Protection proxies\n');
  
  try {
    // For SMTP, Bright Data often requires a different port (9000) 
    // and username format specific for SMTP
    const smtpProxyPort = 9000; // Special port for SMTP traffic
    
    // Special formatting for SMTP - simpler than web browsing format
    const username = `${proxyUser}-ip-country-us`;
    
    console.log(`Using SMTP proxy settings: ${proxyHost}:${smtpProxyPort}`);
    console.log(`Using username format: ${username}`);
    
    // Create proxy URL and agent for SMTP
    const proxyUrl = `http://${username}:${proxyPass}@${proxyHost}:${smtpProxyPort}`;
    const httpAgent = new HttpProxyAgent(proxyUrl);
    
    // Create nodemailer transport with proxy
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
      debug: true, // Enable debug output
      logger: true, // Log to console
      tls: {
        rejectUnauthorized: false
      },
      socketOptions: {
        agent: httpAgent // Set the proxy agent here
      }
    });
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection through proxy successful!');
    
    // Ask if user wants to send a test email
    testEmailPrompt();
    
    return true;
  } catch (error) {
    console.error(`❌ SMTP connection through proxy failed: ${error.message}`);
    
    console.log('\nPossible Solutions:');
    console.log('1. Bright Data might be blocking SMTP traffic on your plan');
    console.log('2. You may need their Email Protection add-on for SMTP traffic');
    console.log('3. Try reaching out to Bright Data support for email proxy settings');
    
    // Try a direct SMTP connection without proxy to verify SMTP server is working
    console.log('\nTesting direct SMTP connection (no proxy) to verify server...');
    try {
      const directTransporter = nodemailer.createTransport({
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
      
      await directTransporter.verify();
      console.log('✅ Direct SMTP connection works! The issue is with the proxy.');
    } catch (directError) {
      console.error(`❌ Direct SMTP connection also failed: ${directError.message}`);
      console.log('There may be an issue with your SMTP settings as well.');
    }
    
    return false;
  }
}

// Helper function to handle test email prompt
function testEmailPrompt() {
  console.log('\nWould you like to send a test email through the proxy? (y/n)');
  process.stdin.once('data', async (data) => {
    const answer = data.toString().trim().toLowerCase();
    
    if (answer === 'y' || answer === 'yes') {
      console.log('\nEnter recipient email address:');
      process.stdin.once('data', async (recipientData) => {
        const recipient = recipientData.toString().trim();
        
        console.log(`\nSending test email to ${recipient}...`);
        
        try {
          // Create a new transporter for this test
          const username = `${proxyUser}-ip-country-us`;
          const proxyUrl = `http://${username}:${proxyPass}@${proxyHost}:9000`;
          const httpAgent = new HttpProxyAgent(proxyUrl);
          
          const transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure,
            auth: {
              user: config.smtp.user,
              pass: config.smtp.pass
            },
            socketOptions: { agent: httpAgent },
            tls: { rejectUnauthorized: false }
          });
          
          const info = await transporter.sendMail({
            from: `"${config.sender.name}" <${config.smtp.user}>`,
            to: recipient,
            subject: 'Bright Data Proxy Test',
            text: 'This email was sent through a Bright Data residential proxy.',
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Bright Data Proxy Test</h2>
                <p>This email was sent through a Bright Data residential proxy at ${new Date().toISOString()}</p>
                <p>The email was routed through a residential IP address, preventing any detection of your actual IP.</p>
              </div>
            `
          });
          
          console.log(`✅ Test email sent successfully! Message ID: ${info.messageId}`);
          process.exit(0);
        } catch (error) {
          console.error(`❌ Failed to send test email: ${error.message}`);
          process.exit(1);
        }
      });
    } else {
      console.log('Test email skipped.');
      process.exit(0);
    }
  });
}

// Main function
async function main() {
  console.log('===== BRIGHT DATA PROXY TEST =====\n');
  
  console.log('IMPORTANT: Your curl test worked but Node.js test failed');
  console.log('This indicates there may be an issue with the port or formatting');
  console.log('We will try multiple configurations to find what works\n');
  
  // First test general connection through proxy
  const connectionSuccess = await testProxyConnection();
  
  if (connectionSuccess) {
    console.log('\nBasic proxy connection successful. Now testing SMTP...');
    // If general connection works, test SMTP through proxy
    await testSmtpConnection();
  } else {
    console.log('\nBasic proxy connection failed.');
    console.log('Checking if you have proxy permissions for SMTP traffic...');
    
    // Try a direct test with curl to verify API works
    const curlSuccess = await testWithCurl();
    
    if (curlSuccess) {
      console.log('\nCurl succeeded but Node.js failed.');
      console.log('This indicates an issue with how we\'re configuring the proxy in Node.');
      console.log('Trying SMTP connection anyway with alternative configuration...');
      
      await testSmtpConnection();
    } else {
      console.log('\nBoth curl and Node.js tests failed.');
      console.log('Please verify your Bright Data credentials.');
      process.exit(1);
    }
  }
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  });
}

// Export for use in other scripts
module.exports = {
  formatUsername,
  testProxyConnection,
  testSmtpConnection
};
