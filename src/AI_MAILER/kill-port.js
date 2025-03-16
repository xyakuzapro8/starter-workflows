const { execSync } = require('child_process');

const killPort = (port) => {
  try {
    // Get the process ID using the port
    let pid;
    
    if (process.platform === 'win32') {
      // For Windows
      const output = execSync(`netstat -ano | findstr :${port}`).toString();
      const match = output.match(/LISTENING\s+(\d+)/);
      if (match && match[1]) {
        pid = match[1];
      }
    } else {
      // For Linux/Mac
      const output = execSync(`lsof -i :${port} | grep LISTEN`).toString();
      const match = output.match(/\w+\s+(\d+)/);
      if (match && match[1]) {
        pid = match[1];
      }
    }

    if (pid) {
      // Kill the process
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /F`);
      } else {
        execSync(`kill -9 ${pid}`);
      }
      console.log(`Process with PID ${pid} using port ${port} has been killed.`);
    } else {
      console.log(`No process found using port ${port}.`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
};

// Check if port is provided as command line argument
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Please provide a port number. Usage: node kill-port.js <port>');
} else {
  const port = args[0];
  killPort(port);
}
