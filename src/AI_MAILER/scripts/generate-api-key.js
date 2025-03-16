/**
 * Cohere API Key Setup Script
 * Helps users get and configure their Cohere API key
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// Try to import the 'open' module, but provide fallback if not available
let open;
try {
  open = require('open');
} catch (error) {
  // Fallback function that just displays the URL instead of opening it
  open = async (url) => {
    console.log(`\nPlease open this URL in your browser:\n${url}\n`);
    return { success: false };
  };
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI color codes for better readability
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

// Helper function to ask questions
function ask(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

/**
 * Update .env file with Cohere API key
 */
async function updateEnvFile(apiKey, model = 'command') {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    let content;
    
    try {
      content = await fs.readFile(envPath, 'utf8');
    } catch (err) {
      // If .env doesn't exist yet, create empty content
      content = '';
    }
    
    // Check if COHERE_API_KEY already exists
    if (content.includes('COHERE_API_KEY=')) {
      content = content.replace(/COHERE_API_KEY=.*(\r?\n|$)/g, `COHERE_API_KEY=${apiKey}$1`);
    } else {
      // Add to the end of the file
      content += `\n# Cohere AI Configuration\nCOHERE_API_KEY=${apiKey}\nCOHERE_MODEL=${model}\n`;
    }
    
    // Update model if it exists
    if (content.includes('COHERE_MODEL=')) {
      content = content.replace(/COHERE_MODEL=.*(\r?\n|$)/g, `COHERE_MODEL=${model}$1`);
    }
    
    // Write the updated content back
    await fs.writeFile(envPath, content, 'utf8');
    console.log(`${colors.green}✓ API key saved to .env file${colors.reset}`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}Error updating .env file: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test the Cohere API key
 */
async function testApiKey(apiKey) {
  try {
    console.log(`\n${colors.blue}Testing Cohere API key...${colors.reset}`);
    
    let CohereClient;
    try {
      // Try to import the cohere-ai module
      const cohereModule = require('cohere-ai');
      CohereClient = cohereModule.CohereClient;
    } catch (importError) {
      console.error(`${colors.yellow}Could not import cohere-ai module: ${importError.message}${colors.reset}`);
      console.log(`${colors.yellow}Skipping API key validation. To install the module, run: npm install cohere-ai${colors.reset}`);
      return true; // Assume the key is valid if we can't test it
    }
    
    if (!CohereClient) {
      console.log(`${colors.yellow}CohereClient not found in module. Skipping validation.${colors.reset}`);
      return true;
    }
    
    const client = new CohereClient({ token: apiKey });
    
    const response = await client.generate({
      prompt: 'Write a short greeting',
      model: 'command',
      max_tokens: 20
    });
    
    console.log(`${colors.green}✓ API key is valid!${colors.reset}`);
    console.log(`Generated text: "${response.generations[0].text.trim()}"`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Error testing API key: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.clear();
  console.log(`${colors.bright}===== COHERE API KEY SETUP =====\n${colors.reset}`);
  console.log(`This script will help you set up your Cohere API key for AI email generation.`);
  
  // Check if key is already configured
  if (process.env.COHERE_API_KEY && process.env.COHERE_API_KEY !== 'your-cohere-api-key-here') {
    console.log(`\n${colors.yellow}An API key is already configured${colors.reset}`);
    const changeKey = await ask('Do you want to change it? (y/n): ');
    
    if (changeKey.toLowerCase() !== 'y') {
      console.log(`\nKeeping existing API key. Exiting.`);
      rl.close();
      return;
    }
  }
  
  // Ask if the user already has a Cohere API key
  console.log(`\nDo you already have a Cohere API key?`);
  const hasKey = await ask('(y/n): ');
  
  if (hasKey.toLowerCase() !== 'y') {
    console.log(`\n${colors.cyan}You'll need to create a Cohere account and get an API key:${colors.reset}`);
    console.log(`1. Go to https://cohere.com/`);
    console.log(`2. Create an account or login`);
    console.log(`3. Navigate to the dashboard and find your API key`);
    
    const openBrowser = await ask('\nWould you like to open the Cohere website now? (y/n): ');
    if (openBrowser.toLowerCase() === 'y') {
      const url = 'https://dashboard.cohere.com/api-keys';
      await open(url);
      console.log(`Attempting to open browser to Cohere dashboard`);
    }
    
    console.log(`\nOnce you have your API key, return to this terminal.`);
    await ask('Press Enter to continue when you have your API key...');
  }
  
  // Get the API key
  const apiKey = await ask('\nEnter your Cohere API key: ');
  
  if (!apiKey || apiKey === 'your-cohere-api-key-here') {
    console.log(`${colors.red}Invalid API key provided. Exiting.${colors.reset}`);
    rl.close();
    return;
  }
  
  // Ask about model
  console.log(`\n${colors.cyan}Cohere offers different models:${colors.reset}`);
  console.log(`1. command (default, good balance)`)
  console.log(`2. command-r (improved reasoning)`)
  console.log(`3. command-r-plus (most powerful)`)
  console.log(`4. command-light (fastest, cheapest)`)
  
  const modelChoice = await ask('\nWhich model would you like to use? (1-4): ');
  let model;
  
  switch (modelChoice) {
    case '2': model = 'command-r'; break;
    case '3': model = 'command-r-plus'; break;
    case '4': model = 'command-light'; break;
    default: model = 'command';
  }
  
  // Test the API key if possible
  const isValid = await testApiKey(apiKey);
  
  if (isValid) {
    // Update the .env file
    await updateEnvFile(apiKey, model);
    
    console.log(`\n${colors.green}✓ Setup complete!${colors.reset}`);
    console.log(`Your Cohere API key has been configured successfully.`);
    console.log(`You can now use AI-generated content in your emails.`);
    console.log(`\nYou may need to install the following packages:`);
    console.log(`- npm install cohere-ai`);
    console.log(`- npm install open (if you want browser opening support)`);
  } else {
    console.log(`\n${colors.yellow}The API key could not be verified.${colors.reset}`);
    const saveAnyway = await ask('Would you like to save it anyway? (y/n): ');
    
    if (saveAnyway.toLowerCase() === 'y') {
      await updateEnvFile(apiKey, model);
    } else {
      console.log(`API key not saved. Please try again with a valid key.`);
    }
  }
  
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  rl.close();
});
