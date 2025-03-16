/**
 * Send Test Email Through Proxy
 * A simple utility to send a test email using the configured proxy
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const proxyManager = require('../utils/proxyManager');
const config = require('../config');
const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ask question helper
function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, answer => resolve(answer));
  });
}

async function main() {
  console.log('===== SEND EMAIL THROUGH PROXY =====');
  
  // Check if proxy is configured
  if (!config.proxy.enabled) {
    console.log('Error: Proxy is not enabled in configuration');
    rl.close();
    return;
  }
  
  console.log(`Using proxy: ${config.proxy.host}:${config.proxy.port} (${config.proxy.type})`);
  
  // Check proxy IP first
  console.log('\nChecking current proxy IP...');
  const ip = await proxyManager.checkIP();
  
  if (ip.includes('Error')) {
    console.log(`Error connecting to proxy: ${ip}`);
    const retry = await ask('Would you like to continue anyway? (y/n): ');
    if (retry.toLowerCase() !== 'y') {
      rl.close();
      return;
    }
  } else {
    console.log(`Current proxy IP: ${ip}`);
    const proxyInfo = proxyManager.getProxyInfo();
    
    if (proxyInfo.location) {
      console.log(`Location: ${proxyInfo.location.city}, ${proxyInfo.location.region}, ${proxyInfo.location.country}`);
      console.log(`ISP: ${proxyInfo.location.org}`);
    }
  }
  
  // Get recipient email
  const recipient = await ask('\nEnter recipient email address: ');
  
  // Get email subject
  const subject = await ask('Enter email subject (default: "Proxy Test"): ');
  
  // Confirm sending
  const confirm = await ask(`\nSend test email to ${recipient} through proxy? (y/n): `);
  
  if (confirm.toLowerCase() !== 'y') {
    console.log('Sending canceled.');
    rl.close();
    return;
  }
  
  console.log('\nSending email through proxy...');
  
  try {
    // Get proxy settings for nodemailer
    const proxySettings = proxyManager.getNodemailerConfig(true);
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false
      },
      ...proxySettings
    });
    
    // Verify connection first
    await transporter.verify();
    console.log('SMTP connection through proxy verified!');
    
    // Send email
    const info = await transporter.sendMail({
      from: `"${config.sender.name}" <${config.sender.email}>`,
      to: recipient,
      subject: subject || 'Proxy Test',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Proxy Test Email</h2>
          <p>This email was sent through a ${config.proxy.type} proxy (${config.proxy.host}).</p>
          <p>Sent at: ${new Date().toISOString()}</p>
          <p>Proxy IP: ${ip}</p>
          <hr>
          <p>If you received this email, it confirms that your proxy setup is working correctly!</p>
        </div>
      `
    });
    
    console.log(`\nEmail sent successfully!`);
    console.log(`Message ID: ${info.messageId}`);
    rl.close();
  } catch (error) {
    console.log(`\nError sending email: ${error.message}`);
    rl.close();
  }
}

main().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  rl.close();
});
