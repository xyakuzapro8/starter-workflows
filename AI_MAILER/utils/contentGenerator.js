const logger = require('./logger');
const config = require('../config');

/**
 * Generate email content using AI
 * @param {Object} options - Content generation options
 * @returns {Object} - Generated email content
 */
async function generateEmailContent(options = {}) {
  try {
    logger.info('Generating email content with AI...');
    
    // Default values if none provided
    const subjectPrompt = options.subjectPrompt || 'Write a concise email subject line';
    const contentPrompt = options.contentPrompt || 'Write a professional email';
    const variables = options.variables || {};
    
    // Check which AI service is configured
    if (config.ai && config.ai.service === 'cody' && config.ai.apiKey) {
      return await generateWithCody(subjectPrompt, contentPrompt, variables);
    } else if (config.cohere && config.cohere.apiKey) {
      return await generateWithCohere(subjectPrompt, contentPrompt, variables);
    } else {
      throw new Error('No AI service properly configured');
    }
  } catch (error) {
    logger.error(`AI content generation error: ${error.message}`);
    // Return default content when generation fails
    return {
      subject: 'Important Information',
      body: 'We were unable to generate custom content at this time. Please contact support for assistance.'
    };
  }
}

// Helper function for Cody AI generation
async function generateWithCody(subjectPrompt, contentPrompt, variables) {
  try {
    // Safer property access with optional chaining
    const apiKey = config?.ai?.apiKey;
    const model = config?.ai?.model || 'cody';
    
    if (!apiKey) {
      throw new Error('Cody API key not configured');
    }
    
    // Format the prompts with variables if needed
    const formattedSubjectPrompt = formatPromptWithVariables(subjectPrompt, variables);
    const formattedContentPrompt = formatPromptWithVariables(contentPrompt, variables);
    
    // Call Cody API for subject generation
    const subjectResponse = await fetch('https://api.codyai.dev/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt: formattedSubjectPrompt,
        max_tokens: 25,
        temperature: 0.7
      })
    });
    
    if (!subjectResponse.ok) {
      throw new Error(`Cody API error: ${subjectResponse.status} ${subjectResponse.statusText}`);
    }
    
    const subjectData = await subjectResponse.json();
    const subject = subjectData?.choices?.[0]?.text?.trim() || 'Important Information';
    
    // Call Cody API for content generation
    const contentResponse = await fetch('https://api.codyai.dev/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt: formattedContentPrompt,
        max_tokens: 500,
        temperature: 0.7
      })
    });
    
    if (!contentResponse.ok) {
      throw new Error(`Cody API error: ${contentResponse.status} ${contentResponse.statusText}`);
    }
    
    const contentData = await contentResponse.json();
    const body = contentData?.choices?.[0]?.text?.trim() || 
      'We were unable to generate custom content at this time. Please contact support for assistance.';
    
    return { subject, body };
  } catch (error) {
    logger.error(`Cody content generation error: ${error.message}`);
    throw error;
  }
}

// Helper function for Cohere generation
async function generateWithCohere(subjectPrompt, contentPrompt, variables) {
  try {
    // Safer property access
    const apiKey = config?.cohere?.apiKey;
    const model = config?.cohere?.model || 'command';
    const endpoint = config?.cohere?.endpoint || 'https://api.cohere.ai';
    
    if (!apiKey) {
      throw new Error('Cohere API key not configured');
    }
    
    // Format the prompts with variables
    const formattedSubjectPrompt = formatPromptWithVariables(subjectPrompt, variables);
    const formattedContentPrompt = formatPromptWithVariables(contentPrompt, variables);
    
    // Generate subject
    const subjectResponse = await fetch(`${endpoint}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt: formattedSubjectPrompt,
        max_tokens: 25,
        temperature: 0.7
      })
    });
    
    if (!subjectResponse.ok) {
      throw new Error(`Cohere API error: ${subjectResponse.status} ${subjectResponse.statusText}`);
    }
    
    const subjectData = await subjectResponse.json();
    const subject = subjectData?.generations?.[0]?.text?.trim() || 'Important Information';
    
    // Generate content
    const contentResponse = await fetch(`${endpoint}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt: formattedContentPrompt,
        max_tokens: 500,
        temperature: 0.7
      })
    });
    
    if (!contentResponse.ok) {
      throw new Error(`Cohere API error: ${contentResponse.status} ${contentResponse.statusText}`);
    }
    
    const contentData = await contentResponse.json();
    const body = contentData?.generations?.[0]?.text?.trim() || 
      'We were unable to generate custom content at this time. Please contact support for assistance.';
    
    return { subject, body };
  } catch (error) {
    logger.error(`Cohere content generation error: ${error.message}`);
    throw error;
  }
}

// Helper to format prompts with variables
function formatPromptWithVariables(prompt, variables) {
  let formattedPrompt = prompt;
  
  // Replace variables in the prompt
  if (variables && typeof variables === 'object') {
    Object.entries(variables).forEach(([key, value]) => {
      formattedPrompt = formattedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    });
  }
  
  return formattedPrompt;
}

module.exports = {
  generateEmailContent
};