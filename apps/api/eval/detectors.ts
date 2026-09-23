/**
 * A detector answers one question per case: "which documents does this PR make
 * out of date, and what should they say?"
 *
 *  - aiDetector: the real DocDrift pipeline (same context, prompt, retries and
 *    validation as the app).
 *  - keywordBaseline: no AI. Flags every candidate document that mentions an
 *    identifier or number the PR removed. It exists so the AI's numbers have
 *    something to be compared with: if the model can't beat grep, it isn't
 *    worth its cost.
 */
import type { Recommendation } from '@docdrift/shared';
import type { AIProvider } from '../src/modules/ai/provider.js';
import {
  buildContext,
  PROMPT_VERSION,
  RunFailure,
  runPipeline,
  type PipelineConfig,
  type PullRequestInfo,
} from '../src/modules/analysis/pipeline.js';
import { caseSource, type EvalCase } from './dataset.js';

export interface Detection {
  /** Validated recommendations: what a user would see. */
  recommendations: Pick<
    Recommendation,
    'documentationPath' | 'reason' | 'suggestedUpdate' | 'modelConfidence'
  >[];
  /** Items removed by semantic validation (invented paths, bad evidence, …). */
  warnings: string[];
  /** True when the pipeline decided there was nothing to ask the model. */
  skipped: boolean;
  summary: string;
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Documents that were sent to the model (or examined by the baseline). */
  docsSent: string[];
  /** Of those, the ones too long to send in full: they can never be recommended. */
  docsTruncated: string[];
  error?: { code: string; message: string };
}

export interface Detector {
  name: string;
  /** Which document selection was measured ('content' or 'path-rules'). */
  retrieval: string;
  model: string;
  promptVersion: string | null;
  /** Whether suggestions contain real document text, so content checks mean something. */
  writesContent: boolean;
  detect(c: EvalCase): Promise<Detection>;
}

export function pullRequestOf(c: EvalCase): PullRequestInfo {
  return { number: 1, title: c.title, body: c.body || null, baseRef: 'main', headRef: 'feature' };
}

const quietLogger = { warn: () => {} };

export function aiDetector(ai: AIProvider, config: PipelineConfig): Detector {
  return {
    name: 'docdrift',
    retrieval: config.retrieval ?? 'content',
    model: `${ai.name}/${ai.model}`,
    promptVersion: PROMPT_VERSION,
    writesContent: true,
    async detect(c) {
      try {
        const result = await runPipeline({
          ai,
          source: caseSource(c),
          pullRequest: pullRequestOf(c),
          config,
          logger: quietLogger,
        });
        const docsSent = result.context.docs.map((d) => d.path);
        const docsTruncated = result.context.sectionedDocs;
        if (result.kind === 'skipped') {
          return {
            recommendations: [],
            warnings: [],
            skipped: true,
            summary: result.summary,
            attempts: 0,
            inputTokens: null,
            outputTokens: null,
            docsSent,
            docsTruncated,
          };
        }
        return {
          recommendations: result.recommendations,
          warnings: result.warnings,
          skipped: false,
          summary: result.output.summary,
          attempts: result.attempts,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          docsSent,
          docsTruncated,
        };
      } catch (err) {
        if (!(err instanceof RunFailure)) throw err;
        // A failed run still retrieved documents: reporting none would blame
        // retrieval for a model failure.
        return {
          recommendations: [],
          warnings: [],
          skipped: false,
          summary: '',
          attempts: err.attempts,
          inputTokens: err.inputTokens,
          outputTokens: err.outputTokens,
          docsSent: err.context?.docs.map((d) => d.path) ?? [],
          docsTruncated: err.context?.sectionedDocs ?? [],
          error: { code: err.code, message: err.message },
        };
      }
    },
  };
}

const TOKEN = /[A-Za-z_][A-Za-z0-9_]{2,}|\d{2,}/g;
const IGNORE = new Set(
  'const let var function return true false null undefined import export from require new class async await this else'.split(
    ' ',
  ),
);

/** Tokens on removed lines that no added line still contains: renamed or deleted things. */
export function removedTokens(patches: string[]): string[] {
  const removed = new Set<string>();
  const added = new Set<string>();
  for (const patch of patches) {
    for (const line of patch.split('\n')) {
      const target = line.startsWith('-') ? removed : line.startsWith('+') ? added : null;
      if (!target) continue;
      for (const t of line.slice(1).match(TOKEN) ?? []) if (!IGNORE.has(t)) target.add(t);
    }
  }
  return [...removed].filter((t) => !added.has(t)).sort();
}

export function keywordBaseline(config: PipelineConfig): Detector {
  return {
    name: 'keyword-baseline',
    retrieval: config.retrieval ?? 'content',
    model: 'none',
    promptVersion: null,
    writesContent: false,
    async detect(c) {
      // Same file selection and document candidates as the AI gets.
      const ctx = await buildContext(caseSource(c), pullRequestOf(c), config);
      const code = ctx.included.filter((f) => f.kind !== 'documentation' && f.kind !== 'test');
      const tokens = removedTokens(code.map((f) => f.patch));
      const changedDocs = new Set(ctx.changedFiles);
      const recommendations = ctx.docs
        // A doc the PR already edits was presumably updated by its author.
        .filter((d) => !changedDocs.has(d.path))
        .flatMap((d) => {
          const hits = tokens.filter((t) => new RegExp(`\\b${t}\\b`).test(d.content));
          return hits.length
            ? [
                {
                  documentationPath: d.path,
                  reason: `Mentions removed ${hits.map((h) => `"${h}"`).join(', ')}`,
                  suggestedUpdate: '',
                  modelConfidence: 1,
                },
              ]
            : [];
        });
      return {
        recommendations,
        warnings: [],
        skipped: code.length === 0,
        summary: `Removed tokens: ${tokens.slice(0, 20).join(', ') || '(none)'}`,
        attempts: 0,
        inputTokens: null,
        outputTokens: null,
        docsSent: ctx.docs.map((d) => d.path),
        docsTruncated: ctx.sectionedDocs,
      };
    },
  };
}
