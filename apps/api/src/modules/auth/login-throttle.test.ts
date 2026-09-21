import { describe, expect, it } from 'vitest';
import { createLoginThrottle } from './login-throttle.js';

const MIN = 60_000;

function setup(maxEntries?: number) {
  let t = 0;
  const throttle = createLoginThrottle({
    maxFailures: 3,
    windowMs: 15 * MIN,
    now: () => t,
    maxEntries,
  });
  return { throttle, advance: (ms: number) => (t += ms) };
}

describe('login throttle', () => {
  it('blocks an account after the maximum number of failures', () => {
    const { throttle } = setup();
    throttle.recordFailure('a@x.io');
    throttle.recordFailure('a@x.io');
    expect(throttle.retryAfterSeconds('a@x.io')).toBe(0);
    throttle.recordFailure('a@x.io');
    expect(throttle.retryAfterSeconds('a@x.io')).toBe(15 * 60);
  });

  it('only blocks the account that failed', () => {
    const { throttle } = setup();
    for (let i = 0; i < 3; i++) throttle.recordFailure('a@x.io');
    expect(throttle.retryAfterSeconds('b@x.io')).toBe(0);
  });

  it('unblocks when the window ends (fixed window from the first failure)', () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 3; i++) throttle.recordFailure('a@x.io');
    advance(10 * MIN);
    expect(throttle.retryAfterSeconds('a@x.io')).toBe(5 * 60);
    advance(5 * MIN);
    expect(throttle.retryAfterSeconds('a@x.io')).toBe(0);
  });

  it('forgets failures after a successful login', () => {
    const { throttle } = setup();
    throttle.recordFailure('a@x.io');
    throttle.recordFailure('a@x.io');
    throttle.reset('a@x.io');
    throttle.recordFailure('a@x.io');
    expect(throttle.retryAfterSeconds('a@x.io')).toBe(0);
  });

  it('never tracks more than maxEntries emails', () => {
    const { throttle } = setup(100);
    for (let i = 0; i < 1000; i++) throttle.recordFailure(`user${i}@x.io`);
    expect(throttle.size).toBeLessThanOrEqual(100);
  });
});
