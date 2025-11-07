/**
 * Custom error classes for the cart API
 */

export class CartError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'CartError';
  }
}

export class NotFoundError extends CartError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends CartError {
  constructor(message = 'Validation failed') {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class TokenError extends CartError {
  constructor(message = 'Token invalid or expired') {
    super(message, 'TOKEN_ERROR', 401);
    this.name = 'TokenError';
  }
}

/**
 * Error envelope for API responses
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof CartError) {
    return {
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }
  
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
}

