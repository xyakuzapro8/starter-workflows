const crypto = require('crypto');
const logger = require('./logger');

/**
 * Link protection utility
 */
const linkProtector = {
  /**
   * Generate a protected URL
   */
  createProtectedUrl(originalUrl, messageId, options = {}) {
    try {
      const { recipient = '', campaignId = '' } = options;
      
      // Generate short hash for the link
      const linkId = crypto.createHash('md5')
        .update(`${messageId}:${originalUrl}:${recipient}`)
        .digest('hex')
        .substring(0, 8);
      
      // Store minimal information to keep headers small
      const baseUrl = 'https://yourdomain.com/r';
      
      // Encode original URL in base64
      const encodedUrl = Buffer.from(originalUrl).toString('base64');
      
      // Create the protected URL
      return `${baseUrl}/${linkId}?d=${encodeURIComponent(encodedUrl)}`;
    } catch (error) {
      logger.error(`Link protection error: ${error.message}`);
      return originalUrl; // Return original URL on error
    }
  },
  
  /**
   * Decode a protected URL
   */
  decodeProtectedUrl(protectedUrl) {
    try {
      // Extract the encoded part
      const urlParams = new URL(protectedUrl).searchParams;
      const encodedData = urlParams.get('d');
      
      if (!encodedData) {
        throw new Error('Missing encoded data in protected URL');
      }
      
      // Decode the URL
      const originalUrl = Buffer.from(encodedData, 'base64').toString('utf8');
      return originalUrl;
    } catch (error) {
      logger.error(`Link decoding error: ${error.message}`);
      return null;
    }
  }
};

module.exports = linkProtector;
