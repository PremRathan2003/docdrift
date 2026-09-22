import { z } from 'zod';
import { suggestionSchema, suggestionStatusSchema } from './analysis-runs.js';

export const reviewActionSchema = z.enum([
  'START_REVIEW',
  'EDIT',
  'REQUEST_CHANGES',
  'APPROVE',
  'REJECT',
  'REOPEN',
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

const note = z.string().trim().max(2000);

/** Every write sends the version it read (optimistic locking). */
export const editSuggestionRequestSchema = z.object({
  content: z.string().min(1, 'The suggestion cannot be empty').max(200_000),
  version: z.number().int().positive(),
  note: note.optional(),
});

export const decisionRequestSchema = z
  .object({
    action: reviewActionSchema.exclude(['EDIT']),
    version: z.number().int().positive(),
    note: note.optional(),
  })
  .refine((d) => d.action !== 'REQUEST_CHANGES' || (d.note && d.note.length > 0), {
    message: 'Say what should change',
    path: ['note'],
  });

export const reviewEntrySchema = z.object({
  id: z.string(),
  decision: reviewActionSchema,
  note: z.string().nullable(),
  reviewer: z.object({ displayName: z.string().nullable(), email: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
});

export const suggestionDetailResponseSchema = z.object({
  suggestion: suggestionSchema,
  allowedActions: z.array(reviewActionSchema),
  analysis: z.object({
    id: z.string(),
    provider: z.string(),
    model: z.string(),
    promptVersion: z.string(),
    headSha: z.string(),
    createdAt: z.iso.datetime(),
  }),
  pullRequest: z.object({
    id: z.string(),
    number: z.number().int(),
    title: z.string(),
    headSha: z.string(),
  }),
  repository: z.object({ id: z.string(), fullName: z.string() }),
  /** The document as it is on the PR branch at the analysed commit. */
  originalDocument: z.object({
    status: z.enum(['found', 'missing', 'unavailable']),
    content: z.string().nullable(),
  }),
  reviews: z.array(reviewEntrySchema),
});

export const dashboardResponseSchema = z.object({
  repositoryCount: z.number().int(),
  suggestionCounts: z.record(suggestionStatusSchema, z.number().int()),
  pendingReviews: z.array(
    z.object({
      id: z.string(),
      documentationPath: z.string(),
      status: suggestionStatusSchema,
      pullRequest: z.object({ id: z.string(), number: z.number().int(), title: z.string() }),
      repositoryFullName: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
  recentAnalyses: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']),
      suggestionCount: z.number().int(),
      pullRequest: z.object({ id: z.string(), number: z.number().int(), title: z.string() }),
      repositoryFullName: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
});

export type SuggestionDetail = z.infer<typeof suggestionDetailResponseSchema>;
export type DashboardSummary = z.infer<typeof dashboardResponseSchema>;
