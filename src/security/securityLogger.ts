import { db } from "@/backend/lib/firebase";
import { doc, setDoc, serverTimestamp, collection } from "firebase/firestore";
import { auth } from "@/backend/lib/firebase";

/**
 * Security logging utility
 * Logs security events to Firestore for monitoring and analysis
 */

export interface SecurityEvent {
  type:
    | "auth_failure"
    | "rate_limit_exceeded"
    | "invalid_input"
    | "suspicious_activity"
    | "account_locked"
    | "security_violation"
    | "auth_success"
    | "profile_update"
    | "password_change"
    | "email_change"
    | "account_deletion"
    | "data_export"
    | "new_device_login"
    | "content_flagged"
    | "admin_action"
    | "2fa_enabled"
    | "2fa_disabled"
    | "2fa_failed";
  userId?: string;
  email?: string;
  details: any;
  severity: "low" | "medium" | "high" | "critical";
  ipAddress?: string;
  deviceFingerprint?: string;
}

/**
 * Log a security event to Firestore
 * Only logs in production to avoid cluttering development logs
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  // Only log in production
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  try {
    const userId = auth.currentUser?.uid;
    const logRef = doc(collection(db, "security_logs"));

    await setDoc(logRef, {
      ...event,
      userId: event.userId || userId,
      timestamp: serverTimestamp(),
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : "server-side",
      environment: process.env.NODE_ENV,
      ipAddress: event.ipAddress || "unknown",
      deviceFingerprint: event.deviceFingerprint || "unknown",
    });
  } catch (error) {
    // Fail silently - logging should never break the application
    console.error("Failed to log security event:", error);
  }
}

/**
 * Log authentication failure
 */
export async function logAuthFailure(
  email: string,
  reason: string,
): Promise<void> {
  await logSecurityEvent({
    type: "auth_failure",
    email,
    details: { reason, timestamp: Date.now() },
    severity: "high",
  });
}

/**
 * Log rate limit exceeded
 */
export async function logRateLimitExceeded(
  action: string,
  userId: string,
): Promise<void> {
  await logSecurityEvent({
    type: "rate_limit_exceeded",
    userId,
    details: { action, timestamp: Date.now() },
    severity: "medium",
  });
}

/**
 * Log invalid input
 */
export async function logInvalidInput(
  field: string,
  value: string,
  reason: string,
): Promise<void> {
  await logSecurityEvent({
    type: "invalid_input",
    details: { field, value: value.substring(0, 100), reason },
    severity: "low",
  });
}

/**
 * Log suspicious activity
 */
export async function logSuspiciousActivity(
  activity: string,
  details: any,
): Promise<void> {
  await logSecurityEvent({
    type: "suspicious_activity",
    details: { activity, ...details },
    severity: "high",
  });
}

/**
 * Log account lockout
 */
export async function logAccountLockout(
  email: string,
  failedAttempts: number,
  lockoutDuration: string,
): Promise<void> {
  await logSecurityEvent({
    type: "account_locked",
    email,
    details: { failedAttempts, lockoutDuration },
    severity: "critical",
  });
}

/**
 * Log security violation
 */
export async function logSecurityViolation(
  violation: string,
  details: any,
): Promise<void> {
  await logSecurityEvent({
    type: "security_violation",
    details: { violation, ...details },
    severity: "critical",
  });
}

/**
 * Log successful authentication
 */
export async function logAuthSuccess(
  userId: string,
  method: string,
): Promise<void> {
  await logSecurityEvent({
    type: "auth_success",
    userId,
    details: { method, timestamp: Date.now() },
    severity: "low",
  });
}

/**
 * Log profile update
 */
export async function logProfileUpdate(
  userId: string,
  fields: string[],
): Promise<void> {
  await logSecurityEvent({
    type: "profile_update",
    userId,
    details: { fields, timestamp: Date.now() },
    severity: "low",
  });
}

/**
 * Log password change
 */
export async function logPasswordChange(userId: string): Promise<void> {
  await logSecurityEvent({
    type: "password_change",
    userId,
    details: { timestamp: Date.now() },
    severity: "high",
  });
}

/**
 * Log email change
 */
export async function logEmailChange(
  userId: string,
  oldEmail: string,
  newEmail: string,
): Promise<void> {
  await logSecurityEvent({
    type: "email_change",
    userId,
    details: { oldEmail, newEmail, timestamp: Date.now() },
    severity: "high",
  });
}

/**
 * Log account deletion
 */
export async function logAccountDeletion(
  userId: string,
  email: string,
): Promise<void> {
  await logSecurityEvent({
    type: "account_deletion",
    userId,
    email,
    details: { timestamp: Date.now() },
    severity: "critical",
  });
}

/**
 * Log data export
 */
export async function logDataExport(
  userId: string,
  recordCount: number,
): Promise<void> {
  await logSecurityEvent({
    type: "data_export",
    userId,
    details: { recordCount, timestamp: Date.now() },
    severity: "medium",
  });
}

/**
 * Log new device login
 */
export async function logNewDeviceLogin(
  userId: string,
  deviceFingerprint: string,
  isNewDevice: boolean,
): Promise<void> {
  await logSecurityEvent({
    type: "new_device_login",
    userId,
    deviceFingerprint,
    details: { isNewDevice, timestamp: Date.now() },
    severity: isNewDevice ? "medium" : "low",
  });
}

/**
 * Log content flagged by moderation
 */
export async function logContentFlagged(
  userId: string,
  contentType: string,
  reason: string,
): Promise<void> {
  await logSecurityEvent({
    type: "content_flagged",
    userId,
    details: { contentType, reason, timestamp: Date.now() },
    severity: "medium",
  });
}

/**
 * Log admin action
 */
export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetUserId?: string,
): Promise<void> {
  await logSecurityEvent({
    type: "admin_action",
    userId: adminUserId,
    details: { action, targetUserId, timestamp: Date.now() },
    severity: "high",
  });
}

/**
 * Log 2FA enabled
 */
export async function log2FAEnabled(
  userId: string,
  method: string,
): Promise<void> {
  await logSecurityEvent({
    type: "2fa_enabled",
    userId,
    details: { method, timestamp: Date.now() },
    severity: "medium",
  });
}

/**
 * Log 2FA disabled
 */
export async function log2FADisabled(userId: string): Promise<void> {
  await logSecurityEvent({
    type: "2fa_disabled",
    userId,
    details: { timestamp: Date.now() },
    severity: "high",
  });
}

/**
 * Log 2FA failed verification
 */
export async function log2FAFailed(
  userId: string,
  reason: string,
): Promise<void> {
  await logSecurityEvent({
    type: "2fa_failed",
    userId,
    details: { reason, timestamp: Date.now() },
    severity: "high",
  });
}
