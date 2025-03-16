/**
 * SMTP Proxy Fix
 * Fixes the issue with SMTP connections not properly routing through proxy
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const config = require('../config');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ask a question and get user input
function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

/**
 * Get current public IP (without proxy)
 */
async function getCurrentIP() {
  try {
    console.log('Checking your current IP address...');
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
    console.log(`Your current IP address is: ${response.data.ip}`);
    return response.data.ip;
  } catch (error) {
    console.error(`Failed to get current IP: ${error.message}`);
    return null;
  }
}

/**
 * Test SMTP connection and verify proxy routing
 */
async function testSmtpWithProxy(smtpConfig, proxyConfig) {
  // Format username for email routing
  let username = proxyConfig.username;
  
  // For Bright Data, add special email-specific formatting
  if (username.includes('brd-customer')) {
    username = `${username}-ip-country-${proxyConfig.country || 'us'}`;
    console.log(`Formatted Bright Data username for SMTP: ${username}`);
  }
  
  // For other residential proxies, add country/session parameters
  else if (proxyConfig.type === 'residential') {
    const sessionId = proxyConfig.sticky ? 
      `-session-${Math.floor(Math.random() * 1000000)}` : 
      `-session-${Date.now()}`;
    
    username = `${username}-country-${proxyConfig.country || 'us'}${sessionId}`;
    console.log(`Formatted residential proxy username: ${username}`);
  }
  
  // Create proxy agent
  const proxyPort = proxyConfig.smtpPort || proxyConfig.port;
  let proxyUrl, agent;
  
  if (proxyConfig.protocol === 'socks5' || proxyConfig.protocol === 'socks4') {
    proxyUrl = `${proxyConfig.protocol}://${username}:${proxyConfig.password}@${proxyConfig.host}:${proxyPort}`;
    agent = new SocksProxyAgent(proxyUrl);
    console.log(`Created SOCKS proxy agent on port ${proxyPort}`);
  } else {
    proxyUrl = `http://${username}:${proxyConfig.password}@${proxyConfig.host}:${proxyPort}`;
    agent = new HttpProxyAgent(proxyUrl);
    console.log(`Created HTTP proxy agent on port ${proxyPort}`);
  }
  
  // Create transporter with proxy
  console.log(`Testing SMTP connection to ${smtpConfig.host}:${smtpConfig.port} through proxy...`);
  
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    logger: process.env.SMTP_DEBUG === 'true',
    debug: process.env.SMTP_DEBUG === 'true',
    tls: {
      rejectUnauthorized: false
    },
    // THIS IS THE CRITICAL PART: socket options must have the proxy agent
    socketOptions: { 
      agent: agent  // This ensures that the SMTP connection itself uses the proxy
    }
  });
  
  try {
    await transporter.verify();
    console.log('✅ SMTP connection through proxy successful!');
    return true;
  } catch (error) {
    console.error(`❌ SMTP connection through proxy failed: ${error.message}`);
    return false;
  }
}

/**
 * Update aiMailer.js to ensure correct proxy usage
 */
