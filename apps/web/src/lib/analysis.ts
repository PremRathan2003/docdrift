import {
  aiStatusSchema,
  analysisListResponseSchema,
  analysisResponseSchema,
  docsPullRequestResponseSchema,
} from '@docdrift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => apiFetch('/api/ai/status', aiStatusSchema),
    staleTime: 5 * 60_000,
  });
}

export function useAnalyses(pullRequestId: string) {
  return useQuery({
    queryKey: ['analyses', pullRequestId],
    queryFn: async () =>
      (
        await apiFetch(
          `/api/pull-requests/${encodeURIComponent(pullRequestId)}/analyses`,
          analysisListResponseSchema,
        )
      ).analyses,
  });
}

const inProgress = (status?: string) => status === 'QUEUED' || status === 'RUNNING';

/** Polls every 2 s while the run is queued or running, then stops. */
export function useAnalysis(id: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['analysis', id],
    enabled: id !== null,
    queryFn: async () => {
      const { analysis } = await apiFetch(
        `/api/analyses/${encodeURIComponent(id!)}`,
        analysisResponseSchema,
      );
      if (!inProgress(analysis.status)) {
        // Finished: refresh the history list and the PR list badges.
        void qc.invalidateQueries({ queryKey: ['analyses', analysis.pullRequestId] });
        void qc.invalidateQueries({ queryKey: ['pull-requests'] });
      }
      return analysis;
    },
    refetchInterval: (q) => (inProgress(q.state.data?.status) ? 2_000 : false),
  });
}

export function useStartAnalysis(pullRequestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(
        `/api/pull-requests/${encodeURIComponent(pullRequestId)}/analyses`,
        analysisResponseSchema,
        { method: 'POST' },
      ),
    onSuccess: ({ analysis }) => {
      qc.setQueryData(['analysis', analysis.id], analysis);
      void qc.invalidateQueries({ queryKey: ['analyses', pullRequestId] });
    },
  });
}

/**
 * Opens (or updates) the documentation pull request for a run.
 *
 * Deliberately a mutation with no automatic retry: it writes to the user's
 * repository, and a retry that looks free to us is a second attempt at changing
 * someone's code. The server is idempotent per run, but the decision to try
 * again belongs to the person.
 */
export function useCreateDocsPullRequest(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: () =>
      apiFetch(
        `/api/analyses/${encodeURIComponent(runId)}/docs-pull-request`,
        docsPullRequestResponseSchema,
        { method: 'POST' },
      ),
    onSuccess: () => {
      // The run now carries the pull request, and its suggestions are APPLIED.
      void qc.invalidateQueries({ queryKey: ['analysis', runId] });
    },
  });
}

export const isInProgress = inProgress;
