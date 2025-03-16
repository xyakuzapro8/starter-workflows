const logger = require('./logger');

/**
 * Configures and returns a proxy for use with email services
 */
async function configureProxy(proxyUrl, isSocks = false) {
    try {
        if (!proxyUrl) {
            logger.warn('No proxy URL provided, will connect directly');
            return null;
        }

        if (isSocks) {
            // Configure SOCKS proxy
            try {
                const { SocksProxyAgent } = await import('socks-proxy-agent');
                logger.info('Configuring SOCKS proxy for connections');
                return new SocksProxyAgent(proxyUrl);
            } catch (error) {
                logger.error(`Failed to initialize SOCKS proxy: ${error.message}`);
                logger.error('Make sure socks-proxy-agent is installed: npm install socks-proxy-agent');
                return null;
            }
        } else {
            // Configure HTTPS proxy
            try {
                const { HttpsProxyAgent } = await import('https-proxy-agent');
                logger.info('Configuring HTTPS proxy for connections');
                return new HttpsProxyAgent(proxyUrl);
            } catch (error) {
                logger.error(`Failed to initialize HTTPS proxy: ${error.message}`);
                logger.error('Make sure https-proxy-agent is installed: npm install https-proxy-agent');
                return null;
            }
        }
    } catch (error) {
        logger.error(`Error in proxy configuration: ${error.message}`);
        return null;
    }
}

/**
 * List of public SMTP relay services that can be used
 * to hide your original IP address
 */
const smtpRelays = {
    // Free services with limitations
    mailgun: {
        host: 'smtp.mailgun.org',
        port: 587,
        secure: false,
        requiresAuth: true
    },
    sendgrid: {
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        requiresAuth: true
    },
    sendinblue: {
        host: 'smtp-relay.sendinblue.com',
        port: 587,
        secure: false,
        requiresAuth: true
    },
    // Add more services here as needed
};

module.exports = {
    configureProxy,
    smtpRelays
};
