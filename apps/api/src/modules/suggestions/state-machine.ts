/**
 * The review workflow as a pure function: given a status and an action, what
 * is the next status? The API never trusts a status sent by the client — it
 * sends an *action*, and this table decides whether it's allowed.
 *
 *   PENDING ──start──► IN_REVIEW ──edit──► EDITED
 *      │  └─────edit─────────────────────────┘ │
 *      │        request changes (stays/returns to IN_REVIEW)
 *      └──── approve / reject (from PENDING, IN_REVIEW or EDITED)
 *   APPROVED / REJECTED ──reopen──► IN_REVIEW
 *   APPLIED / FAILED: set only by creating the docs PR (Phase 3), never by a reviewer.
 */
export type SuggestionStatus =
  'PENDING' | 'IN_REVIEW' | 'EDITED' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'FAILED';
export type ReviewAction =
  'START_REVIEW' | 'EDIT' | 'REQUEST_CHANGES' | 'APPROVE' | 'REJECT' | 'REOPEN';

const OPEN: SuggestionStatus[] = ['PENDING', 'IN_REVIEW', 'EDITED'];

const RULES: Record<
  ReviewAction,
  { from: SuggestionStatus[]; to: (from: SuggestionStatus) => SuggestionStatus }
> = {
  START_REVIEW: { from: ['PENDING'], to: () => 'IN_REVIEW' },
  EDIT: { from: OPEN, to: () => 'EDITED' },
  // Asking for changes keeps an edited suggestion "edited"; otherwise it's under review.
  REQUEST_CHANGES: { from: OPEN, to: (from) => (from === 'EDITED' ? 'EDITED' : 'IN_REVIEW') },
  APPROVE: { from: OPEN, to: () => 'APPROVED' },
  REJECT: { from: OPEN, to: () => 'REJECTED' },
  REOPEN: { from: ['APPROVED', 'REJECTED'], to: () => 'IN_REVIEW' },
};

export function nextStatus(from: SuggestionStatus, action: ReviewAction): SuggestionStatus | null {
  const rule = RULES[action];
  return rule.from.includes(from) ? rule.to(from) : null;
}

/** Actions a reviewer may take right now — the UI shows only these buttons. */
export function allowedActions(from: SuggestionStatus): ReviewAction[] {
  return (Object.keys(RULES) as ReviewAction[]).filter((a) => RULES[a].from.includes(from));
}
