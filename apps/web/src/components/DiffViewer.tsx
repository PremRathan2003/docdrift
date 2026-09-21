import { parsePatch, type PullRequestFile } from '@docdrift/shared';
import { useMemo, useState } from 'react';
import { FileKindBadge, LineStats } from './Badges';

/** Above this many lines a diff starts collapsed, so big files don't swamp the page. */
const LARGE_DIFF_LINES = 400;

const rowStyles = {
  add: 'bg-emerald-50 dark:bg-emerald-950/40',
  del: 'bg-red-50 dark:bg-red-950/40',
  context: '',
  note: 'text-zinc-500 italic',
};
const markers = { add: '+', del: '−', context: ' ', note: '' };

/**
 * A read-only unified diff. Deliberately a small custom component instead of
 * Monaco: displaying a diff needs no editor, and Monaco adds ~2 MB of
 * JavaScript. Monaco arrives later for *editing* suggestions.
 */
export function FileDiff({ file }: { file: PullRequestFile }) {
  const hunks = useMemo(() => (file.patch ? parsePatch(file.patch) : []), [file.patch]);
  const lineCount = hunks.reduce((n, h) => n + h.lines.length + 1, 0);
  const startOpen =
    file.kind !== 'generated' && file.kind !== 'binary' && lineCount <= LARGE_DIFF_LINES;
  const [open, setOpen] = useState(startOpen);
  const bodyId = `diff-${file.filename.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-left text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          <span aria-hidden className="w-3 text-zinc-500">
            {open ? '▾' : '▸'}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono">
            {file.previousFilename ? `${file.previousFilename} → ` : ''}
            {file.filename}
          </span>
          <FileKindBadge kind={file.kind} />
          <span className="text-xs text-zinc-500">{file.status}</span>
          <LineStats additions={file.additions} deletions={file.deletions} />
        </button>
      </h3>

      {open && (
        <div id={bodyId}>
          {!file.patch ? (
            <p className="px-4 py-3 text-sm text-zinc-500">
              No diff available from GitHub (binary file, or the change is too large to display).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse font-mono text-xs"
                aria-label={`Changes in ${file.filename}`}
              >
                <tbody>
                  {hunks.map((hunk, h) => [
                    <tr
                      key={`h${h}`}
                      className="bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                    >
                      <td colSpan={4} className="px-4 py-1">
                        {hunk.header}
                      </td>
                    </tr>,
                    ...hunk.lines.map((line, i) => (
                      <tr key={`${h}-${i}`} className={rowStyles[line.type]}>
                        <td className="w-12 select-none px-2 text-right text-zinc-400">
                          {line.oldLine ?? ''}
                        </td>
                        <td className="w-12 select-none px-2 text-right text-zinc-400">
                          {line.newLine ?? ''}
                        </td>
                        {/* The +/− marker means the change is readable without colour. */}
                        <td className="w-4 select-none text-center">{markers[line.type]}</td>
                        <td className="whitespace-pre pr-4">{line.content}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
              {file.patchTruncated && (
                <p className="px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
                  Diff truncated: only the first part is shown.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
