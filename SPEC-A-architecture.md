# Cart Experience API — Architecture & Design

## Purpose

This service is a thin Experience API for telecom cart management. The cart context follows Salesforce patterns but lives entirely in memory—no database, no persistence. Carts expire after inactivity and once they're gone, they're gone. This keeps the design simple, predictable, and easy to test.

The philosophy here is intentional minimalism: do the essentials well, make behavior obvious, and avoid hidden complexity.

## Technology Stack

- **Runtime:** Node 20+
- **Language:** TypeScript (strict mode)
- **HTTP Framework:** Hono (lightweight, fetch-like API)
- **Testing:** Vitest with fake timers for deterministic time-based tests
- **Build:** TypeScript compiler, ES modules

## Scope

### What's Included
- Creating and retrieving carts
- Adding/removing items and attaching customer info
- TTL-based expiry that refreshes on activity
- Stateless rehydration using signed tokens
- Unit tests for the full cart lifecycle

### What's Not Included
- Authentication or identity resolution (assume upstream handles this)
- Complex pricing catalog or promotions engine (we use simple mock data)
- Checkout or order placement
- Any persistent storage

## Design Decisions

| Component          | Choice                  |
|--------------------|-------------------------|
| HTTP framework     | Hono                    |
| Cart storage       | `Map<string, Cart>`     |
| Expiration         | Lazy check on access    |
| Cleanup            | Lazy + bounded sweeper  |
| Salesforce         | Test double interface   |
| Token security     | HMAC-SHA256             |
| Testing            | Vitest with fake timers |

## Architecture

The service follows a straightforward three-layer pattern:

```
Client (Web)
    ↓
Routes (Hono)              — Validate input, map errors to HTTP status
    ↓
CartService                — Business rules, compute totals, issue tokens
    ↓
SalesforceCartClient       — Store carts, manage TTL, handle expiry
```

Routes keep HTTP concerns isolated. CartService handles all the cart logic and knows nothing about HTTP. The client layer is a clean interface—swap in a real Salesforce adapter later if needed.

### File Structure

Implement the following structure:

```
src/
├── index.ts                    # Server entry, Hono setup, sweeper initialization
├── routes/
│   └── cart.routes.ts          # All cart endpoints, validation, error mapping
├── services/
│   └── cart.service.ts         # Business logic, totals computation, tokens
├── clients/
│   └── salesforceCartClient.ts # In-memory storage, TTL, sweeper
├── models/
│   ├── types.ts                # TypeScript interfaces
│   └── cart.ts                 # Cart domain functions (create, merge, remove)
├── config/
│   └── pricing.ts              # Mock price lookup (SKU → price, tax rate)
├── lib/
│   ├── errors.ts               # Custom error classes (NotFoundError, etc.)
│   ├── validation.ts           # Input validation functions
│   └── rehydration.ts          # Token generation and verification
└── types/
    └── env.d.ts                # Environment variable types

tests/
├── cart.model.test.ts          # Domain model tests
├── cart.service.test.ts        # Service layer tests
├── salesforceCartClient.test.ts # Client TTL and sweeper tests
├── cart.routes.test.ts         # HTTP endpoint tests
├── validation.test.ts          # Validation logic tests
└── rehydration.test.ts         # Token tests
```

## Domain Model

### Cart
```typescript
Cart {
  id: string
  items: CartItem[]
  totals: {
    subtotal: number
    tax: number
    total: number
  }
  customer?: {
    email?: string
    firstName?: string
    lastName?: string
  }
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}
```

### CartItem
```typescript
CartItem {
  itemId: string        // Server-assigned UUID
  sku: string          // Product identifier
  quantity: number     // Must be >= 1
}
```

### Rules

**Totals computation:**
- Always computed server-side using a simple mock price lookup (`src/config/pricing.ts`)
- Mock prices defined as `Record<SKU, price>` with a default fallback price
- Tax rate configurable via environment variable (defaults to 13%)
- Use integer values to avoid floating-point errors
- Client never supplies totals—we recompute them on every mutation
- This prevents tampering and keeps the source of truth clear

**Item merging:**
- Items merge by SKU only
- If you add the same SKU twice, increment the quantity on the existing item
- Each item gets a unique `itemId` (UUID) assigned by the server
- No metadata bags or extra attributes—keep it simple

**Validation:**
- `sku` must be non-empty string
- `quantity` must be integer >= 1
- `email` (if provided) must match valid email format: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

## Lifecycle

Every time you touch a cart—whether reading or writing—we check if it's expired. If the current time is past `expiresAt`, we evict it immediately and return 404. No grace period, no revival.

If the cart is still valid, we refresh its TTL and proceed. This "touch to refresh" behavior keeps active carts alive without explicit keepalive calls.

Two important invariants:
- Once a cart expires, it's gone. We never bring it back.
- Rehydration always creates a fresh cart with a new ID.

## Rehydration Token

