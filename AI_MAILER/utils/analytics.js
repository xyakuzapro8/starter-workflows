const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class EmailAnalytics {
  constructor(dbPath = path.join(__dirname, '..', 'data', 'analytics.json')) {
    this.dbPath = dbPath;
    this.db = null;
    this.ensureDbExists();
  }
  
  // Ensure the database file exists
  async ensureDbExists() {
    try {
      // Make sure the directory exists
      await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
      
      try {
        // Try to read the file
        await fs.access(this.dbPath);
      } catch (err) {
        // File doesn't exist, create it with default structure
        await fs.writeFile(this.dbPath, JSON.stringify({
          sentEmails: {},
          opens: {},
          clicks: {},
          campaigns: {}
        }));
        logger.info(`Created analytics database at ${this.dbPath}`);
      }
    } catch (error) {
      logger.error(`Failed to ensure analytics database exists: ${error.message}`);
    }
  }
  
  // Load the database
  async loadDb() {
    try {
      const data = await fs.readFile(this.dbPath, 'utf-8');
      this.db = JSON.parse(data);
      return this.db;
    } catch (error) {
      logger.error(`Failed to load analytics database: ${error.message}`);
      // Return empty default structure
      return {
        sentEmails: {},
        opens: {},
        clicks: {},
        campaigns: {}
      };
    }
  }
  
  // Save the database
  async saveDb() {
    if (!this.db) return;
    
    try {
      await fs.writeFile(this.dbPath, JSON.stringify(this.db, null, 2));
    } catch (error) {
      logger.error(`Failed to save analytics database: ${error.message}`);
    }
  }
  
  // Record a sent email
  async recordEmailSent(messageId, data) {
    if (!this.db) await this.loadDb();
    
    this.db.sentEmails[messageId] = {
      timestamp: Date.now(),
      recipient: data.recipient,
      campaign: data.campaignId || 'none',
      ...data
    };
    
    // Update campaign stats
    if (data.campaignId) {
      if (!this.db.campaigns[data.campaignId]) {
        this.db.campaigns[data.campaignId] = {
          sent: 0,
          opens: 0,
          clicks: 0,
          firstSent: Date.now()
        };
      }
      this.db.campaigns[data.campaignId].sent++;
      this.db.campaigns[data.campaignId].lastSent = Date.now();
    }
    
    await this.saveDb();
    return messageId;
  }
  
  // Record an email open
  async recordOpen(messageId, ip) {
    if (!this.db) await this.loadDb();
    
    if (!this.db.opens[messageId]) {
      this.db.opens[messageId] = [];
    }
    
    this.db.opens[messageId].push({
      timestamp: Date.now(),
      ip: ip || 'unknown'
    });
    
    // Update campaign stats
    if (this.db.sentEmails[messageId] && this.db.sentEmails[messageId].campaignId) {
      const campaignId = this.db.sentEmails[messageId].campaignId;
      if (this.db.campaigns[campaignId]) {
        this.db.campaigns[campaignId].opens++;
      }
    }
    
    await this.saveDb();
  }
  
  // Record a link click
  async recordClick(messageId, link, ip) {
    if (!this.db) await this.loadDb();
    
    if (!this.db.clicks[messageId]) {
      this.db.clicks[messageId] = [];
    }
    
    this.db.clicks[messageId].push({
      timestamp: Date.now(),
      link: link,
      ip: ip || 'unknown'
    });
    
    // Update campaign stats
    if (this.db.sentEmails[messageId] && this.db.sentEmails[messageId].campaignId) {
      const campaignId = this.db.sentEmails[messageId].campaignId;
      if (this.db.campaigns[campaignId]) {
        this.db.campaigns[campaignId].clicks++;
      }
    }
    
    await this.saveDb();
  }
  
  // Get campaign statistics
  async getCampaignStats(campaignId) {
    if (!this.db) await this.loadDb();
    
    if (!campaignId) {
      return this.db.campaigns;
    }
    
    return this.db.campaigns[campaignId] || null;
  }
  
  // Get email statistics
  async getEmailStats(messageId) {
    if (!this.db) await this.loadDb();
    
    if (!messageId) {
      return { error: 'Message ID is required' };
    }
    
    return {
      sent: this.db.sentEmails[messageId] || null,
      opens: this.db.opens[messageId] || [],
      clicks: this.db.clicks[messageId] || []
    };
  }
}

module.exports = new EmailAnalytics();
