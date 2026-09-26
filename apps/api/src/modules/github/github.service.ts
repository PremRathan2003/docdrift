import type { AvailableRepository } from '@docdrift/shared';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { createAppJwt } from './app-jwt.js';
import type { GitHubAppConfig } from './config.js';
import { GitHubError, type GitHubClient } from './github-client.js';
import {
  createCommit,
  findOpenPullRequest,
  openPullRequest,
  setBranch,
} from './repo-write.github.js';
import { createInstallationTokenProvider } from './installation-tokens.js';
import { fetchPullRequestFiles, fetchPullRequests } from './pull-requests.github.js';
import { fetchBlob, fetchTextFile, fetchTreePaths } from './repo-content.github.js';
import { exchangeCodeForUserToken, listUserInstallations } from './user-oauth.js';

/** The subset of GitHub's repository object we rely on, checked at runtime. */
interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  html_url: string;
}

function isGitHubRepo(r: unknown): r is GitHubRepo {
  const x = r as GitHubRepo;
  return (
    typeof x?.id === 'number' &&
    typeof x.name === 'string' &&
    typeof x.full_name === 'string' &&
    typeof x.owner?.login === 'string' &&
    typeof x.private === 'boolean' &&
    typeof x.default_branch === 'string' &&
    typeof x.html_url === 'string'
  );
}

export interface GitHubServiceDeps {
  db: Db;
  config: GitHubAppConfig;
  client: GitHubClient;
  /** Only for tests: replaces fetch for the github.com OAuth endpoint. */
  oauthFetch?: typeof fetch;
}

