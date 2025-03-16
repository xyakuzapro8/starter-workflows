/**
 * AI Service
 * Handles integration with various AI providers
 */

const axios = require('axios');
const config = require('../config'); // Fixed import
const logger = require('./logger');

/**
 * Class for interacting with AI services
 */
class AIService {
  constructor() {
    // Use correct config structure
    this.service = process.env.AI_SERVICE || 'cohere';
    this.apiKey = config.cohere.apiKey;
    this.model = config.cohere.model;
    this.temperature = config.cohere.temperature;
    this.maxTokens = config.cohere.maxTokens;
    this.config = config;
    
    // Initialize client based on selected service
    this._initialize();
  }
  
  /**
   * Initialize the appropriate AI client
   * @private
   */
  _initialize() {
    switch (this.service) {
      case 'cohere':
        this.headers = {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        };
        this.endpoint = 'https://api.cohere.ai';
        break;
      default:
        logger.warn(`AI service ${this.service} is not supported`);
    }
  }
  
  /**
   * Verify that the API key is valid and working
   * @returns {Promise<boolean>} - Whether the API key is valid
   */
  async verifyApiKey() {
    try {
      switch (this.service) {
        case 'cohere':
          // Use tokenize endpoint instead as it's simpler for verification
          const response = await axios({
            method: 'post',
            url: `${this.endpoint}/v1/tokenize`,
            headers: this.headers,
            data: {
              text: "Just testing API key",
            },
            timeout: 5000 // 5 second timeout
          });
          
          if (response.status === 200 && response.data && response.data.tokens) {
            logger.info('Cohere API key verified successfully');
            return true;
          } else {
            logger.error('Cohere API key verification failed: Invalid response format');
            logger.debug(`Response data: ${JSON.stringify(response.data)}`);
            return false;
          }
        
        default:
          logger.warn(`Cannot verify unsupported AI service: ${this.service}`);
          return false;
      }
    } catch (error) {
      logger.error(`API key verification error: ${error.message}`);
      if (error.response) {
        logger.error(`API response status: ${error.response.status}`);
        logger.debug(`API response data: ${JSON.stringify(error.response.data)}`);
      }
      return false;
    }
  }
  
  /**
   * Generate text completion using the configured AI service
   * @param {string} prompt - The input prompt
   * @param {Object} options - Additional generation options
   * @returns {Promise<string>} - The generated text
   */
  async generateText(prompt, options = {}) {
    try {
      switch (this.service) {
        case 'cohere':
          logger.debug(`Sending Cohere API request to ${this.endpoint}/v1/generate`);
          logger.debug(`Prompt: ${prompt.substring(0, 50)}...`);
          
          // Use the newer Cohere API format
          const requestData = {
            model: options.model || this.model || 'command',
            prompt: prompt,
            max_tokens: options.maxTokens || this.maxTokens || 1000,
            temperature: options.temperature || this.temperature || 0.7,
            truncate: "END",
            k: 0,
            p: 0.75,
            frequency_penalty: 0,
            presence_penalty: 0,
            stop_sequences: options.stopSequences || [],
            return_likelihoods: "NONE"
          };
          
          const cohereResponse = await axios({
            method: 'post',
            url: `${this.endpoint}/v1/generate`,
            headers: this.headers,
            data: requestData,
            timeout: options.timeout || 30000
          });
          
          logger.debug(`Cohere API response status: ${cohereResponse.status}`);
          
          // Log a sample of the response data
          const responsePreview = JSON.stringify(cohereResponse.data).substring(0, 200);
          logger.debug(`Response preview: ${responsePreview}...`);
          
          if (cohereResponse.data && cohereResponse.data.generations && 
              Array.isArray(cohereResponse.data.generations) && 
              cohereResponse.data.generations.length > 0) {
            
            // Extract the generated text
            const generatedText = cohereResponse.data.generations[0].text;
            
            if (typeof generatedText === 'string' && generatedText.trim()) {
              return generatedText.trim();
            }
            
            logger.warn('Cohere API returned empty text in generation');
            return ""; // Return empty string when no text is generated
          }
          
          logger.error('Unexpected response format from Cohere API');
          logger.debug(`Full response: ${JSON.stringify(cohereResponse.data)}`);
          throw new Error('Unexpected response format from Cohere API');
          
        default:
          throw new Error(`AI service ${this.service} is not supported for text generation`);
      }
    } catch (error) {
      logger.error(`Text generation error: ${error.message}`);
      if (error.response) {
        logger.error(`API response status: ${error.response.status}`);
        if (error.response.data) {
          logger.error(`API error message: ${JSON.stringify(error.response.data.message || error.response.data)}`);
        }
      }
      throw error;
    }
  }

  /**
   * Fallback method to generate simple text without AI
   * For when API calls fail but we still need content
   * @param {string} type - Type of content to generate
   * @returns {string} - Simple generated content
   */
  generateFallbackContent(type) {
    switch (type) {
      case 'subject':
        const subjects = [
          'Important Information Inside',
          'Your Monthly Newsletter',
          'Updates You Should Know About',
          'Exclusive Offer Inside'
        ];
        return subjects[Math.floor(Math.random() * subjects.length)];
        
      case 'body':
        return `
          <p>Hello,</p>
          <p>Thank you for your interest in our services. We're reaching out with some important information.</p>
          <p>Please contact us if you have any questions.</p>
          <p>Best regards,<br>The Team</p>
        `;
        
      default:
        return 'Generated content';
    }
  }
}

module.exports = AIService;
