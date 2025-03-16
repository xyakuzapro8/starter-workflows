/**
 * Proxy Connection Tester
 * Tests if the proxy configuration works with your SMTP server
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent;
const HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent;
const config = require('../config');
const axios = require('axios');

// Function to test IP without proxy
async function checkCurrentIP() {
  try {
    console.log('Checking your current IP address...');
    const response = await axios.get('https://api.ipify.org?format=json');
    console.log(`Your current IP address: ${response.data.ip}`);
    return response.data.ip;
  } catch (error) {
    console.log('Could not determine your current IP address');
    return null;
  }
}

// Function to test IP with proxy
async function checkProxiedIP() {
  try {
    console.log(`Checking IP address through ${config.proxy.type} proxy...`);
    
    let proxyConfig = {};
    let proxyUrl;
    
    if (config.proxy.type === 'socks5' || config.proxy.type === 'socks4') {
      proxyUrl = `${config.proxy.type}://${
        config.proxy.auth.username ? 
          `${config.proxy.auth.username}:${config.proxy.auth.password}@` : 
          ''
      }${config.proxy.host}:${config.proxy.port}`;
      
      proxyConfig = {
        httpsAgent: new SocksProxyAgent(proxyUrl)
      };
    } else {
      proxyUrl = `http://${
        config.proxy.auth.username ? 
          `${config.proxy.auth.username}:${config.proxy.auth.password}@` : 
          ''
      }${config.proxy.host}:${config.proxy.port}`;
      
      proxyConfig = {
        proxy: {
          host: config.proxy.host,
          port: config.proxy.port,
          auth: config.proxy.auth.username ? {
            username: config.proxy.auth.username,
            password: config.proxy.auth.password
          } : undefined
        }
      };
    }
    
    const response = await axios.get('https://api.ipify.org?format=json', proxyConfig);
    console.log(`IP address through proxy: ${response.data.ip}`);
    return response.data.ip;
  } catch (error) {
    console.log(`Could not connect through proxy: ${error.message}`);
    return null;
  }
}

// Test SMTP with proxy
async function testSmtpWithProxy() {
  console.log('\nTesting SMTP connection through proxy...');
  
  if (!config.proxy.enabled) {
    console.log('Proxy is not enabled in configuration. Enable it first.');
    return false;
  }
  
  try {
    let proxySettings = {};
    
    if (config.proxy.type === 'socks5' || config.proxy.type === 'socks4') {
      const proxyUrl = `${config.proxy.type}://${
        config.proxy.auth.username ? 
          `${config.proxy.auth.username}:${config.proxy.auth.password}@` : 
          ''
      }${config.proxy.host}:${config.proxy.port}`;
      
      proxySettings = {
        socketOptions: {
          agent: new SocksProxyAgent(proxyUrl)
        }
      };
    } else if (config.proxy.type === 'http') {
      const proxyUrl = `http://${
        config.proxy.auth.username ? 
          `${config.proxy.auth.username}:${config.proxy.auth.password}@` : 
          ''
      }${config.proxy.host}:${config.proxy.port}`;
      
      proxySettings = {
        socketOptions: {
          agent: new HttpProxyAgent(proxyUrl)
        }
      };
    }
    
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
      debug: true,
      logger: true,
      tls: {
        rejectUnauthorized: false
      },
      ...proxySettings
    });
    
    await transporter.verify();
    console.log('✅ SMTP connection through proxy successful!');
    return true;
  } catch (error) {
    console.log(`❌ SMTP connection through proxy failed: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  console.log('===== PROXY CONFIGURATION TEST =====');
  console.log(`Proxy enabled: ${config.proxy.enabled}`);
  
  if (!config.proxy.enabled) {
    console.log('Proxy is disabled. Enable it in .env file to use this tool.');
    return;
  }
  
  console.log(`Proxy type: ${config.proxy.type}`);
  console.log(`Proxy host: ${config.proxy.host}:${config.proxy.port}`);
  console.log(`Proxy auth: ${config.proxy.auth.username ? 'Yes' : 'No'}`);
  
  // Test current IP
  const currentIp = await checkCurrentIP();
  
  // Test proxy IP
  const proxiedIp = await checkProxiedIP();
  
  if (currentIp && proxiedIp && currentIp !== proxiedIp) {
    console.log('\n✅ Proxy is working correctly! IP address is different when using proxy.');
  } else if (currentIp && proxiedIp && currentIp === proxiedIp) {
    console.log('\n❌ Proxy is not working correctly. IP address is the same with and without proxy.');
  }
  
  // Test SMTP with proxy
  await testSmtpWithProxy();
}

// Run the main function
main().catch(console.error);
