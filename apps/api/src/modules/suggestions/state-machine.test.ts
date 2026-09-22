import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  nextStatus,
  type ReviewAction,
  type SuggestionStatus,
} from './state-machine.js';

describe('suggestion state machine', () => {
  it.each<[SuggestionStatus, ReviewAction, SuggestionStatus | null]>([
    ['PENDING', 'START_REVIEW', 'IN_REVIEW'],
    ['PENDING', 'EDIT', 'EDITED'],
    ['PENDING', 'APPROVE', 'APPROVED'],
    ['IN_REVIEW', 'EDIT', 'EDITED'],
    ['IN_REVIEW', 'REQUEST_CHANGES', 'IN_REVIEW'],
    ['EDITED', 'REQUEST_CHANGES', 'EDITED'],
    ['EDITED', 'EDIT', 'EDITED'],
    ['EDITED', 'REJECT', 'REJECTED'],
    ['APPROVED', 'REOPEN', 'IN_REVIEW'],
    ['REJECTED', 'REOPEN', 'IN_REVIEW'],
    // not allowed
    ['IN_REVIEW', 'START_REVIEW', null],
    ['APPROVED', 'EDIT', null],
    ['APPROVED', 'APPROVE', null],
    ['REJECTED', 'APPROVE', null],
    ['APPLIED', 'REOPEN', null],
    ['APPLIED', 'EDIT', null],
    ['FAILED', 'APPROVE', null],
  ])('%s + %s → %s', (from, action, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });

  it('lists the actions available in each state', () => {
    expect(allowedActions('PENDING')).toEqual([
      'START_REVIEW',
      'EDIT',
      'REQUEST_CHANGES',
      'APPROVE',
      'REJECT',
    ]);
    expect(allowedActions('APPROVED')).toEqual(['REOPEN']);
    expect(allowedActions('APPLIED')).toEqual([]);
  });
});
