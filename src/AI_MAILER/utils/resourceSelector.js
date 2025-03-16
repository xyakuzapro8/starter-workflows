const logger = require('./logger');

/**
 * Select the best SMTP server based on usage
 * @param {Array} servers - List of available SMTP servers
 * @returns {Object} - Selected SMTP server
 */
function selectSmtpServer(servers) {
    if (!servers || servers.length === 0) {
        throw new Error('No SMTP servers configured');
    }
    
    // Find servers that haven't exceeded their rate limit
    const now = new Date();
    const availableServers = servers.filter(server => {
        // If server has never been used or last used over an hour ago, reset usage count
        if (!server.lastUsed || (now - new Date(server.lastUsed)) > 3600000) {
            server.usageCount = 0;
        }
        return server.usageCount < server.maxRate;
    });
    
    if (availableServers.length === 0) {
        logger.warn('All SMTP servers have reached their rate limits');
        // Find the server used longest ago
        return servers.reduce((oldest, server) => {
            if (!oldest.lastUsed) return server;
            if (!server.lastUsed) return oldest;
            return new Date(server.lastUsed) < new Date(oldest.lastUsed) ? server : oldest;
        }, { lastUsed: now });
    }
    
    // Sort by usage count (ascending) and select the least used server
    availableServers.sort((a, b) => a.usageCount - b.usageCount);
    logger.debug(`Selected SMTP server: ${availableServers[0].name}`);
    return availableServers[0];
}

/**
 * Select a proxy from the available pool
 * @param {Array} proxies - List of available proxies
 * @returns {Object|null} - Selected proxy or null if none available
 */
function selectProxy(proxies) {
    // If no proxies configured, return null
    if (!proxies || proxies.length === 0) {
        return null;
    }
    
    // Sort proxies by usage count (ascending)
    proxies.sort((a, b) => a.usageCount - b.usageCount);
    
    // Return the least used proxy
    logger.debug(`Selected proxy: ${proxies[0].host}`);
    return proxies[0];
}

module.exports = {
    selectSmtpServer,
    selectProxy
};
