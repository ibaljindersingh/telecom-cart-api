# Telecom Cart Experience API

A minimal, production-quality Node.js Experience API for managing telecom shopping carts with TTL-based expiration and stateless rehydration.

## Features

- **Non-persistent in-memory cart storage** with TTL expiry
- **Lazy expiration** on access with bounded periodic sweeper
- **Stateless rehydration** via HMAC-signed tokens
- **Server-computed totals** with configurable pricing and tax
- **Input validation** for all mutations
- **Comprehensive test coverage** with Vitest and fake timers

## Tech Stack

- **Runtime:** Node 20+
- **Framework:** Hono (minimal, fetch-like HTTP API)
- **Language:** TypeScript (strict mode)
- **Testing:** Vitest with fake timers
- **In-memory storage:** Custom SalesforceCartClient with TTL

## Architecture

```
Client (Web)
    ↓
Routes (Hono) ← input validation, serialization, status mapping
    ↓
CartService ← business rules, totals, token issuance
    ↓
SalesforceCartClient ← in-memory storage with TTL + sweeper
```

### Design Principles

1. **Expired carts return 404** — never revived, ensures bounded memory
2. **TTL refresh on all operations** — read or write extends expiration
3. **Stateless rehydration** — tokens contain only items (sku, quantity), no PII
4. **Correctness doesn't rely on sweeper** — lazy expiration is authoritative

## Installation

```bash
npm install
```

## Configuration

Environment variables (all optional, sensible defaults provided):

```bash
PORT=3000                           # Server port
CART_TTL_MS=900000                  # Cart TTL (15 min)
REHYDRATION_SECRET=your-secret-key  # HMAC secret (min 32 chars)
REHYDRATION_MAX_AGE_MS=3600000      # Token max age (1 hour)
SWEEP_INTERVAL_MS=60000             # Sweeper interval (60s)
SWEEP_SCAN_LIMIT=100                # Max carts scanned per sweep
SWEEP_BUDGET_MS=50                  # Max time per sweep (ms)
TAX_RATE=0.13                       # Tax rate as decimal (default 13%)
```

## Scripts

```bash
npm run dev      # Development mode with hot reload
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled JS from dist/
npm test         # Run all tests
npm run test:watch # Run tests in watch mode
```

## API Endpoints

### Create Cart

```http
POST /cart
```

**Response (201):**

```json
{
  "cart": {
    "id": "uuid",
    "items": [],
    "totals": { "subtotal": 0, "tax": 0, "total": 0 },
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "expiresAt": "2025-01-01T00:15:00.000Z"
  },
  "rehydrationToken": "base64url.signature"
}
```

**Errors:**

- None - This operation always succeeds. No request body is required, and cart creation cannot fail in the in-memory implementation.

### Get Cart

```http
GET /cart/:id
```

**Response (200):**

```json
{
  "cart": { ... }
}
```

**Errors:**

- `404` Cart not found or expired

### Add Item

```http
POST /cart/:id/items
Content-Type: application/json

{
  "sku": "SKU-001",
  "quantity": 2
}
```

**Response (200):**

```json
{
  "cart": {
    "items": [
      { "itemId": "uuid", "sku": "SKU-001", "quantity": 2 }
    ],
    "totals": { "subtotal": 2000, "tax": 260, "total": 2260 }
  },
  "rehydrationToken": "base64url.signature"
}
```

**Errors:**

- `400` Validation error (invalid sku, quantity < 1)
- `404` Cart not found or expired

### Remove Item

```http
DELETE /cart/:id/items/:itemId
```

**Response (200):**

```json
{
  "cart": { ... }
}
```

**Errors:**

- `404` Cart or item not found

### Update Customer

```http
PATCH /cart/:id/customer
Content-Type: application/json

{
  "email": "customer@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response (200):**

```json
{
  "cart": {
    "customer": {
      "email": "customer@example.com",
      "firstName": "John",
      "lastName": "Doe"
    }
  }
}
```

**Errors:**

- `400` Validation error (invalid email format)
- `404` Cart not found or expired

### Rehydrate Cart

```http
POST /cart/rehydrate
Content-Type: application/json

