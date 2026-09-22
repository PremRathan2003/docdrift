import { describe, expect, it } from 'vitest';
import { gettingStartedSteps, nextStep } from './getting-started';

const none = {
  githubInstallations: 0,
  repositoryCount: 0,
  analysisCount: 0,
  decidedSuggestions: 0,
};

describe('gettingStartedSteps', () => {
  it('starts with connecting GitHub for a new user', () => {
    const steps = gettingStartedSteps(none);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(nextStep(steps)?.id).toBe('github');
  });

  it('follows real progress', () => {
    const steps = gettingStartedSteps({ ...none, githubInstallations: 1, repositoryCount: 2 });
    expect(steps.map((s) => s.done)).toEqual([true, true, false, false]);
    expect(nextStep(steps)?.id).toBe('analysis');
  });

  it('has no next step once everything is done', () => {
    const steps = gettingStartedSteps({
      githubInstallations: 1,
      repositoryCount: 1,
      analysisCount: 3,
      decidedSuggestions: 1,
    });
    expect(nextStep(steps)).toBeNull();
  });
});