export function createGitHubService({ db, config, client, oauthFetch }: GitHubServiceDeps) {
  const tokens = createInstallationTokenProvider({
    client,
    appJwt: () => createAppJwt(config.clientId, config.privateKey),
  });

  async function reposOfInstallation(installationId: bigint): Promise<GitHubRepo[]> {
    const token = await tokens.get(installationId);
    const repos = await client.paginate<{ repositories?: unknown[] }, unknown>(
      { path: '/installation/repositories', token },
      (page) => page.repositories ?? [],
    );
    return repos.filter(isGitHubRepo);
  }

  const service = {
    config,

    /** Refreshes the cached PR list of one connected repository from GitHub. */
    async syncPullRequests(repo: {
      id: string;
      owner: string;
      name: string;
      installationId: bigint;
    }) {
      const token = await tokens.get(repo.installationId);
      const prs = await fetchPullRequests(client, token, repo.owner, repo.name);
      const syncedAt = new Date();
      await db.$transaction([
        ...prs.map((pr) =>
          db.pullRequest.upsert({
            where: { repositoryId_number: { repositoryId: repo.id, number: pr.number } },
            update: { ...pr, syncedAt },
            create: { ...pr, repositoryId: repo.id, syncedAt },
          }),
        ),
        db.repository.update({ where: { id: repo.id }, data: { lastSyncedAt: syncedAt } }),
      ]);
      return prs.length;
    },

    // ---- writing (Phase 3: documentation pull requests)

    /** One commit containing every changed document, on top of `parentSha`. */
    async commitDocuments(
      repo: { owner: string; name: string; installationId: bigint },
      opts: { parentSha: string; message: string; files: { path: string; content: string }[] },
    ) {
      const token = await tokens.get(repo.installationId);
      return createCommit(client, token, repo.owner, repo.name, opts);
    },

    /** Points DocDrift's own branch at a commit, creating it if needed. */
    async setBranch(
      repo: { owner: string; name: string; installationId: bigint },
      branch: string,
      sha: string,
    ) {
      const token = await tokens.get(repo.installationId);
      return setBranch(client, token, repo.owner, repo.name, branch, sha);
    },

    /** An open pull request from that branch, if one is already there. */
    async findDocsPullRequest(
      repo: { owner: string; name: string; installationId: bigint },
      branch: string,
      base: string,
    ) {
      const token = await tokens.get(repo.installationId);
      return findOpenPullRequest(client, token, repo.owner, repo.name, branch, base);
    },

    async openDocsPullRequest(
      repo: { owner: string; name: string; installationId: bigint },
      opts: { branch: string; base: string; title: string; body: string },
    ) {
      const token = await tokens.get(repo.installationId);
      return openPullRequest(client, token, repo.owner, repo.name, opts);
    },

    /** Paths of all files at a commit. */
    async treePaths(repo: { owner: string; name: string; installationId: bigint }, sha: string) {
      const token = await tokens.get(repo.installationId);
      return fetchTreePaths(client, token, repo.owner, repo.name, sha);
    },

    /**
     * Several documentation files at one commit, read through a cache.
     *
     * Ranking documents by their text means reading every documentation file in
     * the repository — hundreds in a big project. Git blob SHAs are content
     * hashes, so a file's content is downloaded once and reused by every later
     * analysis of that repository (and by other pull requests that don't touch
     * it). Only the files whose SHA we have never seen cost a request.
     */
    async textFilesBySha(
      repo: { id: string; owner: string; name: string; installationId: bigint },
      blobs: { path: string; sha: string }[],
    ): Promise<Map<string, string>> {
      const out = new Map<string, string>();
      const wanted = blobs.filter((b) => b.sha);
      const cached = await db.documentBlob.findMany({
        where: { repositoryId: repo.id, blobSha: { in: wanted.map((b) => b.sha) } },
        select: { blobSha: true, content: true },
      });
      const bySha = new Map(cached.map((c) => [c.blobSha, c.content]));
      const missing = wanted.filter((b) => !bySha.has(b.sha));

      if (missing.length) {
        const token = await tokens.get(repo.installationId);
        // A little parallelism, but not enough to trip GitHub's abuse limits.
        const CONCURRENCY = 6;
        for (let i = 0; i < missing.length; i += CONCURRENCY) {
          const batch = missing.slice(i, i + CONCURRENCY);
          const texts = await Promise.all(
            batch.map((b) => fetchBlob(client, token, repo.owner, repo.name, b.sha)),
          );
          const rows = batch
            .map((b, j) => ({ b, text: texts[j] }))
            .filter((x): x is { b: (typeof batch)[number]; text: string } => x.text !== null);
          for (const { b, text } of rows) bySha.set(b.sha, text);
          // Caching is an optimisation: a failure here must not fail the analysis.
          await db.documentBlob
            .createMany({
              data: rows.map(({ b, text }) => ({
                repositoryId: repo.id,
                blobSha: b.sha,
                path: b.path,
                content: text,
                bytes: Buffer.byteLength(text),
              })),
              skipDuplicates: true,
            })
            .catch(() => undefined);
        }
      } else if (wanted.length) {
        await db.documentBlob
          .updateMany({
            where: { repositoryId: repo.id, blobSha: { in: wanted.map((b) => b.sha) } },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => undefined);
      }

      for (const b of wanted) {
        const text = bySha.get(b.sha);
        if (text !== undefined) out.set(b.path, text);
      }
      return out;
    },

    /** One text file at a commit, or null if missing/too large/binary. */
    async textFile(
      repo: { owner: string; name: string; installationId: bigint },
      path: string,
      sha: string,
    ) {
      const token = await tokens.get(repo.installationId);
      return fetchTextFile(client, token, repo.owner, repo.name, path, sha);
    },

    /** Changed files of a PR, fetched live (diffs change with every push, so they aren't stored). */
    async pullRequestFiles(
      repo: { owner: string; name: string; installationId: bigint },
      number: number,
    ) {
      const token = await tokens.get(repo.installationId);
      return fetchPullRequestFiles(client, token, repo.owner, repo.name, number);
    },

    /**
     * Links every installation of our app that this GitHub user can access —
     * as reported by GitHub for the user's own token, never taken from the URL.
     * Returns the GitHub installation ids that were linked.
     */
    async linkInstallationsFromCode(userId: string, code: string): Promise<string[]> {
      const userToken = await exchangeCodeForUserToken(
        { clientId: config.clientId, clientSecret: config.clientSecret, code },
        oauthFetch,
      );
      // The user token is used for this single call and then goes out of scope.
      const installations = await listUserInstallations(client, userToken);

      for (const inst of installations) {
        await db.githubInstallation.upsert({
          where: { userId_installationId: { userId, installationId: BigInt(inst.id) } },
          update: { accountLogin: inst.account.login, accountType: inst.account.type },
          create: {
            userId,
            installationId: BigInt(inst.id),
            accountLogin: inst.account.login,
            accountType: inst.account.type,
          },
        });
      }
      return installations.map((i) => String(i.id));
    },

    async listInstallations(userId: string) {
      return db.githubInstallation.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    },

    /**
     * Every repository the app can see through this user's installations,
     * fetched live from GitHub, marked with whether it's already connected.
     */
    async listAvailableRepositories(userId: string) {
      const installations = await service.listInstallations(userId);
      const connected = await db.repository.findMany({
        where: { userId },
        select: { id: true, githubRepoId: true },
      });
      const connectedByGitHubId = new Map(connected.map((r) => [r.githubRepoId, r.id]));

      const repositories: (AvailableRepository & {
        owner: string;
        name: string;
        installationRowId: string;
      })[] = [];
      const unavailableInstallations: { accountLogin: string; reason: string }[] = [];

      for (const inst of installations) {
        try {
          for (const repo of await reposOfInstallation(inst.installationId)) {
            repositories.push({
              githubRepoId: String(repo.id),
              fullName: repo.full_name,
              owner: repo.owner.login,
              name: repo.name,
              isPrivate: repo.private,
              defaultBranch: repo.default_branch,
              htmlUrl: repo.html_url,
              installationId: String(inst.installationId),
              installationRowId: inst.id,
              connectedRepositoryId: connectedByGitHubId.get(BigInt(repo.id)) ?? null,
            });
          }
        } catch (err) {
          // An uninstalled or suspended app shows up as 401/403/404 on token minting.
          if (
            err instanceof GitHubError &&
            ['GITHUB_NOT_FOUND', 'GITHUB_UNAUTHORIZED', 'GITHUB_FORBIDDEN'].includes(err.code)
          ) {
            tokens.invalidate(inst.installationId);
            unavailableInstallations.push({
              accountLogin: inst.accountLogin,
              reason: 'The DocDrift app is no longer installed or was suspended on this account.',
            });
            continue;
          }
          throw err;
        }
      }
      repositories.sort((a, b) => a.fullName.localeCompare(b.fullName));
      return { repositories, unavailableInstallations };
    },

    /**
     * Connects a repository. The client sends only the GitHub id; we look it
     * up through the user's own installations, so a user can never connect a
     * repository they can't access, and metadata can't be forged.
     */
    async connectRepository(userId: string, githubRepoId: string) {
      const { repositories } = await service.listAvailableRepositories(userId);
      const repo = repositories.find((r) => r.githubRepoId === githubRepoId);
      if (!repo) {
        throw new AppError(
          404,
          'REPOSITORY_NOT_ACCESSIBLE',
          'This repository is not accessible through your GitHub installations',
        );
      }
      const data = {
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        isPrivate: repo.isPrivate,
        htmlUrl: repo.htmlUrl,
        installationId: repo.installationRowId,
        // lastSyncedAt means "pull requests last synced"; it stays null until the first sync.
      };
      return db.repository.upsert({
        where: { userId_githubRepoId: { userId, githubRepoId: BigInt(githubRepoId) } },
        update: data,
        create: { ...data, userId, githubRepoId: BigInt(githubRepoId) },
      });
    },
  };
  return service;
}

export type GitHubService = ReturnType<typeof createGitHubService>;
