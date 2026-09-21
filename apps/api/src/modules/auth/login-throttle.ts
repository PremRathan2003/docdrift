/**
 * Per-account brute-force protection: after `maxFailures` wrong passwords for
 * one email within `windowMs`, further attempts for that email are refused
 * until the window ends — even with the right password (otherwise the lock
 * would tell an attacker when they had guessed correctly).
 *
 * This complements the per-IP limit: an attacker spreading guesses across
 * many IP addresses still hits the per-account limit.
 *
 * Trade-offs, stated honestly:
 *  - State is in memory: it resets on restart and isn't shared between
 *    multiple server instances. Fine for one instance; with more we would
 *    move it to PostgreSQL (or Redis).
 *  - Someone who knows your email can lock you out for `windowMs` by typing
 *    wrong passwords. A short window keeps that nuisance small.
 */
export interface LoginThrottleOptions {
  maxFailures: number;
  windowMs: number;
  now?: () => number;
  /** Upper bound on tracked emails, so an attacker can't exhaust memory. */
  maxEntries?: number;
}

interface Entry {
  failures: number;
  windowEndsAt: number;
}

export function createLoginThrottle({
  maxFailures,
  windowMs,
  now = Date.now,
  maxEntries = 10_000,
}: LoginThrottleOptions) {
  const entries = new Map<string, Entry>();

  function current(key: string): Entry | undefined {
    const entry = entries.get(key);
    if (entry && entry.windowEndsAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function prune() {
    const t = now();
    for (const [key, entry] of entries) if (entry.windowEndsAt <= t) entries.delete(key);
    // Still too many (a flood of distinct emails): drop the oldest.
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    /** Seconds until the account may try again, or 0 if not blocked. */
    retryAfterSeconds(key: string): number {
      const entry = current(key);
      if (!entry || entry.failures < maxFailures) return 0;
      return Math.ceil((entry.windowEndsAt - now()) / 1000);
    },

    recordFailure(key: string) {
      const entry = current(key);
      if (entry) {
        entry.failures += 1;
        return;
      }
      if (entries.size >= maxEntries) prune();
      entries.set(key, { failures: 1, windowEndsAt: now() + windowMs });
    },

    reset(key: string) {
      entries.delete(key);
    },

    get size() {
      return entries.size;
    },
  };
}

export type LoginThrottle = ReturnType<typeof createLoginThrottle>;
