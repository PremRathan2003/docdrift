import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-white p-4 text-center text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <Link to="/" className="mt-4 inline-block text-indigo-600 underline dark:text-indigo-400">
          Back to home
        </Link>
      </div>
    </main>
  );
}
