/**
 * Proxy Routing Test
 * This script verifies that all SMTP connections are routing through your proxy
 */

require('dotenv').config();
const proxyUtils = require('../utils/proxyUtils');
const nodemailer = require('nodemailer');
const axios = require('axios');
const config = require('../config');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

async function main() {
  console.log('===== PROXY ROUTING TEST =====');
  console.log(`Proxy enabled: ${config.proxy.enabled ? 'Yes' : 'No'}`);
  console.log(`Proxy type: ${config.proxy.type}`);
  console.log(`Proxy provider: ${config.proxy.host}:${config.proxy.port}`);
  console.log(`Protocol: ${config.proxy.protocol}`);
  console.log(`Country: ${config.proxy.residential.country}`);
  console.log(`Sticky session: ${config.proxy.residential.stickySession ? 'Yes' : 'No'}\n`);
  
  // Step 1: Get current IP (direct connection)
  console.log('Step 1: Checking your direct IP address...');
  try {
    const directIP = await proxyUtils.getCurrentIP();
    console.log(`✓ Your direct IP address is: ${directIP}`);
  } catch (error) {
    console.log(`✗ Failed to get direct IP: ${error.message}`);
  }
  
  // Step 2: Get proxy IP
  console.log('\nStep 2: Checking your proxy IP address...');
  try {
    const proxyIP = await proxyUtils.getProxyIP();
    console.log(`✓ Your proxy IP address is: ${proxyIP}`);
    
    // Additional verification
    if (config.proxy.type === 'residential') {
      console.log('\nVerifying residential IP characteristics...');
      try {
        const ipInfoResponse = await axios.get(`https://ipinfo.io/${proxyIP}/json`);
        const ipInfo = ipInfoResponse.data;
        
        console.log(`Location: ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`);
        console.log(`ISP: ${ipInfo.org}`);
        
        // Check if this looks like a residential IP
        const isLikelyResidential = !ipInfo.org.toLowerCase().includes('hosting') && 
                                    !ipInfo.org.toLowerCase().includes('data center') &&
                                    !ipInfo.org.toLowerCase().includes('datacenter');
        
        if (isLikelyResidential) {
          console.log('✓ This appears to be a residential IP address');
        } else {
          console.log('⚠ This may not be a residential IP (detected datacenter/hosting keywords)');
        }
      } catch (error) {
        console.log(`Could not verify IP characteristics: ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`✗ Failed to get proxy IP: ${error.message}`);
    console.log('\n⚠ Your proxy configuration appears to be incorrect!');
    console.log('Please check your proxy credentials and settings in .env file');
    return;
  }
  
  // Step 3: Test SMTP connection through proxy
  console.log('\nStep 3: Testing SMTP connection through proxy...');
  
  try {
    // Create proxy agent
    let proxyAgent;
    let username = config.proxy.auth.username;
    
    // Format username for residential proxies
    if (config.proxy.type === 'residential' || config.proxy.type === 'isp') {
      const sessionId = `-session-${Date.now()}`;
      
      username = `${username}` +
                 `-country-${config.proxy.residential.country}` + 
                 (config.proxy.residential.city ? `-city-${config.proxy.residential.city}` : '') +
                 sessionId;
    }
    
    if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
      const proxyUrl = `${config.proxy.protocol}://${username}:${config.proxy.auth.password}@${config.proxy.host}:${config.proxy.port}`;
      proxyAgent = new SocksProxyAgent(proxyUrl);
      console.log(`Using SOCKS proxy agent (${config.proxy.protocol})`);
    } else {
      const proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${config.proxy.port}`;
      proxyAgent = new HttpProxyAgent(proxyUrl);
      console.log(`Using HTTP proxy agent`);
    }
    
    const proxySettings = {
      socketOptions: {
        agent: proxyAgent
      }
    };
    
    console.log(`Testing connection to ${config.smtp.host}:${config.smtp.port} through proxy...`);
    
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
      tls: {
        rejectUnauthorized: false
      },
      ...proxySettings
    });
    
    await transporter.verify();
    console.log(`✓ SMTP connection successful through proxy!`);
    
    // Offer to send a test email
    console.log('\nWould you like to send a test email through the proxy? (y/n)');
    process.stdin.once('data', async (data) => {
      const answer = data.toString().trim().toLowerCase();
      
      if (answer === 'y' || answer === 'yes') {
        const recipient = await new Promise((resolve) => {
          console.log('\nEnter recipient email address:');
          process.stdin.once('data', (data) => {
            resolve(data.toString().trim());
          });
        });
        
        console.log(`\nSending test email to ${recipient}...`);
        
        try {
          const info = await transporter.sendMail({
            from: `"Proxy Test" <${config.smtp.user}>`,
            to: recipient,
            subject: 'SMTP Proxy Routing Test',
            text: 'This is a test email sent through a residential proxy.',
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Proxy Routing Test Successful</h2>
                <p>This email was sent through a residential proxy at ${new Date().toISOString()}</p>
                <p>This confirms that your emails are not exposing your real IP address.</p>
              </div>
            `
          });
          
          console.log(`✓ Test email sent successfully! Message ID: ${info.messageId}`);
        } catch (error) {
          console.log(`✗ Failed to send test email: ${error.message}`);
        }
        
        process.exit(0);
      } else {
        console.log('Test email skipped.');
        process.exit(0);
      }
    });
    
  } catch (error) {
    console.log(`✗ SMTP connection through proxy failed: ${error.message}`);
    console.log('\n⚠ There may be an issue with your SMTP server or proxy configuration.');
    
    if (error.message.includes('auth') || error.message.includes('535')) {
      console.log('This appears to be an authentication error with your SMTP server.');
    } else if (error.message.includes('timeout')) {
      console.log('Connection timed out. Your proxy may be blocking SMTP traffic.');
    }
    
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
