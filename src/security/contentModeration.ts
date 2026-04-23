import DOMPurify from "dompurify";

interface ModerationResult {
  approved: boolean;
  flagged: boolean;
  reason?: string;
  severity: "low" | "medium" | "high";
}

interface ModerationRule {
  pattern: RegExp;
  reason: string;
  severity: "low" | "medium" | "high";
}

/**
 * Content Moderation Service
 * Provides basic content filtering for profanity, hate speech, and inappropriate content
 * Note: This is a foundation - production should use advanced AI moderation services
 */
class ContentModerationService {
  private rules: ModerationRule[] = [
    // Profanity (basic list - expand in production)
    {
      pattern: /\b(fuck|shit|damn|ass|bitch|crap|hell)\b/gi,
      reason: "Profanity detected",
      severity: "low",
    },

    // Hate speech indicators (basic patterns)
    {
      pattern:
        /\b(kill\s+(yourself|all\s+of\s+you)|rape|nigger|faggot|retard)\b/gi,
      reason: "Hate speech or harmful content",
      severity: "high",
    },

    // Personal information patterns
    {
      pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      reason: "Potential phone number",
      severity: "medium",
    },
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      reason: "Email address",
      severity: "medium",
    },

    // Spam indicators
    {
      pattern:
        /(buy\s+now|click\s+here|free\s+money|win\s+prize|limited\s+time)/gi,
      reason: "Spam-like content",
      severity: "medium",
    },

    // URL patterns (external links)
    {
      pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s]+/gi,
      reason: "External link",
      severity: "low",
    },
  ];

  /**
   * Moderate text content
   */
  moderateText(content: string): ModerationResult {
    if (!content || typeof content !== "string") {
      return { approved: true, flagged: false, severity: "low" };
    }

    const lowerContent = content.toLowerCase();
    let flagged = false;
    let highestSeverity: "low" | "medium" | "high" = "low";
    const reasons: string[] = [];

    for (const rule of this.rules) {
      if (rule.pattern.test(content)) {
        flagged = true;
        reasons.push(rule.reason);

        // Track highest severity
        if (rule.severity === "high") {
          highestSeverity = "high";
        } else if (rule.severity === "medium" && highestSeverity !== "high") {
          highestSeverity = "medium";
        }
      }
    }

    return {
      approved: highestSeverity !== "high", // Only block high severity
      flagged,
      reason: reasons.length > 0 ? reasons.join(", ") : undefined,
      severity: highestSeverity,
    };
  }

  /**
   * Sanitize HTML content to prevent XSS
   */
  sanitizeHtml(html: string): string {
    if (!html) return "";

    // Configure DOMPurify to allow only safe tags and attributes
    DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
      // Block dangerous attributes
      if (
        data.attrName === "onclick" ||
        data.attrName === "onerror" ||
        data.attrName === "onload"
      ) {
        data.keepAttr = false;
      }
    });

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "b",
        "i",
        "em",
        "strong",
        "a",
        "p",
        "br",
        "ul",
        "ol",
        "li",
      ],
      ALLOWED_ATTR: ["href", "title"],
      ALLOW_DATA_ATTR: false,
    });
  }

  /**
   * Moderate and sanitize content in one step
   */
  moderateAndSanitize(content: string): {
    approved: boolean;
    sanitizedContent: string;
    reason?: string;
  } {
    const moderationResult = this.moderateText(content);
    const sanitizedContent = this.sanitizeHtml(content);

    return {
      approved: moderationResult.approved,
      sanitizedContent,
      reason: moderationResult.reason,
    };
  }

  /**
   * Check if content contains external links
   */
  hasExternalLinks(content: string): boolean {
    const urlPattern =
      /https?:\/\/(?!localhost|127\.0\.0\.1|firebasestorage\.googleapis\.com|storage\.googleapis\.com)[^\s]+/gi;
    return urlPattern.test(content);
  }

  /**
   * Extract and validate URLs from content
   */
  extractUrls(content: string): string[] {
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const matches = content.match(urlPattern);
    return matches || [];
  }

  /**
   * Check for excessive repetition (spam indicator)
   */
  hasExcessiveRepetition(content: string, threshold: number = 3): boolean {
    const words = content.split(/\s+/);
    const wordCount: Record<string, number> = {};

    for (const word of words) {
      if (word.length > 2) {
        // Ignore short words
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    }

    return Object.values(wordCount).some((count) => count >= threshold);
  }

  /**
   * Check for all caps (shouting indicator)
   */
  isAllCaps(content: string, threshold: number = 0.7): boolean {
    if (content.length < 5) return false;

    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length < 3) return false;

    const upperCase = letters.replace(/[^A-Z]/g, "");
    const ratio = upperCase.length / letters.length;

    return ratio >= threshold;
  }

  /**
   * Add custom moderation rule
   */
  addRule(rule: ModerationRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove moderation rule by index
   */
  removeRule(index: number): void {
    if (index >= 0 && index < this.rules.length) {
      this.rules.splice(index, 1);
    }
  }

  /**
   * Get all current rules
   */
  getRules(): ModerationRule[] {
    return [...this.rules];
  }
}

// Singleton instance
export const contentModerationService = new ContentModerationService();
