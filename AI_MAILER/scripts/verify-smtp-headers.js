/**
 * SMTP Headers Verification Tool
 * Tests and displays what headers your email will actually show
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const readline = require('readline');
const config = require('../config');
const proxyUtils = require('../utils/proxyUtils');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ask question helper
function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

/**
 * Format username for proxy
 */
function formatUsername(forEmail = false) {
  let username = config.proxy.auth.username;
  
  // For Bright Data, special email formatting is needed
  if (username.includes('brd-customer') && forEmail) {
    username = `${username}-ip-country-${config.proxy.residential.country}`;
  }
  // Bright Data for regular traffic
  else if (username.includes('brd-customer')) {
    const parts = username.split('-zone-');
    if (parts.length === 2) {
      const customerPart = parts[0];
      const zonePart = parts[1];
      const sessionId = config.proxy.residential.stickySession ? 
        `-session-${Math.floor(Math.random() * 1000000)}` : 
        `-session-${Date.now()}`;
      
      username = `${customerPart}-zone-${zonePart}-country-${config.proxy.residential.country}${sessionId}`;
    }
  }
  // Standard residential/ISP proxy formatting
  else if (config.proxy.type === 'residential' || config.proxy.type === 'isp') {
    const sessionId = config.proxy.residential.stickySession ? 
      `-session-${Math.floor(Math.random() * 1000000)}` : 
      `-session-${Date.now()}`;
    
    username = `${username}` +
               `-country-${config.proxy.residential.country}` + 
               (config.proxy.residential.city ? `-city-${config.proxy.residential.city}` : '') +
               (config.proxy.residential.state ? `-state-${config.proxy.residential.state}` : '') +
               sessionId;
  }
  
  return username;
}

/**
 * Create proxy agent for SMTP
 */
function createProxyAgent(forEmail = true) {
  if (!config.proxy || !config.proxy.enabled) {
    return null;
  }
  
  const username = formatUsername(forEmail);
  const proxyPort = forEmail && config.proxy.smtpPort ? config.proxy.smtpPort : config.proxy.port;
  
  try {
    if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
      const proxyUrl = `${config.proxy.protocol}://${username}:${config.proxy.auth.password}@${config.proxy.host}:${proxyPort}`;
      return new SocksProxyAgent(proxyUrl);
    } else {
      const proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${proxyPort}`;
      return new HttpProxyAgent(proxyUrl);
    }
  } catch (error) {
    console.error(`Error creating proxy agent: ${error.message}`);
    return null;
  }
}

/**
 * Test SMTP connection and send a headers test email
 */
async function sendHeadersTestEmail(recipient) {
  console.log('\nPreparing to send headers test email...');
  console.log(`Host: ${config.smtp.host}`);
  console.log(`Port: ${config.smtp.port}`);
  console.log(`Proxy enabled: ${config.proxy.enabled ? 'Yes' : 'No'}`);
  
  // Create special header object to show all details
  const headers = {
    'X-Test-Header': 'This is a test email',
    'X-Mailer': 'AI_MAILER Header Test',
    'X-Proxy-Test': config.proxy.enabled ? 'Using proxy' : 'No proxy',
    'X-Priority': '1',
    'X-Message-ID': `test-${Date.now()}`,
    'List-Unsubscribe': '<mailto:unsubscribe@example.com>'
  };
  
  try {
    // Create proxy agent
    let proxySettings = {};
    if (config.proxy.enabled) {
      const agent = createProxyAgent(true);
      if (agent) {
        console.log('Created proxy agent for SMTP');
        proxySettings = {
          socketOptions: { agent }
        };
      }
    }
    
    // Create transporter
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
      debug: true,
      logger: true,
      tls: {
        rejectUnauthorized: false
      },
      ...proxySettings
    });
    
    // Verify connection
    console.log('Verifying SMTP connection...');
    await transporter.verify();
    console.log('SMTP connection successful');
    
    // Send email
    console.log(`Sending test email to ${recipient}...`);
    const info = await transporter.sendMail({
      from: `"Headers Test" <${config.sender.email}>`,
      to: recipient,
      subject: 'SMTP Headers Test',
      headers: headers,
      text: 'This is a test email to check what headers will be visible in the email.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>SMTP Headers Test</h2>
          <p>This email was sent to verify what headers will be visible when you send emails.</p>
          <p>If your proxy is configured correctly, the "Received" headers should show your proxy's IP address instead of your real IP.</p>
          <p>Sent at: ${new Date().toISOString()}</p>
          <p><strong>Instructions:</strong></p>
          <ol>
            <li>When you receive this email, view the full headers (in Gmail, click the three dots menu and select "Show original")</li>
            <li>Look for the "Received" headers</li>
            <li>Check if your real IP address or ISP name is visible</li>
            <li>If your real IP is visible, the proxy is not working correctly for SMTP</li>
          </ol>
        </div>
      `
    });
    
    console.log('✅ Test email sent successfully!');
    console.log(`Message ID: ${info.messageId}`);
    console.log('\nPlease check your email and view the full headers to verify:');
    console.log('1. If you see your real IP address in the headers, the proxy is not working correctly');
    console.log('2. If you only see the proxy server or unrelated IPs, the proxy is working correctly');
    
    return true;
  } catch (error) {
    console.error(`❌ Error sending test email: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('===== SMTP HEADERS VERIFICATION TOOL =====');
  
  // Check if proxy is configured
  if (!config.proxy.enabled) {
    console.log('⚠️ Warning: Proxy is not enabled. Your real IP address will be visible in headers.');
    const continue_anyway = await askQuestion('Continue without proxy? (y/n): ');
    if (continue_anyway.toLowerCase() !== 'y') {
      rl.close();
      return;
    }
  } else {
    console.log('Proxy is enabled. Testing if it will correctly mask your IP...');
    
    try {
      // Check proxy IP vs direct IP
      const directIP = await proxyUtils.getCurrentIP().catch(() => 'unknown');
      const proxyIP = await proxyUtils.getProxyIP().catch(() => 'unknown');
      
      console.log(`Your direct IP: ${directIP}`);
      console.log(`Your proxy IP: ${proxyIP}`);
      
      if (directIP === proxyIP) {
        console.log('⚠️ Warning: Your direct IP and proxy IP are the same!');
        console.log('This might indicate that the proxy is not working correctly.');
      } else if (proxyIP !== 'unknown') {
        console.log('✅ Proxy connection is working (direct vs proxy IPs are different)');
      }
    } catch (error) {
      console.error(`Error checking proxy: ${error.message}`);
    }
  }
  
  // Get recipient email
  const recipient = await askQuestion('\nEnter recipient email address: ');
  if (!recipient || !recipient.includes('@')) {
    console.log('Invalid email address.');
    rl.close();
    return;
  }
  
  // Send test email
  await sendHeadersTestEmail(recipient);
  
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  rl.close();
});
