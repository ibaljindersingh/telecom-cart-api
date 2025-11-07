import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateToken,
  verifyToken,
  createRehydrationToken,
} from '../src/lib/rehydration.js';
import { TokenError } from '../src/lib/errors.js';

describe('Rehydration', () => {
  const SECRET = 'test-secret-min-32-chars-long-key';
  const MAX_AGE_MS = 3600_000;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateToken and verifyToken', () => {
    it('generates and verifies valid token', () => {
      const payload = {
        iat: Date.now(),
        items: [{ sku: 'SKU-001', quantity: 2 }],
      };

      const token = generateToken(payload, SECRET);
      const verified = verifyToken(token, SECRET, MAX_AGE_MS);

      expect(verified).toEqual(payload);
    });

    it('rejects token with invalid signature', () => {
      const payload = {
        iat: Date.now(),
        items: [{ sku: 'SKU-001', quantity: 2 }],
      };

      const token = generateToken(payload, SECRET);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';

      expect(() => verifyToken(tamperedToken, SECRET, MAX_AGE_MS)).toThrow(
        TokenError
      );
    });

    it('rejects expired token', () => {
      const payload = {
        iat: Date.now(),
        items: [{ sku: 'SKU-001', quantity: 2 }],
      };

      const token = generateToken(payload, SECRET);

      // Advance time past max age
      vi.advanceTimersByTime(MAX_AGE_MS + 1);

      expect(() => verifyToken(token, SECRET, MAX_AGE_MS)).toThrow(TokenError);
    });

    it('rejects malformed token', () => {
      expect(() => verifyToken('not-a-valid-token', SECRET, MAX_AGE_MS)).toThrow(
        TokenError
      );
    });

    it('rejects token with invalid payload', () => {
      const token = 'invalid.payload';
      expect(() => verifyToken(token, SECRET, MAX_AGE_MS)).toThrow(TokenError);
    });

    it('rejects token with future timestamp', () => {
      const payload = {
        iat: Date.now() + 10_000,
        items: [{ sku: 'SKU-001', quantity: 2 }],
      };

      const token = generateToken(payload, SECRET);

      expect(() => verifyToken(token, SECRET, MAX_AGE_MS)).toThrow(TokenError);
    });
  });

  describe('createRehydrationToken', () => {
    it('creates token with items', () => {
      const items = [
        { sku: 'SKU-001', quantity: 2 },
        { sku: 'SKU-002', quantity: 3 },
      ];

      const token = createRehydrationToken(items, SECRET);
      const verified = verifyToken(token, SECRET, MAX_AGE_MS);

      expect(verified.items).toEqual(items);
      expect(verified.iat).toBeDefined();
    });

    it('creates token with empty items', () => {
      const items: Array<{ sku: string; quantity: number }> = [];

      const token = createRehydrationToken(items, SECRET);
      const verified = verifyToken(token, SECRET, MAX_AGE_MS);

      expect(verified.items).toEqual([]);
    });
  });
});

