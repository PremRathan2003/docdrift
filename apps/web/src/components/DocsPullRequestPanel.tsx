import type { AnalysisRunDto } from '@docdrift/shared';
import { useCreateDocsPullRequest } from '../lib/analysis';
import { ApiError } from '../lib/api';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';

const card = 'rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900';

/** What each refusal means, in terms of what to do about it. */
const refusals: Record<string, string> = {
  STALE_ANALYSIS:
    'Run the analysis again on the current commit: these suggestions were written for code that has since changed.',
  CONFLICTING_SUGGESTIONS:
    'Reject one of the two approved suggestions for that document — each contains a complete file, so only one can be applied.',
  NOTHING_APPROVED: 'Approve at least one suggestion first.',
  GITHUB_WRITE_FORBIDDEN:
    'In the GitHub App’s settings, set “Contents” and “Pull requests” to read and write, then accept the updated permissions on the installation page.',
};

/**
 * The one place in the app that offers to change someone's repository.
 *
 * It says exactly what will happen before it happens — which documents, which
 * branch, where the pull request will point — because "open a pull request on
 * my repo" is not a button anyone should press blind.
 */
export function DocsPullRequestPanel({ run }: { run: AnalysisRunDto }) {
  const approved = run.suggestions.filter((s) => s.status === 'APPROVED');
  const applied = run.suggestions.filter((s) => s.status === 'APPLIED');
  const create = useCreateDocsPullRequest(run.id);

  if (run.status !== 'SUCCEEDED') return null;
  // Nothing approved and nothing opened yet: the review isn't finished.
  if (!run.docsPullRequest && approved.length === 0) return null;

  const existing = run.docsPullRequest;
  const error = create.error instanceof ApiError ? create.error : null;

  return (
    <section className={card} aria-labelledby="docs-pr">
      <h3 id="docs-pr" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Documentation pull request
      </h3>

      {existing ? (
        <div className="mt-2 space-y-2 text-sm">
          <p>
            <a
              href={existing.htmlUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-indigo-600 underline dark:text-indigo-400"
            >
              #{existing.number}
            </a>{' '}
            is open — {existing.documents.length} document
            {existing.documents.length === 1 ? '' : 's'} on{' '}
            <code className="text-xs">{existing.branch}</code>, targeting{' '}
            <code className="text-xs">{existing.base}</code>.
          </p>
          <ul className="list-inside list-disc font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {existing.documents.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          {approved.length > 0 && (
            <p className="text-zinc-600 dark:text-zinc-400">
              {approved.length} newly approved change
              {approved.length === 1 ? '' : 's'} not in it yet — updating adds{' '}
              {approved.length === 1 ? 'it' : 'them'} to the same branch.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          <p>
            Opens a pull request on your repository with {approved.length} approved document
            {approved.length === 1 ? '' : 's'}, from a branch of its own, targeting this pull
            request’s branch — so merging it keeps the documentation with the code.
          </p>
          <ul className="list-inside list-disc font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {approved.map((s) => (
              <li key={s.id}>{s.documentationPath}</li>
            ))}
          </ul>
          {/*
            One branch per pull request means a later analysis replaces what an
            earlier one proposed. That is a change to somebody's open pull
            request, so it is said plainly BEFORE the button, not discovered
            afterwards.
          */}
          <p className="text-zinc-600 dark:text-zinc-400">
            There is one documentation branch per pull request. If an earlier analysis already
            opened one, this replaces its contents with the changes approved here.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Alert>
            <strong>{error.message}</strong>
            {refusals[error.code] && <span className="mt-1 block">{refusals[error.code]}</span>}
          </Alert>
        </div>
      )}

      <Button
        className="mt-4"
        variant={existing ? 'secondary' : 'primary'}
        disabled={create.isPending || (approved.length === 0 && !existing)}
        onClick={() => create.mutate()}
      >
        {create.isPending
          ? 'Opening…'
          : existing
            ? 'Update the pull request'
            : `Open a pull request with ${approved.length} document${approved.length === 1 ? '' : 's'}`}
      </Button>

      {applied.length > 0 && !existing && (
        <p className="mt-2 text-xs text-zinc-500">
          {applied.length} suggestion{applied.length === 1 ? ' was' : 's were'} already applied.
        </p>
      )}
    </section>
  );
}
