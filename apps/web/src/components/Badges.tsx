import type { FileKind, PullRequestDto } from '@docdrift/shared';

const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

const stateStyles: Record<PullRequestDto['state'], string> = {
  OPEN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  MERGED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  CLOSED: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

export function PrStateBadge({
  state,
  isDraft,
}: {
  state: PullRequestDto['state'];
  isDraft?: boolean;
}) {
  const label =
    isDraft && state === 'OPEN' ? 'Draft' : state.charAt(0) + state.slice(1).toLowerCase();
  return <span className={`${base} ${stateStyles[state]}`}>{label}</span>;
}

export function AnalysisBadge({ status }: { status: PullRequestDto['latestAnalysisStatus'] }) {
  if (!status)
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">Not analysed</span>;
  const styles = {
    QUEUED: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    RUNNING: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    SUCCEEDED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    FAILED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  }[status];
  return (
    <span className={`${base} ${styles}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>
  );
}

const kindStyles: Record<FileKind, string> = {
  documentation: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  source: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  test: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  config: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  generated: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500',
  binary: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500',
  other: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400',
};

export function FileKindBadge({ kind }: { kind: FileKind }) {
  return (
    <span className={`${base} ${kindStyles[kind]}`}>
      {kind === 'documentation' ? 'docs' : kind}
    </span>
  );
}

export function LineStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="font-mono text-xs tabular-nums">
      <span className="text-emerald-700 dark:text-emerald-400">+{additions}</span>{' '}
      <span className="text-red-700 dark:text-red-400">−{deletions}</span>
    </span>
  );
}
