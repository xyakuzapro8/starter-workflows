/**
 * Email Configuration Checker
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const dns = require('dns');

// Load environment variables
dotenv.config();

/**
 * Main function to check email configuration
 */
async function checkConfiguration() {
  console.log('=== Email Configuration Checker ===\n');
  
  // Check environment variables
  console.log('Checking SMTP configuration...');
  const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS ? '********' : undefined
  };
  
  // Print current configuration
  console.table(smtpConfig);
  
  // Check for common issues
  const issues = [];
  
  if (!smtpConfig.host) {
    issues.push('SMTP_HOST is missing');
  } else {
    // Try to resolve the hostname
    try {
      const addresses = await dns.promises.resolve(smtpConfig.host);
      console.log(`✓ DNS resolution successful: ${smtpConfig.host} -> ${addresses.join(', ')}`);
    } catch (err) {
      issues.push(`DNS resolution failed for ${smtpConfig.host}: ${err.message}`);
    }
  }
  
  if (!smtpConfig.port) {
    issues.push('SMTP_PORT is missing');
  } else {
    const port = parseInt(smtpConfig.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      issues.push(`Invalid SMTP_PORT: ${smtpConfig.port}`);
    } else if (port === 465 && smtpConfig.secure !== true) {
      issues.push('Port 465 typically requires SMTP_SECURE=true');
    } else if (port === 587 && smtpConfig.secure === true) {
      issues.push('Port 587 typically requires SMTP_SECURE=false with STARTTLS');
    }
  }
  
  if (!smtpConfig.user) {
    issues.push('SMTP_USER is missing');
  }
  
  if (!process.env.SMTP_PASS) {
    issues.push('SMTP_PASS is missing');
  }
  
  // Check sender configuration
  console.log('\nChecking sender configuration...');
  
  const senderName = process.env.SENDER_NAME;
  const senderEmail = process.env.SENDER_EMAIL || process.env.SMTP_USER;
  
  if (!senderName) {
    issues.push('SENDER_NAME is missing, falling back to default');
  }
  
  if (!senderEmail) {
    issues.push('SENDER_EMAIL is missing, falling back to SMTP_USER');
  } else if (!senderEmail.includes('@')) {
    issues.push(`Invalid SENDER_EMAIL format: ${senderEmail}`);
  }
  
  console.log(`Sender Name: ${senderName || '(not set)'}`);
  console.log(`Sender Email: ${senderEmail || '(not set)'}`);
  
  // Check for SPF, DKIM and DMARC records
  if (senderEmail && senderEmail.includes('@')) {
    const domain = senderEmail.split('@')[1];
    console.log(`\nChecking DNS records for domain: ${domain}`);
    
    // Check SPF record
    try {
      const txtRecords = await dns.promises.resolveTxt(domain);
      const spfRecord = txtRecords.find(record => record[0].startsWith('v=spf1'));
      
      if (spfRecord) {
        console.log(`✓ SPF record found: ${spfRecord[0]}`);
      } else {
        issues.push(`No SPF record found for ${domain}`);
      }
      
      // Look for DMARC record
      try {
        const dmarcRecords = await dns.promises.resolveTxt(`_dmarc.${domain}`);
        if (dmarcRecords.length > 0) {
          console.log(`✓ DMARC record found: ${dmarcRecords[0][0]}`);
        } else {
          issues.push(`No DMARC record found for ${domain}`);
        }
      } catch (dmarcErr) {
        issues.push(`No DMARC record found for ${domain}`);
      }
      
    } catch (dnsErr) {
      issues.push(`Failed to retrieve DNS records for ${domain}: ${dnsErr.message}`);
    }
  }
  
  // Print issues if any
  if (issues.length > 0) {
    console.log('\n⚠️ Configuration issues found:');
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue}`);
    });
    
    console.log('\nPotential fixes:');
    if (issues.some(i => i.includes('DNS resolution failed'))) {
      console.log('- Check if the SMTP hostname is correct and accessible from your network');
    }
    if (issues.some(i => i.includes('SMTP_'))) {
      console.log('- Update your .env file with correct SMTP settings');
    }
    if (issues.some(i => i.includes('SPF') || i.includes('DMARC'))) {
      console.log('- Configure proper DNS records for your email domain to improve deliverability');
    }
  } else {
    console.log('\n✓ All configuration checks passed!');
  }
}

// Run the configuration check
checkConfiguration().catch(err => {
  console.error('Error during configuration check:', err);
});
