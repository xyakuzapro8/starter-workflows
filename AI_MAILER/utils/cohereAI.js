/**
 * Cohere AI integration for generating email content
 */
const axios = require('axios');
const logger = require('./logger');
const config = require('../config');

// Cache for previous generations to avoid duplicates
const generationCache = new Map();

/**
 * Generate email subject using Cohere AI
 * @param {string} prompt - The prompt to generate content from
 * @returns {Promise<string>} - The generated subject
 */
async function generateSubject(prompt) {
  try {
    // Check if we have a valid API key
    if (!config.cohere.apiKey) {
      logger.warn('No Cohere API key provided, using fallback subject');
      return getFallbackSubject(prompt);
    }

    const response = await axios.post(
      'https://api.cohere.ai/v1/generate',
      {
        prompt: `Generate a concise, professional email subject line based on this description: "${prompt}". 
                Return only the subject line text without quotes or labels.`,
        max_tokens: 25,
        temperature: 0.7,
        model: config.cohere.model || 'command',
        stop_sequences: ["\n"]
      },
      {
        headers: {
          'Authorization': `Bearer ${config.cohere.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract the actual text from the response
    let subject = response.data.generations[0].text.trim();
    
    // Remove any quotes if present
    subject = subject.replace(/^["']|["']$/g, '');
    
    logger.info(`Generated subject: "${subject}"`);
    return subject;
  } catch (error) {
    logger.error(`Error generating subject with Cohere: ${error.message}`);
    return getFallbackSubject(prompt);
  }
}

/**
 * Generate email body content using Cohere AI
 * @param {string} prompt - The prompt to generate content from
 * @returns {Promise<string>} - The generated HTML body content
 */
async function generateEmailBody(prompt) {
  try {
    // Check cache first to avoid duplicate content
    const cacheKey = prompt.substring(0, 50);
    if (generationCache.has(cacheKey)) {
      logger.info('Using cached email content');
      return generationCache.get(cacheKey);
    }

    // Check if we have a valid API key
    if (!config.cohere.apiKey) {
      logger.warn('No Cohere API key provided, using fallback content');
      return getFallbackEmailBody(prompt);
    }

    const response = await axios.post(
      'https://api.cohere.ai/v1/generate',
      {
        prompt: `Create a concise, professional email about: "${prompt}".
                Write 3-4 short paragraphs.
                Do not use "[Recipient]" as a placeholder. Just start the email with "Hello," without any recipient name.
                Be direct, engaging, and professional.
                Don't include commentary, labels, or explanations.
                Don't include any HTML formatting.
                End the message with your name or team name.
                Just write the plain text content directly.`,
        max_tokens: 350,
        temperature: 0.7,
        model: config.cohere.model || 'command',
        stop_sequences: ["---", "###", "```"]
      },
      {
        headers: {
          'Authorization': `Bearer ${config.cohere.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract the actual text from the response and clean it
    let content = response.data.generations[0].text.trim();
    
    // IMPORTANT: Clean up meta commentary thoroughly
    content = content.replace(/^(Here is|This is|Below is|I've created|I have created|Here's|Here's a possible).*?:/gi, '');
    content = content.replace(/^.*?(email body|formatted as plain text|without any HTML tags).*$/mi, '');
    content = content.replace(/^.*?(matching the provided description|based on your description).*$/mi, '');
    
    // Remove any leftover HTML tags
    content = content.replace(/<[^>]*>/g, '');
    
    // Clean up any excessive whitespace
    content = content
      .split(/\n+/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n\n');
    
    // Store the cleaned content in cache
    generationCache.set(cacheKey, content);
    
    logger.info(`Generated clean email content (${content.length} chars)`);
    return content;
  } catch (error) {
    logger.error(`Error generating email content with Cohere: ${error.message}`);
    return getFallbackEmailBody(prompt);
  }
}

/**
 * Get a fallback subject if AI generation fails
 */
function getFallbackSubject(prompt) {
  const subjects = [
    "Join the OpenSea Exclusive Waitlist Today",
    "Your Invitation to OpenSea's NFT Platform",
    "OpenSea: Special Access to Our NFT Marketplace",
    "Don't Miss Your Chance: OpenSea Waitlist Now Open",
    "OpenSea NFT Marketplace: Exclusive Invitation"
  ];
  
  return subjects[Math.floor(Math.random() * subjects.length)];
}

/**
 * Get fallback email body content if AI generation fails
 */
function getFallbackEmailBody(prompt) {
  // Return plain text without HTML tags - more concise version (3 paragraphs)
  return `Hello,

OpenSea is the world's premier marketplace for NFTs and digital collectibles. Our platform empowers creators and collectors to buy, sell, and discover unique digital assets with ease and security.

We're excited to invite you to join our exclusive waitlist for upcoming features and special access. As a waitlist member, you'll receive priority notifications about new releases, be first to try innovative tools, and get special access to limited collections.

Join our vibrant community of digital art enthusiasts and blockchain innovators today. Simply click the button below to secure your spot on our waitlist and begin your journey into the future of digital ownership.

The OpenSea Team`;
}

module.exports = {
  generateSubject,
  generateEmailBody
};