const { processEmail } = require('./utils/emailProcessor');
const cohereAI = require('./utils/cohereAI');
const logger = require('./utils/logger');
const nodemailer = require('nodemailer');
const config = require('./config');
const fs = require('fs');
const path = require('path');
const { renderTemplate } = require('./utils/templating');
const proxyUtils = require('./utils/proxyUtils');
const { sendSecureEmail } = require('./utils/proxySmtp');
const { secureEmailOptions } = require('./utils/emailSecurity');

// Add proxy agents
const SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent;
const HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent;

console.log('Loading aiMailer module...');

// Timer for IP rotation
let lastRotation = Date.now();
let currentProxyAgent = null;

// Create email transporter
let transporter;

/**
 * Get a proxy agent with properly formatted residential proxy settings
 * This ensures all traffic goes through the residential proxy
 */
function getProxyAgent(forceNew = false, forEmail = false) {
  // If we have a valid agent and don't need to force a new one, return it
  if (currentProxyAgent && !forceNew && config.proxy.residential.stickySession) {
    return currentProxyAgent;
  }
  
  // Check if it's time to rotate the IP (if not using sticky session)
  const shouldRotate = !config.proxy.residential.stickySession && 
    (Date.now() - lastRotation > config.proxy.rotateInterval);
    
  // If we should rotate or we don't have an agent yet, create a new one
  if (shouldRotate || !currentProxyAgent || forceNew) {
    try {
      // Format username for residential proxy targeting
      let username = config.proxy.auth.username;
      let proxyPort = forEmail && config.proxy.smtpPort ? config.proxy.smtpPort : config.proxy.port;
      
      // Special handling for Bright Data with email traffic
      if (username.includes('brd-customer') && forEmail) {
        // For Bright Data, email traffic should use username-ip-country-XX format
        // This is essential for proper proxy routing with SMTP
        username = `${username}-ip-country-${config.proxy.residential.country}`;
        
        if (config.proxy.brightData?.useAlternatePort && config.proxy.smtpPort) {
          proxyPort = config.proxy.smtpPort;
          logger.info(`Using Bright Data specialized SMTP port: ${proxyPort}`);
        }
      }
      // Standard handling for other proxy services or Bright Data without email formatting
      else if (username.includes('brd-customer')) {
        // Bright Data specific username format for non-email traffic
        const parts = username.split('-zone-');
        if (parts.length === 2) {
          const customerPart = parts[0]; // e.g., brd-customer-hl_c86a3063
          const zonePart = parts[1]; // e.g., residential_proxy1
          
          const sessionId = config.proxy.residential.stickySession ? 
            `-session-${Math.floor(Math.random() * 1000000)}` : 
            `-session-${Date.now()}`;
            
          username = `${customerPart}-zone-${zonePart}-country-${config.proxy.residential.country}${sessionId}` + 
                     (config.proxy.residential.city ? `-city-${config.proxy.residential.city}` : '');
                     
          logger.info(`Using Bright Data formatted username: ${username}`);
        }
      }
      // Standard formatting for other providers
      else if (config.proxy.type === 'residential' || config.proxy.type === 'isp') {
        // Add session ID to ensure consistent IP (for sticky sessions)
        // Or use timestamp for rotation
        const sessionId = config.proxy.residential.stickySession ? 
          `-session-${Math.floor(Math.random() * 1000000)}` : 
          `-session-${Date.now()}`;
        
        // Build the complete username with targeting parameters
        username = `${username}` +
                   `-country-${config.proxy.residential.country}` + 
                   (config.proxy.residential.city ? `-city-${config.proxy.residential.city}` : '') +
                   (config.proxy.residential.state ? `-state-${config.proxy.residential.state}` : '') +
                   sessionId;
      }
      
      let proxyUrl;
      let agent;
      
      // Create the appropriate agent based on protocol
      if (config.proxy.protocol === 'socks5' || config.proxy.protocol === 'socks4') {
        proxyUrl = `${config.proxy.protocol}://${username}:${config.proxy.auth.password}@${config.proxy.host}:${proxyPort}`;
        agent = new SocksProxyAgent(proxyUrl);
        logger.info(`Created new SOCKS proxy agent (${config.proxy.protocol})`);
      } else {
        proxyUrl = `http://${username}:${config.proxy.auth.password}@${config.proxy.host}:${proxyPort}`;
        agent = new HttpProxyAgent(proxyUrl);
        logger.info(`Created new HTTP proxy agent`);
      }
      
      // Update rotation timestamp and save agent
      lastRotation = Date.now();
      currentProxyAgent = agent;
      
      return agent;
    } catch (error) {
      logger.error(`Failed to create proxy agent: ${error.message}`);
      return null;
    }
  }
  
  return currentProxyAgent;
}

