/**
 * Proxy Manager
 * Manages proxy connections and handles IP rotation
 */

const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');
const logger = require('./logger');
const config = require('../config');

class ProxyManager {
  constructor() {
    this.lastRotation = Date.now();
    this.currentAgent = null;
    this.config = config.proxy;
    this.rotationInterval = this.config.rotateInterval || 300000; // 5 minutes default
    this.proxyInfo = {
      ip: null,
      lastChecked: null,
      location: null,
      isResidential: null
    };
  }
  
  /**
   * Format username based on proxy provider and type
   * @param {Object} options - Options for formatting
   * @returns {string} - Formatted username
   */
  formatUsername(options = {}) {
    const username = this.config.auth.username;
    const country = this.config.residential.country || 'us';
    const city = this.config.residential.city || '';
    const forEmail = options.forEmail === true;
    
    // For Bright Data - special handling
    if (username.includes('brd-customer')) {
      const parts = username.split('-zone-');
      if (parts.length !== 2) return username;
      
      const customerPart = parts[0]; // e.g., brd-customer-hl_c86a3063
      const zonePart = parts[1]; // e.g., residential_proxy1
      
      // For Email traffic
      if (forEmail) {
        return `${username}-ip-country-${country}`;
      }
      
      // For regular web traffic
      const sessionId = this.config.residential.stickySession ? 
        `-session-${Math.floor(Math.random() * 1000000)}` : 
        `-session-${Date.now()}`;
        
      return `${customerPart}-zone-${zonePart}-country-${country}${sessionId}${city ? `-city-${city}` : ''}`;
    }
    // For other residential proxies
    else if (this.config.type === 'residential' || this.config.type === 'isp') {
      const sessionId = this.config.residential.stickySession ? 
        `-session-${Math.floor(Math.random() * 1000000)}` : 
        `-session-${Date.now()}`;
      
      return `${username}` +
             `-country-${country}` + 
             (city ? `-city-${city}` : '') +
             sessionId;
    }
    
    return username;
  }
  
  /**
   * Get proxy agent with proper configuration
   * @param {boolean} forceNew - Force creation of new agent
   * @param {boolean} forEmail - Format for email traffic
   * @returns {Object} - HTTP or SOCKS agent
   */
  getAgent(forceNew = false, forEmail = false) {
    // If we have a valid agent and don't need to force a new one, return it
    if (this.currentAgent && !forceNew && this.config.residential.stickySession) {
      return this.currentAgent;
    }
    
    // Check if it's time to rotate IP
    const shouldRotate = !this.config.residential.stickySession && 
                        (Date.now() - this.lastRotation > this.rotationInterval);
    
    // Create new agent if needed
    if (shouldRotate || !this.currentAgent || forceNew) {
      try {
        // Get formatted username
        const username = this.formatUsername({ forEmail });
        
        // Get port (may be different for email)
        const port = forEmail && this.config.smtpPort ? 
                      this.config.smtpPort : 
                      this.config.port;
        
        let agent;
        
        // Create appropriate agent based on protocol
        if (this.config.protocol === 'socks5' || this.config.protocol === 'socks4') {
          const proxyUrl = `${this.config.protocol}://${username}:${this.config.auth.password}@${this.config.host}:${port}`;
          agent = new SocksProxyAgent(proxyUrl);
          logger.debug(`Created SOCKS proxy agent: ${this.config.protocol}`);
        } else {
          const proxyUrl = `http://${username}:${this.config.auth.password}@${this.config.host}:${port}`;
          agent = new HttpProxyAgent(proxyUrl);
          logger.debug(`Created HTTP proxy agent`);
        }
        
        // Update last rotation time
        this.lastRotation = Date.now();
        this.currentAgent = agent;
        
        return agent;
      } catch (error) {
        logger.error(`Failed to create proxy agent: ${error.message}`);
        return null;
      }
    }
    
    return this.currentAgent;
  }
  
  /**
   * Create Nodemailer configuration with proxy
   * @param {boolean} forceNew - Force new proxy connection
   * @returns {Object} - Proxy settings for Nodemailer
   */
  getNodemailerConfig(forceNew = false) {
    if (!this.config.enabled) {
      return {};
    }
    
    const agent = this.getAgent(forceNew, true);
    
    if (!agent) {
      logger.warn('Failed to create proxy agent for nodemailer');
      return {};
    }
    
    // Return socket options with our agent
    return {
      socketOptions: { agent }
    };
  }
  
  /**
   * Check current proxy IP
   * @returns {Promise<string>} - IP address
   */
  async checkIP() {
    if (!this.config.enabled) {
      return 'Proxy disabled';
    }
    
    try {
      const agent = this.getAgent(false);
      const response = await axios.get('https://api.ipify.org?format=json', {
        httpsAgent: agent,
        timeout: 15000
      });
      
      const ip = response.data.ip;
      this.proxyInfo.ip = ip;
      this.proxyInfo.lastChecked = Date.now();
      
      // Get location info
      try {
        const ipInfo = await axios.get(`https://ipinfo.io/${ip}/json`, { timeout: 5000 });
        this.proxyInfo.location = {
          country: ipInfo.data.country,
          region: ipInfo.data.region,
          city: ipInfo.data.city,
          org: ipInfo.data.org
        };
        
        // Check if residential
        this.proxyInfo.isResidential = !ipInfo.data.org.toLowerCase().includes('hosting') && 
                                      !ipInfo.data.org.toLowerCase().includes('datacenter');
      } catch (err) {
        logger.debug(`Could not get IP info: ${err.message}`);
      }
      
      return ip;
    } catch (error) {
      logger.error(`Failed to check proxy IP: ${error.message}`);
      return `Error: ${error.message}`;
    }
  }
  
  /**
   * Rotate to a new IP (for non-sticky sessions)
   * @returns {Promise<string>} - New IP address
   */
  async rotateIP() {
    if (!this.config.enabled) {
      return 'Proxy disabled';
    }
    
    if (this.config.residential.stickySession) {
      logger.warn('Cannot rotate IP when using sticky session');
      return await this.checkIP();
    }
    
    // Force new agent creation
    this.currentAgent = null;
    const agent = this.getAgent(true);
    
    try {
      const response = await axios.get('https://api.ipify.org?format=json', {
        httpsAgent: agent,
        timeout: 15000
      });
      
      const newIP = response.data.ip;
      logger.info(`Rotated to new IP: ${newIP}`);
      this.proxyInfo.ip = newIP;
      this.proxyInfo.lastChecked = Date.now();
      
      return newIP;
    } catch (error) {
      logger.error(`Failed to rotate IP: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get current proxy information
   * @returns {Object} - Proxy information
   */
  getProxyInfo() {
    return {
      ...this.proxyInfo,
      provider: this.config.host,
      type: this.config.type,
      stickySession: this.config.residential.stickySession,
      country: this.config.residential.country
    };
  }
}

// Create singleton instance
const proxyManager = new ProxyManager();

module.exports = proxyManager;
