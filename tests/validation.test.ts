import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validateSku,
  validateQuantity,
  validateAddItemRequest,
  validateCustomerRequest,
  validateRehydrationRequest,
} from '../src/lib/validation.js';
import { ValidationError } from '../src/lib/errors.js';

describe('Validation', () => {
  describe('validateEmail', () => {
    it('accepts valid email', () => {
      expect(() => validateEmail('test@example.com')).not.toThrow();
    });

    it('rejects invalid email', () => {
      expect(() => validateEmail('not-an-email')).toThrow(ValidationError);
    });
  });

  describe('validateSku', () => {
    it('accepts non-empty sku', () => {
      expect(() => validateSku('SKU-001')).not.toThrow();
    });

    it('rejects empty sku', () => {
      expect(() => validateSku('')).toThrow(ValidationError);
      expect(() => validateSku('   ')).toThrow(ValidationError);
    });
  });

  describe('validateQuantity', () => {
    it('accepts positive integers', () => {
      expect(() => validateQuantity(1)).not.toThrow();
      expect(() => validateQuantity(100)).not.toThrow();
    });

    it('rejects zero and negative', () => {
      expect(() => validateQuantity(0)).toThrow(ValidationError);
      expect(() => validateQuantity(-1)).toThrow(ValidationError);
    });

    it('rejects non-integers', () => {
      expect(() => validateQuantity(1.5)).toThrow(ValidationError);
    });
  });

  describe('validateAddItemRequest', () => {
    it('validates correct request', () => {
      const body = { sku: 'SKU-001', quantity: 2 };
      const result = validateAddItemRequest(body);

      expect(result).toEqual({ sku: 'SKU-001', quantity: 2 });
    });

    it('rejects missing sku', () => {
      const body = { quantity: 2 };
      expect(() => validateAddItemRequest(body)).toThrow(ValidationError);
    });

    it('rejects invalid quantity', () => {
      const body = { sku: 'SKU-001', quantity: 0 };
      expect(() => validateAddItemRequest(body)).toThrow(ValidationError);
    });
  });

  describe('validateCustomerRequest', () => {
    it('validates email field', () => {
      const body = { email: 'test@example.com' };
      const result = validateCustomerRequest(body);

      expect(result).toEqual({ email: 'test@example.com' });
    });

    it('validates multiple fields', () => {
      const body = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };
      const result = validateCustomerRequest(body);

      expect(result).toEqual(body);
    });

    it('rejects invalid email', () => {
      const body = { email: 'not-an-email' };
      expect(() => validateCustomerRequest(body)).toThrow(ValidationError);
    });
  });

  describe('validateRehydrationRequest', () => {
    it('validates token field', () => {
      const body = { token: 'some-token' };
      const result = validateRehydrationRequest(body);

      expect(result).toEqual({ token: 'some-token' });
    });

    it('rejects empty token', () => {
      const body = { token: '' };
      expect(() => validateRehydrationRequest(body)).toThrow(ValidationError);
    });

    it('rejects missing token', () => {
      const body = {};
      expect(() => validateRehydrationRequest(body)).toThrow(ValidationError);
    });
  });
});

