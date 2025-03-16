/**
 * SMTP Debugging Script
 * This script will perform advanced diagnosis of SMTP issues
 */

require('dotenv').config();
const net = require('net');
const tls = require('tls');
const dns = require('dns');
const config = require('../config');
const { promisify } = require('util');

// Promisify DNS functions
const lookupPromise = promisify(dns.lookup);
const resolveMxPromise = promisify(dns.resolveMx);

// SMTP settings
const settings = {
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  user: config.smtp.user
};

// Print header
console.log('======================================');
console.log('SMTP CONNECTION DIAGNOSTIC TOOL');
console.log('======================================');
console.log(`Testing connection to: ${settings.host}:${settings.port}`);
console.log(`Secure mode: ${settings.secure ? 'Yes' : 'No'}`);
console.log('======================================\n');

async function runDiagnostics() {
  try {
    // Step 1: DNS Lookup for the SMTP host
    console.log('1. DNS Lookup Test');
    console.log('------------------');
    try {
      const addressInfo = await lookupPromise(settings.host);
      console.log(`✅ DNS resolution successful: ${settings.host} -> ${addressInfo.address}`);
    } catch (err) {
      console.log(`❌ DNS resolution failed: ${err.message}`);
      console.log('   This could indicate the hostname is incorrect or DNS issues');
    }
    
    // Step 2: Check if the domain has MX records
    const domain = settings.user.split('@')[1];
    if (domain) {
      console.log(`\n2. MX Records Test for ${domain}`);
      console.log('------------------');
      try {
        const mxRecords = await resolveMxPromise(domain);
        console.log(`✅ MX Records found: ${mxRecords.map(mx => `${mx.exchange} (priority: ${mx.priority})`).join(', ')}`);
      } catch (err) {
        console.log(`❌ MX records lookup failed: ${err.message}`);
        console.log('   This might cause email delivery issues');
      }
    }
    
    // Step 3: Try a TCP connection
    console.log('\n3. TCP Connection Test');
    console.log('------------------');
    const tcpResult = await testTcpConnection(settings.host, settings.port);
    
    // Step 4: Try connecting with TLS if secure mode is enabled
    if (settings.secure) {
      console.log('\n4. TLS Connection Test');
      console.log('------------------');
      await testTlsConnection(settings.host, settings.port);
    }
    
    console.log('\n======================================');
    console.log('DIAGNOSIS SUMMARY');
    console.log('======================================');
    
    if (!tcpResult) {
      console.log('❌ Connection issue detected.');
      console.log('   - Check if SMTP server is reachable');
      console.log('   - Verify that port is correct and not blocked by firewall');
      console.log('   - Try alternate ports (25, 465, 587) if available');
      console.log('   - If using secure (SSL/TLS), ensure port supports encryption');
    } else {
      console.log('✅ Basic connectivity looks good.');
      console.log('If you are still seeing "Greeting never received" errors:');
      console.log('   - Try increasing greetingTimeout in nodemailer config');
      console.log('   - Verify that SMTP server allows connections from your IP');
      console.log('   - Check if the server requires STARTTLS on port 587');
      console.log('   - Some servers have rate limits or connection throttling');
    }
    
  } catch (err) {
    console.log(`\nDiagnostic test failed: ${err.message}`);
  }
}

// Test TCP connection
async function testTcpConnection(host, port) {
  return new Promise((resolve) => {
    console.log(`Testing TCP connection to ${host}:${port}...`);
    
    const socket = net.createConnection(port, host);
    let resolved = false;
    
    socket.setTimeout(10000); // 10 second timeout
    
    socket.on('connect', () => {
      console.log(`✅ TCP connection successful`);
      socket.write('QUIT\r\n'); // Gracefully close the connection
      if (!resolved) {
        resolved = true;
        setTimeout(() => socket.end(), 500); // Close after 500ms
        resolve(true);
      }
    });
    
    socket.on('data', (data) => {
      console.log(`📥 Server response: ${data.toString().trim()}`);
    });
    
    socket.on('timeout', () => {
      console.log(`❌ TCP connection timed out`);
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
    
    socket.on('error', (err) => {
      console.log(`❌ TCP connection error: ${err.message}`);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
    
    socket.on('close', (hadError) => {
      if (!resolved) {
        console.log(`❌ TCP connection closed ${hadError ? 'with' : 'without'} error`);
        resolved = true;
        resolve(false);
      }
    });
  });
}

// Test TLS connection
async function testTlsConnection(host, port) {
  return new Promise((resolve) => {
    console.log(`Testing TLS connection to ${host}:${port}...`);
    
    const options = {
      host: host,
      port: port,
      rejectUnauthorized: false // Allow self-signed certs for testing
    };
    
    const socket = tls.connect(options, () => {
      if (socket.authorized) {
        console.log(`✅ TLS connection authorized with valid certificate`);
      } else {
        console.log(`⚠️ TLS connection established but certificate is not trusted: ${socket.authorizationError}`);
      }
      socket.end();
      resolve(true);
    });
    
    socket.setTimeout(10000); // 10 second timeout
    
    socket.on('timeout', () => {
      console.log(`❌ TLS connection timed out`);
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', (err) => {
      console.log(`❌ TLS connection error: ${err.message}`);
      resolve(false);
    });
  });
}

// Run the diagnostics
runDiagnostics().finally(() => {
  console.log('\nDiagnostic tests completed.');
});
