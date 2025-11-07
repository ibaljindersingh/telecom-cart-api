import { ValidationError } from './errors.js';

/**
 * Simple email validation
 */
export function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

/**
 * Validate SKU exists (demo: just check it's non-empty)
 */
export function validateSku(sku: string): void {
  if (!sku || sku.trim().length === 0) {
    throw new ValidationError('SKU must be non-empty');
  }
}

/**
 * Validate quantity is >= 1
 */
export function validateQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError('Quantity must be an integer >= 1');
  }
}

/**
 * Validate add item request
 */
export function validateAddItemRequest(body: unknown): {
  sku: string;
  quantity: number;
} {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object');
  }

  const { sku, quantity } = body as Record<string, unknown>;

  if (typeof sku !== 'string') {
    throw new ValidationError('sku must be a string');
  }

  if (typeof quantity !== 'number') {
    throw new ValidationError('quantity must be a number');
  }

  validateSku(sku);
  validateQuantity(quantity);

  return { sku, quantity };
}

/**
 * Validate customer update request
 */
export function validateCustomerRequest(body: unknown): {
  email?: string;
  firstName?: string;
  lastName?: string;
} {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object');
  }

  const data = body as Record<string, unknown>;
  const result: { email?: string; firstName?: string; lastName?: string } = {};

  if (data.email !== undefined) {
    if (typeof data.email !== 'string') {
      throw new ValidationError('email must be a string');
    }
    validateEmail(data.email);
    result.email = data.email;
  }

  if (data.firstName !== undefined) {
    if (typeof data.firstName !== 'string') {
      throw new ValidationError('firstName must be a string');
    }
    result.firstName = data.firstName;
  }

  if (data.lastName !== undefined) {
    if (typeof data.lastName !== 'string') {
      throw new ValidationError('lastName must be a string');
    }
    result.lastName = data.lastName;
  }

  return result;
}

/**
 * Validate rehydration request
 */
export function validateRehydrationRequest(body: unknown): { token: string } {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object');
  }

  const { token } = body as Record<string, unknown>;

  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new ValidationError('token must be a non-empty string');
  }

  return { token };
}

