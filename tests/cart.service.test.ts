import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SalesforceCartClient } from '../src/clients/salesforceCartClient.js';
import { CartService } from '../src/services/cart.service.js';
import { NotFoundError, TokenError } from '../src/lib/errors.js';

describe('CartService', () => {
  let client: SalesforceCartClient;
  let service: CartService;
  const SECRET = 'test-secret-min-32-chars-long-key';

  beforeEach(() => {
    vi.useFakeTimers();
    client = new SalesforceCartClient(900_000, 60_000, 100, 50);
    service = new CartService(client, 900_000, SECRET, 3600_000);
  });

  afterEach(() => {
    client.stopSweeper();
    client.clear();
    vi.restoreAllMocks();
  });

  describe('createCart', () => {
    it('creates a new cart with token', async () => {
      const result = await service.createCart();

      expect(result.cart.id).toBeDefined();
      expect(result.cart.items).toEqual([]);
      expect(result.rehydrationToken).toBeDefined();
      expect(client.size()).toBe(1);
    });
  });

  describe('getCart', () => {
    it('retrieves an existing cart', async () => {
      const { cart } = await service.createCart();
      const retrieved = await service.getCart(cart.id);

      expect(retrieved.id).toBe(cart.id);
    });

    it('throws NotFoundError for non-existent cart', async () => {
      await expect(service.getCart('non-existent')).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws NotFoundError for expired cart', async () => {
      const { cart } = await service.createCart();

      vi.advanceTimersByTime(900_001);

      await expect(service.getCart(cart.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('addItem', () => {
    it('adds item to cart and returns token', async () => {
      const { cart } = await service.createCart();
      const result = await service.addItem(cart.id, 'SKU-001', 2);

      expect(result.cart.items).toHaveLength(1);
      expect(result.cart.items[0].sku).toBe('SKU-001');
      expect(result.cart.items[0].quantity).toBe(2);
      expect(result.rehydrationToken).toBeDefined();
    });

    it('merges items with same sku', async () => {
      const { cart } = await service.createCart();
      await service.addItem(cart.id, 'SKU-001', 2);
      const result = await service.addItem(cart.id, 'SKU-001', 3);

      expect(result.cart.items).toHaveLength(1);
      expect(result.cart.items[0].quantity).toBe(5);
    });

    it('recalculates totals', async () => {
      const { cart } = await service.createCart();
      const result = await service.addItem(cart.id, 'SKU-001', 2);

      expect(result.cart.totals.subtotal).toBe(2000);
      expect(result.cart.totals.tax).toBe(260);
      expect(result.cart.totals.total).toBe(2260);
    });
  });

  describe('removeItem', () => {
    it('removes item from cart', async () => {
      const { cart } = await service.createCart();
      const { cart: withItem } = await service.addItem(cart.id, 'SKU-001', 2);
      const itemId = withItem.items[0].itemId;

      const updated = await service.removeItem(cart.id, itemId);

      expect(updated.items).toHaveLength(0);
      expect(updated.totals.total).toBe(0);
    });
  });

  describe('updateCustomerInfo', () => {
    it('updates customer information', async () => {
      const { cart } = await service.createCart();
      const updated = await service.updateCustomerInfo(cart.id, {
        email: 'test@example.com',
        firstName: 'John',
      });

      expect(updated.customer?.email).toBe('test@example.com');
      expect(updated.customer?.firstName).toBe('John');
    });
  });

  describe('rehydrateCart', () => {
    it('creates new cart from valid token', async () => {
      const { cart, rehydrationToken } = await service.createCart();
      await service.addItem(cart.id, 'SKU-001', 2);
      await service.addItem(cart.id, 'SKU-002', 3);

      // Get fresh token
      const { rehydrationToken: token } = await service.addItem(
        cart.id,
        'SKU-002',
        0
      );

      const result = await service.rehydrateCart(token);

      expect(result.cart.id).not.toBe(cart.id); // New cart ID
      expect(result.cart.items).toHaveLength(2);
      expect(result.rehydrationToken).toBeDefined();
    });

    it('replays items correctly', async () => {
      const { cart } = await service.createCart();
      await service.addItem(cart.id, 'SKU-001', 2);
      const { rehydrationToken } = await service.addItem(cart.id, 'SKU-002', 3);

      const result = await service.rehydrateCart(rehydrationToken);

      expect(result.cart.items).toHaveLength(2);
      expect(result.cart.totals.total).toBe(5650); // 5 items
    });

    it('throws TokenError for expired token', async () => {
      const { cart } = await service.createCart();
      const { rehydrationToken } = await service.addItem(cart.id, 'SKU-001', 2);

      // Advance past token max age
      vi.advanceTimersByTime(3600_001);

      await expect(service.rehydrateCart(rehydrationToken)).rejects.toThrow(
        TokenError
      );
    });

    it('throws TokenError for invalid token', async () => {
      await expect(service.rehydrateCart('invalid-token')).rejects.toThrow(
        TokenError
      );
    });
  });
});

