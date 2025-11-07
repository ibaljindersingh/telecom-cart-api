/**
 * Core domain types for the cart API
 */

export interface CartItem {
  itemId: string;
  sku: string;
  quantity: number;
}

export interface CartTotals {
  subtotal: number;
  tax: number;
  total: number;
}

export interface CustomerInfo {
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  totals: CartTotals;
  customer?: CustomerInfo;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface RehydrationTokenPayload {
  iat: number;
  items: Array<{ sku: string; quantity: number }>;
}

export interface CartResponse {
  cart: Cart;
  rehydrationToken: string;
}

