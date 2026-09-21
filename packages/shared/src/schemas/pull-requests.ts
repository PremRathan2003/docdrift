import { z } from 'zod';

export const pullRequestStateSchema = z.enum(['OPEN', 'CLOSED', 'MERGED']);

export const pullRequestSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  authorLogin: z.string(),
  state: pullRequestStateSchema,
  isDraft: z.boolean(),
  headRef: z.string(),
  baseRef: z.string(),
  headSha: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  changedFiles: z.number().int(),
  htmlUrl: z.string(),
  githubCreatedAt: z.iso.datetime(),
  githubUpdatedAt: z.iso.datetime(),
  mergedAt: z.iso.datetime().nullable(),
  /** Filled in by milestone 1.5; null means "never analysed". */
  latestAnalysisStatus: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']).nullable(),
});

export const pullRequestListResponseSchema = z.object({
  repository: z.object({
    id: z.string(),
    fullName: z.string(),
    htmlUrl: z.string(),
    defaultBranch: z.string(),
  }),
  pullRequests: z.array(pullRequestSchema),
  /** When the list was last refreshed from GitHub. */
  syncedAt: z.iso.datetime().nullable(),
  /** Set when refreshing from GitHub failed and cached data is shown instead. */
  syncWarning: z.string().nullable(),
});

export const pullRequestResponseSchema = z.object({
  pullRequest: pullRequestSchema,
  repository: z.object({ id: z.string(), fullName: z.string() }),
});

export const fileKindSchema = z.enum([
  'documentation',
  'source',
  'test',
  'config',
  'generated',
  'binary',
  'other',
]);

export const pullRequestFileSchema = z.object({
  filename: z.string(),
  previousFilename: z.string().nullable(),
  status: z.string(), // added | removed | modified | renamed | copied | changed | unchanged
  additions: z.number().int(),
  deletions: z.number().int(),
  kind: fileKindSchema,
  /** Null when GitHub doesn't provide one (binary files, very large diffs). */
  patch: z.string().nullable(),
  patchTruncated: z.boolean(),
});

export const pullRequestFilesResponseSchema = z.object({
  headSha: z.string(),
  files: z.array(pullRequestFileSchema),
  /** True if the PR has more files than we fetched. */
  incomplete: z.boolean(),
});

export type PullRequestDto = z.infer<typeof pullRequestSchema>;
export type PullRequestFile = z.infer<typeof pullRequestFileSchema>;
