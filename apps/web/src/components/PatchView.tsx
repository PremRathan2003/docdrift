import { parsePatch } from '@docdrift/shared';
import { useMemo } from 'react';

const rowStyles = {
  add: 'bg-emerald-50 dark:bg-emerald-950/40',
  del: 'bg-red-50 dark:bg-red-950/40',
  context: '',
  note: 'text-zinc-500 italic',
};
const markers = { add: '+', del: '−', context: ' ', note: '' };

/** Renders a unified diff (all hunks), reusing the shared patch parser. */
export function PatchView({ patch, label }: { patch: string; label: string }) {
  const hunks = useMemo(() => parsePatch(patch), [patch]);
  if (hunks.length === 0) {
    return (
      <p className="p-4 text-sm text-zinc-500">
        No differences: the suggestion matches the current document.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-xs" aria-label={label}>
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
                <td className="w-4 select-none text-center">{markers[line.type]}</td>
                <td className="whitespace-pre-wrap pr-4">{line.content}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
