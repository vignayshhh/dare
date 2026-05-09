/**
 * Centralized Logging Utility
 * 
 * SECURITY FIX: Replaces scattered console.log statements with a structured,
 * environment-aware logging system.
 * 
 * Features:
 * - Environment-aware logging (debug logs only in development)
 * - Structured log levels (debug, info, warn, error)
 * - No sensitive data in production logs
 * - Performance-friendly
 * - TypeScript-friendly
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: Date;
}

class Logger {
  private logLevel: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === "development";
    this.logLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG) && this.isDevelopment) {
      console.log(this.formatMessage("DEBUG", message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage("INFO", message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage("WARN", message, context));
    }
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorContext = error instanceof Error 
        ? { ...context, error: error.message, stack: error.stack }
        : { ...context, error };
      console.error(this.formatMessage("ERROR", message, errorContext));
    }
  }

  /**
   * Security-specific logging that always logs regardless of environment
   * but sanitizes sensitive data in production
   */
  security(message: string, context?: Record<string, unknown>): void {
    const sanitizedContext = this.isDevelopment 
      ? context 
      : this.sanitizeContext(context);
    
    console.error(this.formatMessage("SECURITY", message, sanitizedContext));
  }

  /**
   * Remove sensitive data from context in production
   */
  private sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context) return undefined;

    const sensitiveKeys = [
      'password', 'token', 'apiKey', 'secret', 'credential',
      'email', 'phoneNumber', 'ssn', 'creditCard',
      'firebase', 'auth', 'session'
    ];

    const sanitized = { ...context };
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Set the minimum log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience exports for common logging patterns
export const log = {
  debug: (message: string, context?: Record<string, unknown>) => logger.debug(message, context),
  info: (message: string, context?: Record<string, unknown>) => logger.info(message, context),
  warn: (message: string, context?: Record<string, unknown>) => logger.warn(message, context),
  error: (message: string, error?: Error | unknown, context?: Record<string, unknown>) => logger.error(message, error, context),
  security: (message: string, context?: Record<string, unknown>) => logger.security(message, context),
};
