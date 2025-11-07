import { SalesforceCartClient } from '../clients/salesforceCartClient.js';
import { createCart, mergeItem, removeItem, updateCustomer } from '../models/cart.js';
import { Cart, CartResponse } from '../models/types.js';
import { NotFoundError } from '../lib/errors.js';
import { createRehydrationToken, verifyToken } from '../lib/rehydration.js';

/**
 * Cart service: business rules + token issuance
 */
export class CartService {
  constructor(
    private readonly client: SalesforceCartClient,
    private readonly ttlMs: number,
    private readonly rehydrationSecret: string,
    private readonly rehydrationMaxAgeMs: number
  ) {}

  /**
   * Create a new cart
   */
  async createCart(): Promise<CartResponse> {
    const id = crypto.randomUUID();
    const cart = createCart(id, this.ttlMs);
    await this.client.create(cart);

    const token = createRehydrationToken(cart.items, this.rehydrationSecret);
    return { cart, rehydrationToken: token };
  }

  /**
   * Get a cart by ID
   */
  async getCart(id: string): Promise<Cart> {
    const cart = await this.client.get(id);
    if (!cart) {
      throw new NotFoundError('Cart not found or expired');
    }
    return cart;
  }

  /**
   * Add an item to the cart
   */
  async addItem(id: string, sku: string, quantity: number): Promise<CartResponse> {
    const cart = await this.getCart(id);
    const updated = mergeItem(cart, sku, quantity);
    await this.client.update(updated);

    const token = createRehydrationToken(
      updated.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
      this.rehydrationSecret
    );

    return { cart: updated, rehydrationToken: token };
  }

  /**
   * Remove an item from the cart
   */
  async removeItem(cartId: string, itemId: string): Promise<Cart> {
    const cart = await this.getCart(cartId);
    const updated = removeItem(cart, itemId);
    await this.client.update(updated);
    return updated;
  }

  /**
   * Update customer information
   */
  async updateCustomerInfo(
    cartId: string,
    customer: { email?: string; firstName?: string; lastName?: string }
  ): Promise<Cart> {
    const cart = await this.getCart(cartId);
    const updated = updateCustomer(cart, customer);
    await this.client.update(updated);
    return updated;
  }

  /**
   * Rehydrate a cart from a token
   */
  async rehydrateCart(token: string): Promise<CartResponse> {
    const payload = verifyToken(
      token,
      this.rehydrationSecret,
      this.rehydrationMaxAgeMs
    );

    // Create new cart
    const id = crypto.randomUUID();
    let cart = createCart(id, this.ttlMs);

    // Replay items
    for (const item of payload.items) {
      cart = mergeItem(cart, item.sku, item.quantity);
    }

    await this.client.create(cart);

    const newToken = createRehydrationToken(
      cart.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
      this.rehydrationSecret
    );

    return { cart, rehydrationToken: newToken };
  }
}

