/**
 * Proxy Setup Assistant
 * Configure and test proxy settings for optimal SMTP delivery
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const readline = require('readline');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const nodemailer = require('nodemailer');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Main proxy providers
const proxyProviders = [
  {
    name: 'Oxylabs Residential Proxies',
    type: 'residential',
    protocol: 'http',
    host: 'pr.oxylabs.io',
    port: 7777,
    description: 'Large pool of residential IPs with good email deliverability',
    urlFormat: '${username}:${password}@${host}:${port}'
  },
  {
    name: 'Bright Data (Luminati) Residential',
    type: 'residential',
    protocol: 'http',
    host: 'brd.superproxy.io',
    port: 22225,
    description: 'Premium residential IPs with country/city targeting',
    urlFormat: '${username}:${password}@${host}:${port}'
  },
  {
    name: 'SOAX Residential Proxies',
    type: 'residential',
    protocol: 'socks5',
    host: 'proxy.soax.com',
    port: 9150,
    description: 'Residential proxies optimized for email sending',
    urlFormat: '${username}:${password}@${host}:${port}'
  },
  {
    name: 'IPRoyal Residential Proxies',
    type: 'residential',
    protocol: 'http',
    host: 'proxy.iproyal.com',
    port: 12321,
    description: 'More affordable residential proxies',
    urlFormat: '${username}:${password}@${host}:${port}'
  },
  {
    name: 'SmartProxy ISP Proxies',
    type: 'isp',
    protocol: 'http',
    host: 'gate.smartproxy.com',
    port: 7000,
    description: 'ISP proxies (datacenter IPs registered with ISPs)',
    urlFormat: '${username}:${password}@${host}:${port}'
  }
];

/**
 * Ask a question and get user input
 */
function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

/**
 * Test proxy connection by checking IP
 */
