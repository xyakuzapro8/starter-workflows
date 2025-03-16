/**
 * Email sending optimization settings
 */
const optimizationConfig = {
  // Delays between emails in milliseconds
  sendDelay: {
    min: 1000,  // Minimum delay between emails (1 second)
    max: 3000   // Maximum delay between emails (3 seconds)
  },
  
  // Maximum number of retry attempts for failed emails
  maxRetries: 2,
  
  // Batch size for large email campaigns
  batchSize: 50,
  
  // Cooling period between batches in milliseconds
  batchCoolingPeriod: 60000, // 1 minute
  
  // Maximum concurrent connections
  maxConcurrentConnections: 5
};

module.exports = optimizationConfig;
