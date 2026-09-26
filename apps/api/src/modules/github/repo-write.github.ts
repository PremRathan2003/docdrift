/**
 * The only code in DocDrift that writes to somebody's repository.
 *
 * It builds one commit through git's own object model — a blob per changed
 * document, one tree, one commit, then a branch pointing at it — rather than
 * calling the "update a file" endpoint once per file. That endpoint makes a
 * separate commit each time, so a three-document update would land as three
 * commits, and a failure halfway would leave the branch half-updated. One
 * commit is atomic: either the branch moves or nothing happened.
 */
import { GitHubError, type GitHubClient } from './github-client.js';

const REF_PREFIX = 'refs/heads/';

export interface FileChange {
  path: string;
  content: string;
}

/** The commit a branch currently points at, or null if the branch is absent. */
export async function fetchBranchHead(
  client: GitHubClient,
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ sha: string } | null> {
  try {
    const { data } = await client.request<{ object: { sha: string } }>({
      path: `/repos/${owner}/${repo}/git/ref/${encodeURIComponent(`heads/${branch}`)}`,
      token,
    });
    return { sha: data.object.sha };
  } catch (err) {
    // A branch that does not exist is an expected answer here, not a failure.
    if (err instanceof GitHubError && err.code === 'GITHUB_NOT_FOUND') return null;
    throw err;
  }
}

/** The tree a commit points at, needed as the base of the new tree. */
export async function fetchCommitTree(
  client: GitHubClient,
  token: string,
  owner: string,
  repo: string,
  sha: string,
) {
  const { data } = await client.request<{ tree: { sha: string } }>({
    path: `/repos/${owner}/${repo}/git/commits/${sha}`,
    token,
  });
  return data.tree.sha;
}

/**
 * One commit containing every change, on top of `parentSha`.
 *
 * Content goes up as a base64 blob rather than inline UTF-8: documentation
 * contains characters that JSON escaping would have to mangle, and base64 makes
 * the byte content unambiguous.
 */
export async function createCommit(
  client: GitHubClient,
  token: string,
  owner: string,
  repo: string,
  opts: { parentSha: string; message: string; files: FileChange[] },
) {
  const baseTree = await fetchCommitTree(client, token, owner, repo, opts.parentSha);

  const blobs = await Promise.all(
    opts.files.map(async (file) => {
      const { data } = await client.request<{ sha: string }>({
        method: 'POST',
        path: `/repos/${owner}/${repo}/git/blobs`,
        token,
        body: { content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' },
      });
      return { path: file.path, sha: data.sha };
    }),
  );

  const { data: tree } = await client.request<{ sha: string }>({
    method: 'POST',
    path: `/repos/${owner}/${repo}/git/trees`,
    token,
    body: {
      base_tree: baseTree,
      tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    },
  });

  const { data: commit } = await client.request<{ sha: string }>({
    method: 'POST',
    path: `/repos/${owner}/${repo}/git/commits`,
    token,
    body: { message: opts.message, tree: tree.sha, parents: [opts.parentSha] },
  });
  return commit.sha;
}

/**
 * Points a branch at a commit, creating the branch if needed.
 *
 * `force` is deliberate: DocDrift's branch is its own, rebuilt from the
 * approved suggestions each time, so moving it is the intended behaviour. It
 * only ever names a branch it created (see the naming in the service), so it
 * cannot overwrite somebody's work.
 */
export async function setBranch(
  client: GitHubClient,
  token: string,
  owner: string,
  repo: string,
  branch: string,
  sha: string,
) {
  const existing = await fetchBranchHead(client, token, owner, repo, branch);
  if (existing) {
    await client.request({
      method: 'PATCH',
      path: `/repos/${owner}/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`,
      token,
      body: { sha, force: true },
    });
    return 'updated' as const;
  }
  await client.request({
    method: 'POST',
    path: `/repos/${owner}/${repo}/git/refs`,
    token,
    body: { ref: `${REF_PREFIX}${branch}`, sha },
  });
  return 'created' as const;
}

export interface OpenedPullRequest {
  number: number;
  htmlUrl: string;
}

/** An open pull request from `branch` into `base`, if one is already there. */
export async function findOpenPullRequest(
  client: GitHubClient,
  token: string,
  owner: string,
  repo: string,
  branch: string,
  base: string,
): Promise<OpenedPullRequest | null> {
  const { data } = await client.request<{ number: number; html_url: string }[]>({
    path: `/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&base=${encodeURIComponent(base)}&state=open&per_page=1`,
    token,
  });
  const pr = data[0];
  return pr ? { number: pr.number, htmlUrl: pr.html_url } : null;
}

export async function openPullRequest(
  client: GitHubClient,
  token: string,
  owner: string,
  repo: string,
  opts: { branch: string; base: string; title: string; body: string },
): Promise<OpenedPullRequest> {
  const { data } = await client.request<{ number: number; html_url: string }>({
    method: 'POST',
    path: `/repos/${owner}/${repo}/pulls`,
    token,
    body: { head: opts.branch, base: opts.base, title: opts.title, body: opts.body },
  });
  return { number: data.number, htmlUrl: data.html_url };
}
