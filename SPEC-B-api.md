# API Contract

## General

All responses are JSON with `Content-Type: application/json`. 

Errors use a consistent envelope structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

This makes client-side error handling straightforward. Every error, regardless of status code, follows this format.

---

## Endpoints

### Create Cart

```http
POST /cart
```

Creates a new empty cart. No request body needed.

**Implementation:**
- Generate a new UUID for cart ID using `crypto.randomUUID()`
- Set TTL from `CART_TTL_MS` environment variable
- Return cart object plus rehydration token

**Response (201 Created):**
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
  "rehydrationToken": "<base64url.signature>"
}
```

The rehydration token should be generated immediately and returned with every cart creation or mutation.

---

### Get Cart

```http
GET /cart/:id
```

Retrieves a cart by ID. This operation refreshes the TTL—important for keeping active sessions alive.

**Implementation:**
- Check if cart exists
- Check if cart is expired (lazy expiration)
- If expired, delete and return 404
- If valid, refresh TTL by updating `expiresAt`
- Return cart

**Response (200 OK):**
```json
{
  "cart": {
    "id": "uuid",
    "items": [...],
    "totals": {...},
    "customer": {...},
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:05:00.000Z",
    "expiresAt": "2025-01-01T00:20:00.000Z"
  }
}
```

**Error (404 Not Found):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cart not found or expired"
  }
}
```

---

### Add Item

```http
POST /cart/:id/items
```

Adds an item to the cart. If the SKU already exists, increment the quantity instead of creating a duplicate.

**Request:**
```json
{
  "sku": "PLAN-5G-PLUS",
  "quantity": 2
}
```

**Validation:**
- `sku`: must be non-empty string (trim and check length > 0)
- `quantity`: must be integer >= 1 (use `Number.isInteger()`)

**Implementation:**
1. Validate input
2. Find cart (returns 404 if expired/missing)
3. Check if SKU exists in cart items
4. If exists: add quantities together
5. If new: generate UUID for `itemId`, add item
6. Recompute totals (subtotal = quantity × price, tax = subtotal × tax_rate)
7. Update `updatedAt` timestamp
8. Generate fresh rehydration token
9. Return cart + token

**Response (200 OK):**
```json
{
  "cart": {
    "id": "uuid",
    "items": [
      { "itemId": "item-uuid", "sku": "PLAN-5G-PLUS", "quantity": 2 }
    ],
    "totals": { 
      "subtotal": 2000,
      "tax": 260,
      "total": 2260
    },
    "updatedAt": "2025-01-01T00:05:00.000Z",
    "expiresAt": "2025-01-01T00:20:00.000Z"
  },
  "rehydrationToken": "<base64url.signature>"
}
```

**Errors:**
- `400 Bad Request`: Invalid sku or quantity
- `404 Not Found`: Cart expired or doesn't exist

---

### Remove Item

```http
DELETE /cart/:id/items/:itemId
```

Removes a specific item by its `itemId` (not SKU—use the UUID assigned when the item was added).

**Implementation:**
1. Find cart (returns 404 if expired/missing)
2. Filter out item with matching `itemId`
3. Recompute totals with remaining items
4. Update `updatedAt` timestamp
5. Return updated cart

**Response (200 OK):**
```json
{
  "cart": {
    "id": "uuid",
    "items": [],
    "totals": { "subtotal": 0, "tax": 0, "total": 0 },
    "updatedAt": "2025-01-01T00:05:00.000Z"
  }
}
```

Note: This endpoint doesn't return a rehydration token since removal is a destructive operation. Clients should already have a token from when they added items.

**Error (404):** Cart or item doesn't exist

---

### Update Customer Info

```http
PATCH /cart/:id/customer
```

Attaches or updates customer information. This is a partial update—provide only the fields you want to change.

