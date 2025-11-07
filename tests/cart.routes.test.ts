import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SalesforceCartClient } from '../src/clients/salesforceCartClient.js';
import { CartService } from '../src/services/cart.service.js';
import { createCartRoutes } from '../src/routes/cart.routes.js';

describe('Cart Routes', () => {
  let client: SalesforceCartClient;
  let service: CartService;
  let app: ReturnType<typeof createCartRoutes>;
  const SECRET = 'test-secret-min-32-chars-long-key';

  beforeEach(() => {
    vi.useFakeTimers();
    client = new SalesforceCartClient(900_000, 60_000, 100, 50);
    service = new CartService(client, 900_000, SECRET, 3600_000);
    app = createCartRoutes(service);
  });

  afterEach(() => {
    client.stopSweeper();
    client.clear();
    vi.restoreAllMocks();
  });

  describe('POST /cart', () => {
    it('creates a new cart', async () => {
      const req = new Request('http://localhost/', { method: 'POST' });
      const res = await app.fetch(req);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.cart).toBeDefined();
      expect(body.rehydrationToken).toBeDefined();
    });
  });

  describe('GET /cart/:id', () => {
    it('retrieves an existing cart', async () => {
      // Create cart first
      const createReq = new Request('http://localhost/', { method: 'POST' });
      const createRes = await app.fetch(createReq);
      const { cart } = await createRes.json();

      // Get cart
      const req = new Request(`http://localhost/${cart.id}`);
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.id).toBe(cart.id);
    });

    it('returns 404 for non-existent cart', async () => {
      const req = new Request('http://localhost/non-existent');
      const res = await app.fetch(req);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });
  });

  describe('POST /cart/:id/items', () => {
    it('adds item to cart', async () => {
      // Create cart first
      const createReq = new Request('http://localhost/', { method: 'POST' });
      const createRes = await app.fetch(createReq);
      const { cart } = await createRes.json();

      // Add item
      const req = new Request(`http://localhost/${cart.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: 'SKU-001', quantity: 2 }),
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items).toHaveLength(1);
      expect(body.rehydrationToken).toBeDefined();
    });

    it('returns 400 for invalid request', async () => {
      const createReq = new Request('http://localhost/', { method: 'POST' });
      const createRes = await app.fetch(createReq);
      const { cart } = await createRes.json();

      const req = new Request(`http://localhost/${cart.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: 'SKU-001', quantity: 0 }),
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /cart/:id/items/:itemId', () => {
    it('removes item from cart', async () => {
      // Create cart and add item
      const createReq = new Request('http://localhost/', { method: 'POST' });
      const createRes = await app.fetch(createReq);
      const { cart } = await createRes.json();

      const addReq = new Request(`http://localhost/${cart.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: 'SKU-001', quantity: 2 }),
      });
      const addRes = await app.fetch(addReq);
      const { cart: cartWithItem } = await addRes.json();
      const itemId = cartWithItem.items[0].itemId;

      // Remove item
      const req = new Request(
        `http://localhost/${cart.id}/items/${itemId}`,
        { method: 'DELETE' }
      );
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items).toHaveLength(0);
    });
  });

  describe('PATCH /cart/:id/customer', () => {
    it('updates customer information', async () => {
      const createReq = new Request('http://localhost/', { method: 'POST' });
      const createRes = await app.fetch(createReq);
      const { cart } = await createRes.json();

      const req = new Request(`http://localhost/${cart.id}/customer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          firstName: 'John',
        }),
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.customer?.email).toBe('test@example.com');
    });

    it('returns 400 for invalid email', async () => {
      const createReq = new Request('http://localhost/', { method: 'POST' });
      const createRes = await app.fetch(createReq);
      const { cart } = await createRes.json();

      const req = new Request(`http://localhost/${cart.id}/customer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid-email' }),
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /cart/rehydrate', () => {
    it('rehydrates cart from token', async () => {
      const createReq = new Request('http://localhost/', { method: 'POST' });
      const createRes = await app.fetch(createReq);
      const { cart, rehydrationToken } = await createRes.json();

      // Add items
      await app.fetch(
        new Request(`http://localhost/${cart.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: 'SKU-001', quantity: 2 }),
        })
      );

      const addRes = await app.fetch(
        new Request(`http://localhost/${cart.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: 'SKU-002', quantity: 3 }),
        })
      );

      const { rehydrationToken: newToken } = await addRes.json();

      // Rehydrate
      const req = new Request('http://localhost/rehydrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newToken }),
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.cart.items).toHaveLength(2);
      expect(body.cart.id).not.toBe(cart.id); // New cart
    });

    it('returns 401 for invalid token', async () => {
      const req = new Request('http://localhost/rehydrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token' }),
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });
  });
});

