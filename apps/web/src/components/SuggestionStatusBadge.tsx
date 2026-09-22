import type { SuggestionDto } from '@docdrift/shared';

const styles: Record<SuggestionDto['status'], string> = {
  PENDING: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  IN_REVIEW: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  EDITED: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  APPLIED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export const statusLabel = (s: SuggestionDto['status']) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ');

export function SuggestionStatusBadge({ status }: { status: SuggestionDto['status'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}
