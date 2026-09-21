import { useCurrentUser } from '../lib/auth';

/**
 * Deliberately honest: no fake charts or numbers. Each card becomes real
 * as its milestone lands (repositories in 1.3, analyses in 1.5, reviews in 1.6).
 */
const upcoming = [
  {
    title: 'Connected repositories',
    body: 'Connect a GitHub repository through the DocDrift GitHub App.',
    milestone: '1.3',
  },
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

export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const name = user?.displayName ?? user?.email;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome{name ? `, ${name}` : ''}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Your workspace is ready. Connect a repository to start analysing pull requests.
      </p>

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {upcoming.map((card) => (
          <li
            key={card.title}
            className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2 className="font-semibold">{card.title}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{card.body}</p>
            <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-500">
              Coming in milestone {card.milestone}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
