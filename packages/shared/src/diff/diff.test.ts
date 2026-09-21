import { describe, expect, it } from 'vitest';
import { classifyFile } from './classify.js';
import { parsePatch } from './parse-patch.js';

describe('classifyFile', () => {
  it.each([
    ['README.md', 'documentation'],
    ['docs/api/users.md', 'documentation'],
    ['packages/web/docs/setup.txt', 'documentation'],
    ['openapi.yaml', 'documentation'],
    ['api/swagger.v2.json', 'documentation'],
    ['CONTRIBUTING', 'documentation'],
    ['src/routes/tasks.js', 'source'],
    ['app/models/user.py', 'source'],
    ['src/routes/tasks.test.js', 'test'],
    ['tests/test_models.py', 'test'],
    ['pkg/handler_test.go', 'test'],
    ['package.json', 'config'],
    ['.github/workflows/ci.yml', 'config'],
    ['.env.example', 'config'],
    ['Dockerfile', 'config'],
    ['package-lock.json', 'generated'],
    ['dist/bundle.js', 'generated'],
    ['public/app.min.js', 'generated'],
    ['assets/logo.png', 'binary'],
    ['LICENSE.txt', 'documentation'],
    ['something.weird', 'other'],
  ])('%s → %s', (path, kind) => {
    expect(classifyFile(path)).toBe(kind);
  });
});

describe('parsePatch', () => {
  const patch = [
    '@@ -1,4 +1,5 @@ const express = require("express");',
    ' line one',
    '-old two',
    '+new two',
    '+added three',
    ' line four',
    '@@ -20,2 +21,2 @@',
    '-a',
    '+b',
    '\\ No newline at end of file',
  ].join('\n');

  it('splits hunks and tracks old/new line numbers', () => {
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.lines).toEqual([
      { type: 'context', content: 'line one', oldLine: 1, newLine: 1 },
      { type: 'del', content: 'old two', oldLine: 2, newLine: null },
      { type: 'add', content: 'new two', oldLine: null, newLine: 2 },
      { type: 'add', content: 'added three', oldLine: null, newLine: 3 },
      { type: 'context', content: 'line four', oldLine: 3, newLine: 4 },
    ]);
    expect(hunks[1]).toMatchObject({ oldStart: 20, newStart: 21 });
    expect(hunks[1]!.lines.at(-1)).toMatchObject({ type: 'note' });
  });

  it('handles single-line hunk headers, CRLF and empty input', () => {
    const [h] = parsePatch('@@ -3 +3 @@\r\n-x\r\n+y');
    expect(h!.lines.map((l) => l.type)).toEqual(['del', 'add']);
    expect(parsePatch('')).toEqual([]);
    expect(parsePatch('Binary files differ')).toEqual([]);
  });
});
