import { createHmac, timingSafeEqual } from 'crypto';
import { RehydrationTokenPayload } from '../models/types.js';
import { TokenError } from './errors.js';

/**
 * Generate a rehydration token from a payload
 */
export function generateToken(
  payload: RehydrationTokenPayload,
  secret: string
): string {
  const dataStr = JSON.stringify(payload);
  const encoded = Buffer.from(dataStr).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

/**
 * Verify and decode a rehydration token
 */
export function verifyToken(
  token: string,
  secret: string,
  maxAgeMs: number
): RehydrationTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new TokenError('Invalid token format');
  }

  const [encoded, signature] = parts;

  // Verify signature
  const expectedSignature = createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');

  // Compare signatures safely (handle different lengths)
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  
  if (sigBuffer.length !== expectedBuffer.length || 
      !timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new TokenError('Token signature invalid');
  }

  // Decode payload
  let payload: RehydrationTokenPayload;
  try {
    const dataStr = Buffer.from(encoded, 'base64url').toString('utf-8');
    payload = JSON.parse(dataStr);
  } catch {
    throw new TokenError('Token payload invalid');
  }

  // Validate payload structure
  if (
    typeof payload.iat !== 'number' ||
    !Array.isArray(payload.items)
  ) {
    throw new TokenError('Token payload malformed');
  }

  // Check age
  const now = Date.now();
  const age = now - payload.iat;
  if (age > maxAgeMs || age < 0) {
    throw new TokenError('Token expired or invalid timestamp');
  }

  return payload;
}

/**
 * Create a rehydration token from cart items
 */
export function createRehydrationToken(
  items: Array<{ sku: string; quantity: number }>,
  secret: string
): string {
  const payload: RehydrationTokenPayload = {
    iat: Date.now(),
    items,
  };
  return generateToken(payload, secret);
}

