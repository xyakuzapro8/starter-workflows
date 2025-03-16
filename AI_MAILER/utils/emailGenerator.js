const cohere = require('cohere-ai');
const fs = require('fs').promises;
const Mustache = require('mustache');
const nunjucks = require('nunjucks');
const config = require('../config');
const logger = require('./logger');

// Initialize Cohere client
cohere.init(config.cohereApi.apiKey);

// Configure nunjucks for more complex templating
nunjucks.configure({
    autoescape: true,
    trimBlocks: true,
    lstripBlocks: true
});

/**
 * Generate email content using Cohere API
 * @param {Object} template - Template configuration
 * @param {Object} vars - Variables for template
 * @returns {Promise<Object>} - Generated email content
 */
async function generate(template, vars) {
    try {
        // Read template file
        const templateContent = await fs.readFile(template.path, 'utf8');
        
        // Basic template parsing with variables
        const parsedTemplate = nunjucks.renderString(templateContent, vars);
        
        // Generate enhanced content with Cohere API
        const enhancedContent = await enhanceWithCohere(parsedTemplate, vars);
        
        // Process the subject template
        const subject = await generateSubject(template.subject, vars);
        
        return {
            subject: subject,
            body: enhancedContent
        };
    } catch (error) {
        logger.error(`Error generating email content: ${error.message}`);
        throw error;
    }
}

/**
 * Enhance email content using Cohere's AI
 * @param {String} baseContent - Base content
 * @param {Object} vars - Variables for personalization
 * @returns {Promise<String>} - Enhanced content
 */
async function enhanceWithCohere(baseContent, vars) {
    try {
        const prompt = `
You are a professional email copywriter. 
I have an email template below that I need you to enhance to make it more engaging and personalized.
The email should sound natural, professional, and not like typical marketing spam.

Recipient information:
- Name: ${vars.recipient_name || 'Recipient'}
- Company: ${vars.company_name || 'Company'}
${vars.additional_context ? `- Additional context: ${vars.additional_context}` : ''}

Base email content:
${baseContent}

Please enhance this email to make it more personalized, engaging, and effective while maintaining the core message.
Return ONLY the enhanced HTML email body without any additional explanation or formatting.
`;

        // Call Cohere API to generate enhanced content
        const response = await cohere.generate({
            model: config.cohereApi.model,
            prompt: prompt,
            max_tokens: 1000,
            temperature: 0.7,
            k: 0,
            stop_sequences: [],
            return_likelihoods: 'NONE'
        });

        if (response.body && response.body.generations && response.body.generations[0]) {
            return response.body.generations[0].text.trim();
        } else {
            logger.warn("Unexpected response format from Cohere API. Using base template.");
            return baseContent;
        }
    } catch (error) {
        logger.error(`Cohere API error: ${error.message}`);
        return baseContent; // Fallback to the original template
    }
}

/**
 * Generate email subject using Cohere's AI
 * @param {String} baseSubject - Subject template
 * @param {Object} vars - Variables for personalization
 * @returns {Promise<String>} - Enhanced subject
 */
async function generateSubject(baseSubject, vars) {
    try {
        // First apply template variables
        const parsedSubject = Mustache.render(baseSubject, vars);
        
        // Then enhance with Cohere
        const prompt = `
Create an engaging email subject line based on this draft: "${parsedSubject}"
The subject should be catchy but professional and relevant to the content.
Keep it under 60 characters. Return ONLY the subject line with no additional text.
`;

        // Call Cohere API to generate subject
        const response = await cohere.generate({
            model: config.cohereApi.model,
            prompt: prompt,
            max_tokens: 30,
            temperature: 0.8,
            k: 0,
            stop_sequences: ["\n"],
            return_likelihoods: 'NONE'
        });

        if (response.body && response.body.generations && response.body.generations[0]) {
            return response.body.generations[0].text.trim().replace(/^"(.+)"$/, '$1');
        } else {
            return parsedSubject; // Fallback
        }
    } catch (error) {
        logger.error(`Error generating subject: ${error.message}`);
        return baseSubject; // Fallback to the original template
    }
}

module.exports = {
    generate
};