The rehydration token is a signed snapshot of cart items. It's intentionally minimal:

```json
{
  "iat": 1234567890,
  "items": [
    { "sku": "PLAN-5G-PLUS", "quantity": 2 },
    { "sku": "ADDON-ROAM", "quantity": 1 }
  ]
}
```

**Implementation details:**
- Sign with HMAC-SHA256 using a server secret (from `REHYDRATION_SECRET` env var)
- Format: `base64url(payload).base64url(hmac-signature)`
- Payload contains only items—no customer data, no totals, no PII
- Use `timingSafeEqual()` for signature comparison to prevent timing attacks
- Tokens are age-bounded; check `Date.now() - payload.iat <= REHYDRATION_MAX_AGE_MS`

**Rehydration flow:**
1. Verify token signature
2. Check token age
3. Create new cart with new UUID
4. Replay items by calling `mergeItem()` for each
5. Recompute totals (happens automatically in `mergeItem`)
6. Return new cart with fresh token

Think of it as a stateless recovery mechanism: the token is instructions for rebuilding state, not state itself.

## Cleanup Strategy

We use two mechanisms to clean up expired carts:

**Lazy expiration** is the primary mechanism. Every time we access a cart, we check if it's expired. If it is, we evict it right then. This is what ensures correctness—we never hand out stale carts.

Implementation:
```typescript
private isExpired(cart: Cart): boolean {
  return Date.now() > cart.expiresAt.getTime();
}

async get(id: string): Promise<Cart | null> {
  const cart = this.carts.get(id);
  if (!cart) return null;
  
  if (this.isExpired(cart)) {
    this.carts.delete(id);
    return null;
  }
  
  // Refresh TTL
  return this.refreshTtl(cart);
}
```

**Bounded sweeper** is secondary. It runs periodically to clean up carts that expired while nobody was looking. This is purely for hygiene; the sweeper has hard limits so it never causes latency spikes:

Configuration (via environment variables):
- `SWEEP_INTERVAL_MS`: How often to run (default: 60000 = 60s)
- `SWEEP_SCAN_LIMIT`: Max carts to check per run (default: 100)
- `SWEEP_BUDGET_MS`: Max time per run (default: 50ms)

The sweeper scans the cart map and deletes expired entries. It stops early if it hits the scan limit or time budget. Call `unref()` on the interval so it doesn't keep the process alive.

## ADR-001: Expired Carts Return 404

**Decision:** When a cart expires, we return 404 and never revive it.

**Why:** This matches how Salesforce cart contexts work—ephemeral by nature. It also makes behavior predictable and testable. There's a clear line between "active" and "expired," no gray area.

**Tradeoffs:** Memory stays bounded and behavior is deterministic, which is good. The downside is clients need to handle 404 gracefully, but that's reasonable. The recovery path is straightforward: use the `/cart/rehydrate` endpoint with the last token you got.

## Risks & Mitigations

**Memory is process-local.** That's fine for this implementation. The client interface is clean enough that we could swap in Redis or a real Salesforce adapter later if we need to scale horizontally.

**Token tampering.** We mitigate this with HMAC signatures and age bounds. Even if someone modifies a token, the signature won't match. And we always recompute totals server-side, so there's no way to inject fake prices.

**Multi-instance scaling.** Not needed for this assignment, but the architecture supports it. You'd add a load balancer with sticky sessions or switch to shared storage.

**Memory leaks.** The TTL + sweeper combo keeps memory bounded. Old carts get cleaned up even if clients abandon them.

## Quality Goals

The implementation aims for:
- **Small surface area** — under 1,000 lines of code
- **Predictable latency** — bounded sweeper prevents spikes
- **Deterministic tests** — fake timers, no real time dependencies
- **Transparent behavior** — no hidden state transitions or surprises
- **Type safety** — TypeScript strict mode throughout
- **Proper error handling** — custom error classes that map cleanly to HTTP status codes

## Configuration

Use environment variables with sensible defaults:

```bash
PORT=3000                           # Server port
CART_TTL_MS=900000                  # 15 minutes
REHYDRATION_SECRET=<your-secret>    # Min 32 chars for HMAC security
REHYDRATION_MAX_AGE_MS=3600000      # 1 hour
SWEEP_INTERVAL_MS=60000             # 60 seconds
SWEEP_SCAN_LIMIT=100                # Max carts per sweep
SWEEP_BUDGET_MS=50                  # Max ms per sweep
```

## NPM Scripts

Include these in `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

## Implementation Notes

- Use `crypto.randomUUID()` for generating IDs
- Use `Date` objects for timestamps (not unix timestamps in models)
- Return dates as ISO strings in JSON responses
- Store carts in a `Map<string, Cart>` for O(1) lookup
- Use Vitest's `vi.useFakeTimers()` and `vi.advanceTimersByTime()` for time-based tests
- Make all cart operations `async` even though they're in-memory (future-proofs the interface)
