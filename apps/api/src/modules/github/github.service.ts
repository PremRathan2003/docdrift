import type { AvailableRepository } from '@docdrift/shared';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { createAppJwt } from './app-jwt.js';
import type { GitHubAppConfig } from './config.js';
import { GitHubError, type GitHubClient } from './github-client.js';
import { createInstallationTokenProvider } from './installation-tokens.js';
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
        lastSyncedAt: new Date(),
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
