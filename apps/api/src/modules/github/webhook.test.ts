import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decide, toPullRequestRow, verifySignature, type PullRequestEvent } from './webhook.js';

/** decide() returns a union; these tests only ever pass it real events. */
function eventOf(body: unknown): PullRequestEvent {
  const d = decide('pull_request', body);
  if (d.kind !== 'pull_request') throw new Error(`expected an event, got ${d.reason}`);
  return d.event;
}

const SECRET = 'a-webhook-secret';
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;

describe('verifySignature', () => {
  const body = '{"action":"opened"}';

  it('accepts a signature made with the same secret over the same bytes', () => {
    expect(verifySignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('rejects another secret, altered bytes, a missing or a malformed header', () => {
    expect(verifySignature(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false);
    expect(verifySignature(Buffer.from(body + ' '), sign(body), SECRET)).toBe(false);
    expect(verifySignature(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifySignature(Buffer.from(body), 'sha256=short', SECRET)).toBe(false);
    // A re-serialised body has the same meaning and a different signature,
    // which is why the raw bytes are what gets verified.
    expect(verifySignature(Buffer.from(JSON.stringify(JSON.parse(body))), sign(body), SECRET)).toBe(
      true,
    );
    expect(verifySignature(Buffer.from('{ "action": "opened" }'), sign(body), SECRET)).toBe(false);
  });
});

const event = (over: Record<string, unknown> = {}) => ({
  action: 'opened',
  repository: { id: 42, full_name: 'o/r' },
  pull_request: {
    id: 7,
    number: 3,
    title: 'Rename the field',
    body: null,
    state: 'open',
    draft: false,
    user: { login: 'prem' },
    head: { sha: 'abc123', ref: 'feature' },
    base: { ref: 'main' },
    additions: 4,
    deletions: 2,
    changed_files: 1,
    html_url: 'https://github.com/o/r/pull/3',
    created_at: '2026-09-26T10:00:00Z',
    updated_at: '2026-09-26T10:05:00Z',
    merged_at: null,
    ...over,
  },
});

describe('decide', () => {
  it('handles the pull request actions that change what we cache', () => {
    for (const action of ['opened', 'reopened', 'synchronize', 'edited', 'closed']) {
      expect(decide('pull_request', { ...event(), action }).kind).toBe('pull_request');
    }
  });

  it('records the reason for everything else instead of doing work', () => {
    expect(decide('ping', {})).toEqual({ kind: 'ignored', reason: 'ping' });
    expect(decide('push', {})).toMatchObject({ kind: 'ignored', reason: 'event push' });
    expect(decide(undefined, {})).toMatchObject({ kind: 'ignored', reason: 'event missing' });
    expect(decide('pull_request', { ...event(), action: 'labeled' })).toMatchObject({
      kind: 'ignored',
      reason: 'action labeled',
    });
    // An unreadable payload is not worth a retry: GitHub would resend it as-is.
    expect(decide('pull_request', { action: 'opened' })).toMatchObject({
      kind: 'ignored',
      reason: 'payload did not match the schema',
    });
  });
});

describe('toPullRequestRow', () => {
  it('maps the event onto our columns', () => {
    const row = toPullRequestRow(eventOf(event()));
    expect(row).toMatchObject({
      githubPrId: 7n,
      number: 3,
      state: 'OPEN',
      authorLogin: 'prem',
      headSha: 'abc123',
      baseRef: 'main',
    });
    expect(row.githubUpdatedAt.toISOString()).toBe('2026-09-26T10:05:00.000Z');
  });

  it('tells a merged pull request from a closed one, and survives a deleted author', () => {
    const merged = event({ state: 'closed', merged_at: '2026-09-26T11:00:00Z', user: null });
    const row = toPullRequestRow(eventOf(merged));
    expect(row).toMatchObject({ state: 'MERGED', authorLogin: 'unknown' });
    const closed = event({ state: 'closed' });
    expect(toPullRequestRow(eventOf(event({ state: 'closed' }))).state).toBe('CLOSED');
  });
});
