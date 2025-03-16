/**
 * Fix Email Headers - Prevents IP Leakage
 * This script specifically addresses the issue of real IP addresses 
 * appearing in email headers when using Bright Data proxies
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent'); // Add missing import
const axios = require('axios');
const readline = require('readline');
const config = require('../config'); // Ensure config is imported
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

// Ask question helper
function ask(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

/**
 * Test IP through proxy and direct connection
 * @returns {Promise} Results of IP test
 */
async function testConnections() {
  console.log('\nTesting IP addresses to verify proxy connection...');
  
  try {
    // Check direct IP
    const directResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
    const directIP = directResponse.data.ip;
    console.log(`${colors.yellow}Your real IP: ${directIP}${colors.reset}`);
    
    // Check IP through proxy
    if (!config.proxy.enabled) {
      console.log('Proxy is not enabled in your configuration');
      return { directIP, proxyIP: null, working: false };
    }
    
    // Format username for Bright Data or other residential proxy
    let username = config.proxy.auth.username;
    if (username.includes('brd-customer')) {
      // Format for Bright Data web requests
      const parts = username.split('-zone-');
      if (parts.length === 2) {
        const customerPart = parts[0];
        const zonePart = parts[1];
        username = `${customerPart}-zone-${zonePart}-country-${config.proxy.residential.country || 'us'}-session-${Date.now()}`;
      }
    } else if (config.proxy.type === 'residential') {
      // Format for other residential proxies
      username = `${username}-country-${config.proxy.residential.country || 'us'}-session-${Date.now()}`;
    }
    
    // Create proxy URL and agent
    const proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${config.proxy.port}`;
    const agent = new HttpProxyAgent(proxyUrl);
    
    // Check proxy IP
    const proxyResponse = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      timeout: 15000
    });
    
    const proxyIP = proxyResponse.data.ip;
    console.log(`${colors.green}Proxy IP: ${proxyIP}${colors.reset}`);
    
    const isWorking = directIP !== proxyIP;
    
    if (isWorking) {
      console.log(`${colors.green}✓ Proxy connection is working correctly!${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ ISSUE DETECTED: Your proxy is not masking your IP address${colors.reset}`);
    }
    
    return { directIP, proxyIP, working: isWorking };
  } catch (error) {
    console.error(`${colors.red}Error testing connection: ${error.message}${colors.reset}`);
    return { directIP: 'unknown', proxyIP: 'error', working: false };
  }
}

/**
 * Fix the aiMailer.js file to properly handle proxy configuration
 */
async function fixMailerFile() {
  console.log('\nUpdating aiMailer.js to fix the proxy routing issue...');
  
  const mailerPath = path.join(__dirname, '..', 'aiMailer.js');
  
  try {
    let content = await fs.readFile(mailerPath, 'utf8');
    let updated = false;
    
    // Check for the critical issue: socketOptions needs to be configured properly
    if (!content.includes('socketOptions: { agent') || 
        !content.includes('forEmail = false') || 
        !content.includes('-ip-country-')) {
      
      // Add or update the getProxyAgent function to handle Bright Data correctly
      const getProxyAgentPattern = /function getProxyAgent\([^)]*\) \{[\s\S]*?\}/;
      const fixedProxyAgentFunction = `function getProxyAgent(forceNew = false, forEmail = false) {
  // If we have a valid agent and don't need to force a new one, return it
  if (currentProxyAgent && !forceNew && config.proxy.residential.stickySession) {
    return currentProxyAgent;
  }
  
  try {
    // Format username for residential proxy targeting
    let username = config.proxy.auth.username;
    let proxyPort = forEmail && config.proxy.smtpPort ? config.proxy.smtpPort : config.proxy.port;
    
    // Special handling for Bright Data with email traffic
    if (username.includes('brd-customer') && forEmail) {
      // CRITICAL FIX: For Bright Data, email traffic MUST use the -ip-country format
      // without other parameters to avoid revealing your real IP in headers
      username = \`\${username}-ip-country-\${config.proxy.residential.country}\`;
      
      // Use special port 9000 for SMTP if configured
      if (config.proxy.brightData?.useAlternatePort && config.proxy.smtpPort) {
        proxyPort = config.proxy.smtpPort;
        logger.info(\`Using Bright Data specialized SMTP port: \${proxyPort}\`);
      }
    } 
    // Standard Bright Data format for regular web traffic
    else if (username.includes('brd-customer')) {
      const parts = username.split('-zone-');
      if (parts.length === 2) {
        const customerPart = parts[0]; // e.g., brd-customer-hl_c86a3063
        const zonePart = parts[1]; // e.g., residential_proxy1
        
        const sessionId = config.proxy.residential.stickySession ? 
          \`-session-\${Math.floor(Math.random() * 1000000)}\` : 
          \`-session-\${Date.now()}\`;
          
        username = \`\${customerPart}-zone-\${zonePart}-country-\${config.proxy.residential.country}\${sessionId}\` + 
                  (config.proxy.residential.city ? \`-city-\${config.proxy.residential.city}\` : '');
      }
    } 
    // Standard format for other residential proxies
    else if (config.proxy.type === 'residential') {
      const sessionId = config.proxy.residential.stickySession ? 
        \`-session-\${Math.floor(Math.random() * 1000000)}\` : 
        \`-session-\${Date.now()}\`;
      
      username = \`\${username}-country-\${config.proxy.residential.country}\` + 
               (config.proxy.residential.city ? \`-city-\${config.proxy.residential.city}\` : '') +
               sessionId;
    }
    
    // Create the appropriate agent based on protocol
    let proxyUrl, agent;
    
    if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
      proxyUrl = \`\${config.proxy.protocol}://\${username}:\${config.proxy.auth.password}@\${config.proxy.host}:\${proxyPort}\`;
      agent = new SocksProxyAgent(proxyUrl);
      logger.debug(\`Created \${config.proxy.protocol} proxy agent for \${forEmail ? 'email' : 'web'} with username: \${username}\`);
    } else {
      proxyUrl = \`http://\${username}:\${config.proxy.auth.password}@\${config.proxy.host}:\${proxyPort}\`;
      agent = new HttpProxyAgent(proxyUrl);
      logger.debug(\`Created HTTP proxy agent for \${forEmail ? 'email' : 'web'} with username: \${username}\`);
    }
    
    // Update rotation timestamp and save agent
    lastRotation = Date.now();
    currentProxyAgent = agent;
    
    return agent;
  } catch (error) {
    logger.error(\`Failed to create proxy agent: \${error.message}\`);
    return null;
  }
}`;

      // Replace the existing getProxyAgent function or add it if not found
      if (content.match(getProxyAgentPattern)) {
        content = content.replace(getProxyAgentPattern, fixedProxyAgentFunction);
        updated = true;
      } else {
        // If function not found, add it before module.exports
        const exportPattern = /module\.exports/;
        if (content.match(exportPattern)) {
          content = content.replace(exportPattern, 
            `${fixedProxyAgentFunction}\n\n/**\n * Create proxy settings for nodemailer\n */\nfunction createProxySettings() {
  if (!config.proxy || !config.proxy.enabled) {
    return {};
  }
  
  const agent = getProxyAgent(false, true); // true indicates this is for email/SMTP
  
  if (!agent) {
    logger.warn('Failed to create proxy agent, will connect directly');
    return {};
  }
  
  // CRITICAL FIX: Using socketOptions with the agent ensures ALL SMTP traffic 
  // goes through the proxy, including the initial connection handshake
  return {
    socketOptions: { agent }
  };
}\n\nmodule.exports`);
          updated = true;
        }
      }
    }
    
    // Ensure appropriate imports
    if (!content.includes('HttpProxyAgent') || !content.includes('SocksProxyAgent')) {
      const importPattern = /const nodemailer = require\('nodemailer'\);/;
      const proxyImports = `const nodemailer = require('nodemailer');\nconst { HttpProxyAgent } = require('http-proxy-agent');\nconst { SocksProxyAgent } = require('socks-proxy-agent');`;
      content = content.replace(importPattern, proxyImports);
      updated = true;
    }
    
    // Save the updated file if changes were made
    if (updated) {
      await fs.writeFile(mailerPath, content, 'utf8');
      console.log(`${colors.green}✓ Successfully updated aiMailer.js with fixed proxy configuration${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ No changes needed in aiMailer.js${colors.reset}`);
    }
    
    return true;
  } catch (error) {
    console.error(`${colors.red}Error updating aiMailer.js: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test SMTP with properly configured proxy
 */
async function testSmtpProxy() {
  console.log('\nTesting SMTP connection with updated proxy configuration...');
  
  try {
    // Use proper format for Bright Data SMTP
    let username = config.proxy.auth.username;
    let port = config.proxy.smtpPort || config.proxy.port;
    
    // Special handling for Bright Data
    if (username.includes('brd-customer')) {
      username = `${username}-ip-country-${config.proxy.residential.country}`;
      console.log(`${colors.cyan}Using Bright Data SMTP format: ${username}${colors.reset}`);
      
      // Suggest using port 9000 for Bright Data SMTP if not already set
      if (!config.proxy.smtpPort || config.proxy.smtpPort !== 9000) {
        console.log(`${colors.yellow}⚠ Recommendation: Use port 9000 specifically for Bright Data SMTP traffic${colors.reset}`);
        const usePort9000 = await ask('Would you like to use port 9000 for SMTP? (y/n): ');
        if (usePort9000.toLowerCase() === 'y') {
          port = 9000;
          // Update the .env file with the new SMTP port
          try {
            const envPath = path.join(__dirname, '..', '.env');
            let envContent = await fs.readFile(envPath, 'utf8');
            if (envContent.includes('PROXY_SMTP_PORT=')) {
              envContent = envContent.replace(/PROXY_SMTP_PORT=.*/, 'PROXY_SMTP_PORT=9000');
            } else {
              envContent += '\nPROXY_SMTP_PORT=9000';
            }
            await fs.writeFile(envPath, envContent, 'utf8');
            console.log(`${colors.green}✓ Updated .env with SMTP proxy port 9000${colors.reset}`);
          } catch (err) {
            console.error(`${colors.red}Error updating .env file: ${err.message}${colors.reset}`);
          }
        }
      }
    }
    
    // Create proxy URL and agent
    const proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${port}`;
    const agent = new HttpProxyAgent(proxyUrl);
    
    // Create SMTP transporter with proxy
    console.log(`Testing connection to SMTP server ${config.smtp.host}:${config.smtp.port} through proxy...`);
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
      socketOptions: { agent } // This is the critical part
    });
    
    // Verify connection
    await transporter.verify();
    console.log(`${colors.green}✓ SMTP connection through proxy successful!${colors.reset}`);
    
    // Ask to send a test email
    const sendTest = await ask('\nWould you like to send a test email to verify the fix? (y/n): ');
    if (sendTest.toLowerCase() === 'y') {
      const recipient = await ask('Enter recipient email address: ');
      
      console.log(`\nSending test email to ${recipient}...`);
      const info = await transporter.sendMail({
        from: `"Header Test" <${config.smtp.user}>`,
        to: recipient,
        subject: 'IP Header Test - Fixed',
        text: 'This is a test email to verify that your proxy is properly masking your IP address.',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>IP Address Test - Fixed Configuration</h2>
            <p>This email was sent using the fixed proxy configuration that should properly mask your IP address.</p>
            <p>Please check the email headers to verify that your real IP address is not visible.</p>
            <p>Send time: ${new Date().toISOString()}</p>
            <p><strong>How to check:</strong><br>
            1. View the full headers of this email (in Gmail, click the three dots and select "Show original")<br>
            2. Look for "Received:" headers<br>
            3. Your real IP should no longer be visible in these headers
            </p>
          </div>
        `
      });
      
      console.log(`${colors.green}✓ Test email sent successfully! ${info.messageId}${colors.reset}`);
      console.log(`\nPlease check the email and verify that your real IP address (${colors.yellow}${await getLocalIP()}${colors.reset}) is not visible in the headers.`);
    }
    
    return true;
  } catch (error) {
    console.error(`${colors.red}SMTP test failed: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Get local IP address using quick shell command
 */
async function getLocalIP() {
  try {
    // Different commands for different OS
    const command = process.platform === 'win32' 
      ? 'powershell -command "Get-NetIPAddress | Where-Object {$_.AddressFamily -eq \'IPv4\' -and $_.PrefixOrigin -ne \'WellKnown\'} | Select-Object -First 1 -ExpandProperty IPAddress"' 
      : "ifconfig | grep 'inet ' | grep -v 127.0.0.1 | awk '{print $2}' | head -1";
    
    const { stdout } = await execPromise(command);
    return stdout.trim();
  } catch (error) {
    return "Could not determine local IP";
  }
}

/**
 * Main function
 */
async function main() {
  console.clear();
  console.log(`${colors.bright}===== EMAIL HEADERS FIX =====${colors.reset}`);
  console.log('This script will fix the issue with your real IP appearing in email headers\n');
  
  // Check if proxy is enabled
  if (!config.proxy.enabled) {
    console.log(`${colors.red}Proxy is not enabled in your configuration!${colors.reset}`);
    const enableProxy = await ask('Would you like to enable the proxy now? (y/n): ');
    if (enableProxy.toLowerCase() !== 'y') {
      rl.close();
      return;
    }
    
    // Enable proxy in .env
    try {
      const envPath = path.join(__dirname, '..', '.env');
      let envContent = await fs.readFile(envPath, 'utf8');
      envContent = envContent.replace(/PROXY_ENABLED=.*/g, 'PROXY_ENABLED=true');
      if (!envContent.includes('PROXY_ENABLED=')) {
        envContent += '\nPROXY_ENABLED=true';
      }
      await fs.writeFile(envPath, envContent, 'utf8');
      console.log(`${colors.green}✓ Proxy enabled in .env${colors.reset}`);
    } catch (err) {
      console.error(`${colors.red}Error updating .env file: ${err.message}${colors.reset}`);
      rl.close();
      return;
    }
  }
  
  // Test connections to check current status
  const { directIP, proxyIP, working } = await testConnections();
  
  // Fix the aiMailer.js file to handle proxy properly
  const fileFixed = await fixMailerFile();
  
  // Test SMTP with the updated configuration
  if (fileFixed) {
    await testSmtpProxy();
  }
  
  console.log(`\n${colors.bright}Summary:${colors.reset}`);
  console.log(`• Your real IP address: ${colors.yellow}${directIP}${colors.reset}`);
  console.log(`• Proxy IP address: ${colors.cyan}${proxyIP || 'Unknown'}${colors.reset}`);
  console.log(`• Web proxy working: ${working ? colors.green + 'Yes' + colors.reset : colors.red + 'No' + colors.reset}`);
  console.log(`• aiMailer.js updated: ${fileFixed ? colors.green + 'Yes' + colors.reset : colors.red + 'No' + colors.reset}`);
  
  console.log(`\n${colors.bright}What to do next:${colors.reset}`);
  console.log('1. Send another test email using the send.js script');
  console.log('2. Check the headers in the received email to verify your real IP is not visible');
  console.log('3. If you still see your real IP, restart your application to apply all changes');
  
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  rl.close();
});
