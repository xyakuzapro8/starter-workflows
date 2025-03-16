# AI Mailer

An advanced email sending system with AI content generation, obfuscation, and security features.

## Features

- **AI Content Generation**: Uses Cohere AI to generate email subject lines and body content
- **Email Obfuscation**: Prevents spam filters from detecting patterns in emails
- **Link Protection**: Creates trusted redirects to protect original URLs
- **Anti-Forwarding**: Implements techniques to discourage email forwarding
- **Email Tracking**: Track when emails are opened
- **Templates**: Pre-designed email templates for various purposes

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure the `.env` file with your SMTP settings and Cohere API key:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
COHERE_API_KEY=your-cohere-api-key
```

3. Start the server:

```bash
npm start
# or
node server.js
```

## Sending Emails

### Using the Command Line Tool

The easiest way to send emails is using the included command-line tool:

```bash
node send.js
# or
npm run send
```

The tool will guide you through the process of:
- Specifying recipients
- Choosing between AI-generated or manual content
- Selecting templates
- Enabling security features

### Using curl

You can also send emails using curl:

```bash
curl -X POST http://localhost:4000/api/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "subject": "Hello",
    "body": "This is a test email.",
    "obfuscate": true
  }'
```

### AI Content Generation

To generate content with AI, omit the subject/body and provide prompts instead:

```bash
curl -X POST http://localhost:4000/api/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "subjectPrompt": "Create a compelling subject line about a new product launch",
    "contentPrompt": "Write an email announcing our new AI product that helps with email marketing"
  }'
```

## Security Features

The system includes several security features:

1. **Email Obfuscation**: Adds random invisible elements and encoded characters to bypass spam filters
2. **Link Protection**: Replaces original URLs with trusted redirects
3. **Anti-Forwarding Protection**: Adds code to discourage forwarding
4. **Email Tracking**: Embeds invisible tracking pixels

## Templates

Create HTML templates in the `templates` directory. Templates should include a `{{content}}` placeholder where the email body will be inserted.

## API Reference

### POST /api/send-email

Send an email with various options.

**Parameters:**

- `to`: Email recipient(s) (string or array)
- `subject`: Email subject (optional if using AI generation)
- `body`: Email body content (optional if using AI generation)
- `subjectPrompt`: Prompt for AI to generate subject (optional)
- `contentPrompt`: Prompt for AI to generate body content (optional)
- `template`: HTML template content (optional)
- `obfuscate`: Whether to apply obfuscation (boolean, default: true)

**Response:**

```json
{
  "success": true,
  "messageId": "message-id",
  "emailId": "tracking-id"
}
```

## License

MIT

# AI Mailer Testing Scripts

## How to use these scripts

### Starting the server
To start the server, use one of the following methods:

**Windows Command Prompt:**
```
start-server.bat
```

**PowerShell:**
```
.\start-server.ps1
```

**Node directly:**
```
node start-server.js
```

### Checking if the server is running
```
node check-server.js
```

### Sending a test email
**Git Bash or WSL:**
```
bash test-email.sh
```

**PowerShell alternative:**
```
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/send-email" -ContentType "application/json" -Body '{"to": "recipient@example.com", "subject": "Test Email", "text": "This is a test email to verify SMTP connection.", "html": "<p>This is a test email to verify SMTP connection.</p>"}'
```

## Troubleshooting
- Make sure Node.js is installed and in your PATH
- Verify that server.js exists in the same directory
- Check that your SMTP configuration is correct by running `node smtp-config-check.js`
- Ensure that port 3000 is not being used by another application
