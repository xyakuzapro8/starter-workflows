const logger = require('./logger');

/**
 * Email forwarding detection utility
 */
const forwardDetector = {
  /**
   * Create a hidden code to detect email forwarding
   */
  createForwardDetectionCode(messageId, recipient) {
    try {
      // Generate a unique token for this email
      const token = require('crypto')
        .createHash('md5')
        .update(`${messageId}:${recipient}:${Date.now()}`)
        .digest('hex')
        .substring(0, 12);
      
      // Create an encoded recipient value
      const encodedRecipient = Buffer.from(recipient).toString('base64');
      
      // Create the hidden HTML code
      const detectionCode = `
        <div style="display:none" class="forward-detect" data-token="${token}" data-recipient="${encodedRecipient}"></div>
        <img src="https://yourdomain.com/track/${token}?r=${encodedRecipient.replace(/=/g, '')}" width="1" height="1" style="display:none" />
        <script type="text/javascript">
          (function(){
            // This script detects forwarding in some email clients
            var token = "${token}";
            var recipient = "${encodedRecipient}";
            var originalRecipient = "${recipient}";
            
            // Check if this is being viewed by someone else
            if (document.referrer && document.referrer.indexOf('mail') > -1) {
              var img = new Image();
              img.src = "https://yourdomain.com/forward-detected?token=" + token + "&r=" + recipient;
            }
          })();
        </script>
      `;
      
      return detectionCode;
    } catch (error) {
      logger.error(`Forward detection error: ${error.message}`);
      return '';
    }
  },
  
  /**
   * Process forward detection data from tracking pixel
   */
  processForwardDetection(token, encodedRecipient) {
    try {
      // In a real implementation, this would store the data
      // and possibly notify about the forward
      logger.info(`Forward detection: token=${token}`);
      
      if (encodedRecipient) {
        const recipient = Buffer.from(encodedRecipient, 'base64').toString('utf8');
        logger.info(`Email was forwarded from: ${recipient}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Forward detection processing error: ${error.message}`);
      return false;
    }
  }
};

module.exports = forwardDetector;