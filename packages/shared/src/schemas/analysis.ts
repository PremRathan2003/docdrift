import { z } from 'zod';

/**
 * The contract we require the LLM to follow when it analyses a pull request.
 *
 * Important: passing this schema only proves the response is *well-formed*.
 * It says nothing about whether the analysis is *correct*. Semantic checks
 * (e.g. "does every evidence path actually exist in the PR diff?") are done
 * separately in the API's analysis module, and results are always reviewed
 * by a human before anything touches a repository.
 */

/** Bumped whenever the shape below changes. Stored with every analysis run. */
export const ANALYSIS_OUTPUT_SCHEMA_VERSION = '1';

// Limits keep a misbehaving model from flooding the database or the UI.
const MAX_RECOMMENDATIONS = 20;
const MAX_EVIDENCE_ITEMS = 10;

const repoPath = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((p) => !p.startsWith('/') && !p.split('/').includes('..'), {
    message: 'Path must be repository-relative and must not contain ".."',
  });

export const evidenceSchema = z.object({
  /** A file changed in the PR that motivates the recommendation. */
  filePath: repoPath,
  /** Short explanation of what in that file changed. */
  detail: z.string().trim().min(1).max(500),
});

export const recommendationSchema = z.object({
  documentationPath: repoPath,
  reason: z.string().trim().min(1).max(2000),
  evidence: z.array(evidenceSchema).min(1).max(MAX_EVIDENCE_ITEMS),
  /**
   * The complete updated document (prompt v2+). Not trimmed: leading/trailing
   * whitespace, like the final newline, is part of the file.
   */
  suggestedUpdate: z
    .string()
    .max(100_000)
    .refine((s) => s.trim().length > 0, { message: 'Suggested update is empty' }),
  /**
   * The model's own estimate in [0, 1]. This is NOT a calibrated probability
   * and the UI must label it as a model-generated estimate.
   */
  modelConfidence: z.number().min(0).max(1),
  /** What the model could not see or verify. Empty string if nothing. */
  uncertainty: z.string().trim().max(2000),
});

export const analysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  /** An empty list is a valid, useful answer: "no docs need updating". */
  recommendations: z.array(recommendationSchema).max(MAX_RECOMMENDATIONS),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
