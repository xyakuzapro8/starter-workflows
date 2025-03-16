/**
 * Email Content Analysis Tool
 * Helps analyze proposed email content for spam triggers
 */

// Example of a high-risk email (what you proposed)
const highRiskExample = {
  subject: "🚨 You're on the Waitlist for a GAME-CHANGING NFT Drop… 🎉",
  body: `Dear [Friend's Name],

Congratulations! 🎉 You've officially secured your spot on the exclusive waitlist for one of the most anticipated drops in OpenSea history! You are among a select group of people who will get first access to an incredible new collection — but there's a twist!

🔒 What You're Waiting For...
We're talking about a next-level NFT experience. This collection is so rare and valuable, you'll be one of the first to get a chance to own it. Here's what's coming:

    VIP-Only Access: Get ready to unlock secret drops that only people on the waitlist (like you) will be able to access.
    Exclusive Features: Imagine owning NFTs that give you something beyond just digital art — think unlockable content, rare perks, and more!
    A Major Upgrade: You've got first dibs on collectibles that will redefine your OpenSea experience.

But there's just one thing... There's a catch.
You're not the only one on the waitlist — but don't worry, you're getting closer to your chance to claim your spot.

⏳ How Long Will You Wait?
Unfortunately, we can't guarantee how much longer you'll have to wait — but don't worry! We've made sure that you're on the priority list. You'll get your invitation soon enough.`
};

// Improved version with lower spam risk but maintaining engagement
const lowerRiskExample = {
  subject: "Your OpenSea Waitlist Status: New Collection Access",
  body: `Hello [First Name],

Thank you for joining the OpenSea waitlist for our upcoming collection. We're pleased to confirm your place among our early access members.

What to expect:

- Early collection access: You'll be among the first to view and acquire pieces from this new collection
- Enhanced NFT features: These NFTs include special unlockable content beyond the digital artwork
- Community benefits: Connect with other collectors and creators in a private forum

Your position on the waitlist is secured. We're currently preparing for the release and will notify you as soon as your access is ready.

While we finalize the preparations, feel free to explore our current collections and set up your preferences for the upcoming release.

We appreciate your interest in OpenSea and look forward to sharing this exclusive opportunity with you soon.

Best regards,
The OpenSea Team`
};

// Risk analysis for email content
function analyzeSpamRisk(emailContent) {
  const spamTriggers = [
    { pattern: /[A-Z]{4,}/, description: "ALL CAPS text", score: 10 },
    { pattern: /\!{2,}/, description: "Multiple exclamation points", score: 8 },
    { pattern: /urgent|hurry|limited time|act now|don't wait|exclusive offer/i, description: "Urgency language", score: 12 },
    { pattern: /free|guaranteed|winner|selected|special offer/i, description: "Promotional language", score: 10 },
    { pattern: /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]{2,}/u, description: "Multiple emoji", score: 15 },
    { pattern: /but wait|that's not all|secret|insider|vip/i, description: "Marketing phrases", score: 8 },
    { pattern: /congratulations|you've won|you're selected/i, description: "Prize language", score: 9 }
  ];
  
  // Calculate risk score
  let totalScore = 0;
  let triggers = [];
  
  for (const trigger of spamTriggers) {
    if (trigger.pattern.test(emailContent.subject) || trigger.pattern.test(emailContent.body)) {
      totalScore += trigger.score;
      triggers.push(trigger.description);
    }
  }
  
  // Subject-specific checks
  if (/^.*([\u{1F300}-\u{1F6FF}]).*$/u.test(emailContent.subject)) {
    totalScore += 5;
    triggers.push("Emoji in subject line");
  }
  
  // Length checks
  if (emailContent.subject.length > 50) {
    totalScore += 5;
    triggers.push("Long subject line");
  }
  
  // Assess risk level
  let riskLevel;
  if (totalScore >= 30) {
    riskLevel = "HIGH";
  } else if (totalScore >= 15) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }
  
  return {
    score: totalScore,
    riskLevel,
    triggers,
    recommendedChanges: totalScore > 15 ? [
      "Remove emoji from subject line",
      "Avoid ALL CAPS text",
      "Reduce exclamation points",
      "Remove urgency language",
      "Use more natural, conversational language",
      "Avoid creating artificial scarcity or FOMO"
    ] : []
  };
}

// Analysis results
console.log("==== HIGH RISK EXAMPLE ANALYSIS ====");
console.log(analyzeSpamRisk(highRiskExample));

console.log("\n==== LOWER RISK EXAMPLE ANALYSIS ====");
console.log(analyzeSpamRisk(lowerRiskExample));

/**
 * Recommended approach: Use similar content to the lowerRiskExample,
 * which maintains engagement but significantly reduces spam triggers.
 * 
 * For production emails:
 * 1. Use a professional, clean template
 * 2. Keep subject lines clear but avoid marketing language
 * 3. Use at most one emoji in the entire email
 * 4. Avoid exclamation points (one at most)
 * 5. Focus on providing value rather than creating FOMO
 * 6. Use personal, conversational language rather than marketing speak
 */

module.exports = { analyzeSpamRisk };
