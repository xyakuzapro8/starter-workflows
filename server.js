const express = require('express');
const logger = require('./utils/logger');
const sendEmail = require('./send'); // Import the sendEmail function
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); // Add middleware to parse JSON bodies

app.get('/health', (req, res) => {
  res.status(200).send('Server is healthy');
});

app.post('/send-email', async (req, res) => {
  try {
    await sendEmail();
    res.status(200).send('Email sent successfully');
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    res.status(500).send('Failed to send email');
  }
});

const server = app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${port} is already in use. Trying another port...`);
    const alternativePort = port + 1;
    app.listen(alternativePort, () => {
      logger.info(`Server is running on port ${alternativePort}`);
    });
  } else {
    logger.error(`Server error: ${error.message}`);
    process.exit(1);
  }
});
