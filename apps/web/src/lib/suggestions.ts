import {
  dashboardResponseSchema,
  suggestionDetailResponseSchema,
  type ReviewAction,
} from '@docdrift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from './api';

const key = (id: string) => ['suggestion', id] as const;

export function useSuggestion(id: string) {
  return useQuery({
    queryKey: key(id),
    queryFn: () =>
      apiFetch(`/api/suggestions/${encodeURIComponent(id)}`, suggestionDetailResponseSchema),
  });
}

function useOnSaved(id: string) {
  const qc = useQueryClient();
  return (data: Awaited<ReturnType<typeof apiFetch<typeof suggestionDetailResponseSchema>>>) => {
    qc.setQueryData(key(id), data);
    // Status changes affect the analysis view, the dashboard and PR badges.
    void qc.invalidateQueries({ queryKey: ['analysis'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useEditSuggestion(id: string) {
  const onSaved = useOnSaved(id);
  return useMutation({
    mutationFn: (body: { content: string; version: number; note?: string }) =>
      apiFetch(
        `/api/suggestions/${encodeURIComponent(id)}/content`,
        suggestionDetailResponseSchema,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      ),
    onSuccess: onSaved,
  });
}

export function useDecision(id: string) {
  const onSaved = useOnSaved(id);
  return useMutation({
    mutationFn: (body: { action: Exclude<ReviewAction, 'EDIT'>; version: number; note?: string }) =>
      apiFetch(
        `/api/suggestions/${encodeURIComponent(id)}/decision`,
        suggestionDetailResponseSchema,
        postJson(body),
      ),
    onSuccess: onSaved,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch('/api/dashboard', dashboardResponseSchema),
  });
}
