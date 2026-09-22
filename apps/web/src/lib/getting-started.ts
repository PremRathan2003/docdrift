/**
 * The "Getting started" checklist on the dashboard. Each step is worked out
 * from real data (GitHub status and the dashboard summary), never stored, so
 * it can't drift from what the user has actually done.
 */
export interface GettingStartedInput {
  githubInstallations: number;
  repositoryCount: number;
  analysisCount: number;
  decidedSuggestions: number;
}

export interface GettingStartedStep {
  id: 'github' | 'repository' | 'analysis' | 'review';
  title: string;
  hint: string;
  href: string;
  done: boolean;
}

export function gettingStartedSteps(input: GettingStartedInput): GettingStartedStep[] {
  return [
    {
      id: 'github',
      title: 'Connect GitHub',
      hint: 'Install the read-only DocDrift app on the repositories you choose.',
      href: '/repositories',
      done: input.githubInstallations > 0,
    },
    {
      id: 'repository',
      title: 'Connect a repository',
      hint: 'Pick which of those repositories DocDrift should work with.',
      href: '/repositories',
      done: input.repositoryCount > 0,
    },
    {
      id: 'analysis',
      title: 'Analyse a pull request',
      hint: 'Open a pull request and click Run analysis.',
      href: '/repositories',
      done: input.analysisCount > 0,
    },
    {
      id: 'review',
      title: 'Review a suggestion',
      hint: 'Approve or reject what the AI suggested — nothing changes without you.',
      href: '/dashboard#pending',
      done: input.decidedSuggestions > 0,
    },
  ];
}

/** The first step that isn't done yet, or null once the user has done them all. */
export function nextStep(steps: GettingStartedStep[]) {
  return steps.find((s) => !s.done) ?? null;
}
