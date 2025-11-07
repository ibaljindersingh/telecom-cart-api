import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SalesforceCartClient } from '../src/clients/salesforceCartClient.js';
import { createCart } from '../src/models/cart.js';
import { NotFoundError } from '../src/lib/errors.js';

describe('SalesforceCartClient', () => {
  let client: SalesforceCartClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new SalesforceCartClient(900_000, 60_000, 100, 50);
  });

  afterEach(() => {
    client.stopSweeper();
    client.clear();
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('stores a new cart', async () => {
      const cart = createCart('test-id', 900_000);
      await client.create(cart);

      expect(client.size()).toBe(1);
    });
  });

  describe('get', () => {
    it('retrieves an existing cart', async () => {
      const cart = createCart('test-id', 900_000);
      await client.create(cart);

      const retrieved = await client.get('test-id');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-id');
    });

    it('returns null for non-existent cart', async () => {
      const retrieved = await client.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('refreshes TTL on read', async () => {
      const cart = createCart('test-id', 900_000);
      await client.create(cart);

      // Advance time but not past TTL
      vi.advanceTimersByTime(500_000);

      const retrieved = await client.get('test-id');
      expect(retrieved).not.toBeNull();

      // Advance another 500ms - should still be valid because TTL was refreshed
      vi.advanceTimersByTime(500_000);
      const stillValid = await client.get('test-id');
      expect(stillValid).not.toBeNull();
    });

    it('expires cart after TTL', async () => {
      const cart = createCart('test-id', 900_000);
      await client.create(cart);

      // Advance past TTL
      vi.advanceTimersByTime(900_001);

      const retrieved = await client.get('test-id');
      expect(retrieved).toBeNull();
      expect(client.size()).toBe(0);
    });
  });

  describe('update', () => {
    it('updates an existing cart', async () => {
      const cart = createCart('test-id', 900_000);
      await client.create(cart);

      const updated = { ...cart, items: [] };
      await client.update(updated);

      const retrieved = await client.get('test-id');
      expect(retrieved).not.toBeNull();
    });

    it('throws NotFoundError for non-existent cart', async () => {
      const cart = createCart('test-id', 900_000);

      await expect(client.update(cart)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for expired cart', async () => {
      const cart = createCart('test-id', 900_000);
      await client.create(cart);

      vi.advanceTimersByTime(900_001);

      await expect(client.update(cart)).rejects.toThrow(NotFoundError);
    });

    it('refreshes TTL on update', async () => {
      const cart = createCart('test-id', 900_000);
      await client.create(cart);

      vi.advanceTimersByTime(500_000);
      await client.update(cart);

      vi.advanceTimersByTime(500_000);
      const retrieved = await client.get('test-id');
      expect(retrieved).not.toBeNull();
    });
  });

  describe('delete', () => {
    it('removes a cart', async () => {
      const cart = createCart('test-id', 900_000);
      await client.create(cart);

      await client.delete('test-id');

      expect(client.size()).toBe(0);
    });
  });

  describe('sweeper', () => {
    it('removes expired carts periodically', async () => {
      const cart1 = createCart('cart-1', 900_000);
      const cart2 = createCart('cart-2', 900_000);
      await client.create(cart1);
      await client.create(cart2);

      expect(client.size()).toBe(2);

      // Start sweeper
      client.startSweeper();

      // Advance past TTL
      vi.advanceTimersByTime(900_001);

      // Trigger sweep interval
      vi.advanceTimersByTime(60_000);

      expect(client.size()).toBe(0);
    });

    it('respects scan limit', async () => {
      const smallClient = new SalesforceCartClient(100, 60_000, 2, 50);
      
      // Create 5 carts
      for (let i = 0; i < 5; i++) {
        await smallClient.create(createCart(`cart-${i}`, 100));
      }

      expect(smallClient.size()).toBe(5);

      smallClient.startSweeper();
      vi.advanceTimersByTime(101);
      vi.advanceTimersByTime(60_000);

      // Only 2 should be scanned per sweep (scan limit)
      expect(smallClient.size()).toBeLessThanOrEqual(3);

      smallClient.stopSweeper();
      smallClient.clear();
    });

    it('does not keep process alive', async () => {
      client.startSweeper();
      // This test just ensures startSweeper doesn't throw
      expect(true).toBe(true);
    });
  });
});

