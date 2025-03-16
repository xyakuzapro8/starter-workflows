/**
 * Error Handler Utility
 * Provides standardized error handling for email sending process
 */

const logger = require('./logger');

/**
 * Handle email sending errors with detailed diagnostics
 * @param {Error} error - The error object
 * @param {Object} context - Additional context about the operation
 * @returns {Object} - Standardized error response
 */
function handleEmailError(error, context = {}) {
  const errorResponse = {
    success: false,
    error: error.message,
    code: error.code || 'UNKNOWN_ERROR',
    details: {}
  };
  
  // Log the error with context
  logger.error(`Email error: ${error.message}`, {
    code: error.code,
    context
  });
  
  // Add diagnostic information based on error type
  if (error.message.includes('ECONNREFUSED') || error.message.includes('connection refused')) {
    errorResponse.details.type = 'CONNECTION_ERROR';
    errorResponse.details.suggestion = 'Check SMTP server address and port';
  } else if (error.message.includes('auth') || error.message.includes('535')) {
    errorResponse.details.type = 'AUTHENTICATION_ERROR';
    errorResponse.details.suggestion = 'Verify SMTP username and password';
  } else if (error.message.includes('timeout')) {
    errorResponse.details.type = 'TIMEOUT_ERROR';
    errorResponse.details.suggestion = 'Check network connection or proxy configuration';
  } else if (error.message.includes('proxy')) {
    errorResponse.details.type = 'PROXY_ERROR';
    errorResponse.details.suggestion = 'Verify proxy configuration';
  }
  
  return errorResponse;
}

/**
 * Wrap an async function with standardized error handling
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - Wrapped function with error handling
 */
function withErrorHandling(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return handleEmailError(error, { args });
    }
  };
}

module.exports = {
  handleEmailError,
  withErrorHandling
};
