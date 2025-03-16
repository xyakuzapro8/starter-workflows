/**
 * Configuration Manager
 * Loads settings from .env file and provides consistent configuration
 */

require('dotenv').config();

// Default configuration
const config = {
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    tls: {
      minVersion: process.env.SMTP_TLS_MIN_VERSION || 'TLSv1',
      maxVersion: process.env.SMTP_TLS_MAX_VERSION || 'TLSv1.3',
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
    }
  },
  
  sender: {
    name: process.env.SENDER_NAME || 'AI Mailer',
    email: process.env.SENDER_EMAIL || process.env.SMTP_USER || ''
  },
  
  proxy: {
    enabled: process.env.PROXY_ENABLED === 'true',
    host: process.env.PROXY_HOST || '',
    port: parseInt(process.env.PROXY_PORT || '0', 10),
    smtpPort: parseInt(process.env.PROXY_SMTP_PORT || process.env.PROXY_PORT || '0', 10),
    protocol: process.env.PROXY_PROTOCOL || 'http',
    type: process.env.PROXY_TYPE || 'datacenter',
    auth: {
      username: process.env.PROXY_USERNAME || '',
      password: process.env.PROXY_PASSWORD || ''
    },
    residential: {
      country: process.env.PROXY_COUNTRY || 'us',
      city: process.env.PROXY_CITY || '',
      state: process.env.PROXY_STATE || '',
      stickySession: process.env.PROXY_STICKY_SESSION === 'true'
    },
    rotateInterval: parseInt(process.env.PROXY_ROTATE_INTERVAL || '300000', 10) // 5 minutes default
  },
  
  server: {
    port: parseInt(process.env.SERVER_PORT || '3000', 10),
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  },
  
  email: {
    linkProtection: process.env.LINK_PROTECTION !== 'false'
  },
  
  templates: {
    default: process.env.DEFAULT_TEMPLATE || 'default',
    path: process.env.TEMPLATES_PATH || './templates'
  },
  
  // Fix Cohere API configuration - make sure we have a single uniform structure
  cohere: {
    apiKey: process.env.COHERE_API_KEY || '',
    model: process.env.COHERE_MODEL || 'command',
    temperature: parseFloat(process.env.COHERE_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.COHERE_MAX_TOKENS || '500')
  },
  
  batch: {
    size: parseInt(process.env.BATCH_SIZE || '10', 10),
    delay: parseInt(process.env.BATCH_DELAY || '60000', 10), // 1 minute between batches
    maxPerDay: parseInt(process.env.MAX_EMAILS_PER_DAY || '100', 10),
    minDelay: parseInt(process.env.MIN_BATCH_DELAY || '30000', 10),
    maxDelay: parseInt(process.env.MAX_BATCH_DELAY || '60000', 10)
  },
  
  defaultEmail: {
    subject: process.env.DEFAULT_EMAIL_SUBJECT || 'OpenSea NFT Waitlist',
    templateName: process.env.DEFAULT_TEMPLATE || 'inbox-friendly',
    useAI: process.env.USE_AI === 'true',
    aiPrompts: {
      subject: process.env.DEFAULT_SUBJECT_PROMPT || 'Create a simple, professional subject line about OpenSea information or updates',
      content: process.env.DEFAULT_CONTENT_PROMPT || 'Write a brief professional paragraph informing the recipient about OpenSea\'s platform and inviting them to join the waitlist'
    },
    cta: {
      text: process.env.DEFAULT_CTA_TEXT || 'Join Waitlist',
      link: process.env.DEFAULT_CTA_LINK || 'https://example.com/waitlist'
    }
  }
};

// Create a function to validate critical configuration
function validateConfig() {
  const issues = [];
  
  // Check Cohere API key
  if (!config.cohere.apiKey) {
    issues.push("Cohere API key not found. Set COHERE_API_KEY in .env file.");
  }
  
  // Check SMTP configuration
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    issues.push("SMTP configuration is incomplete. Check SMTP_* variables in .env file.");
  }
  
  // Log issues if any
  if (issues.length > 0) {
    console.warn("Configuration issues detected:");
    issues.forEach(issue => console.warn(`- ${issue}`));
  } else {
    console.log("Configuration validated successfully.");
  }
  
  return issues.length === 0;
}

// Run validation on module load
validateConfig();

module.exports = config;