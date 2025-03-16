/**
 * Proxy Utilities
 * Tools for managing proxy connections and routing
 */

const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const config = require('../config');
const logger = require('./logger');

/**
 * Format username specifically for Bright Data proxies
 * @param {string} username - Base username
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted username
 */
function formatBrightDataUsername(username, options = {}) {
  // Check if this is a Bright Data username
  if (!username || !username.includes('brd-customer')) return username;
  
  try {
    const isForEmail = options.forEmail === true;
    const country = options.country || config.proxy?.residential?.country || 'us';
    const city = options.city || config.proxy?.residential?.city || '';
    const session = options.session || (config.proxy?.residential?.stickySession ? 
      `${Math.floor(Math.random() * 1000000)}` : 
      `${Date.now()}`);
    
    // Special format for email/SMTP connections
    if (isForEmail) {
      return `${username}-ip-country-${country}`;
    }
    
    // For normal web connections: brd-customer-ID-zone-NAME-country-XX-session-YYY
    const parts = username.split('-zone-');
    if (parts.length !== 2) return username;
    
    const customerPart = parts[0]; // e.g., brd-customer-hl_c86a3063
    const zonePart = parts[1]; // e.g., residential_proxy1
    
    let formattedUsername = `${customerPart}-zone-${zonePart}-country-${country}-session-${session}`;
    
    // Add city if specified
    if (city) {
      formattedUsername += `-city-${city}`;
    }
    
    return formattedUsername;
  } catch (error) {
    logger.error(`Error formatting Bright Data username: ${error.message}`);
    return username; // Return original on error
  }
}

/**
 * Get the current public IP address without proxy
 * @returns {Promise<string>} - IP address
 */
async function getCurrentIP() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
    return response.data.ip;
  } catch (error) {
    logger.error(`Failed to get current IP: ${error.message}`);
    throw error;
  }
}

/**
 * Get IP address when using proxy
 * @returns {Promise<string>} - Proxy IP address
 */
async function getProxyIP() {
  try {
    if (!config.proxy || !config.proxy.enabled) {
      throw new Error('Proxy is not enabled');
    }
    
    // Create proxy URL
    let username = config.proxy.auth.username;
    
    // Format username - handle Bright Data specially
    if (username.includes('brd-customer')) {
      username = formatBrightDataUsername(username, {
        country: config.proxy.residential.country,
        city: config.proxy.residential.city,
        session: config.proxy.residential.stickySession ? `session-${Math.floor(Math.random() * 1000000)}` : null
      });
    }
    // Format for other residential proxies
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
    
    let proxyUrl;
    let agent;
    
    // Create agent based on protocol
    if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
      proxyUrl = `${config.proxy.protocol}://${username}:${config.proxy.auth.password}@${config.proxy.host}:${config.proxy.port}`;
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${config.proxy.port}`;
      agent = new HttpProxyAgent(proxyUrl);
    }
    
    // Make request through proxy
    const response = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      timeout: 15000
    });
    
    return response.data.ip;
  } catch (error) {
    logger.error(`Failed to get proxy IP: ${error.message}`);
    throw error;
  }
}

/**
 * Verify that all traffic is being routed through proxy
 * @returns {Promise<boolean>} - Whether routing is working
 */
async function verifyProxyRouting() {
  if (!config.proxy || !config.proxy.enabled) {
    logger.info('Proxy is not enabled, using direct connection');
    return false;
  }
  
  try {
    // Get both IPs
    const [directIP, proxyIP] = await Promise.all([
      getCurrentIP().catch(() => 'unknown'),
      getProxyIP()
    ]);
    
    // Check if they're different
    if (directIP === 'unknown') {
      logger.warn('Could not determine direct IP for comparison');
      return true; // Assume it's working if we got a proxy IP
    }
    
    if (directIP === proxyIP) {
      logger.error('PROXY LEAK DETECTED: Direct IP and proxy IP are the same!');
      return false;
    }
    
    logger.info(`Proxy routing verified: Using external IP ${proxyIP}`);
    return true;
  } catch (error) {
    logger.error(`Failed to verify proxy routing: ${error.message}`);
    return false;
  }
}

/**
 * Rotate the proxy IP (for non-sticky sessions)
 * @returns {Promise<string>} - New IP address
 */
async function rotateIP() {
  if (!config.proxy || !config.proxy.enabled) {
    throw new Error('Proxy is not enabled');
  }
  
  if (config.proxy.residential.stickySession) {
    logger.warn('Cannot rotate IP when using sticky session');
    return await getProxyIP();
  }
  
  // For most residential proxies, requesting with a new session parameter 
  // will give a new IP address
  try {
    const newIP = await getProxyIP();
    logger.info(`Rotated to new IP: ${newIP}`);
    return newIP;
  } catch (error) {
    logger.error(`Failed to rotate IP: ${error.message}`);
    throw error;
  }
}

/**
 * Create proxy agent for HTTP/HTTPS requests
 * @param {boolean} forceNew - Force creation of new agent
 * @param {boolean} forEmail - Format specifically for email connections
 * @returns {Object} - Proxy agent
 */
function createProxyAgent(forceNew = false, forEmail = false) {
  // Static cache for agent
  const cacheKey = forEmail ? 'emailAgent' : 'agent';
  if (!createProxyAgent[cacheKey] || forceNew) {
    if (!config.proxy || !config.proxy.enabled) {
      return null;
    }
    
    try {
      // Format username - special handling for Bright Data
      let username = config.proxy.auth.username;
      
      if (username.includes('brd-customer')) {
        // Use Bright Data specific formatting
        username = formatBrightDataUsername(username, {
          country: config.proxy.residential.country,
          city: config.proxy.residential.city,
          forEmail: forEmail,
          session: config.proxy.residential.stickySession ? Math.floor(Math.random() * 1000000) : null
        });
        
        logger.debug(`Formatted Bright Data username: ${username}`);
      }
      else if (config.proxy.type === 'residential' || config.proxy.type === 'isp') {
        // Standard formatting for other residential proxies
        const sessionId = config.proxy.residential.stickySession ? 
          `-session-${Math.floor(Math.random() * 1000000)}` : 
          `-session-${Date.now()}`;
        
        username = `${username}` +
                   `-country-${config.proxy.residential.country}` + 
                   (config.proxy.residential.city ? `-city-${config.proxy.residential.city}` : '') +
                   sessionId;
      }
      
      let agent;
      // For email connections, use special SMTP port if it's Bright Data
      let port = config.proxy.port;
      if (forEmail && username.includes('brd-customer') && config.proxy.smtpPort) {
        port = config.proxy.smtpPort;
        logger.info(`Using special SMTP proxy port: ${port}`);
      }
      
      // Create agent based on protocol
      if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
        const proxyUrl = `${config.proxy.protocol}://${username}:${config.proxy.auth.password}@${config.proxy.host}:${port}`;
        agent = new SocksProxyAgent(proxyUrl);
      } else {
        const proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${port}`;
        agent = new HttpProxyAgent(proxyUrl);
      }
      
      // Cache agent for future use
      createProxyAgent[cacheKey] = agent;
    } catch (error) {
      logger.error(`Failed to create proxy agent: ${error.message}`);
      return null;
    }
  }
  
  return createProxyAgent[cacheKey];
}

module.exports = {
  getCurrentIP,
  getProxyIP,
  verifyProxyRouting,
  rotateIP,
  createProxyAgent,
  formatBrightDataUsername
};
