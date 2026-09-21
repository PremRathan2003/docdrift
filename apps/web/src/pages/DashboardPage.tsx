import { Link } from 'react-router';
import { useCurrentUser } from '../lib/auth';
import { useConnectedRepositories } from '../lib/github';

/**
 * Deliberately honest: no fake charts or numbers. Each card becomes real
 * as its milestone lands (analyses in 1.5, reviews in 1.6).
 */
const upcoming = [
  {
    title: 'Recent analyses',
    body: 'Pull request analyses and their results will appear here.',
    milestone: '1.5',
  },
  {
    title: 'Pending reviews',
    body: 'Documentation suggestions waiting for your decision.',
    milestone: '1.6',
  },
];

const cardClass = 'rounded-lg border bg-white p-5 dark:bg-zinc-900';

export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const repos = useConnectedRepositories();
  const name = user?.displayName ?? user?.email;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome{name ? `, ${name}` : ''}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {repos.data?.length
          ? 'Your connected repositories are ready for pull request analysis.'
          : 'Connect a repository to start analysing pull requests.'}
      </p>

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        <li className={`${cardClass} border-zinc-200 dark:border-zinc-800`}>
          <h2 className="font-semibold">Connected repositories</h2>
          {repos.isPending && <p className="mt-2 text-sm text-zinc-500">Loading…</p>}
          {repos.isError && (
            <p className="mt-2 text-sm text-red-600">Couldn’t load repositories.</p>
          )}
          {repos.data && (
            <>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{repos.data.length}</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {repos.data.slice(0, 5).map((r) => (
                  <li key={r.id} className="truncate">
                    <Link to={`/repositories/${r.id}`} className="hover:underline">
                      {r.fullName}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                to="/repositories"
                className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {repos.data.length ? 'Manage repositories' : 'Connect a repository'} →
              </Link>
            </>
          )}
        </li>
        {upcoming.map((card) => (
          <li
            key={card.title}
            className={`${cardClass} border-dashed border-zinc-300 dark:border-zinc-700`}
          >
            <h2 className="font-semibold">{card.title}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{card.body}</p>
            <p className="mt-3 text-xs font-medium text-zinc-500">
              Coming in milestone {card.milestone}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
