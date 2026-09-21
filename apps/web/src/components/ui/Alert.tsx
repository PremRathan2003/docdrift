import type { ReactNode } from 'react';

export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'info';
}) {
  const colours =
    tone === 'error'
      ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200'
      : 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200';
  // role="alert" makes screen readers announce it as soon as it appears.
  return (
    <div role="alert" className={`rounded-md border px-3 py-2 text-sm ${colours}`}>
      {children}
    </div>
  );
}
