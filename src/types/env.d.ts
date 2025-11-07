declare namespace NodeJS {
  interface ProcessEnv {
    PORT?: string;
    CART_TTL_MS?: string;
    REHYDRATION_SECRET?: string;
    REHYDRATION_MAX_AGE_MS?: string;
    SWEEP_INTERVAL_MS?: string;
    SWEEP_SCAN_LIMIT?: string;
    SWEEP_BUDGET_MS?: string;
  }
}

