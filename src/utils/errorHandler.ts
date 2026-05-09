/**
 * Standardized Error Handler
 * 
 * SECURITY FIX: Prevents information leakage through error messages
 * 
 * Features:
 * - Generic error messages for clients
 * - Detailed error logging server-side
 * - Consistent error response format
 * - No stack traces in production
 */

export enum ErrorCode {
  // Authentication errors (4xx)
  UNAUTHORIZED = "UNAUTHORIZED",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_INVALID = "TOKEN_INVALID",
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  
  // Authorization errors (4xx)
  FORBIDDEN = "FORBIDDEN",
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
  
  // Input validation errors (4xx)
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_FORMAT = "INVALID_FORMAT",
  
  // Resource errors (4xx)
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  CONFLICT = "CONFLICT",
  
  // Rate limiting (4xx)
  RATE_LIMITED = "RATE_LIMITED",
  
  // Server errors (5xx)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  DATABASE_ERROR = "DATABASE_ERROR",
  
  // Security errors (4xx)
  CSRF_FAILURE = "CSRF_FAILURE",
  SUSPICIOUS_ACTIVITY = "SUSPICIOUS_ACTIVITY",
  BOT_DETECTED = "BOT_DETECTED",
}

export interface ErrorResponse {
  error: string;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

class ErrorHandler {
  /**
   * Create a standardized error response
   * In production, returns generic messages to prevent information leakage
   */
  createErrorResponse(
    code: ErrorCode,
    customMessage?: string,
    details?: Record<string, unknown>,
    isDevelopment = process.env.NODE_ENV === "development"
  ): ErrorResponse {
    const message = customMessage || this.getGenericMessage(code);
    
    const response: ErrorResponse = {
      error: code,
      code,
      message: isDevelopment ? message : this.getGenericMessage(code),
    };

    // Only include details in development
    if (isDevelopment && details) {
      response.details = details;
    }

    return response;
  }

  /**
   * Get generic, non-revealing error messages for production
   */
  private getGenericMessage(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.UNAUTHORIZED:
      case ErrorCode.INVALID_CREDENTIALS:
      case ErrorCode.TOKEN_EXPIRED:
      case ErrorCode.TOKEN_INVALID:
        return "Authentication failed. Please sign in again.";
      
      case ErrorCode.ACCOUNT_LOCKED:
        return "Your account has been locked. Please contact support.";
      
      case ErrorCode.FORBIDDEN:
      case ErrorCode.INSUFFICIENT_PERMISSIONS:
        return "You don't have permission to perform this action.";
      
      case ErrorCode.INVALID_INPUT:
      case ErrorCode.MISSING_REQUIRED_FIELD:
      case ErrorCode.INVALID_FORMAT:
        return "Invalid input. Please check your data and try again.";
      
      case ErrorCode.NOT_FOUND:
        return "The requested resource was not found.";
      
      case ErrorCode.ALREADY_EXISTS:
        return "This resource already exists.";
      
      case ErrorCode.CONFLICT:
        return "There was a conflict with your request.";
      
      case ErrorCode.RATE_LIMITED:
        return "Too many requests. Please try again later.";
      
      case ErrorCode.INTERNAL_ERROR:
      case ErrorCode.DATABASE_ERROR:
        return "An internal error occurred. Please try again.";
      
      case ErrorCode.SERVICE_UNAVAILABLE:
        return "Service temporarily unavailable. Please try again later.";
      
      case ErrorCode.CSRF_FAILURE:
        return "Security verification failed. Please refresh the page.";
      
      case ErrorCode.SUSPICIOUS_ACTIVITY:
      case ErrorCode.BOT_DETECTED:
        return "Security check failed. Please try again.";
      
      default:
        return "An error occurred. Please try again.";
    }
  }

  /**
   * Log error details server-side (never expose to client)
   */
  logError(
    error: Error | unknown,
    context?: Record<string, unknown>,
    requestId?: string
  ): void {
    const errorDetails = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      requestId,
      timestamp: new Date().toISOString(),
    };

    // In development, log to console
    if (process.env.NODE_ENV === "development") {
      console.error("[ERROR]", errorDetails);
    }

    // In production, log to security logging system
    // This would integrate with the security logger
    // For now, we'll use console.error with structured format
    console.error(JSON.stringify(errorDetails));
  }

  /**
   * Wrap async functions with standardized error handling
   */
  async wrapAsync<T>(
    fn: () => Promise<T>,
    errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,
    context?: Record<string, unknown>
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logError(error, context);
      throw new AppError(errorCode, this.getGenericMessage(errorCode));
    }
  }
}

/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Singleton instance
export const errorHandler = new ErrorHandler();

// Convenience function for creating error responses
export function createErrorResponse(
  code: ErrorCode,
  customMessage?: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return errorHandler.createErrorResponse(code, customMessage, details);
}