/**
 * Create proxy settings object for nodemailer
 */
function createProxySettings() {
  if (!config.proxy || !config.proxy.enabled) {
    return {};
  }
  
  const agent = getProxyAgent(false, true); // true indicates this is for email/SMTP
  
  if (!agent) {
    logger.warn('Failed to create proxy agent, will connect directly');
    return {};
  }
  
  // Configure nodemailer socket options with our proxy agent
  return {
    socketOptions: { agent }
  };
}

// Initial transporter setup
try {
  // Get proxy settings if proxy is enabled
  const proxySettings = createProxySettings();
  
  // IMPORTANT: Ensure username and password are entered correctly from config
  const smtpAuth = {
    user: config.smtp.user || process.env.SMTP_USER,
    pass: config.smtp.pass || process.env.SMTP_PASS
  };
  
  // Log the SMTP configuration for debugging (obscuring password)
  logger.info(`Setting up SMTP: ${config.smtp.host}:${config.smtp.port} with user ${smtpAuth.user}`);
  
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: smtpAuth,
    connectionTimeout: 120000, // Increased timeout for slow connections
    greetingTimeout: 90000,
    socketTimeout: 120000,
    debug: process.env.SMTP_DEBUG === 'true',
    tls: {
      rejectUnauthorized: false
    },
    ...proxySettings
  });
  
  // Immediately verify connection during initialization
  transporter.verify()
    .then(() => {
      logger.info('SMTP connection verified successfully during initialization');
    })
    .catch(err => {
      logger.error(`SMTP verification failed during initialization: ${err.message}`);
    });
  
  if (config.proxy && config.proxy.enabled) {
    logger.info(`SMTP transport created with ${config.proxy.type} proxy routing`);
  } else {
    logger.info(`SMTP transport created for ${config.smtp.host}:${config.smtp.port} (direct connection)`);
  }
} catch (error) {
  logger.error(`Failed to create email transporter: ${error.message}`);
}

/**
 * Configure the email transporter
 */
