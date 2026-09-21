import { GitHubError, type GitHubClient } from './github-client.js';

const seg = (s: string) => encodeURIComponent(s);
const pathSegs = (p: string) => p.split('/').map(seg).join('/');

/** All file paths at a commit (one request). GitHub truncates very large trees. */
export async function fetchTreePaths(
  client: GitHubClient,
  token: string,
  owner: string,
  name: string,
  sha: string,
) {
  const { data } = await client.request<{
    tree?: { path?: string; type?: string; size?: number }[];
    truncated?: boolean;
  }>({
    path: `/repos/${seg(owner)}/${seg(name)}/git/trees/${seg(sha)}?recursive=1`,
    token,
  });
  const paths = (data.tree ?? [])
    .filter((e) => e.type === 'blob' && typeof e.path === 'string')
    .map((e) => ({ path: e.path!, size: e.size ?? 0 }));
  return { paths, truncated: data.truncated === true };
}

/** Text content of one file at a ref. Files over maxBytes are skipped (returns null). */
export async function fetchTextFile(
  client: GitHubClient,
  token: string,
  owner: string,
  name: string,
  path: string,
  ref: string,
  maxBytes = 200_000,
): Promise<string | null> {
  try {
    const { data } = await client.request<{
      type?: string;
      encoding?: string;
      content?: string;
      size?: number;
    }>({
      path: `/repos/${seg(owner)}/${seg(name)}/contents/${pathSegs(path)}?ref=${seg(ref)}`,
      token,
    });
    if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string')
      return null;
    if ((data.size ?? 0) > maxBytes) return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err instanceof GitHubError && err.code === 'GITHUB_NOT_FOUND') return null;
    throw err;
  }
}
