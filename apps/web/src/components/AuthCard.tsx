import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ThemeToggle } from './ThemeToggle';

export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link to="/" className="font-mono text-lg font-semibold">
          docdrift
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-sm px-4 pb-16 pt-8 sm:pt-16">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">{footer}</p>
      </main>
    </div>
  );
}
