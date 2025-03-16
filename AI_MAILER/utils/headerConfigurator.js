const crypto = require('crypto');
const config = require('../config');
const dkimSigner = require('../services/dkimSigner');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates properly configured email headers
 * @param {Object} base - Base header information (from, to, subject)
 * @returns {Object} - Complete email headers
 */
function createHeaders(base) {
    // Generate a unique Message-ID
    const domain = extractDomain(base.from);
    const messageId = `<${generateRandomString(32)}@${domain}>`;
    
    // Format the current date according to RFC 2822
    const date = new Date().toUTCString();
    
    // Extract sender information for proper formatting
    const fromName = base.from.includes('<') ? 
        base.from.split('<')[0].trim() : 
        base.from.split('@')[0].trim();
    
    // Assemble the headers with optimized settings
    const headers = {
        ...base,
        'Message-ID': messageId,
        'Date': date,
        'Return-Path': `<>`,
        'Reply-To': config.emailConfig.replyTo || base.from,
        'X-Source-IP': '127.0.0.1',
        'X-Sender-IP': '127.0.0.1',
        'X-Mailer': 'Microsoft Office Outlook, Build 10.0.5610',
        'X-MimeOLE': 'Produced By Microsoft MimeOLE V6.00.2800.1441',
        'List-Unsubscribe': `<mailto:unsubscribe@${domain}>`,
        'Precedence': 'first-class',
        'X-Anti-Abuse': `Please report abuse to abuse@${domain}`,
        'Received': generateRandomReceived(),
        'MIME-Version': '1.0',
        'Content-Type': 'multipart/alternative; boundary="boundary-string"',
    };
    
    // Add Outlook-specific headers for Outlook recipients
    if (isOutlookEmail(base.to)) {
        headers['X-Priority'] = '1';
        headers['X-MSmail-Priority'] = 'High';
    }
    
    // Add read receipt headers if enabled
    if (config.emailConfig.requestReadReceipts && !isNoReadReceiptDomain(base.to)) {
        Object.assign(headers, getReadReceiptHeaders(base.from));
    }
    
    // Add custom headers for better deliverability
    const enhancedHeaders = addEnhancedHeaders(headers);
    
    return enhancedHeaders;
}

/**
 * Generate random string for Message-ID
 * @param {Number} length - Length of string
 * @returns {String} - Random string
 */
function generateRandomString(length) {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
}

/**
 * Generate a random "Received" header to look more authentic
 * @returns {String} - Random received header
 */
function generateRandomReceived() {
    const servers = [
        'mail-gateway', 'mx1', 'smtp-relay', 'mta', 'mailfilter',
        'inbound-smtp', 'mail-exchanger', 'smtp-in', 'edge-mail'
    ];
    const domains = [
        'example.com', 'mail.protection.outlook.com', 'google.com',
        'mail-relay.com', 'proofpoint.com', 'mimecast.com'
    ];
    const protocols = ['ESMTP', 'SMTP', 'ESMTPS'];
    
    const server = servers[Math.floor(Math.random() * servers.length)];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const protocol = protocols[Math.floor(Math.random() * protocols.length)];
    const ip = `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    
    return `from ${server}.${domain} (${server}.${domain} [${ip}]) by mx.${domain} with ${protocol} id ${generateRandomString(8)}; ${new Date().toUTCString()}`;
}

/**
 * Check if the recipient is using an Outlook email
 * @param {String} email - Email to check
 * @returns {Boolean} - True if Outlook email
 */
function isOutlookEmail(email) {
    return email.includes('outlook.com') || 
           email.includes('hotmail.com') || 
           email.includes('live.com') ||
           email.includes('msn.com') ||
           email.includes('microsoft.com');
}

/**
 * Check if the domain should not receive read receipts
 * @param {String} email - Email to check
 * @returns {Boolean} - True if read receipts should not be sent
 */
function isNoReadReceiptDomain(email) {
    return email.includes('gmail.com') || // Gmail ignores read receipts
           email.includes('yahoo.com') ||
           email.includes('protonmail.com');
}

/**
 * Generate read receipt headers
 * @param {String} from - From email address
 * @returns {Object} - Read receipt headers
 */
function getReadReceiptHeaders(from) {
    return {
        'Disposition-Notification-To': from,
        'X-Confirm-Reading-To': from,
        'Return-Receipt-To': from,
        'Read-Receipt-To': from
    };
}

/**
 * Add enhanced headers for better deliverability
 * @param {Object} headers - Basic email headers
 * @returns {Object} - Enhanced headers
 */
function addEnhancedHeaders(headers) {
    // Add enhanced headers
    const enhanced = {
        ...headers,
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Auto-Submitted': 'auto-generated',
        'Feedback-ID': generateFeedbackId(headers.from),
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Report-Abuse': `Please report abuse at https://${extractDomain(headers.from)}/report-abuse`,
    };
    
    // Generate DKIM header if available
    try {
        const dkimHeader = dkimSigner.sign(headers);
        if (dkimHeader) {
            enhanced['DKIM-Signature'] = dkimHeader;
        }
    } catch (error) {
        // DKIM signing failed, but we can continue without it
        console.error('DKIM signing error:', error.message);
    }
    
    return enhanced;
}

/**
 * Generate a consistent feedback ID for email tracking
 * @param {String} from - From email address
 * @returns {String} - Feedback ID
 */
function generateFeedbackId(from) {
    const campaignId = crypto.createHash('md5').update(from + new Date().toISOString().split('T')[0]).digest('hex').substring(0, 8);
    const domain = extractDomain(from);
    return `${campaignId}:${domain}`;
}

/**
 * Extract domain from email address
 * @param {String} email - Email address
 * @returns {String} - Domain
 */
function extractDomain(email) {
    const match = email.match(/@([^>]*)/);
    return match ? match[1] : 'example.com';
}

module.exports = {
    createHeaders
};
