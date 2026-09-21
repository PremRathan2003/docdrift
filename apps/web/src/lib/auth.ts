import {
  meResponseSchema,
  type LoginRequest,
  type PublicUser,
  type RegisterRequest,
} from '@docdrift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, apiSend, postJson } from './api';

export const meQueryKey = ['auth', 'me'] as const;

/**
 * The current user, or null when signed out. The browser can't read the
 * httpOnly cookie, so "am I logged in?" is always answered by the API.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<PublicUser | null> => {
      try {
        return (await apiFetch('/api/auth/me', meResponseSchema)).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginRequest) =>
      apiFetch('/api/auth/login', meResponseSchema, postJson(input)),
    onSuccess: ({ user }) => queryClient.setQueryData(meQueryKey, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterRequest) =>
      apiFetch('/api/auth/register', meResponseSchema, postJson(input)),
    onSuccess: ({ user }) => queryClient.setQueryData(meQueryKey, user),
  });
}

/** everywhere=true ends the user's sessions on all devices. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts: { everywhere?: boolean } = {}) =>
      apiSend(opts.everywhere ? '/api/auth/logout-all' : '/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Drop *all* cached data: nothing from the previous user may leak to the next one.
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}
