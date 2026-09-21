import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('keeps paths on our own site', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/repos/abc?tab=prs#top')).toBe('/repos/abc?tab=prs#top');
  });

  it('falls back for missing values', () => {
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
  });

  it('rejects anything that could leave the site', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'evil.example/path',
    ]) {
      expect(safeNextPath(bad), bad).toBe('/dashboard');
    }
  });
});
