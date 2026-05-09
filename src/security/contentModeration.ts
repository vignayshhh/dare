import DOMPurify from "dompurify";

interface ModerationResult {
  approved: boolean;
  flagged: boolean;
  reason?: string;
  severity: "low" | "medium" | "high";
  categories?: string[];
}

interface ModerationRule {
  pattern: RegExp;
  reason: string;
  severity: "low" | "medium" | "high";
  category: string;
}

/**
 * Content Moderation Service
 *
 * SECURITY FIX: Enhanced with OpenAI integration for AI-powered moderation
 * - Basic rule-based filtering for immediate detection
 * - OpenAI Moderation API integration for advanced content analysis
 * - Configurable strictness levels
 * - Category-based flagging for better review workflow
 */
class ContentModerationService {
  private useOpenAI: boolean;
  private openAIKey?: string;

  constructor() {
    this.useOpenAI = process.env.NEXT_PUBLIC_USE_OPENAI_MODERATION === "true";
    this.openAIKey = process.env.OPENAI_API_KEY;
  }

  private rules: ModerationRule[] = [
    // Profanity (basic list - expand in production)
    {
      pattern: /\b(fuck|shit|damn|ass|bitch|crap|hell)\b/gi,
      reason: "Profanity detected",
      severity: "low",
      category: "profanity",
    },

    // Hate speech indicators (basic patterns)
    {
      pattern:
        /\b(kill\s+(yourself|all\s+of\s+you)|rape|nigger|faggot|retard)\b/gi,
      reason: "Hate speech or harmful content",
      severity: "high",
      category: "hate_speech",
    },

    // Personal information patterns
    {
      pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      reason: "Potential phone number",
      severity: "medium",
      category: "pii",
    },
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      reason: "Email address",
      severity: "medium",
      category: "pii",
    },

    // Spam indicators
    {
      pattern:
        /(buy\s+now|click\s+here|free\s+money|win\s+prize|limited\s+time)/gi,
      reason: "Spam-like content",
      severity: "medium",
      category: "spam",
    },

    // URL patterns (external links)
    {
      pattern:
        /https?:\/\/(?!localhost|127\.0\.0\.1|dare-g5ijg25ue-vignayshhhs-projects\.vercel\.app|dare-web-app\.vercel\.app)[^\s]+/gi,
      reason: "External link",
      severity: "low",
      category: "external_links",
    },
  ];

  /**
   * Moderate text content with OpenAI integration
   * Falls back to rule-based moderation if OpenAI is not configured
   */
  async moderateText(content: string): Promise<ModerationResult> {
    if (!content || typeof content !== "string") {
      return { approved: true, flagged: false, severity: "low" };
    }

    // Try OpenAI moderation first if configured
    if (this.useOpenAI && this.openAIKey) {
      try {
        const openaiResult = await this.moderateWithOpenAI(content);
        if (openaiResult.flagged) {
          return openaiResult;
        }
      } catch (error) {
        // Fall back to rule-based if OpenAI fails
        console.warn("OpenAI moderation failed, falling back to rules:", error);
      }
    }

    // Rule-based moderation (fallback or primary if OpenAI disabled)
    return this.moderateWithRules(content);
  }

  /**
   * Moderate content using OpenAI Moderation API
   */
  private async moderateWithOpenAI(content: string): Promise<ModerationResult> {
    try {
      const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openAIKey}`,
        },
        body: JSON.stringify({ input: content }),
      });

      const data = await response.json();

      if (data.results && data.results[0] && data.results[0].flagged) {
        const result = data.results[0];
        const categories = Object.entries(result.categories)
          .filter(([_, flagged]) => flagged)
          .map(([category, _]) => category);

        return {
          approved: false,
          flagged: true,
          reason: "Content flagged by AI moderation",
          severity:
            result.category_scores && result.category_scores.harassment > 0.5
              ? "high"
              : "medium",
          categories,
        };
      }

      return { approved: true, flagged: false, severity: "low" };
    } catch (error) {
      console.error("OpenAI moderation error:", error);
      throw error;
    }
  }

  /**
   * Moderate content using rule-based patterns (fallback)
   */
  private moderateWithRules(content: string): ModerationResult {
    const lowerContent = content.toLowerCase();
    let flagged = false;
    let highestSeverity: "low" | "medium" | "high" = "low";
    const reasons: string[] = [];
    const categories: string[] = [];

    for (const rule of this.rules) {
      if (rule.pattern.test(content)) {
        flagged = true;
        reasons.push(rule.reason);
        categories.push(rule.category);

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
      categories,
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
  async moderateAndSanitize(content: string): Promise<{
    approved: boolean;
    sanitizedContent: string;
    reason?: string;
  }> {
    const moderationResult = await this.moderateText(content);
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
      /https?:\/\/(?!localhost|127\.0\.0\.1|firebasestorage\.googleapis\.com|storage\.googleapis\.com|dare-g5ijg25ue-vignayshhhs-projects\.vercel\.app|dare-web-app\.vercel\.app)[^\s]+/gi;
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
