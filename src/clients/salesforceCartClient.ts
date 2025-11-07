import { Cart } from '../models/types.js';
import { NotFoundError } from '../lib/errors.js';

/**
 * In-memory Salesforce-style cart client with TTL and bounded sweeper
 */
export class SalesforceCartClient {
  private carts = new Map<string, Cart>();
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly sweepIntervalMs: number = 60_000,
    private readonly sweepScanLimit: number = 100,
    private readonly sweepBudgetMs: number = 50
  ) {}

  /**
   * Create a new cart
   */
  async create(cart: Cart): Promise<Cart> {
    this.carts.set(cart.id, cart);
    return cart;
  }

  /**
   * Get a cart by ID, refreshing TTL if not expired
   * Returns null if expired or not found
   */
  async get(id: string): Promise<Cart | null> {
    const cart = this.carts.get(id);
    if (!cart) {
      return null;
    }

    // Lazy expiration check
    if (this.isExpired(cart)) {
      this.carts.delete(id);
      return null;
    }

    // Refresh TTL
    const refreshed = this.refreshTtl(cart);
    this.carts.set(id, refreshed);
    return refreshed;
  }

  /**
   * Update an existing cart, refreshing TTL
   * Throws NotFoundError if cart doesn't exist or is expired
   */
  async update(cart: Cart): Promise<Cart> {
    const existing = this.carts.get(cart.id);
    if (!existing) {
      throw new NotFoundError('Cart not found');
    }

    if (this.isExpired(existing)) {
      this.carts.delete(cart.id);
      throw new NotFoundError('Cart expired');
    }

    const refreshed = this.refreshTtl(cart);
    this.carts.set(cart.id, refreshed);
    return refreshed;
  }

  /**
   * Delete a cart
   */
  async delete(id: string): Promise<void> {
    this.carts.delete(id);
  }

  /**
   * Check if a cart is expired
   */
  private isExpired(cart: Cart): boolean {
    return Date.now() > cart.expiresAt.getTime();
  }

  /**
   * Refresh the TTL on a cart
   */
  private refreshTtl(cart: Cart): Cart {
    const now = new Date();
    return {
      ...cart,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
  }

  /**
   * Bounded periodic sweeper for expired carts
   * Scans up to sweepScanLimit entries or runs for up to sweepBudgetMs
   */
  private sweep(): void {
    const startTime = Date.now();
    let scanned = 0;

    for (const [id, cart] of this.carts.entries()) {
      if (this.isExpired(cart)) {
        this.carts.delete(id);
      }

      scanned++;
      if (scanned >= this.sweepScanLimit) {
        break;
      }

      if (Date.now() - startTime >= this.sweepBudgetMs) {
        break;
      }
    }
  }

  /**
   * Start the bounded sweeper
   */
  startSweeper(): void {
    if (this.sweepInterval) {
      return;
    }

    this.sweepInterval = setInterval(() => {
      this.sweep();
    }, this.sweepIntervalMs);

    // Don't keep process alive just for sweeper
    if (this.sweepInterval.unref) {
      this.sweepInterval.unref();
    }
  }

  /**
   * Stop the sweeper (useful for tests)
   */
  stopSweeper(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  /**
   * Get current cart count (for testing/monitoring)
   */
  size(): number {
    return this.carts.size;
  }

  /**
   * Clear all carts (for testing)
   */
  clear(): void {
    this.carts.clear();
  }
}