{
  "token": "base64url.signature"
}
```

**Response (201):**

```json
{
  "cart": { ... },
  "rehydrationToken": "new-token"
}
```

**Errors:**

- `400` Invalid request format
- `401` Token invalid, expired, or malformed

## Error Response Format

All errors return a consistent envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

**Status Codes:**

- `200` OK
- `201` Created
- `400` Validation error
- `401` Token invalid/expired
- `404` Not found
- `500` Internal server error

## Domain Model

### Cart

```typescript
{
  id: string;
  items: CartItem[];
  totals: CartTotals;
  customer?: CustomerInfo;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}
```

### CartItem

```typescript
{
  itemId: string;  // UUID assigned by server
  sku: string;     // Product SKU
  quantity: number; // Integer >= 1
}
```

### CartTotals

```typescript
{
  subtotal: number; // Price before tax (integer values)
  tax: number;      // Tax amount (configurable rate)
  total: number;    // subtotal + tax
}
```

## Cart Lifecycle

1. **Create** → TTL starts (default 15 min)
2. **Read/Write** → TTL refreshed
3. **Expire** → Cart evicted, returns 404
4. **Rehydrate** → New cart created from token

### Expiration Behavior

- **Lazy expiration:** Checked on every access (GET/POST/PATCH/DELETE)
- **Bounded sweeper:** Periodically cleans up expired carts (hygiene only)
- **No revival:** Expired carts cannot be accessed, must rehydrate

## Rehydration Tokens

- **Payload:** `{ iat: timestamp, items: [{ sku, quantity }] }`
- **Signature:** HMAC-SHA256
- **No PII:** Customer info not included
- **Age-bounded:** Tokens expire after `REHYDRATION_MAX_AGE_MS`

## Testing

Run tests with coverage:

```bash
npm test
```

### Test Coverage

- **Cart model:** Create, merge, remove, totals calculation
- **SalesforceCartClient:** TTL refresh, lazy expiration, sweeper
- **CartService:** All business operations, token lifecycle
- **Validation:** Input validation for all mutations
- **Rehydration:** Token generation, verification, expiry
- **Routes:** Smoke tests for all endpoints

## Development Notes

### No Database

This is an in-memory implementation. Carts are lost on server restart. For production, replace `SalesforceCartClient` with a real Salesforce Commerce API adapter or persistent store.

### No Authentication

The API assumes upstream authentication/authorization. Cart IDs are UUIDs, providing some obscurity, but not security.

### Pricing

Mock pricing data in `src/config/pricing.ts`:
- SKU-based price lookup with fallback to default price
- Tax rate configurable via `TAX_RATE` environment variable
- In production, replace with real pricing service or Salesforce Commerce Cloud integration

### Out of Scope

- Checkout / order placement
- Promotions / discounts
- Inventory checks
- Multi-currency support

## Decisions and Tradeoffs

### ADR-001: Expired Carts Return 404

**Context:** In-memory carts must expire to bound memory usage.

**Decision:** Expired carts return 404 and are never revived.

**Consequences:**
- ✅ Predictable, deterministic behavior
- ✅ Bounded memory footprint
- ✅ Simple to test
- ❌ Client must handle expiration gracefully
- ✅ Recovery path: rehydration token

### Why POST /cart Has No Errors

The `POST /cart` endpoint intentionally has no error conditions because:
- No request body to validate
- No resource dependencies
- UUID generation and empty cart initialization cannot fail

This is documented explicitly to show it's a design decision, not an oversight. In production with external dependencies (database, rate limiting), we would add appropriate error handling (503, 429, 507).

### Type Safety in Error Handling

In `cart.routes.ts`, the `jsonError()` function uses `as any` for status codes because Hono expects literal types but our status codes are runtime-determined from error classes. Alternative: use union type `200 | 201 | 400 | 401 | 404 | 500`.

### TTL and Expiration Strategy

**Two-tier cleanup:**
1. **Lazy expiration** (primary): Check on every access, guarantees correctness
2. **Bounded sweeper** (secondary): Periodic cleanup with hard limits (scan limit, time budget)

The sweeper uses `unref()` so it doesn't prevent process shutdown. Correctness never relies on the sweeper—it's purely for memory hygiene.

### Known Gaps

- **No persistent storage:** Carts lost on restart (by design for this assignment)
- **No authentication:** Assumes upstream auth; cart IDs provide obscurity, not security
- **No horizontal scaling:** In-memory storage is process-local; would need Redis or sticky sessions
- **Mock pricing:** Real implementation would integrate with pricing service or Salesforce Commerce Cloud
- **No rate limiting:** Production would need request throttling

## License

MIT

