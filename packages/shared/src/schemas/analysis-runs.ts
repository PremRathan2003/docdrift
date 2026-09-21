import { z } from 'zod';
import { evidenceSchema } from './analysis.js';

export const analysisStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);
export const suggestionStatusSchema = z.enum([
  'PENDING',
  'IN_REVIEW',
  'EDITED',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'FAILED',
]);

export const suggestionSchema = z.object({
  id: z.string(),
  documentationPath: z.string(),
  reason: z.string(),
  evidence: z.array(evidenceSchema),
  originalContent: z.string(),
  currentContent: z.string(),
  /** Model-generated estimate, not a calibrated probability. */
  modelConfidence: z.number(),
  uncertainty: z.string().nullable(),
  status: suggestionStatusSchema,
  version: z.number().int(),
});

/** What was sent to the model and what was left out — makes every result explainable. */
export const inputManifestSchema = z.object({
  filesSent: z.array(z.object({ filename: z.string(), kind: z.string(), truncated: z.boolean() })),
  filesSkipped: z.array(z.object({ filename: z.string(), reason: z.string() })),
  docsSent: z.array(
    z.object({ path: z.string(), matchedKeywords: z.array(z.string()), truncated: z.boolean() }),
  ),
  docsConsidered: z.number().int(),
  secretsRedacted: z.number().int(),
  promptChars: z.number().int(),
});

export const analysisRunSchema = z.object({
  id: z.string(),
  pullRequestId: z.string(),
  status: analysisStatusSchema,
  headSha: z.string(),
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  summary: z.string().nullable(),
  warnings: z.array(z.string()),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  /** Null unless token prices are configured on the server. */
  costUsd: z.number().nullable(),
  latencyMs: z.number().int().nullable(),
  attemptCount: z.number().int(),
  inputManifest: inputManifestSchema.nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  suggestions: z.array(suggestionSchema),
});

export const analysisResponseSchema = z.object({ analysis: analysisRunSchema });
export const analysisListResponseSchema = z.object({
  analyses: z.array(
    analysisRunSchema
      .omit({ suggestions: true, inputManifest: true })
      .extend({ suggestionCount: z.number().int() }),
  ),
});
export const aiStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
});

export type AnalysisRunDto = z.infer<typeof analysisRunSchema>;
export type SuggestionDto = z.infer<typeof suggestionSchema>;
export type InputManifest = z.infer<typeof inputManifestSchema>;
