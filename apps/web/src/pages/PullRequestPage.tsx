import type { FileKind } from '@docdrift/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { FileKindBadge, LineStats, PrStateBadge } from '../components/Badges';
import { FileDiff } from '../components/DiffViewer';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { ApiError } from '../lib/api';
import { formErrorMessage } from '../lib/form-errors';
import { formatDateTime, usePullRequest, usePullRequestFiles } from '../lib/pull-requests';

const KIND_ORDER: FileKind[] = [
  'documentation',
  'source',
  'test',
  'config',
  'other',
  'generated',
  'binary',
];

export function PullRequestPage() {
  const { id = '' } = useParams();
  const prQuery = usePullRequest(id);
  const filesQuery = usePullRequestFiles(id);
  const [kindFilter, setKindFilter] = useState<FileKind | 'all'>('all');

  const files = filesQuery.data?.files;
  const counts = useMemo(() => {
    const c = new Map<FileKind, number>();
    for (const f of files ?? []) c.set(f.kind, (c.get(f.kind) ?? 0) + 1);
    return c;
  }, [files]);
  const docFiles = (files ?? []).filter((f) => f.kind === 'documentation');
  const visible = (files ?? []).filter((f) => kindFilter === 'all' || f.kind === kindFilter);

  if (prQuery.isPending) return <p className="text-sm text-zinc-500">Loading pull request…</p>;
  if (prQuery.isError) {
    return (
      <Alert>
        {prQuery.error instanceof ApiError && prQuery.error.status === 404
          ? 'Pull request not found.'
          : formErrorMessage(prQuery.error)}
      </Alert>
    );
  }
  const { pullRequest: pr, repository } = prQuery.data;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <Link to="/repositories" className="hover:underline">
          Repositories
        </Link>{' '}
        /{' '}
        <Link to={`/repositories/${repository.id}`} className="hover:underline">
          {repository.fullName}
        </Link>{' '}
        / <span className="text-zinc-700 dark:text-zinc-300">#{pr.number}</span>
      </nav>

      <header className="mt-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {pr.title} <span className="font-normal text-zinc-400">#{pr.number}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <PrStateBadge state={pr.state} isDraft={pr.isDraft} />
          <span>
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">
              {pr.authorLogin}
            </strong>{' '}
            wants to merge <code>{pr.headRef}</code> into <code>{pr.baseRef}</code>
          </span>
          <span>Opened {formatDateTime(pr.githubCreatedAt)}</span>
          <span>Updated {formatDateTime(pr.githubUpdatedAt)}</span>
          <a
            href={pr.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View on GitHub
          </a>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section
          aria-labelledby="desc"
          className="rounded-lg border border-zinc-200 bg-white p-5 lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 id="desc" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Description
          </h2>
          {/* Shown as plain text on purpose: rendering untrusted Markdown as HTML needs sanitising first. */}
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {pr.body ?? <span className="text-zinc-500">No description.</span>}
          </p>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Changes</h2>
            <p className="mt-2 text-sm">
              <span className="tabular-nums">{pr.changedFiles}</span> files ·{' '}
              <LineStats additions={pr.additions} deletions={pr.deletions} />
            </p>
            <p className="mt-1 font-mono text-xs text-zinc-500">head {pr.headSha.slice(0, 7)}</p>
          </section>
          <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              AI analysis
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Documentation analysis arrives in milestone 1.5.
            </p>
            <Button className="mt-3 w-full" disabled>
              Run analysis
            </Button>
          </section>
        </aside>
      </div>

      <section aria-labelledby="docs-changed" className="mt-6">
        <h2 id="docs-changed" className="text-lg font-semibold">
          Documentation-related changes
        </h2>
        {filesQuery.isPending && <p className="mt-2 text-sm text-zinc-500">Loading…</p>}
        {files && docFiles.length === 0 && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This pull request changes <strong>no documentation files</strong>. If it changes
            behaviour, the docs may now be out of date — that’s what the analysis will check.
          </p>
        )}
        {docFiles.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-sm">
            {docFiles.map((f) => (
              <li key={f.filename} className="font-mono">
                {f.filename}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="files" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="files" className="text-lg font-semibold">
            Changed files{' '}
            {files && <span className="font-normal text-zinc-500">({files.length})</span>}
          </h2>
          {files && files.length > 0 && (
            <label className="text-sm">
              <span className="mr-2 text-zinc-600 dark:text-zinc-400">Show</span>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as FileKind | 'all')}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="all">All files</option>
                {KIND_ORDER.filter((k) => counts.has(k)).map((k) => (
                  <option key={k} value={k}>
                    {k} ({counts.get(k)})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {filesQuery.isError && (
          <div className="mt-3">
            <Alert>{formErrorMessage(filesQuery.error)}</Alert>
          </div>
        )}
        {filesQuery.data?.incomplete && (
          <div className="mt-3">
            <Alert tone="info">
              This pull request is very large; only the first files are shown.
            </Alert>
          </div>
        )}
        {files && (
          <div className="mt-3 flex flex-wrap gap-2" aria-hidden>
            {KIND_ORDER.filter((k) => counts.has(k)).map((k) => (
              <span key={k} className="flex items-center gap-1 text-xs text-zinc-500">
                <FileKindBadge kind={k} /> {counts.get(k)}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 space-y-3">
          {visible.map((f) => (
            <FileDiff key={f.filename} file={f} />
          ))}
        </div>
      </section>
    </>
  );
}
