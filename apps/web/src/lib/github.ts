import {
  availableRepositoriesResponseSchema,
  githubStatusSchema,
  repositoryListResponseSchema,
  repositoryResponseSchema,
} from '@docdrift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend, postJson } from './api';

const keys = {
  status: ['github', 'status'] as const,
  available: ['repositories', 'available'] as const,
  connected: ['repositories', 'connected'] as const,
};

export function useGitHubStatus() {
  return useQuery({
    queryKey: keys.status,
    queryFn: () => apiFetch('/api/github/status', githubStatusSchema),
  });
}

/** Live from GitHub, so only fetched when there is at least one installation. */
export function useAvailableRepositories(enabled: boolean) {
  return useQuery({
    queryKey: keys.available,
    queryFn: () => apiFetch('/api/repositories/available', availableRepositoriesResponseSchema),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useConnectedRepositories() {
  return useQuery({
    queryKey: keys.connected,
    queryFn: async () =>
      (await apiFetch('/api/repositories', repositoryListResponseSchema)).repositories,
  });
}

function useInvalidateRepositories() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['repositories'] });
}

export function useConnectRepository() {
  const invalidate = useInvalidateRepositories();
  return useMutation({
    mutationFn: (githubRepoId: string) =>
      apiFetch('/api/repositories', repositoryResponseSchema, postJson({ githubRepoId })),
    onSuccess: invalidate,
  });
}

export function useDisconnectRepository() {
  const invalidate = useInvalidateRepositories();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend(`/api/repositories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/** Messages for /repositories?github=<outcome>, set by the API's OAuth callback. */
export const connectOutcomes: Record<string, { tone: 'info' | 'error'; text: string }> = {
  connected: {
    tone: 'info',
    text: 'GitHub is connected. Choose which repositories DocDrift should work with.',
  },
  no_installations: {
    tone: 'error',
    text: 'Your GitHub account is linked, but the DocDrift app isn’t installed on any account yet. Install it to continue.',
  },
  denied: { tone: 'error', text: 'GitHub authorization was cancelled.' },
  state_mismatch: {
    tone: 'error',
    text: 'That GitHub sign-in expired or wasn’t started from this browser. Please try again.',
  },
  installation_not_verified: {
    tone: 'error',
    text: 'We couldn’t confirm that installation belongs to your GitHub account, so it wasn’t connected.',
  },
  github_error: {
    tone: 'error',
    text: 'GitHub couldn’t complete the connection. Please try again.',
  },
  not_configured: { tone: 'error', text: 'GitHub integration isn’t configured on this server.' },
};
