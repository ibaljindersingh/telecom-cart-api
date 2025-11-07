# PROMPTS.md

This file includes the **exact prompts** used to generate the implementation with Claude Code.
It contains at least one full prompt that **pastes the specs**, follow-up refinements, and
short notes about what I accepted or edited.

---
## Initial Prompt (Full Spec Paste)
```
You are an expert TypeScript backend engineer.
Generate a minimal, production‑quality Node 20+ project for a thin Experience API. 
Follow the two specs pasted below exactly. Keep code small, cohesive, and testable.
No database. No real Salesforce calls.

=== SPEC-A (Architecture & Design) ===
[BEGIN SPEC-A]

[END SPEC-A]

=== SPEC-B (API Contract) ===
[BEGIN SPEC-B]

[END SPEC-B]

=== Requirements ===
- Language: TypeScript on Node 20+
- HTTP framework: Hono
- In-memory SalesforceCartClient with TTL (refresh on read & write)
- Lazy expiration on access + bounded periodic sweeper
- Rehydration: HMAC‑signed snapshot token (items only) with max‑age enforcement
- Totals: server‑computed with configurable pricing and tax, ignore any client totals
- Validation on routes (sku exists, quantity ≥ 1, email format if present)
- Error → HTTP mapping (400/401/404/500)
- Tests: Vitest with fake timers (TTL/sweeper), service and route smoke tests
- NPM scripts: dev, build, start, test
- Project files to create:
  src/index.ts
  src/routes/cart.routes.ts
  src/services/cart.service.ts
  src/clients/salesforceCartClient.ts
  src/models/types.ts
  src/models/cart.ts
  src/lib/errors.ts
  src/lib/validation.ts
  src/lib/rehydration.ts
  src/types/env.d.ts
  tests/*.test.ts
  README.md

Implement exactly as specified. Keep code minimal and readable.
```

## Follow-up Prompt 1 (Refinement)
```
Please remove any notion of “meta” or arbitrary attribute bags from CartItem.
CartItem should be { itemId, sku, quantity } only. Adjust merge logic to merge by sku only.
Ensure rehydration token includes only { iat, items:[{ sku, quantity }]}.
Update tests accordingly.
```

## Follow-up Prompt 2 (Refinement)
```
Add a bounded sweeper (≤ SWEEP_SCAN_LIMIT entries or ≤ SWEEP_BUDGET_MS per run).
Start it in index.ts with SWEEP_INTERVAL_MS defaulting to 60s.
Ensure correctness does not rely on the sweeper; keep lazy expiry on access.
```

## Follow-up Prompt 3 (Pricing Updates)
```
Update pricing to be more general and reusable:
1. Remove currency-specific terminology (CAD, HST, "Cents" suffix)
2. Make pricing and tax computation generic/configurable
3. Update field names: subtotalCents/taxCents/totalCents → subtotal/tax/total

```

## Notes — Accepted & Edited Decisions

**Accepted:**
- Hono as minimal HTTP framework
- Vitest with fake timers for deterministic time-based tests
- TTL refresh on read/write operations
- 404 response for expired carts (no revival)
- Stateless rehydration token with HMAC signatures
- Bounded periodic sweeper for cart cleanup

**Edited:**
- Removed `meta` from CartItem (keep only itemId, sku, quantity)
- Simplified merging logic to sku-only matching
- Removed any JSON stringify comparisons
- Tightened API examples and response formats
- Clarified error envelope structure
- Kept tests small and deterministic
- Removed currency-specific terminology (CAD, HST)
- Changed field names: `subtotalCents/taxCents/totalCents` → `subtotal/tax/total`
- Made tax rate configurable instead of hardcoded 13%

