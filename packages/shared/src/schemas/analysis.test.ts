import { describe, expect, it } from 'vitest';
import { analysisOutputSchema } from './analysis.js';

const valid = {
  summary: 'The user API response shape changed.',
  recommendations: [
    {
      documentationPath: 'README.md',
      reason: 'The documented response example no longer matches the controller.',
      evidence: [
        { filePath: 'src/controllers/userController.ts', detail: 'Renamed `name` to `fullName`.' },
      ],
      suggestedUpdate: 'Update the example response under "GET /users/:id".',
      modelConfidence: 0.8,
      uncertainty: 'The OpenAPI spec was not provided.',
    },
  ],
};

describe('analysisOutputSchema', () => {
  it('accepts a well-formed response', () => {
    expect(analysisOutputSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts "no documentation affected" as a valid answer', () => {
    const result = analysisOutputSchema.safeParse({
      summary: 'Internal refactor only.',
      recommendations: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence outside [0, 1]', () => {
    const bad = structuredClone(valid);
    bad.recommendations[0]!.modelConfidence = 1.5;
    expect(analysisOutputSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects path traversal and absolute paths', () => {
    for (const documentationPath of ['../secrets.md', '/etc/passwd', 'docs/../../x.md']) {
      const bad = structuredClone(valid);
      bad.recommendations[0]!.documentationPath = documentationPath;
      expect(analysisOutputSchema.safeParse(bad).success, documentationPath).toBe(false);
    }
  });

  it('requires at least one piece of evidence per recommendation', () => {
    const bad = structuredClone(valid);
    bad.recommendations[0]!.evidence = [];
    expect(analysisOutputSchema.safeParse(bad).success).toBe(false);
  });
});
