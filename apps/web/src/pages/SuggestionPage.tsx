import type { ReviewAction } from '@docdrift/shared';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { LineStats } from '../components/Badges';
import { PatchView } from '../components/PatchView';
import { statusLabel, SuggestionStatusBadge } from '../components/SuggestionStatusBadge';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { ApiError } from '../lib/api';
import { fieldErrorsFromApi, formErrorMessage } from '../lib/form-errors';
import { buildPatch, downloadText, patchStats } from '../lib/patch';
import { formatDateTime } from '../lib/pull-requests';
import { useDecision, useEditSuggestion, useSuggestion } from '../lib/suggestions';
import { useIsDark } from '../lib/theme';

const MarkdownEditor = lazy(() => import('../components/MarkdownEditor'));

type Tab = 'changes' | 'edit' | 'ai';
const card = 'rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900';

const ACTION_LABELS: Record<Exclude<ReviewAction, 'EDIT'>, string> = {
  START_REVIEW: 'Start review',
  APPROVE: 'Approve',
  REQUEST_CHANGES: 'Request changes',
  REJECT: 'Reject',
  REOPEN: 'Reopen',
};
const DECISION_TEXT: Record<ReviewAction, string> = {
  START_REVIEW: 'started reviewing',
  EDIT: 'edited the suggestion',
  REQUEST_CHANGES: 'requested changes',
  APPROVE: 'approved',
  REJECT: 'rejected',
  REOPEN: 'reopened',
};

