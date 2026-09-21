import {
  pullRequestFilesResponseSchema,
  pullRequestListResponseSchema,
  pullRequestResponseSchema,
} from '@docdrift/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export type PrStateFilter = 'open' | 'closed' | 'merged' | 'all';

export function usePullRequests(repositoryId: string, state: PrStateFilter, q: string) {
  const params = new URLSearchParams({ state });
  if (q.trim()) params.set('q', q.trim());
  return useQuery({
    queryKey: ['pull-requests', repositoryId, state, q.trim()],
    queryFn: () =>
      apiFetch(
        `/api/repositories/${encodeURIComponent(repositoryId)}/pull-requests?${params}`,
        pullRequestListResponseSchema,
      ),
    placeholderData: keepPreviousData, // keep the table visible while typing a search
  });
}

/** Forces a refresh from GitHub, then updates every cached list of this repository. */
export function useRefreshPullRequests(repositoryId: string) {
  const qc = useQueryClient();
  return async () => {
    await apiFetch(
      `/api/repositories/${encodeURIComponent(repositoryId)}/pull-requests?refresh=1&state=all`,
      pullRequestListResponseSchema,
    );
    await qc.invalidateQueries({ queryKey: ['pull-requests', repositoryId] });
  };
}

export function usePullRequest(id: string) {
  return useQuery({
    queryKey: ['pull-request', id],
    queryFn: () =>
      apiFetch(`/api/pull-requests/${encodeURIComponent(id)}`, pullRequestResponseSchema),
  });
}

export function usePullRequestFiles(id: string) {
  return useQuery({
    queryKey: ['pull-request', id, 'files'],
    queryFn: () =>
      apiFetch(
        `/api/pull-requests/${encodeURIComponent(id)}/files`,
        pullRequestFilesResponseSchema,
      ),
    staleTime: 60_000,
    retry: false,
  });
}

const dateFormat = new Intl.DateTimeFormat('en-IE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat('en-IE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
