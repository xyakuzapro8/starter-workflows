const logger = require('./logger');

/**
 * Obfuscates email content to help prevent spam filters
 * and protect against email scrapers
 * 
 * @param {String} html - HTML content of the email
 * @param {Object} options - Obfuscation options
 * @returns {String} Obfuscated HTML content
 */
function obfuscateEmail(html, options = {}) {
    // Default level is medium if not specified
    const level = options.level || 'medium';
    
    try {
        let obfuscatedHtml = html;
        
        // Apply different obfuscation techniques based on level
        switch (level) {
            case 'low':
                // Simple entity encoding for @ and dots in email addresses
                obfuscatedHtml = obfuscatedHtml.replace(
                    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
                    (match, name, domain) => {
                        return `${name}&#64;${domain}`;
                    }
                );
                break;
                
            case 'medium':
                // More complex entity encoding for the whole email
                obfuscatedHtml = obfuscatedHtml.replace(
                    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
                    (match, name, domain) => {
                        // Convert each character to its HTML entity
                        let result = '';
                        for (let i = 0; i < name.length; i++) {
                            result += `&#${name.charCodeAt(i)};`;
                        }
                        result += '&#64;'; // @ symbol
                        for (let i = 0; i < domain.length; i++) {
                            result += `&#${domain.charCodeAt(i)};`;
                        }
                        return result;
                    }
                );
                break;
                
            case 'high':
                // Advanced techniques including CSS and random entity encoding
                obfuscatedHtml = obfuscatedHtml.replace(
                    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
                    (match, name, domain) => {
                        // Use CSS to display email properly
                        const styles = `direction:ltr;unicode-bidi:bidi-override;`;
                        
                        // Randomize between decimal and hex entities
                        let result = `<span style="${styles}">`;
                        
                        // Reverse the email and encode characters
                        const email = match.split('').reverse().join('');
                        for (let i = 0; i < email.length; i++) {
                            // Randomly choose decimal or hex encoding
                            if (Math.random() > 0.5) {
                                result += `&#${email.charCodeAt(i)};`;
                            } else {
                                result += `&#x${email.charCodeAt(i).toString(16)};`;
                            }
                        }
                        result += '</span>';
                        return result;
                    }
                );
                break;
                
            default:
                // If unknown level, use medium
                logger.warn(`Unknown obfuscation level: ${level}, using 'medium' instead`);
                return obfuscateEmail(html, { level: 'medium' });
        }
        
        return obfuscatedHtml;
    } catch (error) {
        logger.error(`Email obfuscation error: ${error.message}`);
        // Return original HTML in case of error
        return html;
    }
}

module.exports = {
    obfuscateEmail
};
