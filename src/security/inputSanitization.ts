import DOMPurify from "dompurify";

/**
 * Input Sanitization Utilities
 * Uses DOMPurify to sanitize HTML content and prevent XSS attacks
 */

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param html Raw HTML string
 * @param options Optional DOMPurify configuration
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string, options?: any): string {
  if (typeof html !== "string") {
    return "";
  }

  const defaultOptions = {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "code",
      "pre",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: false,
    ...options,
  };

  return DOMPurify.sanitize(html, defaultOptions) as unknown as string;
}

/**
 * Sanitize plain text by removing any HTML tags
 * @param text Plain text that might contain HTML
 * @returns Sanitized plain text
 */
export function sanitizePlainText(text: string): string {
  if (typeof text !== "string") {
    return "";
  }

  // Remove HTML tags completely
  return text.replace(/<[^>]*>/g, "");
}

/**
 * Sanitize URL to prevent javascript: and data: attacks
 * @param url URL string to sanitize
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== "string") {
    return "";
  }

  try {
    const parsedUrl = new URL(url);

    // Block dangerous protocols
    const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:"];
    if (
      dangerousProtocols.some((protocol) =>
        url.toLowerCase().startsWith(protocol),
      )
    ) {
      return "";
    }

    // Only allow http and https
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return "";
    }

    return url;
  } catch {
    return "";
  }
}

/**
 * Sanitize username/input to prevent injection
 * @param input User input string
 * @param maxLength Maximum allowed length
 * @returns Sanitized input
 */
export function sanitizeInput(input: string, maxLength: number = 100): string {
  if (typeof input !== "string") {
    return "";
  }

  // Remove control characters
  let sanitized = input.replace(/[\u0000-\u001F\u007F]/g, "");

  // Trim whitespace
  sanitized = sanitized.trim();

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Validate and sanitize email address
 * @param email Email string
 * @returns Validated and sanitized email or empty string if invalid
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== "string") {
    return "";
  }

  const sanitized = email.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (emailPattern.test(sanitized)) {
    return sanitized;
  }

  return "";
}

/**
 * Strip potentially dangerous characters from filenames
 * @param filename Original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== "string") {
    return "";
  }

  // Remove path traversal attempts and dangerous characters
  let sanitized = filename.replace(/[\\\/]/g, "_");
  sanitized = sanitized.replace(/\.\./g, "_");
  sanitized = sanitized.replace(/[<>:"|?*]/g, "_");

  // Trim to reasonable length
  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }

  return sanitized;
}
