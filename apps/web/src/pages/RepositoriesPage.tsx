import type { AvailableRepository } from '@docdrift/shared';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button, buttonClass } from '../components/ui/Button';
import { formErrorMessage } from '../lib/form-errors';
import {
  connectOutcomes,
  useAvailableRepositories,
  useConnectRepository,
  useDisconnectRepository,
  useGitHubStatus,
} from '../lib/github';

// These are plain links, not fetch calls: the browser must *navigate* to
// GitHub and back so GitHub can show its own pages and set up the redirect.
const INSTALL_URL = '/api/github/install';
const AUTHORIZE_URL = '/api/github/authorize';

export function RepositoriesPage() {
  const [params, setParams] = useSearchParams();
  const outcome = connectOutcomes[params.get('github') ?? ''];
  const status = useGitHubStatus();
  const hasInstallations = (status.data?.installations.length ?? 0) > 0;
  const available = useAvailableRepositories(hasInstallations);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Choose the GitHub repositories DocDrift should analyse. Access is read-only.
          </p>
        </div>
        {hasInstallations && (
          <a href={INSTALL_URL} className={buttonClass('secondary')}>
            Manage access on GitHub
          </a>
        )}
      </div>

      {outcome && (
        <div className="mt-6 flex items-start justify-between gap-3">
          <div className="flex-1">
            <Alert tone={outcome.tone}>{outcome.text}</Alert>
          </div>
          <Button
            variant="ghost"
            onClick={() => setParams({}, { replace: true })}
            aria-label="Dismiss message"
          >
            ✕
          </Button>
        </div>
      )}

      <div className="mt-6">
        {status.isPending && <p className="text-sm text-zinc-500">Loading…</p>}
        {status.isError && <Alert>{formErrorMessage(status.error)}</Alert>}
        {status.data && !status.data.configured && (
          <Alert>
            GitHub integration isn’t configured on this server yet. See{' '}
            <code>docs/GITHUB_APP_SETUP.md</code>.
          </Alert>
        )}
        {status.data?.configured && !hasInstallations && <ConnectGitHub />}
        {hasInstallations && <AvailableList query={available} />}
      </div>
    </>
  );
}

function ConnectGitHub() {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Connect GitHub</h2>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        Install the DocDrift GitHub App on the repositories you choose. It can <strong>read</strong>{' '}
        code, pull requests and metadata — it cannot push, comment or change settings. You can
        remove it at any time from GitHub.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a href={INSTALL_URL} className={buttonClass('primary')}>
          Install the GitHub App
        </a>
        <a
          href={AUTHORIZE_URL}
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Already installed it? Link your GitHub account
        </a>
      </div>
    </section>
  );
}

function AvailableList({ query }: { query: ReturnType<typeof useAvailableRepositories> }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'connected' | 'not_connected'>('all');
  const repos = query.data?.repositories;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (repos ?? []).filter(
      (r) =>
        r.fullName.toLowerCase().includes(term) &&
        (filter === 'all' || (filter === 'connected') === (r.connectedRepositoryId !== null)),
    );
  }, [repos, search, filter]);

  if (query.isPending)
    return <p className="text-sm text-zinc-500">Loading repositories from GitHub…</p>;
  if (query.isError) {
    return (
      <div className="space-y-3">
        <Alert>{formErrorMessage(query.error)}</Alert>
        <Button variant="secondary" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {query.data.unavailableInstallations.map((u) => (
        <Alert key={u.accountLogin}>
          <strong>{u.accountLogin}:</strong> {u.reason}{' '}
          <a href={INSTALL_URL} className="underline">
            Reinstall
          </a>
        </Alert>
      ))}

      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="sr-only">Search repositories</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label>
          <span className="sr-only">Filter</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">All</option>
            <option value="connected">Connected</option>
            <option value="not_connected">Not connected</option>
          </select>
        </label>
      </div>

      {repos && repos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          The app can’t see any repositories yet.{' '}
          <a href={INSTALL_URL} className="text-indigo-600 underline dark:text-indigo-400">
            Choose repositories on GitHub
          </a>
          .
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-zinc-500">No repositories match.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {visible.map((repo) => (
            <RepositoryRow key={repo.githubRepoId} repo={repo} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RepositoryRow({ repo }: { repo: AvailableRepository }) {
  const connect = useConnectRepository();
  const disconnect = useDisconnectRepository();
  const error = connect.error ?? disconnect.error;
  const connected = repo.connectedRepositoryId !== null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <a
          href={repo.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium hover:underline"
        >
          {repo.fullName}
        </a>
        <div className="mt-1 flex gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{repo.isPrivate ? 'Private' : 'Public'}</span>
          <span aria-hidden>·</span>
          <span>default branch: {repo.defaultBranch}</span>
          {connected && (
            <span className="rounded bg-emerald-100 px-1.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Connected
            </span>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrorMessage(error)}</p>
        )}
      </div>
      {connected ? (
        <div className="flex gap-2">
          <Link
            to={`/repositories/${repo.connectedRepositoryId}`}
            className={buttonClass('primary')}
          >
            Pull requests
          </Link>
          <Button
            variant="secondary"
            loading={disconnect.isPending}
            onClick={() => disconnect.mutate(repo.connectedRepositoryId!)}
            aria-label={`Disconnect ${repo.fullName}`}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <Button
          loading={connect.isPending}
          onClick={() => connect.mutate(repo.githubRepoId)}
          aria-label={`Connect ${repo.fullName}`}
        >
          Connect
        </Button>
      )}
    </li>
  );
}
