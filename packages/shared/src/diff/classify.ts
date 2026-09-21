/**
 * Classifies a changed file by its path. Used by the UI (badges, "documentation
 * changes") and by the analysis pipeline (what to send to the LLM and what to skip).
 *
 * Path rules are deliberately simple and explainable. Order matters: the
 * first matching rule wins (e.g. a lockfile is "generated", not "config").
 */
export type FileKind =
  'documentation' | 'source' | 'test' | 'config' | 'generated' | 'binary' | 'other';

const lower = (p: string) => p.toLowerCase();
const base = (p: string) => lower(p).split('/').pop() ?? '';
const ext = (p: string) => {
  const b = base(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1) : '';
};

const GENERATED_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'cargo.lock',
  'composer.lock',
  'gemfile.lock',
  'go.sum',
]);
const GENERATED_DIRS = [
  'dist/',
  'build/',
  'node_modules/',
  'vendor/',
  'coverage/',
  '.next/',
  'generated/',
];
const BINARY_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'pdf',
  'zip',
  'gz',
  'tgz',
  'jar',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'mp4',
  'mov',
  'mp3',
  'wav',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'class',
  'pyc',
]);
const DOC_EXT = new Set(['md', 'mdx', 'rst', 'adoc', 'txt']);
const DOC_NAMES = new Set([
  'readme',
  'contributing',
  'changelog',
  'license',
  'authors',
  'security',
  'code_of_conduct',
]);
const API_SPEC = /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/;
const TEST =
  /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/;
const SOURCE_EXT = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'java',
  'kt',
  'go',
  'rs',
  'rb',
  'php',
  'cs',
  'c',
  'h',
  'cpp',
  'hpp',
  'swift',
  'scala',
  'vue',
  'svelte',
  'sql',
  'sh',
  'graphql',
  'prisma',
  'css',
  'scss',
  'html',
]);
const CONFIG_EXT = new Set([
  'json',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'properties',
]);
const CONFIG_NAMES = new Set([
  'dockerfile',
  'makefile',
  '.env.example',
  '.gitignore',
  '.nvmrc',
  '.editorconfig',
]);

export function classifyFile(path: string): FileKind {
  const p = lower(path);
  const b = base(path);
  const e = ext(path);

  if (
    GENERATED_FILES.has(b) ||
    GENERATED_DIRS.some((d) => p.startsWith(d) || p.includes(`/${d}`)) ||
    /\.min\.(js|css)$/.test(p)
  ) {
    return 'generated';
  }
  if (BINARY_EXT.has(e)) return 'binary';
  // API specs describe behaviour, so they count as documentation even though they're YAML/JSON.
  if (
    API_SPEC.test(p) ||
    DOC_EXT.has(e) ||
    DOC_NAMES.has(b.replace(/\.[^.]+$/, '')) ||
    p.startsWith('docs/') ||
    p.includes('/docs/')
  ) {
    return 'documentation';
  }
  if (TEST.test(p)) return 'test';
  if (SOURCE_EXT.has(e)) return 'source';
  if (CONFIG_EXT.has(e) || CONFIG_NAMES.has(b) || b.startsWith('.env') || p.startsWith('.github/'))
    return 'config';
  return 'other';
}
