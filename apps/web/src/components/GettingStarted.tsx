import { Link } from 'react-router';
import { nextStep, type GettingStartedStep } from '../lib/getting-started';

/** Shown on the dashboard until the user has been through the whole flow once. */
export function GettingStarted({ steps }: { steps: GettingStartedStep[] }) {
  const next = nextStep(steps);
  if (!next) return null;
  const done = steps.filter((s) => s.done).length;

  return (
    <section
      aria-labelledby="getting-started"
      className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-900 dark:bg-indigo-950/30"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="getting-started" className="font-semibold">
          Getting started
        </h2>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {done} of {steps.length} done
        </span>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => {
          const current = s.id === next.id;
          return (
            <li key={s.id} className="flex items-start gap-3 text-sm">
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  s.done
                    ? 'bg-emerald-600 text-white'
                    : current
                      ? 'bg-indigo-600 text-white'
                      : 'border border-zinc-300 text-zinc-500 dark:border-zinc-700'
                }`}
              >
                {s.done ? '✓' : i + 1}
              </span>
              <div>
                {current ? (
                  <Link
                    to={s.href}
                    className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                  >
                    {s.title}
                  </Link>
                ) : (
                  <span className={s.done ? 'text-zinc-500 line-through' : ''}>{s.title}</span>
                )}
                <span className="sr-only">{s.done ? ' (done)' : current ? ' (next)' : ''}</span>
                {current && <p className="text-xs text-zinc-600 dark:text-zinc-400">{s.hint}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
