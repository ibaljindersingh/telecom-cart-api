import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { SalesforceCartClient } from './clients/salesforceCartClient.js';
import { CartService } from './services/cart.service.js';
import { createCartRoutes } from './routes/cart.routes.js';
import { TAX_RATE } from './config/pricing.js';

// Environment configuration with defaults
const PORT = parseInt(process.env.PORT || '3000', 10);
const CART_TTL_MS = parseInt(process.env.CART_TTL_MS || '900000', 10); // 15 min
const REHYDRATION_SECRET =
  process.env.REHYDRATION_SECRET || 'dev-secret-min-32-chars-long-key';
const REHYDRATION_MAX_AGE_MS = parseInt(
  process.env.REHYDRATION_MAX_AGE_MS || '3600000',
  10
); // 1 hour
const SWEEP_INTERVAL_MS = parseInt(
  process.env.SWEEP_INTERVAL_MS || '60000',
  10
); // 60s
const SWEEP_SCAN_LIMIT = parseInt(process.env.SWEEP_SCAN_LIMIT || '100', 10);
const SWEEP_BUDGET_MS = parseInt(process.env.SWEEP_BUDGET_MS || '50', 10);

// Initialize components
const client = new SalesforceCartClient(
  CART_TTL_MS,
  SWEEP_INTERVAL_MS,
  SWEEP_SCAN_LIMIT,
  SWEEP_BUDGET_MS
);

const service = new CartService(
  client,
  CART_TTL_MS,
  REHYDRATION_SECRET,
  REHYDRATION_MAX_AGE_MS
);

// Start bounded sweeper
client.startSweeper();

// Create Hono app
const app = new Hono();

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// Mount cart routes
app.route('/cart', createCartRoutes(service));

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    },
    404
  );
});

// Start server
console.log(`Server starting on port ${PORT}...`);
serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`✓ Server running at http://localhost:${PORT}`);
console.log(`  Cart TTL: ${CART_TTL_MS}ms`);
console.log(`  Sweeper interval: ${SWEEP_INTERVAL_MS}ms`);
console.log(`  Tax rate: ${(TAX_RATE * 100).toFixed(0)}%`);

