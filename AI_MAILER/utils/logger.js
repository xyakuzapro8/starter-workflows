/**
 * Simple Logger
 * Provides consistent logging across the application
 */

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Set default log level from environment or use info
const currentLevel = process.env.LOG_LEVEL ? 
  (logLevels[process.env.LOG_LEVEL.toLowerCase()] || 2) : 
  2;

/**
 * Log a message if its level is less than or equal to the current log level
 * @param {string} message - Message to log
 * @param {number} level - Log level of this message
 */
function log(message, level = 2) {
  if (level <= currentLevel) {
    const timestamp = new Date().toISOString();
    const prefix = getPrefix(level);
    console.log(`${timestamp} ${prefix}: ${message}`);
  }
}

/**
 * Get prefix string based on log level
 * @param {number} level - Log level
 * @returns {string} - Log prefix
 */
function getPrefix(level) {
  switch (level) {
    case 0: return '[ERROR]';
    case 1: return '[WARNING]';
    case 2: return '[INFO]';
    case 3: return '[DEBUG]';
    default: return '[LOG]';
  }
}

// Export logger methods
module.exports = {
  error: (message) => log(message, 0),
  warn: (message) => log(message, 1),
  info: (message) => log(message, 2),
  debug: (message) => log(message, 3)
};
