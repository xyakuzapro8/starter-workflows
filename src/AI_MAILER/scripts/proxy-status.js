/**
 * Proxy Status Monitor
 * Continuously monitors and displays the proxy status
 */

require('dotenv').config();
const axios = require('axios');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../config');
const formatBrightDataUsername = require('../utils/proxyUtils').formatBrightDataUsername;

// ANSI color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m"
};

// Clear console
console.clear();
console.log(`${colors.bright}===== PROXY STATUS MONITOR =====
${colors.reset}Monitoring proxy connection for ${colors.cyan}${config.proxy.host}${colors.reset}\n`);

/**
 * Check current IP (without proxy)
 */
async function checkDirectIP() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
    return response.data.ip;
  } catch (error) {
    return "Unknown (Error)";
  }
}

/**
 * Check IP through proxy
 */
async function checkProxyIP() {
  if (!config.proxy.enabled) {
    return "Proxy disabled";
  }
  
  try {
    // Format username based on provider
    let username = config.proxy.auth.username;
    
    // Special handling for Bright Data
    if (username.includes('brd-customer')) {
      username = formatBrightDataUsername(username, {
        country: config.proxy.residential.country,
        session: Date.now().toString()
      });
    } else if (config.proxy.type === 'residential') {
      // Format for other residential proxies
      username = `${username}-country-${config.proxy.residential.country}-session-${Date.now()}`;
    }
    
    // Create appropriate agent
    let agent;
    if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
      const proxyUrl = `${config.proxy.protocol}://${username}:${config.proxy.auth.password}@${config.proxy.host}:${config.proxy.port}`;
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      const proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${config.proxy.port}`;
      agent = new HttpProxyAgent(proxyUrl);
    }
    
    const response = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      timeout: 15000
    });
    
    return response.data.ip;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

/**
 * Get location information for an IP
 */
async function getIPInfo(ip) {
  if (!ip || ip.includes('Error') || ip === 'Unknown') {
    return { country: 'Unknown', city: 'Unknown', org: 'Unknown' };
  }
  
  try {
    const response = await axios.get(`https://ipinfo.io/${ip}/json`, { timeout: 5000 });
    return {
      country: response.data.country || 'Unknown',
      city: response.data.city || 'Unknown',
      region: response.data.region || 'Unknown',
      org: response.data.org || 'Unknown'
    };
  } catch (error) {
    return { country: 'Error', city: 'Error', org: 'Error' };
  }
}

/**
 * Display status
 */
async function displayStatus() {
  try {
    process.stdout.write("\r\x1b[K"); // Clear current line
    process.stdout.write(`${colors.cyan}Checking proxy status...${colors.reset}`);
    
    const directIP = await checkDirectIP();
    const proxyIP = await checkProxyIP();
    
    // Check if proxy is working properly
    const isWorking = directIP !== proxyIP && !proxyIP.includes('Error');
    
    // Get location info
    const directInfo = await getIPInfo(directIP);
    const proxyInfo = await getIPInfo(proxyIP);
    
    // Clear console for clean display
    console.clear();
    console.log(`${colors.bright}===== PROXY STATUS MONITOR =====
${colors.reset}Proxy: ${config.proxy.host}:${config.proxy.port} (${config.proxy.type})\n`);
    
    console.log(`${colors.bright}Direct Connection:${colors.reset}`);
    console.log(`IP: ${colors.yellow}${directIP}${colors.reset}`);
    console.log(`Location: ${directInfo.city}, ${directInfo.region}, ${directInfo.country}`);
    console.log(`ISP: ${directInfo.org}`);
    
    console.log(`\n${colors.bright}Proxy Connection:${colors.reset}`);
    console.log(`IP: ${isWorking ? colors.green : colors.red}${proxyIP}${colors.reset}`);
    
    if (isWorking) {
      console.log(`Location: ${proxyInfo.city}, ${proxyInfo.region}, ${proxyInfo.country}`);
      console.log(`ISP: ${proxyInfo.org}`);
      console.log(`\n${colors.green}✓ Proxy is working correctly!${colors.reset}`);
      
      // Check if it appears to be residential
      const isResidential = !proxyInfo.org.toLowerCase().includes('hosting') && 
                          !proxyInfo.org.toLowerCase().includes('datacenter');
      if (isResidential) {
        console.log(`${colors.green}✓ IP appears to be residential${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠ IP may not be residential${colors.reset}`);
      }
    } else {
      console.log(`\n${colors.red}✗ Proxy is not working correctly${colors.reset}`);
      if (proxyIP.includes('Error')) {
        console.log(`${colors.red}Error: ${proxyIP}${colors.reset}`);
      } else {
        console.log(`${colors.red}Direct and proxy IPs are the same${colors.reset}`);
      }
    }
    
    console.log(`\n${colors.dim}Last checked: ${new Date().toLocaleTimeString()}${colors.reset}`);
    console.log(`${colors.dim}Press Ctrl+C to exit${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.red}Error checking proxy status: ${error.message}${colors.reset}`);
  }
}

// Run status check immediately
displayStatus();

// Then update every minute
const intervalId = setInterval(displayStatus, 60000);

// Handle exit
process.on('SIGINT', () => {
  clearInterval(intervalId);
  console.log(`\n${colors.bright}Exiting proxy monitor${colors.reset}`);
  process.exit();
});