**Request:**
```json
{
  "email": "customer@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Validation:**
- All fields optional
- `email` (if provided): must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- `firstName`, `lastName`: no validation (any string)

**Implementation:**
- Merge provided fields with existing customer object
- Preserve any existing fields not included in request
- Don't return rehydration token (customer data not included in token)

**Response (200 OK):**
```json
{
  "cart": {
    "id": "uuid",
    "items": [...],
    "customer": {
      "email": "customer@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "updatedAt": "2025-01-01T00:05:00.000Z"
  }
}
```

**Errors:**
- `400 Bad Request`: Invalid email format
- `404 Not Found`: Cart doesn't exist

---

### Rehydrate Cart

```http
POST /cart/rehydrate
```

Rebuilds a cart from a rehydration token. This creates a brand new cart with a new ID—it doesn't revive the old one.

**Request:**
```json
{
  "token": "<base64url.signature>"
}
```

**Implementation:**
1. Split token on `.` into `[payload, signature]`
2. Verify HMAC signature using `timingSafeEqual()`
3. Decode payload from base64url
4. Parse JSON and validate structure (`iat` number, `items` array)
5. Check token age: `Date.now() - payload.iat <= REHYDRATION_MAX_AGE_MS`
6. Create new cart with new UUID
7. Replay items: for each item in payload, call `mergeItem(cart, item.sku, item.quantity)`
8. Totals recompute automatically during replay
9. Generate fresh rehydration token
10. Return new cart + token

**Response (201 Created):**
```json
{
  "cart": {
    "id": "new-uuid",
    "items": [
      { "itemId": "new-item-uuid-1", "sku": "PLAN-5G-PLUS", "quantity": 2 },
      { "itemId": "new-item-uuid-2", "sku": "ADDON-ROAM", "quantity": 1 }
    ],
    "totals": { "subtotal": 3000, "tax": 390, "total": 3390 },
    "createdAt": "2025-01-01T00:10:00.000Z",
    "updatedAt": "2025-01-01T00:10:00.000Z",
    "expiresAt": "2025-01-01T00:25:00.000Z"
  },
  "rehydrationToken": "<new-base64url.signature>"
}
```

Note: Customer data is NOT carried over—tokens contain only items. Each item gets a new `itemId`.

**Errors:**
- `400 Bad Request`: Token format invalid (not base64url, missing parts, malformed JSON)
- `401 Unauthorized`: Signature mismatch or token expired

---

## Status Codes

| Code | When | Example Scenarios |
|------|------|-------------------|
| `200 OK` | Successful operation | GET cart, DELETE item, PATCH customer |
| `201 Created` | New resource created | POST /cart, POST /cart/rehydrate |
| `400 Bad Request` | Validation failed | Empty sku, quantity < 1, invalid email |
| `401 Unauthorized` | Auth/token failed | Bad signature, expired token, tampered token |
| `404 Not Found` | Resource missing | Cart expired, cart doesn't exist, item not found |
| `500 Internal Server Error` | Unexpected error | Unhandled exception (should be rare) |

**Important:** Expired carts return `404 Not Found`, not some special "expired" status. From the API's perspective, they're just gone.

**Error Handling:**
- Catch all errors in route handlers
- Map custom error classes to HTTP status (use `error.statusCode` property)
- Use `toErrorResponse()` function to format error envelope
- Default to 500 for unexpected errors

---

## Example Usage

**Building a cart:**

```bash
# Create
POST /cart
→ 201 { cart: { id: "abc" }, rehydrationToken: "token1" }

# Add items
POST /cart/abc/items
{ "sku": "PLAN-5G", "quantity": 1 }
→ 200 { cart: {...}, rehydrationToken: "token2" }

POST /cart/abc/items
{ "sku": "ADDON-DATA", "quantity": 2 }
→ 200 { cart: {...}, rehydrationToken: "token3" }

# Attach customer
PATCH /cart/abc/customer
{ "email": "user@example.com" }
→ 200 { cart: {...} }

# Retrieve
GET /cart/abc
→ 200 { cart: {...} }
```

**Recovering from expiry:**

```bash
# Cart expired
GET /cart/abc
→ 404 { error: { code: "NOT_FOUND", message: "..." } }

# Rehydrate using the last token
POST /cart/rehydrate
{ "token": "token3" }
→ 201 { cart: { id: "xyz", items: [...] }, rehydrationToken: "token4" }
```

The rehydrated cart gets a new ID but has the same items as before.

---

## Implementation Checklist

When implementing these endpoints:

1. **Route layer (`cart.routes.ts`):**
   - Parse request bodies with `await c.req.json()`
   - Extract params with `c.req.param('id')`
   - Call validation functions before service calls
   - Wrap all calls in try-catch
   - Map errors to status codes using `error.statusCode`
   - Return JSON with `c.json(data, statusCode)`

2. **Service layer (`cart.service.ts`):**
   - All methods should be `async`
   - Call client methods to get/update carts
   - Apply business logic (merge items, compute totals)
   - Generate tokens after mutations
   - Throw typed errors (`NotFoundError`, `ValidationError`, etc.)

3. **Client layer (`salesforceCartClient.ts`):**
   - Store carts in `Map<string, Cart>`
   - Check expiration on every access
   - Refresh TTL by updating `expiresAt`
   - Return `null` for expired/missing carts (don't throw)
   - Throw `NotFoundError` in `update()` if cart missing/expired

4. **Testing:**
   - Use `vi.useFakeTimers()` for time-dependent tests
   - Test TTL refresh behavior with `vi.advanceTimersByTime()`
   - Test all status codes for each endpoint
   - Test token expiration and signature validation
   - Test item merging by SKU
