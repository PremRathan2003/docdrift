export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-screen place-items-center bg-white dark:bg-zinc-950">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-r-transparent"
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
