const nodemailer = require('nodemailer');
require('dotenv').config();

async function sendTestEmail() {
  let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  let info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: 'adamlorde8@gmail.com',
    subject: '⏳ Act Now! 🔥 Exclusive OpenSea Early Access 🎟️',
    html: `<!DOCTYPE html><html lang="en"><head>...</head><body>...</body></html>`, // Your email HTML content here
  });

  console.log('Message sent: %s', info.messageId);
}

sendTestEmail().catch(console.error);
