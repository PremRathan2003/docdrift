import { Link } from 'react-router';
import { AnalysisBadge } from '../components/Badges';
import { GettingStarted } from '../components/GettingStarted';
import { SuggestionStatusBadge } from '../components/SuggestionStatusBadge';
import { Alert } from '../components/ui/Alert';
import { useCurrentUser } from '../lib/auth';
import { formErrorMessage } from '../lib/form-errors';
import { gettingStartedSteps } from '../lib/getting-started';
import { useGitHubStatus } from '../lib/github';
import { formatDateTime } from '../lib/pull-requests';
import { useDashboard } from '../lib/suggestions';

const card = 'rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900';
const link = 'text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400';

/** Every number here comes from the database; nothing is a placeholder. */
export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data, isPending, isError, error } = useDashboard();
  const github = useGitHubStatus();
  const name = user?.displayName ?? user?.email;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome{name ? `, ${name}` : ''}</h1>
      {isPending && <p className="mt-4 text-sm text-zinc-500">Loading…</p>}
      {isError && (
        <div className="mt-4">
          <Alert>{formErrorMessage(error)}</Alert>
        </div>
      )}
      {data && (
        <>
          {github.data && (
            <GettingStarted
              steps={gettingStartedSteps({
                githubInstallations: github.data.installations.length,
                repositoryCount: data.repositoryCount,
                analysisCount: data.recentAnalyses.length,
                decidedSuggestions: data.suggestionCounts.APPROVED + data.suggestionCounts.REJECTED,
              })}
            />
          )}
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                ['Connected repositories', data.repositoryCount],
                [
                  'Awaiting review',
                  data.suggestionCounts.PENDING +
                    data.suggestionCounts.IN_REVIEW +
                    data.suggestionCounts.EDITED,
                ],
                ['Approved', data.suggestionCounts.APPROVED],
                ['Rejected', data.suggestionCounts.REJECTED],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div key={label} className={card}>
                <dt className="text-xs text-zinc-500">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className={card} aria-labelledby="pending">
              <h2 id="pending" className="font-semibold">
                Pending reviews
              </h2>
              {data.pendingReviews.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Nothing waiting for you.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data.pendingReviews.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <Link
                          to={`/suggestions/${s.id}`}
                          className="font-mono text-sm hover:underline"
                        >
                          {s.documentationPath}
                        </Link>
                        <p className="truncate text-xs text-zinc-500">
                          {s.repositoryFullName} #{s.pullRequest.number} {s.pullRequest.title}
                        </p>
                      </div>
                      <SuggestionStatusBadge status={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={card} aria-labelledby="recent">
              <h2 id="recent" className="font-semibold">
                Recent analyses
              </h2>
              {data.recentAnalyses.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  No analyses yet. Open a pull request and click <strong>Run analysis</strong>.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data.recentAnalyses.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <Link
                          to={`/pull-requests/${a.pullRequest.id}`}
                          className="text-sm hover:underline"
                        >
                          #{a.pullRequest.number} {a.pullRequest.title}
                        </Link>
                        <p className="truncate text-xs text-zinc-500">
                          {a.repositoryFullName} · {formatDateTime(a.createdAt)} ·{' '}
                          {a.suggestionCount} suggestion(s)
                        </p>
                      </div>
                      <AnalysisBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="mt-6">
            <Link to="/repositories" className={link}>
              {data.repositoryCount ? 'Manage repositories →' : 'Connect a repository →'}
            </Link>
          </p>
        </>
      )}
    </>
  );
}
