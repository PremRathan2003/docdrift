import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { useCurrentUser } from '../lib/auth';
import { safeNextPath } from '../lib/safe-redirect';
import { Alert } from './ui/Alert';
import { FullPageSpinner } from './FullPageSpinner';

/**
 * Pages inside this route need a signed-in user. Signed-out visitors go to
 * /login?next=<where they wanted to go>.
 *
 * This is a UX convenience, not security: the API checks the session on
 * every request, so hiding a page in the browser protects nothing by itself.
 */
export function RequireAuth() {
  const { data: user, isPending, isError } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <FullPageSpinner />;
  if (isError) {
    return (
      <div className="mx-auto max-w-md p-8">
        <Alert>Could not reach the server. Is the API running?</Alert>
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** Login/register pages: already signed-in users are sent on to the app. */
export function GuestOnly() {
  const { data: user, isPending } = useCurrentUser();
  const [params] = useSearchParams();
  if (isPending) return <FullPageSpinner />;
  if (user) return <Navigate to={safeNextPath(params.get('next'))} replace />;
  return <Outlet />;
}
