import { analysisOutputSchema, type AnalysisOutput, type Recommendation } from '@docdrift/shared';

export type ParseResult =
  | { ok: true; output: AnalysisOutput }
  | { ok: false; reason: 'invalid_json' | 'schema_mismatch'; detail: string };

/** Step 1: is it JSON, and does it match the schema? (Well-formed ≠ correct.) */
export function parseModelOutput(text: string): ParseResult {
  let json: unknown;
  try {
    // Some models wrap JSON in ``` fences despite instructions; tolerate that one quirk.
    json = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    );
  } catch {
    return { ok: false, reason: 'invalid_json', detail: 'Response was not valid JSON' };
  }
  const parsed = analysisOutputSchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, reason: 'schema_mismatch', detail };
  }
  return { ok: true, output: parsed.data };
}

/**
 * Step 2: semantic checks against what we actually sent. The model may
 * invent paths or cite files that weren't changed; such items are removed
 * and reported as warnings instead of being shown as facts.
 */
export function validateSemantics(
  output: AnalysisOutput,
  ctx: { changedFiles: string[]; candidateDocs: string[] },
): { recommendations: Recommendation[]; warnings: string[] } {
  const changed = new Set(ctx.changedFiles);
  const docs = new Set(ctx.candidateDocs);
  const warnings: string[] = [];
  const seen = new Set<string>();
  const recommendations: Recommendation[] = [];

  for (const rec of output.recommendations) {
    if (!docs.has(rec.documentationPath)) {
      warnings.push(
        `Dropped a recommendation for "${rec.documentationPath}": not one of the documentation files provided.`,
      );
      continue;
    }
    const evidence = rec.evidence.filter((e) => changed.has(e.filePath));
    const dropped = rec.evidence.length - evidence.length;
    if (dropped > 0) {
      warnings.push(
        `Removed ${dropped} evidence reference(s) for "${rec.documentationPath}" pointing to files this PR doesn't change.`,
      );
    }
    if (evidence.length === 0) {
      warnings.push(
        `Dropped the recommendation for "${rec.documentationPath}": no valid evidence left.`,
      );
      continue;
    }
    if (seen.has(rec.documentationPath)) {
      warnings.push(
        `Merged a duplicate recommendation for "${rec.documentationPath}" (kept the first).`,
      );
      continue;
    }
    seen.add(rec.documentationPath);
    recommendations.push({ ...rec, evidence });
  }
  return { recommendations, warnings };
}
