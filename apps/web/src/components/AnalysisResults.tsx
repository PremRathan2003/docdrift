import type { AnalysisRunDto, SuggestionDto } from '@docdrift/shared';
import { Link } from 'react-router';
import { SuggestionStatusBadge } from './SuggestionStatusBadge';
import { buttonClass } from './ui/Button';
import { AnalysisBadge, FileKindBadge } from './Badges';
import { Alert } from './ui/Alert';
import { DocsPullRequestPanel } from './DocsPullRequestPanel';

const card = 'rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900';

const errorHelp: Record<string, string> = {
  AI_AUTH: 'Check AI_API_KEY and AI_MODEL in apps/api/.env, then run npm run ai:check.',
  AI_BAD_REQUEST:
    'Check that AI_MODEL is a current model id; npm run ai:check shows the provider’s message.',
  AI_RATE_LIMITED:
    'The provider’s rate limit or free quota was reached. Wait a minute and run again.',
  AI_INVALID_OUTPUT:
    'The model kept returning output that failed validation. Running again usually works.',
  AI_TIMEOUT: 'The model took too long. Try again, or raise AI_TIMEOUT_MS.',
  GITHUB_ERROR:
    'DocDrift could not read the pull request from GitHub. Check the installation still has access.',
  INTERRUPTED: 'The server restarted during the analysis. Run it again.',
};

export function AnalysisResults({
  run,
  currentHeadSha,
}: {
  run: AnalysisRunDto;
  currentHeadSha: string;
}) {
  const stale = run.headSha !== currentHeadSha;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <AnalysisBadge status={run.status} />
        <span>
          {run.provider} · {run.model} · prompt {run.promptVersion} · commit{' '}
          <code>{run.headSha.slice(0, 7)}</code>
        </span>
      </div>

      {stale && (
        <Alert tone="info">
          These results are for an older commit (<code>{run.headSha.slice(0, 7)}</code>). The pull
          request has changed since; run the analysis again for current results.
        </Alert>
      )}

      {run.status === 'FAILED' && (
        <Alert>
          <strong>Analysis failed ({run.errorCode}).</strong> {run.errorMessage}
          {run.errorCode && errorHelp[run.errorCode] && (
            <span className="mt-1 block">{errorHelp[run.errorCode]}</span>
          )}
        </Alert>
      )}

      {run.summary && (
        <section className={card}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            AI-generated summary
          </h3>
          <p className="mt-2 text-sm">{run.summary}</p>
        </section>
      )}

      {run.warnings.length > 0 && (
        <Alert tone="info">
          <strong>Validation removed parts of the model’s answer:</strong>
          <ul className="mt-1 list-inside list-disc">
            {run.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {run.status === 'SUCCEEDED' && run.suggestions.length === 0 && (
        <p className={`${card} text-sm`}>
          No documentation appears to need updating for this pull request.
        </p>
      )}

      {run.suggestions.map((s) => (
        <SuggestionCard key={s.id} suggestion={s} />
      ))}

      <DocsPullRequestPanel run={run} />

      {(run.status === 'SUCCEEDED' || run.status === 'FAILED') && <RunDetails run={run} />}
    </div>
  );
}

function SuggestionCard({ suggestion: s }: { suggestion: SuggestionDto }) {
  const pct = Math.round(s.modelConfidence * 100);
  return (
    <article className={card} aria-labelledby={`sug-${s.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`sug-${s.id}`} className="font-mono text-sm font-semibold">
          {s.documentationPath}
        </h3>
        <SuggestionStatusBadge status={s.status} />
      </div>
      <p className="mt-2 text-sm">{s.reason}</p>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Evidence in this PR
      </h4>
      <ul className="mt-1 space-y-1 text-sm">
        {s.evidence.map((e) => (
          <li key={e.filePath + e.detail}>
            <code className="text-xs">{e.filePath}</code> — {e.detail}
          </li>
        ))}
      </ul>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Suggested update (preview — open the review to see the exact changes)
      </h4>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-950">
        {s.currentContent}
      </pre>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span title="The model's own estimate. It is not a measured accuracy or a probability.">
          Model’s self-reported confidence: <strong>{pct}%</strong> (not a measured accuracy)
        </span>
        {s.uncertainty && <span>Uncertainty: {s.uncertainty}</span>}
      </div>
      <Link to={`/suggestions/${s.id}`} className={buttonClass('primary', 'mt-4')}>
        {s.status === 'PENDING' || s.status === 'IN_REVIEW' || s.status === 'EDITED'
          ? 'Review changes'
          : 'View review'}
      </Link>
    </article>
  );
}

function RunDetails({ run }: { run: AnalysisRunDto }) {
  const m = run.inputManifest;
  const rows: [string, string][] = [
    ['Attempts', String(run.attemptCount)],
    ['Duration', run.latencyMs !== null ? `${(run.latencyMs / 1000).toFixed(1)} s` : '—'],
    ['Tokens (in / out)', `${run.inputTokens ?? '—'} / ${run.outputTokens ?? '—'}`],
    [
      'Cost',
      run.costUsd !== null ? `$${run.costUsd.toFixed(6)}` : 'not tracked (no prices configured)',
    ],
  ];
  return (
    <details className={`${card} text-sm`}>
      <summary className="cursor-pointer font-medium">
        What was sent to the model, and run details
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-zinc-500">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {m && (
        <div className="mt-4 space-y-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Changed files sent ({m.filesSent.length})
            </h4>
            <ul className="mt-1 space-y-0.5">
              {m.filesSent.map((f) => (
                <li key={f.filename} className="flex items-center gap-2">
                  <code className="text-xs">{f.filename}</code>
                  <FileKindBadge kind={f.kind as never} />
                  {f.truncated && <span className="text-xs text-amber-700">truncated</span>}
                </li>
              ))}
            </ul>
          </div>
          {m.filesSkipped.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Not sent ({m.filesSkipped.length})
              </h4>
              <ul className="mt-1 space-y-0.5">
                {m.filesSkipped.map((f) => (
                  <li key={f.filename}>
                    <code className="text-xs">{f.filename}</code>{' '}
                    <span className="text-xs text-zinc-500">— {f.reason.replace('_', ' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Documentation sent ({m.docsSent.length} of {m.docsConsidered} considered)
            </h4>
            <ul className="mt-1 space-y-0.5">
              {m.docsSent.map((d) => (
                <li key={d.path}>
                  <code className="text-xs">{d.path}</code>{' '}
                  <span className="text-xs text-zinc-500">
                    {d.matchedKeywords.length
                      ? `matched: ${d.matchedKeywords.slice(0, 8).join(', ')}`
                      : 'no keyword matches'}
                    {d.truncated ? ' · truncated' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-zinc-500">
            Secrets redacted: {m.secretsRedacted} · Prompt size:{' '}
            {m.promptChars.toLocaleString('en-IE')} characters
          </p>
        </div>
      )}
    </details>
  );
}
