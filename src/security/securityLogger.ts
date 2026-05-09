import { db } from "@/backend/lib/firebase";
import { doc, setDoc, serverTimestamp, collection } from "firebase/firestore";
import { auth } from "@/backend/lib/firebase";

/**
 * Security logging utility
 * Logs security events to Firestore for monitoring and analysis
 *
 * SECURITY FIX: Enhanced to support both client-side and server-side logging
 * - Client-side: Uses Firebase Auth and browser context
 * - Server-side: Accepts explicit userId and context
 * - Added real-time alerting for critical events
 * - Added structured logging for better analysis
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
    | "2fa_failed"
    | "csrf_failure"
    | "bot_detected"
    | "ip_blocked"
    | "xss_attempt"
    | "injection_attempt";
  userId?: string;
  email?: string;
  details: any;
  severity: "low" | "medium" | "high" | "critical";
  ipAddress?: string;
  deviceFingerprint?: string;
  userAgent?: string;
  path?: string;
  method?: string;
}

/**
 * Server-side security logging (for API routes)
 * This can be imported in server-only contexts
 */
export async function logSecurityEventServer(
  event: SecurityEvent,
): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    // In development, still log to console for debugging
    console.log("[SECURITY]", event.type, event.severity, event.details);
    return;
  }

  try {
    const logRef = doc(collection(db, "security_logs"));

    await setDoc(logRef, {
      ...event,
      timestamp: serverTimestamp(),
      userAgent: event.userAgent || "server-side",
      environment: process.env.NODE_ENV,
      ipAddress: event.ipAddress || "unknown",
      deviceFingerprint: event.deviceFingerprint || "unknown",
    });

    // Trigger alert for critical events
    if (event.severity === "critical") {
      await triggerSecurityAlert(event);
    }
  } catch (error) {
    // Fail silently - logging should never break the application
    console.error("Failed to log security event:", error);
  }
}

/**
 * Client-side security logging (for browser contexts)
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    // In development, still log to console for debugging
    console.log("[SECURITY]", event.type, event.severity, event.details);
    return;
  }

  try {
    const userId = auth.currentUser?.uid;
    const logRef = doc(collection(db, "security_logs"));

    await setDoc(logRef, {
      ...event,
      userId: event.userId || userId,
      timestamp: serverTimestamp(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "server-side",
      environment: process.env.NODE_ENV,
      ipAddress: event.ipAddress || "unknown",
      deviceFingerprint: event.deviceFingerprint || "unknown",
    });

    // Trigger alert for critical events
    if (event.severity === "critical") {
      await triggerSecurityAlert(event);
    }
  } catch (error) {
    // Fail silently - logging should never break the application
    console.error("Failed to log security event:", error);
  }
}

/**
 * Trigger real-time alert for critical security events
 * This could send notifications to admins via email, Slack, etc.
 */
async function triggerSecurityAlert(event: SecurityEvent): Promise<void> {
  try {
    // Create alert document for real-time monitoring
    const alertRef = doc(collection(db, "security_alerts"));
    await setDoc(alertRef, {
      event: event.type,
      severity: event.severity,
      userId: event.userId,
      details: event.details,
      timestamp: serverTimestamp(),
      acknowledged: false,
    });

    // TODO: Integrate with external alerting services (e.g., SendGrid for email, Slack webhook)
    // This would require additional environment variables and service configuration
  } catch (error) {
    console.error("Failed to trigger security alert:", error);
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
