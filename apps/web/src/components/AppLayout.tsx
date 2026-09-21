import { Link, Outlet } from 'react-router';
import { useCurrentUser } from '../lib/auth';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

/** Shell for signed-in pages. Only rendered inside <RequireAuth>, so user is set. */
export function AppLayout() {
  const { data: user } = useCurrentUser();
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-3 focus:py-2 dark:focus:bg-zinc-900"
      >
        Skip to content
      </a>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="font-mono text-lg font-semibold">
            docdrift
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user && <UserMenu user={user} />}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