async function createTransporter() {
  if (transporter) {
    // Check if the existing transporter is still valid
    try {
      await Promise.race([
        transporter.verify(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SMTP verification timeout')), 10000)
        )
      ]);
      logger.debug('Existing SMTP transporter is valid');
      return transporter;
    } catch (error) {
      logger.warn(`Existing transporter invalid, creating new one: ${error.message}`);
      // Continue to create a new transporter
    }
  }
  
  // Define common port/security combinations to try
  const smtpConfigs = [
    // Main configuration - stick with this first
    { 
      port: config.smtp.port, 
      secure: config.smtp.secure,
      description: "Primary configuration" 
    },
    // Only try alternatives if explicitly enabled
    { port: 465, secure: true, description: "SSL/TLS" },
    { port: 587, secure: false, description: "STARTTLS" },
    { port: 25, secure: false, description: "Plain" }
  ];
  
  // Check for auto fallback mode
  const autoFallback = process.env.SMTP_AUTO_FALLBACK === 'true';
  
  // Try main config first - with special handling for auth
  try {
    logger.info(`Creating SMTP transporter for ${config.smtp.host}:${config.smtp.port} (secure: ${config.smtp.secure})`);
    
    // Get (potentially new) proxy settings
    const proxySettings = createProxySettings();
    
    // Enhanced configuration with proper auth handling and proxy
    const transporterOptions = {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      },
      connectionTimeout: 45000,
      greetingTimeout: 45000,
      socketTimeout: 45000,
      debug: process.env.SMTP_DEBUG === 'true',
      logger: process.env.SMTP_DEBUG === 'true',
      tls: {
        rejectUnauthorized: false,
        minVersion: config.smtp.tls?.minVersion || 'TLSv1',
        maxVersion: config.smtp.tls?.maxVersion || 'TLSv1.3'
      },
      ...proxySettings
    };
    
    transporter = nodemailer.createTransport(transporterOptions);
    
    // Verify connection - this would detect auth issues too
    await transporter.verify();
    
    if (config.proxy && config.proxy.enabled) {
      logger.info(`SMTP connection and authentication verified successfully through proxy`);
      
      // Log confirmation of proxy routing
      try {
        await proxyUtils.verifyProxyRouting();
        logger.info("Confirmed all SMTP traffic is routing through proxy");
      } catch (err) {
        logger.warn(`Could not verify proxy routing: ${err.message}`);
      }
    } else {
      logger.info('SMTP connection and authentication verified successfully (direct connection)');
    }
    
    return transporter;
    
  } catch (error) {
    // ...existing code for error handling...
  }
}

/**
 * Send an email with all original features
 */
