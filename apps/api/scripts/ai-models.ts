/**
 * Lists the models your API key can use (Gemini, or any OpenAI-compatible
 * service), so you can pick another one (free-tier limits are per model).
 *   npm run ai:models -w @docdrift/api
 * Prints only model ids and names, never the key.
 */
import { loadAiEnv } from '../src/config/env.js';

const env = loadAiEnv();
if (env.AI_PROVIDER === 'openai-compatible') {
  // The standard /models endpoint: every OpenAI-compatible service has it.
  const res = await fetch(`${env.AI_BASE_URL!.replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${env.AI_API_KEY!}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error(`✗ ${env.AI_BASE_URL} answered HTTP ${res.status}`);
    process.exit(1);
  }
  const body = (await res.json()) as { data?: { id: string; owned_by?: string }[] };
  const ids = (body.data ?? []).map((m) => m.id).sort();
  console.warn(`Models at ${env.AI_BASE_URL} (current: ${env.AI_MODEL}):\n`);
  for (const id of ids) console.warn(`  ${id === env.AI_MODEL ? '*' : ' '} ${id}`);
  console.warn(
    "\nThe list includes speech/guard models; use a chat model. Check your plan's limits in the provider's console.",
  );
  process.exit(0);
}
if (env.AI_PROVIDER !== 'gemini') {
  console.error('✗ No AI provider configured (AI_PROVIDER in apps/api/.env)');
  process.exit(1);
}
interface ModelList {
  models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  nextPageToken?: string;
}

const models: NonNullable<ModelList['models']> = [];
let pageToken = '';
do {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`,
    { headers: { 'x-goog-api-key': env.AI_API_KEY! }, signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) {
    console.error(`✗ Gemini answered HTTP ${res.status}`);
    process.exit(1);
  }
  const body = (await res.json()) as ModelList;
  models.push(...(body.models ?? []));
  pageToken = body.nextPageToken ?? '';
} while (pageToken);

const usable = models
  .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
  .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName ?? '' }))
  .filter((m) => /gemini/i.test(m.id))
  .sort((a, b) => a.id.localeCompare(b.id));

console.warn(`Models your key can call with generateContent (current: ${env.AI_MODEL}):\n`);
for (const m of usable)
  console.warn(`  ${m.id === env.AI_MODEL ? '*' : ' '} ${m.id.padEnd(40)} ${m.name}`);
console.warn(
  '\nListed ≠ free: check which have free-tier quota at https://aistudio.google.com/rate-limit',
);
