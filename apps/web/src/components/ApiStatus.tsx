import { useQuery } from '@tanstack/react-query';
import { healthResponseSchema } from '@docdrift/shared';
import { apiFetch } from '../lib/api';

/** Real, live status from GET /api/health — useful while developing locally. */
export function ApiStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health', healthResponseSchema),
    refetchInterval: 30_000,
    retry: false,
  });

  let label = 'Checking API…';
  let dot = 'bg-zinc-400';
  if (isError) {
    label = 'API unreachable';
    dot = 'bg-red-500';
  } else if (data) {
    label =
      data.status === 'ok' ? `API ok · v${data.version}` : 'API degraded (database unreachable)';
    dot = data.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500';
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${isPending ? 'animate-pulse' : ''} ${dot}`}
      />
      {label}
    </p>
  );
}
