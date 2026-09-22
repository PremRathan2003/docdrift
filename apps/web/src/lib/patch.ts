import { createTwoFilesPatch } from 'diff';

/** Files conventionally end with a newline; don't show a diff just for that. */
const withFinalNewline = (s: string) => (s.endsWith('\n') ? s : `${s}\n`);

/**
 * A unified diff that `git apply` understands (a/ and b/ prefixes). `original`
 * is null when the document doesn't exist yet (the suggestion creates it).
 */
export function buildPatch(path: string, original: string | null, updated: string): string {
  const before = original === null ? '' : withFinalNewline(original);
  const after = withFinalNewline(updated);
  const patch = createTwoFilesPatch(
    original === null ? '/dev/null' : `a/${path}`,
    `b/${path}`,
    before,
    after,
    undefined,
    undefined,
    {
      context: 3,
    },
  );
  // jsdiff adds a "====" (and sometimes "Index:") header that git does not need.
  return patch.replace(/^(Index: .*\n)?=+\n/, '');
}

export function patchStats(patch: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/x-diff' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
