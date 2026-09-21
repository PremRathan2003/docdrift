import { ApiStatus } from '../components/ApiStatus';
import { ThemeToggle } from '../components/ThemeToggle';

const steps = [
  {
    title: 'Connect a repository',
    body: 'Install the GitHub App on the repositories you choose — read-only by default.',
  },
  {
    title: 'Analyse a pull request',
    body: 'DocDrift reads the diff, finds related docs and asks an LLM for a structured, validated analysis.',
  },
  {
    title: 'Review every suggestion',
    body: 'Edit, approve or reject. Nothing is written to your repository without explicit approval.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="font-mono text-lg font-semibold">docdrift</span>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 sm:py-24">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Catch out-of-date documentation before you merge.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            DocDrift analyses GitHub pull requests, identifies documentation that may no longer
            match the code, and drafts updates for a human to review.
          </p>
          <div className="mt-6">
            <ApiStatus />
          </div>
        </section>

        <section aria-labelledby="how" className="pb-24">
          <h2 id="how" className="text-2xl font-semibold">
            How it works
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
              >
                <p className="font-mono text-sm text-indigo-600 dark:text-indigo-400">0{i + 1}</p>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
