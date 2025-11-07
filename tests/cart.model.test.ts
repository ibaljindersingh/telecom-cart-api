import { describe, it, expect } from 'vitest';
import {
  createCart,
  mergeItem,
  removeItem,
  updateCustomer,
  calculateTotals,
} from '../src/models/cart.js';

describe('Cart Model', () => {
  describe('calculateTotals', () => {
    it('calculates totals with tax rate', () => {
      const items = [
        { itemId: '1', sku: 'SKU-001', quantity: 2 },
        { itemId: '2', sku: 'SKU-002', quantity: 3 },
      ];

      const totals = calculateTotals(items);

      expect(totals.subtotal).toBe(5000); // 5 items * 1000
      expect(totals.tax).toBe(650); // 13% of 5000
      expect(totals.total).toBe(5650);
    });

    it('returns zero for empty cart', () => {
      const totals = calculateTotals([]);
      expect(totals).toEqual({
        subtotal: 0,
        tax: 0,
        total: 0,
      });
    });
  });

  describe('createCart', () => {
    it('creates a cart with correct structure', () => {
      const cart = createCart('test-id', 900_000);

      expect(cart.id).toBe('test-id');
      expect(cart.items).toEqual([]);
      expect(cart.totals.total).toBe(0);
      expect(cart.createdAt).toBeInstanceOf(Date);
      expect(cart.updatedAt).toBeInstanceOf(Date);
      expect(cart.expiresAt).toBeInstanceOf(Date);
    });

    it('sets correct expiration time', () => {
      const ttl = 900_000;
      const cart = createCart('test-id', ttl);

      const expectedExpiry = cart.createdAt.getTime() + ttl;
      expect(cart.expiresAt.getTime()).toBe(expectedExpiry);
    });
  });

  describe('mergeItem', () => {
    it('adds new item to empty cart', () => {
      const cart = createCart('test-id', 900_000);
      const updated = mergeItem(cart, 'SKU-001', 2);

      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].sku).toBe('SKU-001');
      expect(updated.items[0].quantity).toBe(2);
    });

    it('merges quantity for existing sku', () => {
      let cart = createCart('test-id', 900_000);
      cart = mergeItem(cart, 'SKU-001', 2);
      cart = mergeItem(cart, 'SKU-001', 3);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(5);
    });

    it('keeps different skus separate', () => {
      let cart = createCart('test-id', 900_000);
      cart = mergeItem(cart, 'SKU-001', 2);
      cart = mergeItem(cart, 'SKU-002', 3);

      expect(cart.items).toHaveLength(2);
      expect(cart.items[0].sku).toBe('SKU-001');
      expect(cart.items[1].sku).toBe('SKU-002');
    });

    it('recalculates totals after merge', () => {
      let cart = createCart('test-id', 900_000);
      cart = mergeItem(cart, 'SKU-001', 2);

      expect(cart.totals.total).toBe(2260); // 2000 + 260 tax
    });
  });

  describe('removeItem', () => {
    it('removes item by itemId', () => {
      let cart = createCart('test-id', 900_000);
      cart = mergeItem(cart, 'SKU-001', 2);
      const itemId = cart.items[0].itemId;

      const updated = removeItem(cart, itemId);

      expect(updated.items).toHaveLength(0);
      expect(updated.totals.total).toBe(0);
    });

    it('keeps other items when removing one', () => {
      let cart = createCart('test-id', 900_000);
      cart = mergeItem(cart, 'SKU-001', 2);
      cart = mergeItem(cart, 'SKU-002', 3);
      const firstItemId = cart.items[0].itemId;

      const updated = removeItem(cart, firstItemId);

      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].sku).toBe('SKU-002');
    });
  });

  describe('updateCustomer', () => {
    it('adds customer info to cart', () => {
      const cart = createCart('test-id', 900_000);
      const updated = updateCustomer(cart, {
        email: 'test@example.com',
        firstName: 'John',
      });

      expect(updated.customer).toEqual({
        email: 'test@example.com',
        firstName: 'John',
      });
    });

    it('merges with existing customer info', () => {
      let cart = createCart('test-id', 900_000);
      cart = updateCustomer(cart, { email: 'test@example.com' });
      cart = updateCustomer(cart, { firstName: 'John' });

      expect(cart.customer).toEqual({
        email: 'test@example.com',
        firstName: 'John',
      });
    });
  });
});