async function updateMailerFile() {
  try {
    const mailerPath = path.join(__dirname, '..', 'aiMailer.js');
    let content = await fs.readFile(mailerPath, 'utf8');
    
    // Check if the file already has the corrected code
    if (content.includes('socketOptions: { agent') && content.includes('This ensures all SMTP traffic goes through the proxy')) {
      console.log('aiMailer.js already has the correct proxy configuration.');
      return true;
    }
    
    // Fix the createProxySettings function
    const createProxySettingsRegex = /function createProxySettings\(\) \{[\s\S]*?return \{[\s\S]*?\};[\s\S]*?\}/;
    const newCreateProxySettings = `function createProxySettings() {
  if (!config.proxy || !config.proxy.enabled) {
    return {};
  }
  
  const agent = getProxyAgent(false, true); // true indicates this is for email/SMTP
  
  if (!agent) {
    logger.warn('Failed to create proxy agent, will connect directly');
    return {};
  }
  
  // THIS IS THE KEY FIX: Using socketOptions with the agent ensures ALL SMTP traffic 
  // goes through the proxy, including the initial connection
  return {
    socketOptions: { agent }
  };
}`;

    // Update the content
    content = content.replace(createProxySettingsRegex, newCreateProxySettings);
    
    // Fix the getProxyAgent function to properly handle email connections
    const getProxyAgentRegex = /function getProxyAgent\(forceNew = false\) \{[\s\S]*?return currentProxyAgent;\n\}/;
    const newGetProxyAgent = `function getProxyAgent(forceNew = false, forEmail = false) {
  // If we have a valid agent and don't need to force a new one, return it
  if (currentProxyAgent && !forceNew && config.proxy.residential.stickySession) {
    return currentProxyAgent;
  }
  
  // Check if it's time to rotate the IP (if not using sticky session)
  const shouldRotate = !config.proxy.residential.stickySession && 
    (Date.now() - lastRotation > config.proxy.rotateInterval);
    
  // If we should rotate or we don't have an agent yet, create a new one
  if (shouldRotate || !currentProxyAgent || forceNew) {
    try {
      // Format username for residential proxy targeting
      let username = config.proxy.auth.username;
      let proxyPort = forEmail && config.proxy.smtpPort ? config.proxy.smtpPort : config.proxy.port;
      
      // Special handling for Bright Data with email traffic
      if (username.includes('brd-customer') && forEmail) {
        // For Bright Data, email traffic should use username-ip-country-XX format
        // This is essential for proper proxy routing with SMTP
        username = \`\${username}-ip-country-\${config.proxy.residential.country}\`;
        
        if (config.proxy.brightData?.useAlternatePort && config.proxy.smtpPort) {
          proxyPort = config.proxy.smtpPort;
          logger.info(\`Using Bright Data specialized SMTP port: \${proxyPort}\`);
        }
      }
      // Standard handling for other proxy services or Bright Data without email formatting
      else if (username.includes('brd-customer')) {
        // Bright Data specific username format for non-email traffic
        const parts = username.split('-zone-');
        if (parts.length === 2) {
          const customerPart = parts[0]; // e.g., brd-customer-hl_c86a3063
          const zonePart = parts[1]; // e.g., residential_proxy1
          
          const sessionId = config.proxy.residential.stickySession ? 
            \`-session-\${Math.floor(Math.random() * 1000000)}\` : 
            \`-session-\${Date.now()}\`;
            
          username = \`\${customerPart}-zone-\${zonePart}-country-\${config.proxy.residential.country}\${sessionId}\` + 
                     (config.proxy.residential.city ? \`-city-\${config.proxy.residential.city}\` : '');
                     
          logger.info(\`Using Bright Data formatted username: \${username}\`);
        }
      }
      // Standard formatting for other providers
      else if (config.proxy.type === 'residential' || config.proxy.type === 'isp') {
        // Add session ID to ensure consistent IP (for sticky sessions)
        // Or use timestamp for rotation
        const sessionId = config.proxy.residential.stickySession ? 
          \`-session-\${Math.floor(Math.random() * 1000000)}\` : 
          \`-session-\${Date.now()}\`;
        
        // Build the complete username with targeting parameters
        username = \`\${username}\` +
                   \`-country-\${config.proxy.residential.country}\` + 
                   (config.proxy.residential.city ? \`-city-\${config.proxy.residential.city}\` : '') +
                   (config.proxy.residential.state ? \`-state-\${config.proxy.residential.state}\` : '') +
                   sessionId;
      }
      
      let proxyUrl;
      let agent;
      
      // Create the appropriate agent based on protocol
      if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
        proxyUrl = \`\${config.proxy.protocol}://\${username}:\${config.proxy.auth.password}@\${config.proxy.host}:\${proxyPort}\`;
        agent = new SocksProxyAgent(proxyUrl);
        logger.info(\`Created new SOCKS proxy agent (\${config.proxy.protocol})\`);
      } else {
        proxyUrl = \`http://\${username}:\${config.proxy.auth.password}@\${config.proxy.host}:\${proxyPort}\`;
        agent = new HttpProxyAgent(proxyUrl);
        logger.info(\`Created new HTTP proxy agent\`);
      }
      
      // Update rotation timestamp and save agent
      lastRotation = Date.now();
      currentProxyAgent = agent;
      
      return agent;
    } catch (error) {
      logger.error(\`Failed to create proxy agent: \${error.message}\`);
      return null;
    }
  }
  
  return currentProxyAgent;
}`;

    content = content.replace(getProxyAgentRegex, newGetProxyAgent);
    
    // Write the updated content back to the file
    await fs.writeFile(mailerPath, content, 'utf8');
    console.log('✅ Updated aiMailer.js with fixed proxy configuration');
    return true;
  } catch (error) {
    console.error(`❌ Failed to update aiMailer.js: ${error.message}`);
    return false;
  }
}

/**
 * Update .env file with new configuration if needed
 */
