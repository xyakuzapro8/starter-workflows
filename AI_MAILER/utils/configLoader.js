/**
 * Configuration Loader
 * Validates configuration and ensures all necessary settings are defined
 */

const fs = require('fs');
const logger = require('./logger');

/**
 * Validate critical configuration settings
 * @param {Object} config - Configuration object
 * @returns {boolean} - Whether the config is valid
 */
function validateConfig(config) {
  const requiredSettings = [
    { path: 'smtp.host', name: 'SMTP_HOST' },
    { path: 'smtp.user', name: 'SMTP_USER' },
    { path: 'smtp.pass', name: 'SMTP_PASS' },
    { path: 'sender.email', name: 'SENDER_EMAIL or SMTP_FROM' },
  ];
  
  const missingSettings = [];
  
  // Check each required setting
  requiredSettings.forEach(setting => {
    const value = getNestedProperty(config, setting.path);
    if (!value) {
      missingSettings.push(setting.name);
    }
  });
  
  // Validate additional settings that might be obvious if they're wrong
  if (config.smtp.port <= 0 || config.smtp.port > 65535) {
    missingSettings.push('SMTP_PORT (invalid port number)');
  }
  
  // Check for valid sender email format
  if (config.sender.email && !config.sender.email.includes('@')) {
    missingSettings.push('SENDER_EMAIL (invalid format)');
  }
  
  // Log any missing settings
  if (missingSettings.length > 0) {
    logger.error(`Missing or invalid configuration settings: ${missingSettings.join(', ')}`);
    logger.info('Please ensure all required settings are defined in your .env file');
    return false;
  }
  
  return true;
}

/**
 * Get nested property from object
 * @param {Object} obj - Object to get property from
 * @param {string} path - Dot notation path to property
 * @returns {*} - Property value or undefined
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((prev, curr) => {
    return prev ? prev[curr] : undefined;
  }, obj);
}

/**
 * Check if .env file exists
 * @returns {boolean} - Whether .env file exists
 */
function checkEnvFile() {
  try {
    return fs.existsSync('.env');
  } catch (error) {
    return false;
  }
}

/**
 * Initialize configuration
 * @param {Object} config - Configuration object to validate
 * @returns {Object} - Validated configuration object
 */
function initConfig(config) {
  // Check if .env file exists
  if (!checkEnvFile()) {
    logger.warn('.env file not found. Using default or environment variables.');
  }
  
  // Validate configuration
  const isValid = validateConfig(config);
  if (!isValid) {
    logger.warn('Configuration has missing or invalid values. Check your .env file.');
  } else {
    logger.info('Configuration loaded successfully');
  }
  
  return config;
}

module.exports = {
  validateConfig,
  checkEnvFile,
  initConfig
};