async function testProxyConnection(proxyConfig) {
  try {
    console.log(`Testing connection to ${proxyConfig.host}:${proxyConfig.port}...`);
    
    let agent;
    let proxyUrl;
    
    // Format proxy URL based on protocol
    if (proxyConfig.protocol === 'socks5' || proxyConfig.protocol === 'socks4') {
      proxyUrl = `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
      agent = new HttpProxyAgent(proxyUrl);
    }
    
    // Test connection with 10s timeout
    const response = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      timeout: 10000
    });
    
    return {
      success: true,
      ip: response.data.ip,
      message: "Connection successful"
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Test SMTP with proxy
 */
async function testSmtpWithProxy(smtpConfig, proxyConfig) {
  try {
    console.log(`Testing SMTP through ${proxyConfig.host} proxy...`);
    
    let proxySettings = {};
    let proxyUrl;
    
    // Create proxy agent based on protocol
    if (proxyConfig.protocol === 'socks5' || proxyConfig.protocol === 'socks4') {
      proxyUrl = `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
      proxySettings = {
        socketOptions: {
          agent: new SocksProxyAgent(proxyUrl)
        }
      };
    } else {
      proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
      proxySettings = {
        socketOptions: {
          agent: new HttpProxyAgent(proxyUrl)
        }
      };
    }
    
    // Create transporter with proxy
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
      tls: {
        rejectUnauthorized: false
      },
      ...proxySettings
    });
    
    // Verify connection
    await transporter.verify();
    
    return {
      success: true,
      message: "SMTP connection through proxy successful"
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Update env file with new proxy settings
 */
async function updateEnvFile(settings) {
  try {
    const envPath = path.join(__dirname, '../.env');
    let content = await fs.readFile(envPath, 'utf8');
    
    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      const regex = new RegExp(`^${key}=.*`, 'm');
      
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content += `\n${key}=${value}`;
      }
    }
    
    await fs.writeFile(envPath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error updating .env file: ${error.message}`);
    return false;
  }
}

/**
 * Get current IP without proxy
 */
async function getCurrentIP() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    return response.data.ip;
  } catch (error) {
    console.log(`Could not determine current IP: ${error.message}`);
    return 'Unknown';
  }
}

/**
 * Main function
 */
async function main() {
  console.log('===== SMTP PROXY SETUP ASSISTANT =====\n');
  
  // Get current settings
  const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  };
  
  // Check current IP
  const currentIP = await getCurrentIP();
  console.log(`Your current IP address: ${currentIP}\n`);
  
  // Show proxy provider options
  console.log('Available proxy providers:\n');
  proxyProviders.forEach((provider, index) => {
    console.log(`${index + 1}. ${provider.name} (${provider.type})`);
    console.log(`   Description: ${provider.description}`);
    console.log(`   Protocol: ${provider.protocol}, Host: ${provider.host}, Port: ${provider.port}\n`);
  });
  
  // Choose proxy provider
  const providerIndex = parseInt(await askQuestion('Select a proxy provider (number): ')) - 1;
  if (isNaN(providerIndex) || providerIndex < 0 || providerIndex >= proxyProviders.length) {
    console.log('Invalid selection. Exiting.');
    rl.close();
    return;
  }
  
  const provider = proxyProviders[providerIndex];
  console.log(`\nSelected: ${provider.name}`);
  
  // Get proxy credentials
  console.log('\nEnter your proxy credentials:');
  const username = await askQuestion('Username: ');
  const password = await askQuestion('Password: ');
  
  // For residential/ISP proxies, get country code
  let country = 'us';
  let city = '';
  let stickySession = true;
  
  if (provider.type === 'residential' || provider.type === 'isp') {
    country = await askQuestion('\nEnter country code (e.g., us, uk, ca): ');
    city = await askQuestion('Enter city (optional): ');
    
    const sessionType = await askQuestion('\nChoose session type:\n1. Sticky session (same IP for multiple requests)\n2. Rotating IP (different IP for each request)\nSelect (1/2): ');
    stickySession = sessionType === '1';
  }
  
  // Construct final proxy config
  const proxyConfig = {
    protocol: provider.protocol,
    host: provider.host,
    port: provider.port,
    username: username + (provider.type === 'residential' ? `-country-${country}${city ? `-city-${city}` : ''}${stickySession ? '-session-123456' : ''}` : ''),
    password: password
  };
  
  // Test proxy connection
  console.log('\nTesting proxy connection...');
  const connectionTest = await testProxyConnection(proxyConfig);
  
  if (connectionTest.success) {
    console.log(`✅ Connection successful! Your proxy IP: ${connectionTest.ip}`);
    
    // Test SMTP through proxy
    console.log('\nTesting SMTP through proxy...');
    const smtpTest = await testSmtpWithProxy(smtpConfig, proxyConfig);
    
    if (smtpTest.success) {
      console.log(`✅ SMTP through proxy works! Emails will be sent through IP: ${connectionTest.ip}`);
      
      // Ask to save settings
      const saveSettings = await askQuestion('\nSave these proxy settings to .env file? (y/n): ');
      
      if (saveSettings.toLowerCase() === 'y') {
        const settings = {
          'PROXY_ENABLED': 'true',
          'PROXY_TYPE': provider.type,
          'PROXY_HOST': provider.host,
          'PROXY_PORT': provider.port.toString(),
          'PROXY_USER': proxyConfig.username,
          'PROXY_PASS': proxyConfig.password,
          'PROXY_PROTOCOL': provider.protocol,
          'PROXY_COUNTRY': country,
          'PROXY_CITY': city,
          'PROXY_STICKY_SESSION': stickySession ? '1' : '0'
        };
        
        const updated = await updateEnvFile(settings);
        if (updated) {
          console.log('\n✅ Proxy settings saved successfully!');
        }
      }
    } else {
      console.log(`❌ SMTP test failed: ${smtpTest.message}`);
      console.log('Try a different provider or check your credentials.');
    }
  } else {
    console.log(`❌ Proxy connection failed: ${connectionTest.message}`);
    console.log('Check your credentials and try again.');
  }
  
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error(`\nUnexpected error: ${error.message}`);
  rl.close();
});
