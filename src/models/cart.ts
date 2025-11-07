import { Cart, CartItem, CartTotals } from './types.js';
import { getPrice, TAX_RATE } from '../config/pricing.js';

/**
 * Calculate cart totals using mock pricing data
 */
export function calculateTotals(items: CartItem[]): CartTotals {
  const subtotal = items.reduce((sum, item) => {
    const price = getPrice(item.sku);
    return sum + price * item.quantity;
  }, 0);
  
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;

  return { subtotal, tax, total };
}

/**
 * Create a new cart with computed totals
 */
export function createCart(id: string, ttlMs: number): Cart {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  return {
    id,
    items: [],
    totals: { subtotal: 0, tax: 0, total: 0 },
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
}

/**
 * Merge an item into the cart by sku
 */
export function mergeItem(cart: Cart, sku: string, quantity: number): Cart {
  const existingIndex = cart.items.findIndex((item) => item.sku === sku);
  let updatedItems: CartItem[];

  if (existingIndex >= 0) {
    updatedItems = [...cart.items];
    updatedItems[existingIndex] = {
      ...updatedItems[existingIndex],
      quantity: updatedItems[existingIndex].quantity + quantity,
    };
  } else {
    const newItem: CartItem = {
      itemId: crypto.randomUUID(),
      sku,
      quantity,
    };
    updatedItems = [...cart.items, newItem];
  }

  return {
    ...cart,
    items: updatedItems,
    totals: calculateTotals(updatedItems),
    updatedAt: new Date(),
  };
}

/**
 * Remove an item from the cart by itemId
 */
export function removeItem(cart: Cart, itemId: string): Cart {
  const updatedItems = cart.items.filter((item) => item.itemId !== itemId);
  
  return {
    ...cart,
    items: updatedItems,
    totals: calculateTotals(updatedItems),
    updatedAt: new Date(),
  };
}

/**
 * Update customer information on the cart
 */
export function updateCustomer(
  cart: Cart,
  customer: { email?: string; firstName?: string; lastName?: string }
): Cart {
  return {
    ...cart,
    customer: { ...cart.customer, ...customer },
    updatedAt: new Date(),
  };
}

