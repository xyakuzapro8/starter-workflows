/**
 * Bright Data SMTP Special Fix
 * This script specifically addresses issues with Bright Data proxy and SMTP connections
 * to prevent your real IP address from showing in email headers
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const nodemailer = require('nodemailer');
const { HttpProxyAgent } = require('http-proxy-agent');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI color codes for terminal output
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
 * Update .env file with new configuration
 */
async function updateEnvFile(updates = {}) {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = await fs.readFile(envPath, 'utf8');
    let updated = false;
    
    // Process each update
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
        updated = true;
      } else {
        envContent += `\n${key}=${value}`;
        updated = true;
      }
    }
    
    if (updated) {
      await fs.writeFile(envPath, envContent, 'utf8');
      console.log(`${colors.green}✓ Updated .env file${colors.reset}`);
    }
    
    return true;
  } catch (error) {
    console.error(`${colors.red}Error updating .env file: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test current email configuration
 */
async function testBrightDataSmtp() {
  try {
    const config = require('../config');
  
    if (!config || !config.proxy || !config.proxy.enabled) {
      console.log(`${colors.red}Proxy is not enabled in your configuration!${colors.reset}`);
      return false;
    }
    
    console.log(`${colors.blue}Testing Bright Data SMTP configuration...${colors.reset}`);
    
    // Format username specifically for Bright Data SMTP
    let username = config.proxy.auth.username;
    if (!username.includes('brd-customer')) {
      console.log(`${colors.yellow}Warning: Your proxy username doesn't appear to be a Bright Data username${colors.reset}`);
    }
    
    // Create the specialized "super-simple" username format for Bright Data SMTP
    // This is the KEY to making it work!
    username = `${username}-ip-country-${config.proxy.residential.country || 'us'}`;
    console.log(`Using simplified username format: ${username}`);
    
    // CRITICAL: For Bright Data, port 9000 works better for SMTP than the default port
    const port = config.proxy.smtpPort || 9000;
    console.log(`Using port ${port} for Bright Data SMTP proxy`);
    
    // Create proxy URL and agent
    const proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${port}`;
    const agent = new HttpProxyAgent(proxyUrl);
    
    try {
      // Create SMTP transporter with the proxy agent
      console.log(`\nConnecting to ${config.smtp.host}:${config.smtp.port} through Bright Data...`);
      
      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass
        },
        connectionTimeout: 60000, // Longer timeout
        greetingTimeout: 60000, // Longer timeout
        socketTimeout: 60000,    // Longer timeout
        logger: true,            // Enable logging
        debug: true,             // Enable debug output
        tls: {
          rejectUnauthorized: false
        },
        // This is the CRITICAL fix - ensure socket options has the proxy agent
        socketOptions: { 
          agent 
        }
      });
      
      console.log(`\nVerifying SMTP connection...`);
      await transporter.verify();
      console.log(`${colors.green}✓ Connection successful!${colors.reset}`);
      
      // Ask if user wants to send a test email
      const sendTest = await ask(`\nWould you like to send a test email? (y/n): `);
      if (sendTest.toLowerCase() === 'y') {
        const recipient = await ask(`Enter recipient address: `);
        
        // Send test email
        console.log(`\nSending test email to ${recipient}...`);
        
        const info = await transporter.sendMail({
          from: `"Bright Data Test" <${config.smtp.user}>`,
          to: recipient,
          subject: 'Bright Data Proxy SMTP Test',
          text: 'If you receive this email, the Bright Data SMTP proxy configuration is working correctly.',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
              <h2>Bright Data SMTP Test</h2>
              <p>This email was sent at ${new Date().toISOString()} through a Bright Data proxy.</p>
              <p>If you received this email and your real IP is not visible in the headers, the configuration is working correctly!</p>
              <p><strong>How to check:</strong> View the email headers (in Gmail, click the three dots → "Show original") and look for the "Received:" headers. Your real IP should not be visible.</p>
            </div>
          `
        });
        
        console.log(`${colors.green}✓ Test email sent! ID: ${info.messageId}${colors.reset}`);
        console.log(`Please check the email headers to verify your IP is hidden.`);
      }
      
      return true;
    } catch (error) {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      console.log('\nTroubleshooting tips:');
      console.log('1. Make sure your Bright Data account has SMTP capabilities enabled');
      console.log('2. Try using port 9000 which is specialized for SMTP traffic');
      console.log('3. Check if your plan allows proxy usage with SMTP servers');
      return false;
    }
  } catch (error) {
    console.error(`${colors.red}Error loading configuration: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Update utils/proxySmtp.js file to enhance SMTP proxy handling
 */
async function fixProxySmtpFile() {
  console.log(`\n${colors.blue}Updating proxySmtp.js to enhance SMTP proxy handling...${colors.reset}`);
  
  const proxySmtpPath = path.join(__dirname, '..', 'utils', 'proxySmtp.js');
  
  try {
    let content = await fs.readFile(proxySmtpPath, 'utf8');
    
    // Update the getProxyAgent function to handle Bright Data specially
    const getProxyAgentFunction = `
/**
 * Get HTTP/SOCKS proxy agent for SMTP connections
 * @param {boolean} forEmail - Format username specifically for email traffic
 * @returns {Object} - Configured proxy agent
 */
function getProxyAgent(forEmail = true) {
  try {
    // Format username based on proxy provider
    let username = config.proxy.auth.username;
    const port = forEmail && config.proxy.smtpPort ? config.proxy.smtpPort : config.proxy.port;
    
    // For Bright Data, special email formatting is required - super simple format
    if (username.includes('brd-customer') && forEmail) {
      // CRITICAL FIX: For Bright Data, email traffic MUST use this simple -ip-country format 
      // without any additional parameters to avoid revealing real IP
      username = \`\${username}-ip-country-\${config.proxy.residential.country}\`;
      logger.debug(\`Using Bright Data email format: \${username}\`);
    } 
    // For other residential proxies
    else if (config.proxy.type === 'residential' || config.proxy.type === 'isp') {
      const sessionId = config.proxy.residential.stickySession ? 
        \`-session-\${Math.floor(Math.random() * 1000000)}\` : 
        \`-session-\${Date.now()}\`;
      
      username = \`\${username}\` +
                \`-country-\${config.proxy.residential.country}\` + 
                (config.proxy.residential.city ? \`-city-\${config.proxy.residential.city}\` : '') +
                sessionId;
    }
    
    // Create appropriate agent based on protocol
    let agent;
    if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
      const proxyUrl = \`\${config.proxy.protocol}://\${username}:\${config.proxy.auth.password}@\${config.proxy.host}:\${port}\`;
      agent = new SocksProxyAgent(proxyUrl);
      logger.debug(\`Created \${config.proxy.protocol} proxy agent for email\`);
    } else {
      const proxyUrl = \`http://\${username}:\${config.proxy.auth.password}@\${config.proxy.host}:\${port}\`;
      agent = new HttpProxyAgent(proxyUrl);
      logger.debug(\`Created HTTP proxy agent for email\`);
    }
    
    return agent;
  } catch (error) {
    logger.error(\`Failed to create proxy agent: \${error.message}\`);
    return null;
  }
}
`;

    // Check if we need to replace the function
    if (content.includes('function getProxyAgent')) {
      // Replace the existing function
      const getProxyAgentPattern = /function getProxyAgent\([^)]*\) \{[\s\S]*?\}/;
      content = content.replace(getProxyAgentPattern, getProxyAgentFunction.trim());
      await fs.writeFile(proxySmtpPath, content, 'utf8');
      console.log(`${colors.green}✓ Updated proxySmtp.js with enhanced Bright Data support${colors.reset}`);
    } else {
      console.log(`${colors.yellow}! Could not find getProxyAgent function in proxySmtp.js${colors.reset}`);
    }
    
    return true;
  } catch (error) {
    // If file doesn't exist yet, that's ok - it will be created by other fixes
    if (error.code === 'ENOENT') {
      console.log(`${colors.yellow}! proxySmtp.js not found - will be created by main fixes${colors.reset}`);
      return true;
    }
    
    console.error(`${colors.red}Error updating proxySmtp.js: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.clear();
  console.log(`${colors.bright}===== BRIGHT DATA SMTP FIX =====
${colors.reset}This tool fixes the issue with real IP addresses showing in email headers
when using Bright Data proxies with SMTP connections.\n`);

  // 1. Check if using Bright Data
  const config = require('../config');
  
  if (!config.proxy.enabled) {
    console.log(`${colors.red}Proxy is not enabled in your configuration${colors.reset}`);
    const enableProxy = await ask('Would you like to enable the proxy now? (y/n): ');
    if (enableProxy.toLowerCase() === 'y') {
      await updateEnvFile({ 'PROXY_ENABLED': 'true' });
    } else {
      console.log('Exiting without changes');
      rl.close();
      return;
    }
  }
  
  // 2. Configure Bright Data SMTP port
  if (!config.proxy.smtpPort) {
    console.log(`\n${colors.yellow}No SMTP-specific proxy port configured${colors.reset}`);
    console.log('For Bright Data, port 9000 is recommended for SMTP traffic');
    const setPort = await ask('Would you like to configure port 9000 for SMTP traffic? (y/n): ');
    if (setPort.toLowerCase() === 'y') {
      await updateEnvFile({ 'PROXY_SMTP_PORT': '9000' });
    }
  }
  
  // 3. Fix the proxySmtp.js file
  await fixProxySmtpFile();
  
  // 4. Test the SMTP connection
  console.log('\n');
  await testBrightDataSmtp();
  
  console.log(`\n${colors.bright}====== NEXT STEPS ======${colors.reset}`);
  console.log('1. Restart your application to apply all changes');
  console.log('2. Send a test email and check the headers');
  console.log('3. Verify that your real IP is no longer visible in the headers');
  
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  rl.close();
});
