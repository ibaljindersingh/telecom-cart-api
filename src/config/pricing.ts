/**
 * Mock pricing data for demo/testing
 * In production, this would be loaded from a pricing service or database
 */

export const MOCK_PRICES: Record<string, number> = {
  'PLAN-5G-PLUS': 2500,
  'PLAN-BASIC': 1500,
  'ADDON-ROAM': 500,
  'ADDON-DATA': 300,
};

export const DEFAULT_PRICE = 1000;

/**
 * Get price for a SKU, falling back to default if not found
 */
export function getPrice(sku: string): number {
  return MOCK_PRICES[sku] ?? DEFAULT_PRICE;
}

/**
 * Tax rate loaded from environment or default to 13%
 */
export const TAX_RATE = parseFloat(process.env.TAX_RATE || '0.13');

