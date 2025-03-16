/**
 * Proxy SMTP Module
 * Manages SMTP connections through proxy servers with improved email security features
 * Enhanced to fix issues with Bright Data proxy and email headers
 */

const nodemailer = require('nodemailer');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const crypto = require('crypto');
const config = require('../config'); // Make sure this is imported
const logger = require('./logger');

/**
 * Creates an authenticated SMTP transporter with proxy routing
 * @param {Object} options - SMTP and proxy options
 * @returns {Object} - Configured nodemailer transport
 */
function createSecureTransport(options = {}) {
  // Extract SMTP settings from config, but allow overrides from options
  const smtpConfig = {
    host: options.host || config.smtp.host,
    port: options.port || config.smtp.port,
    secure: options.secure !== undefined ? options.secure : config.smtp.secure,
    auth: {
      user: options.user || config.smtp.user,
      pass: options.pass || config.smtp.pass
    },
    connectionTimeout: options.timeout || 30000,
    greetingTimeout: options.greetingTimeout || 30000,
    socketTimeout: options.socketTimeout || 30000,
    tls: {
      rejectUnauthorized: false,
      minVersion: options.tlsMinVersion || config.smtp.tls?.minVersion || 'TLSv1',
      maxVersion: options.tlsMaxVersion || config.smtp.tls?.maxVersion || 'TLSv1.3'
    }
  };

  // Add proxy if enabled
  if (config.proxy && config.proxy.enabled) {
    const proxySettings = createProxySettings();
    Object.assign(smtpConfig, proxySettings);
  }
  
  // Create the transporter
  return nodemailer.createTransport(smtpConfig);
}

/**
 * Create proxy settings for nodemailer
 * @returns {Object} - Proxy settings object for nodemailer
 */
function createProxySettings() {
  if (!config.proxy || !config.proxy.enabled) {
    return {};
  }
  
  const agent = getProxyAgent(true); // true for email traffic
  
  if (!agent) {
    logger.warn('Failed to create proxy agent, will connect directly');
    return {};
  }
  
  // CRITICAL FIX: Always use socketOptions with the agent for email 
  // This ensures all SMTP traffic goes through the proxy including the initial handshake
  return {
    socketOptions: { agent }
  };
}

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
      username = `${username}-ip-country-${config.proxy.residential.country}`;
      logger.debug(`Using Bright Data email format: ${username}`);
    } 
    // For other residential proxies
    else if (config.proxy.type === 'residential' || config.proxy.type === 'isp') {
      const sessionId = config.proxy.residential.stickySession ? 
        `-session-${Math.floor(Math.random() * 1000000)}` : 
        `-session-${Date.now()}`;
      
      username = `${username}` +
                `-country-${config.proxy.residential.country}` + 
                (config.proxy.residential.city ? `-city-${config.proxy.residential.city}` : '') +
                sessionId;
    }
    
    // Create appropriate agent based on protocol
    let agent;
    if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
      const proxyUrl = `${config.proxy.protocol}://${username}:${config.proxy.auth.password}@${config.proxy.host}:${port}`;
      agent = new SocksProxyAgent(proxyUrl);
      logger.debug(`Created ${config.proxy.protocol} proxy agent for email`);
    } else {
      const proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${port}`;
      agent = new HttpProxyAgent(proxyUrl);
      logger.debug(`Created HTTP proxy agent for email`);
    }
    
    return agent;
  } catch (error) {
    logger.error(`Failed to create proxy agent: ${error.message}`);
    return null;
  }
}

/**
 * Process email content to protect links
 * @param {string} html - Email HTML content
 * @param {Object} options - Processing options
 * @returns {string} - Processed HTML
 */
function protectLinks(html, options = {}) {
  if (!html) return html;
  
  const baseUrl = config.server.baseUrl || 'https://your-domain.com';
  const linkProtectionEnabled = options.protectLinks !== false && 
                               config.email.linkProtection !== false;
  
  if (!linkProtectionEnabled) return html;
  
  // Match all href attributes in anchor tags
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(https?:\/\/[^"']+)\1/gi;
  
  return html.replace(linkRegex, (match, quote, url) => {
    // Don't replace unsubscribe links and internal redirect links
    if (url.includes('unsubscribe') || url.includes('/r/') || 
        url.includes('mailto:') || url.includes('#')) {
      return match;
    }
    
    // Generate a unique ID for this link
    const linkId = crypto.randomBytes(6).toString('hex');
    
    // Encode the URL in base64
    const encodedUrl = Buffer.from(url).toString('base64');
    
    // Create the redirect URL
    const redirectUrl = `${baseUrl}/r/${linkId}?d=${encodeURIComponent(encodedUrl)}`;
    
    // Replace the original URL with the redirect URL
    return match.replace(url, redirectUrl);
  });
}

/**
 * Format recipient name to appear once and properly formatted
 * @param {string|Object} recipient - Recipient email or object
 * @returns {Object} - Formatted recipient object
 */
function formatRecipient(recipient) {
  if (!recipient) return { email: '', name: '' };
  
  // If it's already an object, ensure it has all required properties
  if (typeof recipient === 'object') {
    return {
      email: recipient.email || '',
      name: formatName(recipient.name || recipient.email?.split('@')[0] || '')
    };
  }
  
  // If it's a string, assume it's an email address
  const email = recipient.trim();
  let name = email.split('@')[0]; // Default to using part before @ as name
  
  // Format the name properly
  name = formatName(name);
  
  return { email, name };
}

/**
 * Format name properly with capitalization
 * @param {string} name - Raw name
 * @returns {string} - Formatted name
 */
function formatName(name) {
  if (!name) return '';
  
  // Remove special characters
  name = name.replace(/[^a-zA-Z0-9._ -]/g, '')
             .replace(/\./g, ' ')
             .replace(/_/g, ' ');
  
  // Capitalize each word
  return name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Send an email with link protection, proxy routing, and proper recipient formatting
 * @param {Object} options - Email options
 * @returns {Promise<Object>} - Email send result
 */
async function sendSecureEmail(options = {}) {
  try {
    // Ensure we have basic requirements
    if (!options.to) {
      throw new Error('Recipient is required');
    }
    
    // Format recipient details
    const recipient = formatRecipient(options.to);
    
    // Create HTML content from template if needed
    let htmlContent = options.html || options.body || '';
    
    // Process HTML to protect links
    htmlContent = protectLinks(htmlContent, {
      protectLinks: options.protectLinks !== false
    });
    
    // Create email message
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 15)}@${config.sender.email.split('@')[1]}>`;
    
    const message = {
      from: options.from || `"${config.sender.name}" <${config.sender.email}>`,
      to: `"${recipient.name}" <${recipient.email}>`,
      subject: options.subject || 'Important Message',
      html: htmlContent,
      messageId: messageId,
      headers: {
        'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
        'List-Unsubscribe': '<mailto:unsubscribe@example.com>',
        'Message-ID': messageId,
        'X-Tracking-ID': options.trackingId || Date.now().toString()
      }
    };
    
    // Create transporter with proxy
    const transporter = createSecureTransport();
    
    // Send the email
    const info = await transporter.sendMail(message);
    
    return {
      success: true,
      messageId: info.messageId || messageId,
      recipient: recipient.email,
      emailId: options.trackingId || Date.now().toString(), // Important: Always return the tracking ID
      trackingId: options.trackingId || Date.now().toString() // For backward compatibility
    };
  } catch (error) {
    logger.error(`Error sending secure email: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createSecureTransport,
  protectLinks,
  formatRecipient,
  sendSecureEmail
};
