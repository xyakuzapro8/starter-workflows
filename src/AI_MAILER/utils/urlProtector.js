const cheerio = require('cheerio');
const crypto = require('crypto');

/**
 * Process links in email content to make them safer
 * @param {String} content - Email content with links
 * @returns {String} - Content with protected links
 */
function processLinks(content) {
    try {
        // If not HTML content, return as is
        if (!content.includes('<a') && !content.includes('href=')) {
            return content;
        }
        
        // Parse HTML
        const $ = cheerio.load(content);
        
        // Process all links
        $('a').each((i, el) => {
            const originalUrl = $(el).attr('href');
            if (!originalUrl) return;
            
            // Skip already protected URLs or anchor links
            if (originalUrl.startsWith('#') || isAlreadyProtected(originalUrl)) {
                return;
            }
            
            // Apply URL protection techniques
            const protectedUrl = protectUrl(originalUrl);
            $(el).attr('href', protectedUrl);
            
            // Add tracking for analytics if not present
            if (!$(el).attr('data-tracking')) {
                $(el).attr('data-tracking', generateTrackingId(originalUrl));
            }
        });
        
        return $.html();
    } catch (error) {
        console.error('Error processing links:', error.message);
        return content; // Return original content on error
    }
}

/**
 * Check if a URL is already protected
 * @param {String} url - URL to check
 * @returns {Boolean} - true if already protected
 */
function isAlreadyProtected(url) {
    // Check if URL is already a redirect or tracking URL
    return url.includes('redirect') || 
           url.includes('track') || 
           url.includes('proxy') ||
           url.includes('?utm_');
}

/**
 * Apply protection techniques to a URL
 * @param {String} url - Original URL
 * @returns {String} - Protected URL
 */
function protectUrl(url) {
    // Add UTM parameters for tracking
    const utmParams = {
        utm_source: 'email',
        utm_medium: 'email',
        utm_campaign: 'newsletter',
        utm_content: generateContentId()
    };
    
    // Append UTM parameters
    const urlObj = new URL(url);
    Object.keys(utmParams).forEach(key => {
        urlObj.searchParams.set(key, utmParams[key]);
    });
    
    return urlObj.toString();
}

/**
 * Generate a tracking ID for a URL
 * @param {String} url - URL to generate ID for
 * @returns {String} - Tracking ID
 */
function generateTrackingId(url) {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return hash.substring(0, 10);
}

/**
 * Generate a content ID for UTM tracking
 * @returns {String} - Content ID
 */
function generateContentId() {
    return 'em_' + Date.now().toString(36);
}

module.exports = {
    processLinks
};