import { GitHubError, type GitHubClient } from './github-client.js';

/**
 * Reads pull requests with GitHub's GraphQL API.
 *
 * Why GraphQL here? The REST "list pull requests" endpoint doesn't include
 * additions, deletions or the changed-file count — we'd need one extra request
 * per PR (N+1). One GraphQL query returns all of it for 50 PRs at once.
 */
const PULL_REQUESTS_QUERY = `
query PullRequests($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        fullDatabaseId
        number
        title
        body
        author { login }
        state
        isDraft
        headRefName
        baseRefName
        headRefOid
        additions
        deletions
        changedFiles
        url
        createdAt
        updatedAt
        mergedAt
      }
    }
  }
}`;

export interface GitHubPullRequest {
  githubPrId: bigint;
  number: number;
  title: string;
  body: string | null;
  authorLogin: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  headRef: string;
  baseRef: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  htmlUrl: string;
  githubCreatedAt: Date;
  githubUpdatedAt: Date;
  mergedAt: Date | null;
}

interface GraphQLResponse {
  data?: { repository?: { pullRequests?: { nodes?: unknown[] } } | null };
  errors?: { type?: string; message?: string }[];
}

type Node = {
  fullDatabaseId: string | number;
  number: number;
  title: string;
  body: string | null;
  author: { login: string } | null;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
};

function isNode(n: unknown): n is Node {
  const x = n as Node;
  return (
    (typeof x?.fullDatabaseId === 'string' || typeof x?.fullDatabaseId === 'number') &&
    typeof x.number === 'number' &&
    typeof x.title === 'string' &&
    ['OPEN', 'CLOSED', 'MERGED'].includes(x.state) &&
    typeof x.headRefOid === 'string' &&
    typeof x.additions === 'number' &&
    typeof x.createdAt === 'string'
  );
}

export async function fetchPullRequests(
  client: GitHubClient,
  token: string,
  owner: string,
  name: string,
  first = 50,
): Promise<GitHubPullRequest[]> {
  const { data: res } = await client.request<GraphQLResponse>({
    method: 'POST',
    path: '/graphql',
    token,
    body: { query: PULL_REQUESTS_QUERY, variables: { owner, name, first } },
  });

  // GraphQL reports most errors with HTTP 200 and an "errors" array.
  if (res.errors?.length) {
    const type = res.errors[0]?.type;
    if (type === 'NOT_FOUND')
      throw new GitHubError('GITHUB_NOT_FOUND', 'Repository not found on GitHub');
    if (type === 'RATE_LIMITED')
      throw new GitHubError('GITHUB_RATE_LIMITED', 'GitHub rate limit reached', 200, 60);
    throw new GitHubError(
      'GITHUB_BAD_RESPONSE',
      `GitHub GraphQL error: ${res.errors[0]?.message ?? 'unknown'}`,
    );
  }
  const nodes = res.data?.repository?.pullRequests?.nodes;
  if (!Array.isArray(nodes))
    throw new GitHubError('GITHUB_BAD_RESPONSE', 'Unexpected GraphQL response shape');

  return nodes.filter(isNode).map((n) => ({
    githubPrId: BigInt(n.fullDatabaseId),
    number: n.number,
    title: n.title,
    body: n.body || null,
    // Deleted GitHub accounts appear as a null author ("ghost" on github.com).
    authorLogin: n.author?.login ?? 'ghost',
    state: n.state as GitHubPullRequest['state'],
    isDraft: n.isDraft,
    headRef: n.headRefName,
    baseRef: n.baseRefName,
    headSha: n.headRefOid,
    additions: n.additions,
    deletions: n.deletions,
    changedFiles: n.changedFiles,
    htmlUrl: n.url,
    githubCreatedAt: new Date(n.createdAt),
    githubUpdatedAt: new Date(n.updatedAt),
    mergedAt: n.mergedAt ? new Date(n.mergedAt) : null,
  }));
}

export interface GitHubPullRequestFile {
  filename: string;
  previousFilename: string | null;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** GitHub returns at most 3,000 files per PR; we stop at MAX_PAGES × 100. */
export async function fetchPullRequestFiles(
  client: GitHubClient,
  token: string,
  owner: string,
  name: string,
  number: number,
): Promise<GitHubPullRequestFile[]> {
  const raw = await client.paginate<unknown[], Record<string, unknown>>(
    {
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls/${number}/files`,
      token,
    },
    (page) => (Array.isArray(page) ? (page as Record<string, unknown>[]) : []),
  );
  return raw
    .filter((f) => typeof f.filename === 'string')
    .map((f) => ({
      filename: f.filename as string,
      previousFilename: typeof f.previous_filename === 'string' ? f.previous_filename : null,
      status: typeof f.status === 'string' ? f.status : 'modified',
      additions: typeof f.additions === 'number' ? f.additions : 0,
      deletions: typeof f.deletions === 'number' ? f.deletions : 0,
      patch: typeof f.patch === 'string' ? f.patch : null,
    }));
}
