import { z } from 'zod';

/**
 * GitHub ids are sent as strings: they can exceed JavaScript's safe integer
 * range in the future, and the database stores them as BigInt.
 */
const githubId = z.string().regex(/^\d{1,20}$/, 'Must be a numeric GitHub id');

export const githubStatusSchema = z.object({
  /** False when the server has no GitHub App credentials configured. */
  configured: z.boolean(),
  installations: z.array(
    z.object({
      id: z.string(),
      installationId: githubId,
      accountLogin: z.string(),
      accountType: z.string(),
    }),
  ),
});

export const availableRepositorySchema = z.object({
  githubRepoId: githubId,
  fullName: z.string(),
  isPrivate: z.boolean(),
  defaultBranch: z.string(),
  htmlUrl: z.string(),
  installationId: githubId,
  /** Id of the DocDrift Repository row if already connected, else null. */
  connectedRepositoryId: z.string().nullable(),
});

export const availableRepositoriesResponseSchema = z.object({
  repositories: z.array(availableRepositorySchema),
  /** Installations we could not read (e.g. the app was uninstalled on GitHub). */
  unavailableInstallations: z.array(z.object({ accountLogin: z.string(), reason: z.string() })),
});

export const repositorySchema = z.object({
  id: z.string(),
  githubRepoId: githubId,
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  isPrivate: z.boolean(),
  htmlUrl: z.string(),
  createdAt: z.iso.datetime(),
});

export const repositoryListResponseSchema = z.object({ repositories: z.array(repositorySchema) });
export const repositoryResponseSchema = z.object({ repository: repositorySchema });

/** The client sends only the GitHub id; every other detail is fetched from GitHub by the server. */
export const connectRepositoryRequestSchema = z.object({ githubRepoId: githubId });

export type GitHubStatus = z.infer<typeof githubStatusSchema>;
export type AvailableRepository = z.infer<typeof availableRepositorySchema>;
export type Repository = z.infer<typeof repositorySchema>;