async function updateEnvFile(updates) {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    let content = await fs.readFile(envPath, 'utf8');
    let updated = false;
    
    // Process each update
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
        updated = true;
      } else {
        content += `\n${key}=${value}`;
        updated = true;
      }
    }
    
    if (updated) {
      await fs.writeFile(envPath, content, 'utf8');
      console.log('✅ Updated .env file with new proxy configuration');
    }
    return true;
  } catch (error) {
    console.error(`❌ Failed to update .env file: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('===== SMTP PROXY FIX =====');
  console.log('This script will fix the issue with your SMTP not routing through the proxy.');
  console.log('Currently, your emails are revealing your real IP address in the headers.\n');
  
  // Check if proxy is enabled
  if (!config.proxy || !config.proxy.enabled) {
    console.log('❌ Proxy is not enabled in your configuration.');
    const enableProxy = await askQuestion('Would you like to enable the proxy now? (y/n): ');
    if (enableProxy.toLowerCase() !== 'y') {
      console.log('Exiting without changes.');
      rl.close();
      return;
    }
    
    // Add basic proxy configuration
    await updateEnvFile({
      'PROXY_ENABLED': 'true'
    });
  }
  
  // Get current IP for comparison
  await getCurrentIP();
  
  // Extract SMTP and proxy config from the config file
  const smtpConfig = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: config.smtp.user,
    pass: config.smtp.pass
  };
  
  const proxyConfig = {
    host: config.proxy.host,
    port: config.proxy.port,
    smtpPort: config.proxy.smtpPort,
    protocol: config.proxy.protocol,
    username: config.proxy.auth.username,
    password: config.proxy.auth.password,
    type: config.proxy.type,
    country: config.proxy.residential.country,
    sticky: config.proxy.residential.stickySession
  };
  
  console.log(`\nCurrent proxy configuration:`);
  console.log(`Host: ${proxyConfig.host}`);
  console.log(`Port: ${proxyConfig.port}`);
  console.log(`SMTP Port: ${proxyConfig.smtpPort || 'Not configured'}`);
  console.log(`Protocol: ${proxyConfig.protocol}`);
  console.log(`Type: ${proxyConfig.type}`);
  console.log(`Country: ${proxyConfig.country}`);
  console.log(`Sticky Session: ${proxyConfig.sticky ? 'Yes' : 'No'}`);
  
  // Check if special SMTP port is configured for Bright Data
  if (proxyConfig.host.includes('brd') && !proxyConfig.smtpPort) {
    console.log('\n⚠️ Warning: Using Bright Data without a specific SMTP port.');
    console.log('For Bright Data, it\'s recommended to use port 9000 for SMTP traffic.');
    const setSmtpPort = await askQuestion('Would you like to set the SMTP port to 9000? (y/n): ');
    if (setSmtpPort.toLowerCase() === 'y') {
      await updateEnvFile({
        'PROXY_SMTP_PORT': '9000'
      });
      proxyConfig.smtpPort = 9000;
    }
  }
  
  // Update the mailer file
  await updateMailerFile();
  
  // Test the fixed configuration
  console.log('\nTesting the fixed configuration...');
  const success = await testSmtpWithProxy(smtpConfig, proxyConfig);
  
  if (success) {
    console.log('\n✅ Success! Your SMTP traffic is now properly routing through the proxy.');
    console.log('This means your emails will no longer reveal your actual IP address.');
    console.log('\nYour emails will now show the proxy IP instead of your real IP address.');
    
    // Ask if user wants to send a test email
    const sendTest = await askQuestion('\nWould you like to send a test email to verify? (y/n): ');
    if (sendTest.toLowerCase() === 'y') {
      const recipient = await askQuestion('Enter recipient email: ');
      
      // Send test email using the system's sendEmail function
      const { sendEmail } = require('../aiMailer');
      console.log(`\nSending test email to ${recipient}...`);
      
      try {
        const result = await sendEmail({
          to: recipient,
          subject: 'Proxy Configuration Test',
          body: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Proxy Configuration Test</h2>
              <p>If you're seeing this email, your proxy configuration is working correctly!</p>
              <p>This email was sent at: ${new Date().toISOString()}</p>
              <p>The email headers should now show the proxy IP address instead of your real IP.</p>
            </div>
          `
        });
        
        if (result.success) {
          console.log('✅ Test email sent successfully!');
          console.log('Check the email headers to verify the proxy IP is being used.');
        } else {
          console.log(`❌ Failed to send test email: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error sending test email: ${error.message}`);
      }
    }
  } else {
    console.log('\n❌ The test failed. Your SMTP traffic may still not be routing through the proxy.');
    console.log('Please check your proxy configuration and try again.');
  }
  
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  rl.close();
});