async function sendEmail(options = {}) {
  try {
    const { 
      to, // Make sure this is used consistently, not 'recipient'
      subject, 
      body, 
      contentPrompt, 
      subjectPrompt,
      templateName, 
      templateData,
      preserveGeneratedContent = true,
      isAIGenerated = false
    } = options;
    
    if (!to) {
      throw new Error("Recipient email address (to) is required");
    }
    
    let emailSubject = subject || "OpenSea NFT Waitlist"; // Updated default subject
    let emailBody = body || '';
    
    // Clean up subject line if requested and handle special OpenSea formatting
    if (options.cleanContent !== false && emailSubject) {
      try {
        // Check if this is likely an OpenSea email
        if (emailSubject.includes('OpenSea') || 
            emailSubject.includes('NFT') || 
            (emailBody && (emailBody.includes('OpenSea') || emailBody.includes('opensea-static')))) {
          
          // Use OpenSea-specific subject cleaner
          const openSeaFixer = require('./scripts/fix-opensea-template');
          emailSubject = openSeaFixer.fixOpenSeaSubject(emailSubject);
        } else {
          // Use standard subject cleaner
          const contentCleaner = require('./scripts/fix-email-content');
          emailSubject = contentCleaner.cleanSubjectLine(emailSubject);
        }
        logger.info(`Cleaned email subject: ${emailSubject}`);
      } catch (error) {
        logger.warn(`Could not clean subject: ${error.message}`);
      }
    }
    
    // Normalize recipient format using the new utility
    const proxySmtp = require('./utils/proxySmtp');
    let recipientObj = proxySmtp.formatRecipient(options.to);
    
    // Ensure sender information is correct from config
    const senderName = config.sender?.name || "OpenSea NFT Waitlist";
    const senderEmail = config.sender?.email || "noreply@emirates-deliveries.com";
    
    // Generate a proper Message-ID that won't be broken by Gmail
    const domain = senderEmail.split('@')[1];
    const messageId = Date.now().toString();
    const customMessageId = `<${messageId}.${Math.random().toString(36).substring(2, 10)}@${domain}>`;
    
    // Create the email configuration with proper recipient format
    const emailConfig = {
      from: `"${senderName}" <${senderEmail}>`,
      to: recipientObj.name ? 
          `"${recipientObj.name}" <${recipientObj.email}>` : 
          recipientObj.email,
      subject: emailSubject,
      messageId: customMessageId,
      headers: {
        'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`, // Add unique ID to prevent Gmail grouping
        'List-Unsubscribe': '<mailto:unsubscribe@emirates-deliveries.com>', // Improve deliverability
        'Sender': `"${senderName}" <${senderEmail}>`, // Explicitly set sender
        'Message-ID': customMessageId, // Explicitly set Message-ID to prevent Gmail from adding BROKEN
        'X-Tracking-ID': messageId // Add tracking ID to headers
      }
    };
    
    // Additional AI content generation directly here if needed and not done in server
    if (contentPrompt || subjectPrompt) {
      try {
        const cohereAI = require('./utils/cohereAI');
        
        if (subjectPrompt && !emailSubject) {
          emailSubject = await cohereAI.generateSubject(subjectPrompt);
          logger.info(`Generated email subject in aiMailer: ${emailSubject}`);
        }
        
        if (contentPrompt && !emailBody) {
          emailBody = await cohereAI.generateEmailBody(contentPrompt);
          logger.info(`Generated email body in aiMailer: ${emailBody.length} chars`);
          options.isAIGenerated = true;
        }
      } catch (aiError) {
        logger.error(`AI generation error in aiMailer: ${aiError.message}`);
        // Continue with existing content or defaults
      }
    }
    
    // Handle AI-generated content with template
    if (emailBody && templateName) {
      try {
        // Ensure emailBody is properly decoded HTML
        const emailFormatter = require('./utils/emailFormatter');
        const decodedBody = emailFormatter.decodeHtmlEntities(emailBody);
        
        // Replace any [Recipient] placeholders with the actual name
        const recipientName = recipientObj.name || recipientObj.email.split('@')[0] || 'there';
        const processedBody = decodedBody.replace(/\[Recipient\]/g, recipientName);
        
        // Create template data with body included
        const fullTemplateData = {
          ...(templateData || {}),
          body: processedBody,
          recipientData: {
            name: recipientObj.name || recipientObj.email.split('@')[0],
            email: recipientObj.email
          },
          ctaLink: options.ctaLink,
          ctaText: options.ctaText,
          messageId: customMessageId,
          timestamp: Date.now(),
          randomString: Math.random().toString(36).substring(2, 7)
        };
        
        // Render template with our data
        emailConfig.html = await renderTemplate(templateName, fullTemplateData);
        
        // No need for additional processing, template already contains the formatted content
      } catch (templateError) {
        logger.error(`Template rendering error: ${templateError.message}`);
        // If template rendering fails, use direct HTML content
        emailConfig.html = emailFormatter.formatEmailBody(emailBody);
      }
    } 
    // Normal template handling without AI content or when not preserving AI content
    else if (templateName) {
      try {
        emailBody = await renderTemplate(templateName, { 
          ...templateData,
          recipient: recipientObj
        });
        
        // Process the email content for security and tracking
        const emailProcessor = require('./utils/emailProcessor');
        const processed = await emailProcessor.processEmail(emailBody, {
          recipient: recipientObj.email,
          messageId: customMessageId, // Use our custom Message-ID here
          enableTracking: options.trackOpens !== false,
          enableObfuscation: options.obfuscate !== false,
          preventForwarding: options.preventForwarding === true,
          cleanContent: options.cleanContent !== false // Enable content cleaning by default
        });
        
        emailConfig.html = processed.html;
        emailConfig.messageId = processed.messageId;
      } catch (templateError) {
        logger.error(`Template rendering error: ${templateError.message}`);
        emailConfig.text = "There was an error rendering the email template.";
      }
    } 
    // Direct content without template
    else if (emailBody) {
      // Ensure HTML is properly formatted
      const emailFormatter = require('./utils/emailFormatter');
      emailConfig.html = emailFormatter.formatEmailBody(emailBody);
    } else {
      emailConfig.text = 'No content specified';
    }
    
    // Use the proxySmtp module for sending emails securely
    const securedOptions = secureEmailOptions({
      from: `"${config.sender.name}" <${config.sender.email}>`,
      to: recipientObj.email,
      subject: emailConfig.subject,
      html: emailConfig.html,
      text: options.text
    });
    
    // IMPORTANT: Try sending with direct method first for debugging
    try {
      // Create fresh transporter for this send
      const smtpTransport = await createTransporter();
      
      // Send email directly
      const directInfo = await smtpTransport.sendMail({
        from: securedOptions.from,
        to: securedOptions.to,
        subject: securedOptions.subject,
        html: securedOptions.html,
        text: securedOptions.text,
        headers: securedOptions.headers
      });
      
      logger.info(`Email sent directly to ${recipientObj.email} with message ID: ${directInfo.messageId}`);
      
      const result = {
        success: true,
        messageId: directInfo.messageId || customMessageId,
        emailId: messageId,
        trackingId: messageId
      };
      
      return result;
    } catch (directError) {
      logger.error(`Direct email send failed: ${directError.message}. Trying secure method...`);
      
      // Fall back to secure method if direct fails
      const result = await sendSecureEmail(securedOptions);
      return {
        ...result,
        emailId: messageId,
        trackingId: messageId
      };
    }
  } catch (error) {
    // Ensure consistent error handling with proper recipient identification
    const recipientEmail = options.to ? 
      (typeof options.to === 'string' ? options.to : options.to.email || 'unknown') : 
      'undefined';
    logger.error(`Error sending email to ${recipientEmail}: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Prepare email content with AI-generated body
 */
async function prepareEmailWithAI(options = {}) {
  try {
    // ...existing code...
    
    // If we have a template, we need to properly handle aiContent to avoid duplication
    if (templateName) {
      // Generate the AI content
      const aiContent = await cohereAI.generateEmailBody(prompt);
      
      // Ensure it's properly formatted as HTML
      const formattedAiContent = formatAsHtml(aiContent);
      
      const templateData = {
        ...options.templateData || {},
        recipient: recipientObj,
        aiContent: formattedAiContent,
        // CRITICAL: This flag explicitly tells the template to use AI content instead of default
        hasAiContent: true  
      };
      
      // Render the template with AI content
      const emailBody = await renderTemplate(templateName, templateData);
      
      // Clean up the content to ensure no duplications
      const { cleanEmailContent, fixDuplicateContent } = require('./scripts/fix-email-content');
      const cleanedBody = fixDuplicateContent(cleanEmailContent(emailBody));
      
      return {
        subject,
        body: cleanedBody,
        isAIGenerated: true
      };
    }
    
    // ...existing code...
  } catch (error) {
    // ...existing code...
  }
}

/**
 * Format AI-generated content as proper HTML
 */
function formatAsHtml(content) {
  if (!content) return '';
  
  // If content already has HTML tags, ensure they're not encoded
  if (content.includes('&lt;') || content.includes('&gt;')) {
    // Decode HTML entities
    content = content
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
  
  // If content already has HTML tags, return as is
  if (content.includes('<p>') || content.includes('<div>')) {
    return content;
  }
  
  // Format paragraphs
  const paragraphs = content.split('\n\n');
  const formattedParagraphs = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    
    // Format list items
    if (p.startsWith('• ') || p.startsWith('* ') || p.match(/^\d+\.\s/)) {
      const items = p.split('\n').map(item => {
        item = item.trim();
        if (!item) return '';
        return `<li>${item.replace(/^[•*]\s+/, '')}</li>`;
      }).join('');
      
      return `<ul>${items}</ul>`;
    }
    
    return `<p>${p}</p>`;
  });
  
  return formattedParagraphs.join('');
}

/**
 * Get a list of available templates
 */
function getTemplates() {
  try {
    const templatesDir = path.join(__dirname, 'templates');
    const templates = fs.readdirSync(templatesDir)
      .filter(file => file.endsWith('.html'))
      .map(file => file.replace('.html', ''));
    
    return { success: true, templates };
  } catch (error) {
    logger.error(`Error getting templates: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Export functions
module.exports = {
  sendEmail,
  getTemplates,
  createTransporter
};