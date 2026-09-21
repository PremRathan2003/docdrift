import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AnalysisBadge, LineStats, PrStateBadge } from '../components/Badges';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { ApiError } from '../lib/api';
import { formErrorMessage } from '../lib/form-errors';
import {
  formatDate,
  formatDateTime,
  usePullRequests,
  useRefreshPullRequests,
  type PrStateFilter,
} from '../lib/pull-requests';

const STATES: { value: PrStateFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export function RepositoryPage() {
  const { id = '' } = useParams();
  // Filters live in the URL, so a filtered view can be bookmarked or shared.
  const [params, setParams] = useSearchParams();
  const state = (STATES.find((s) => s.value === params.get('state'))?.value ??
    'open') as PrStateFilter;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const query = usePullRequests(id, state, params.get('q') ?? '');
  const refresh = useRefreshPullRequests(id);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>(null);

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    return <Alert>Repository not found. It may have been disconnected.</Alert>;
  }

  const data = query.data;
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <Link to="/repositories" className="hover:underline">
          Repositories
        </Link>{' '}
        /{' '}
        <span className="text-zinc-700 dark:text-zinc-300">{data?.repository.fullName ?? '…'}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {data?.repository.fullName ?? 'Repository'}
          </h1>
          {data && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Default branch <code>{data.repository.defaultBranch}</code> ·{' '}
              <a
                href={data.repository.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                View on GitHub
              </a>
              {data.syncedAt && <> · Updated from GitHub {formatDateTime(data.syncedAt)}</>}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          loading={refreshing}
          onClick={async () => {
            setRefreshing(true);
            setRefreshError(null);
            try {
              await refresh();
            } catch (err) {
              setRefreshError(err);
            } finally {
              setRefreshing(false);
            }
          }}
        >
          Refresh from GitHub
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        {data?.syncWarning && <Alert>{data.syncWarning}</Alert>}
        {refreshError !== null && <Alert>{formErrorMessage(refreshError)}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Pull request state"
            className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
          >
            {STATES.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={state === s.value}
                onClick={() => update({ state: s.value === 'open' ? '' : s.value })}
                className={`rounded px-3 py-1 text-sm ${
                  state === s.value
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <form
            role="search"
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: search });
            }}
          >
            <label>
              <span className="sr-only">Search pull requests</span>
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (!e.target.value) update({ q: '' });
                }}
                placeholder="Search title, author or #number, then press Enter"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </form>
        </div>

        {query.isPending && <p className="text-sm text-zinc-500">Loading pull requests…</p>}
        {query.isError && <Alert>{formErrorMessage(query.error)}</Alert>}
        {data && data.pullRequests.length === 0 && (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {params.get('q')
              ? 'No pull requests match your search.'
              : `No ${state === 'all' ? '' : `${state} `}pull requests.`}
          </p>
        )}
        {data && data.pullRequests.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Pull requests</caption>
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Pull request
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Files
                  </th>
                  <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">
                    Created
                  </th>
                  <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">
                    Updated
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Analysis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.pullRequests.map((pr) => (
                  <tr key={pr.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-3">
                      <Link to={`/pull-requests/${pr.id}`} className="font-medium hover:underline">
                        {pr.title}
                      </Link>
                      <div className="text-xs text-zinc-500">
                        #{pr.number} by {pr.authorLogin}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PrStateBadge state={pr.state} isDraft={pr.isDraft} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="tabular-nums">{pr.changedFiles}</span>{' '}
                      <LineStats additions={pr.additions} deletions={pr.deletions} />
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-600 md:table-cell dark:text-zinc-400">
                      {formatDate(pr.githubCreatedAt)}
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-600 md:table-cell dark:text-zinc-400">
                      {formatDate(pr.githubUpdatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <AnalysisBadge status={pr.latestAnalysisStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
