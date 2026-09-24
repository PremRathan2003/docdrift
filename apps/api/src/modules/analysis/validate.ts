import { analysisOutputSchema, type AnalysisOutput, type Recommendation } from '@docdrift/shared';
import { spliceRecommendation, type ContextDoc } from './pipeline.js';

export type ParseResult =
  | { ok: true; output: AnalysisOutput }
  | {
      ok: false;
      reason: 'invalid_json' | 'schema_mismatch';
      /** For our logs: may quote the model's own words. */
      detail: string;
      /** For the retry prompt: our description of the fault, never the model's text. */
      hint: string;
    };

/** Step 1: is it JSON, and does it match the schema? (Well-formed ≠ correct.) */
export function parseModelOutput(text: string): ParseResult {
  // Some models wrap JSON in ``` fences despite instructions; tolerate that one quirk.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'it was not JSON';
    return {
      ok: false,
      reason: 'invalid_json',
      detail: describeNonJson(cleaned, err),
      // The parser quotes the offending text ("Unexpected token 'o', \"not json\"…").
      // That text came from the repository by way of the model, so it is stripped
      // before anything goes back into a prompt.
      hint: cleaned === '' ? 'it was empty' : message.replace(/"[^"]*"/g, '(text removed)'),
    };
  }
  const parsed = analysisOutputSchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, reason: 'schema_mismatch', detail, hint: detail };
  }
  return { ok: true, output: parsed.data };
}

/**
 * What came back instead of JSON. Without this an AI_INVALID_OUTPUT failure is
 * unanswerable after the fact: "not valid JSON" is true of an empty answer, a
 * refusal and a half-written object alike. The snippet is model output, so it
 * is trimmed to one short line and never treated as an instruction.
 */
function describeNonJson(text: string, err: unknown): string {
  if (text === '') return 'The model returned no answer text';
  const message = err instanceof Error ? err.message : 'not JSON';
  // JSON.parse names the offending offset; the text around it says whether the
  // answer was cut short or whether the model mis-escaped the document it was
  // quoting — two failures with nothing in common but this message.
  const at = /position (\d+)/.exec(message);
  const window = at
    ? text.slice(Math.max(0, Number(at[1]) - 60), Number(at[1]) + 60)
    : text.slice(0, 120);
  return `Response was not valid JSON (${text.length} chars): ${message}. Near the problem: ${JSON.stringify(
    window.replace(/\s+/g, ' '),
  )}`;
}

/**
 * Step 2: semantic checks against what we actually sent. The model may
 * invent paths or cite files that weren't changed; such items are removed
 * and reported as warnings instead of being shown as facts.
 */
export function validateSemantics(
  output: AnalysisOutput,
  ctx: { changedFiles: string[]; docs: ContextDoc[] },
): { recommendations: Recommendation[]; warnings: string[] } {
  const changed = new Set(ctx.changedFiles);
  const docs = new Map(ctx.docs.map((d) => [d.path, d]));
  const warnings: string[] = [];
  const seen = new Set<string>();
  const recommendations: Recommendation[] = [];

  for (const rec of output.recommendations) {
    const doc = docs.get(rec.documentationPath);
    if (!doc) {
      warnings.push(
        `Dropped a recommendation for "${rec.documentationPath}": not one of the documentation files provided.`,
      );
      continue;
    }
    // A section update becomes a complete document here, so the rest of the
    // app never deals with fragments.
    const spliced = spliceRecommendation(doc, rec);
    if ('error' in spliced) {
      warnings.push(`Dropped a recommendation for "${rec.documentationPath}": ${spliced.error}.`);
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
    recommendations.push({ ...rec, evidence, suggestedUpdate: spliced.content });
  }
  return { recommendations, warnings };
}
