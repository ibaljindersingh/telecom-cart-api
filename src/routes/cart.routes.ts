import { Hono } from 'hono';
import type { Context } from 'hono';
import { CartService } from '../services/cart.service.js';
import { CartError, toErrorResponse, type ErrorResponse } from '../lib/errors.js';
import {
  validateAddItemRequest,
  validateCustomerRequest,
  validateRehydrationRequest,
} from '../lib/validation.js';

/**
 * Helper to return JSON error responses with proper status codes
 */
function jsonError(c: Context, error: unknown) {
  const response = toErrorResponse(error);
  const status = error instanceof CartError ? error.statusCode : 500;
  // Type assertion needed because Hono's json() expects specific status code literals
  // Our CartError only uses valid HTTP status codes (400, 401, 404, 500)
  return c.json(response, status as any);
}

/**
 * Create cart routes
 */
export function createCartRoutes(service: CartService): Hono {
  const app = new Hono();

  /**
   * POST /cart - Create a new cart
   */
  app.post('/', async (c) => {
    try {
      const result = await service.createCart();
      return c.json(result, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  /**
   * GET /cart/:id - Get a cart by ID
   */
  app.get('/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const cart = await service.getCart(id);
      return c.json({ cart });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  /**
   * POST /cart/:id/items - Add an item to the cart
   */
  app.post('/:id/items', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const { sku, quantity } = validateAddItemRequest(body);
      
      const result = await service.addItem(id, sku, quantity);
      return c.json(result);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  /**
   * DELETE /cart/:id/items/:itemId - Remove an item from the cart
   */
  app.delete('/:id/items/:itemId', async (c) => {
    try {
      const cartId = c.req.param('id');
      const itemId = c.req.param('itemId');
      
      const cart = await service.removeItem(cartId, itemId);
      return c.json({ cart });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  /**
   * PATCH /cart/:id/customer - Update customer information
   */
  app.patch('/:id/customer', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const customer = validateCustomerRequest(body);
      
      const cart = await service.updateCustomerInfo(id, customer);
      return c.json({ cart });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  /**
   * POST /cart/rehydrate - Rehydrate a cart from a token
   */
  app.post('/rehydrate', async (c) => {
    try {
      const body = await c.req.json();
      const { token } = validateRehydrationRequest(body);
      
      const result = await service.rehydrateCart(token);
      return c.json(result, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  return app;
}

