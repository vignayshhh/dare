import { auth } from "@/backend/lib/firebase";
import { isFirestoreOfflineError } from "@/utils/firestoreErrors";
export { firestoreRateLimiter, RATE_LIMITS } from "./firestoreRateLimit";

export const SECURITY_LIMITS = {
  email: 320,
  username: 20,
  displayName: 100,
  bio: 500,
  postContent: 10000,
  dareDescription: 2000,
  mediaUrl: 2000,
  passwordMin: 12, // SECURITY: Increased from 8 to 12
  passwordMax: 128,
  authAttemptsPerWindow: 5,
  profileUpdatesPerWindow: 10,
  uploadAttemptsPerWindow: 6,
  rateLimitWindowMs: 15 * 60 * 1000,
} as const;

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

export function getAuthenticatedUserId(): string | null {
  return auth.currentUser?.uid ?? null;
}

export function requireAuthenticatedUser(
  expectedUserId?: string,
  message = "Authentication required.",
): string {
  const authenticatedUserId = getAuthenticatedUserId();

  if (!authenticatedUserId) {
    throw new SecurityError(message);
  }

  if (expectedUserId && authenticatedUserId !== expectedUserId) {
    throw new SecurityError("You are not authorized to perform this action.");
  }

  return authenticatedUserId;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function sanitizePlainText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateEmail(email: string): string {
  const normalizedEmail = normalizeEmail(email);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > SECURITY_LIMITS.email ||
    !emailPattern.test(normalizedEmail)
  ) {
    throw new SecurityError("Please enter a valid email address.");
  }

  return normalizedEmail;
}

export function validateUsername(username: string): string {
  const normalizedUsername = normalizeUsername(username);

  if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
    throw new SecurityError(
      "Username must be 3-20 characters and use only lowercase letters, numbers, and underscores.",
    );
  }

  return normalizedUsername;
}

export function validateDisplayName(displayName: string): string {
  const normalizedDisplayName = sanitizePlainText(displayName);

  if (
    normalizedDisplayName.length < 2 ||
    normalizedDisplayName.length > SECURITY_LIMITS.displayName
  ) {
    throw new SecurityError(
      "Display name must be between 2 and 100 characters.",
    );
  }

  return normalizedDisplayName;
}

export function validateOptionalBio(bio?: string): string {
  const normalizedBio = sanitizePlainText(bio ?? "");

  if (normalizedBio.length > SECURITY_LIMITS.bio) {
    throw new SecurityError("Bio is too long.");
  }

  return normalizedBio;
}

export function validateOptionalMediaUrl(
  mediaUrl?: string,
): string | undefined {
  if (!mediaUrl) return undefined;

  const normalizedMediaUrl = mediaUrl.trim();
  if (normalizedMediaUrl.length === 0) return undefined;

  if (normalizedMediaUrl.length > SECURITY_LIMITS.mediaUrl) {
    throw new SecurityError("Media URL is too long.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedMediaUrl);
  } catch {
    throw new SecurityError("Media URL is invalid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new SecurityError("Media URL must use HTTPS.");
  }

  const allowedHosts = [
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",
    "firebasestorage.app",
  ];

  const hostname = parsedUrl.hostname.toLowerCase();
  const isAllowedHost = allowedHosts.some(
    (allowedHost) =>
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
  );

  if (!isAllowedHost) {
    throw new SecurityError("Media URL host is not allowed.");
  }

  return normalizedMediaUrl;
}

export function validateRequiredText(
  value: string,
  fieldName: string,
  maxLength: number,
): string {
  const normalizedValue = sanitizePlainText(value);

  if (normalizedValue.length === 0) {
    throw new SecurityError(`${fieldName} is required.`);
  }

  if (normalizedValue.length > maxLength) {
    throw new SecurityError(`${fieldName} is too long.`);
  }

  return normalizedValue;
}

/**
 * Validate password strength
 * Requires: minimum 12 characters, at least 1 uppercase, 1 lowercase, 1 number, 1 special character
 */
export function validatePassword(password: string): string {
  if (password.length < SECURITY_LIMITS.passwordMin) {
    throw new SecurityError(
      `Password must be at least ${SECURITY_LIMITS.passwordMin} characters long.`,
    );
  }

  if (password.length > SECURITY_LIMITS.passwordMax) {
    throw new SecurityError("Password is too long.");
  }

  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    throw new SecurityError(
      "Password must contain at least one uppercase letter.",
    );
  }

  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    throw new SecurityError(
      "Password must contain at least one lowercase letter.",
    );
  }

  // Check for at least one number
  if (!/[0-9]/.test(password)) {
    throw new SecurityError("Password must contain at least one number.");
  }

  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    throw new SecurityError(
      "Password must contain at least one special character.",
    );
  }

  // Check for common passwords (basic check)
  const commonPasswords = [
    "password",
    "123456",
    "12345678",
    "qwerty",
    "abc123",
    "password123",
    "admin",
    "welcome",
    "monkey",
    "letmein",
  ];
  if (
    commonPasswords.some((common) => password.toLowerCase().includes(common))
  ) {
    throw new SecurityError(
      "Password is too common. Please choose a stronger password.",
    );
  }

  return password;
}

export function validateOptionalText(
  value: string | undefined,
  maxLength: number,
): string {
  const normalizedValue = sanitizePlainText(value ?? "");

  if (normalizedValue.length > maxLength) {
    throw new SecurityError("Input is too long.");
  }

  return normalizedValue;
}

export function secureLogError(message: string, error: unknown) {
  if (isFirestoreOfflineError(error)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(message);
    }
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.error(message, error);
  } else {
    console.error(message);
  }
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

/**
 * Client-side rate limiting (fallback)
 * Note: This can be bypassed by clearing browser data
 * Use Firestore-based rate limiting for production security
 */
export function enforceRateLimit(
  key: string,
  maxAttempts: number,
  windowMs = SECURITY_LIMITS.rateLimitWindowMs,
) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return;
  }

  if (bucket.count >= maxAttempts) {
    throw new SecurityError("Too many requests. Please try again later.");
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
}

/**
 * Clear rate limit bucket (for testing or admin)
 */
export function clearRateLimit(key: string) {
  rateLimitBuckets.delete(key);
}