export function SuggestionPage() {
  const { id = '' } = useParams();
  const query = useSuggestion(id);
  const edit = useEditSuggestion(id);
  const decision = useDecision(id);
  const dark = useIsDark();
  const [tab, setTab] = useState<Tab>('changes');
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const data = query.data;
  const s = data?.suggestion;
  // Start the editor from the saved text whenever a new version arrives.
  useEffect(() => setDraft(null), [s?.version]);
  // Bumped to give the (uncontrolled) editor fresh text, e.g. after "Discard".
  const [editorResets, setEditorResets] = useState(0);
  const editorValue = draft ?? s?.currentContent ?? '';

  const patch = useMemo(
    () =>
      data && s
        ? buildPatch(s.documentationPath, data.originalDocument.content, s.currentContent)
        : '',
    [data, s],
  );
  const stats = patchStats(patch);

  if (query.isPending) return <p className="text-sm text-zinc-500">Loading suggestion…</p>;
  if (query.isError || !data || !s) {
    return (
      <Alert>
        {query.error instanceof ApiError && query.error.status === 404
          ? 'Suggestion not found.'
          : formErrorMessage(query.error)}
      </Alert>
    );
  }

  const canEdit = data.allowedActions.includes('EDIT');
  const dirty = draft !== null && draft !== s.currentContent;
  const error = edit.error ?? decision.error;
  const conflict = error instanceof ApiError && error.code === 'VERSION_CONFLICT';
  const noteError = fieldErrorsFromApi(decision.error).note;
  const stale = data.analysis.headSha !== data.pullRequest.headSha;
  const buttons = data.allowedActions.filter(
    (a): a is Exclude<ReviewAction, 'EDIT'> => a !== 'EDIT',
  );

  const act = (action: Exclude<ReviewAction, 'EDIT'>) =>
    decision.mutate(
      { action, version: s.version, note: note || undefined },
      { onSuccess: () => setNote('') },
    );

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <Link to="/repositories" className="hover:underline">
          Repositories
        </Link>{' '}
        /{' '}
        <Link to={`/repositories/${data.repository.id}`} className="hover:underline">
          {data.repository.fullName}
        </Link>{' '}
        /{' '}
        <Link to={`/pull-requests/${data.pullRequest.id}`} className="hover:underline">
          #{data.pullRequest.number}
        </Link>{' '}
        / <span className="text-zinc-700 dark:text-zinc-300">review</span>
      </nav>

      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{s.documentationPath}</h1>
        <SuggestionStatusBadge status={s.status} />
      </header>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Suggested for{' '}
        <Link to={`/pull-requests/${data.pullRequest.id}`} className="underline">
          #{data.pullRequest.number} {data.pullRequest.title}
        </Link>{' '}
        by {data.analysis.model} (prompt {data.analysis.promptVersion}) on{' '}
        {formatDateTime(data.analysis.createdAt)} · model’s self-reported confidence{' '}
        {Math.round(s.modelConfidence * 100)}% (not a measured accuracy)
      </p>

      <div className="mt-4 space-y-3">
        {stale && (
          <Alert tone="info">
            The pull request has new commits since this analysis (
            <code>{data.analysis.headSha.slice(0, 7)}</code> →{' '}
            <code>{data.pullRequest.headSha.slice(0, 7)}</code>). Check the suggestion still fits,
            or run the analysis again.
          </Alert>
        )}
        {data.analysis.promptVersion === 'v1' && (
          <Alert tone="info">
            Made with prompt v1, which could return only a section instead of the whole file. If the
            diff shows unrelated lines removed, edit the suggestion to include the full document.
          </Alert>
        )}
        {data.originalDocument.status === 'missing' && (
          <Alert tone="info">
            This file doesn’t exist on the branch; the suggestion would create it.
          </Alert>
        )}
        {data.originalDocument.status === 'unavailable' && (
          <Alert>
            The current document couldn’t be loaded from GitHub, so no diff can be shown.
          </Alert>
        )}
        {conflict && (
          <Alert>
            Someone changed this suggestion while you were working on it.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                edit.reset();
                decision.reset();
                void query.refetch();
              }}
            >
              Load the latest version
            </button>{' '}
            (your unsaved text stays in the editor until you reload).
          </Alert>
        )}
        {error && !conflict && !noteError && <Alert>{formErrorMessage(error)}</Alert>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className={`${card} p-5`} aria-labelledby="why">
            <h2 id="why" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Why
            </h2>
            <p className="mt-2 text-sm">{s.reason}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {s.evidence.map((e) => (
                <li key={e.filePath + e.detail}>
                  <code className="text-xs">{e.filePath}</code> — {e.detail}
                </li>
              ))}
            </ul>
            {s.uncertainty && (
              <p className="mt-3 text-xs text-zinc-500">
                Model’s stated uncertainty: {s.uncertainty}
              </p>
            )}
          </section>

          <section className={card} aria-label="Suggestion">
            <div
              role="tablist"
              aria-label="View"
              className="flex gap-1 border-b border-zinc-200 px-3 pt-3 dark:border-zinc-800"
            >
              {(
                [
                  [
                    'changes',
                    `Changes${patch ? ` (+${stats.additions} −${stats.deletions})` : ''}`,
                  ],
                  ['edit', canEdit ? 'Edit' : 'Text'],
                  ['ai', 'Original AI suggestion'],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-t-md px-3 py-2 text-sm ${
                    tab === t
                      ? 'border-b-2 border-indigo-600 font-medium'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'changes' && (
              <div role="tabpanel">
                <p className="px-4 pt-3 text-xs text-zinc-500">
                  Current document on the PR branch →{' '}
                  {s.status === 'EDITED' || s.currentContent !== s.originalContent
                    ? 'your edited version'
                    : 'the suggestion'}{' '}
                  · <LineStats additions={stats.additions} deletions={stats.deletions} />
                </p>
                <PatchView patch={patch} label={`Proposed changes to ${s.documentationPath}`} />
              </div>
            )}

            {tab === 'edit' && (
              <div role="tabpanel" className="space-y-3 p-4">
                {canEdit ? (
                  <>
                    <Suspense fallback={<p className="text-sm text-zinc-500">Loading editor…</p>}>
                      <MarkdownEditor
                        key={`${s.version}-${editorResets}`}
                        initialValue={editorValue}
                        onChange={setDraft}
                        dark={dark}
                        label={`Edit ${s.documentationPath}`}
                      />
                    </Suspense>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        disabled={!dirty}
                        loading={edit.isPending}
                        onClick={() =>
                          edit.mutate(
                            { content: editorValue, version: s.version, note: note || undefined },
                            { onSuccess: () => setNote('') },
                          )
                        }
                      >
                        Save changes
                      </Button>
                      {dirty && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setDraft(null);
                            setEditorResets((n) => n + 1);
                          }}
                        >
                          Discard
                        </Button>
                      )}
                      <span className="text-xs text-zinc-500">
                        Saving keeps the AI’s original text; you can compare it any time.
                      </span>
                    </div>
                  </>
                ) : (
                  <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-xs">
                    {s.currentContent}
                  </pre>
                )}
              </div>
            )}

            {tab === 'ai' && (
              <div role="tabpanel" className="p-4">
                <p className="mb-2 text-xs text-zinc-500">
                  Exactly as the model produced it. This never changes.
                </p>
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-xs">
                  {s.originalContent}
                </pre>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className={`${card} p-5`} aria-labelledby="decide">
            <h2 id="decide" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Your review
            </h2>
            {buttons.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                This suggestion is {statusLabel(s.status).toLowerCase()}; no further review actions.
              </p>
            ) : (
              <>
                <label className="mt-3 block text-sm">
                  Note{' '}
                  {buttons.includes('REQUEST_CHANGES') && (
                    <span className="text-zinc-500">(required to request changes)</span>
                  )}
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    aria-invalid={noteError ? true : undefined}
                    aria-describedby={noteError ? 'note-error' : undefined}
                    className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
                {noteError && (
                  <p id="note-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {noteError}
                  </p>
                )}
                {dirty && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    You have unsaved edits — save them before approving.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {buttons.map((a) => (
                    <Button
                      key={a}
                      variant={a === 'APPROVE' ? 'primary' : 'secondary'}
                      disabled={decision.isPending || (a === 'APPROVE' && dirty)}
                      loading={decision.isPending && decision.variables?.action === a}
                      onClick={() => act(a)}
                    >
                      {ACTION_LABELS[a]}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {s.status === 'APPROVED' && data.originalDocument.status !== 'unavailable' && (
              <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() =>
                    downloadText(`${s.documentationPath.replace(/\//g, '_')}.patch`, patch)
                  }
                >
                  Download approved patch
                </Button>
                <p className="mt-2 text-xs text-zinc-500">
                  Apply it on the PR branch with{' '}
                  <code>git apply {s.documentationPath.replace(/\//g, '_')}.patch</code>. Creating a
                  documentation pull request directly from DocDrift comes in Phase 3.
                </p>
              </div>
            )}
          </section>

          <section className={`${card} p-5`} aria-labelledby="history">
            <h2
              id="history"
              className="text-sm font-semibold uppercase tracking-wide text-zinc-500"
            >
              History
            </h2>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="text-zinc-600 dark:text-zinc-400">
                Suggested by {data.analysis.model} · {formatDateTime(data.analysis.createdAt)}
              </li>
              {data.reviews.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">
                    {r.reviewer?.displayName ?? r.reviewer?.email ?? 'Deleted user'}
                  </span>{' '}
                  {DECISION_TEXT[r.decision]} ·{' '}
                  <span className="text-zinc-500">{formatDateTime(r.createdAt)}</span>
                  {r.note && (
                    <p className="mt-0.5 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                      “{r.note}”
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
