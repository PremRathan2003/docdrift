/**
 * Verifies your AI provider settings with one tiny request that contains no
 * repository data.  npm run ai:check -w @docdrift/api
 */
import { analysisOutputSchema } from '@docdrift/shared';
import { z } from 'zod';
import { loadEnv } from '../src/config/env.js';
import { AIProviderError, createAIProvider } from '../src/modules/ai/index.js';
import { parseModelOutput } from '../src/modules/analysis/validate.js';

async function main() {
  const env = loadEnv();
  const ai = createAIProvider(env);
  if (!ai) {
    console.error(
      '✗ No AI provider configured: set AI_PROVIDER, AI_API_KEY and AI_MODEL in apps/api/.env',
    );
    process.exit(1);
  }
  console.warn(`… Asking ${ai.name} (${ai.model}) for a structured test answer`);
  const started = Date.now();
  // Same retry rule as real analyses: transient errors (overload, rate limit) get up to 3 tries.
  const ask = () => {
    return ai.generateJson({
      system: 'You check documentation. Reply with the JSON schema given.',
      user:
        'A code change renamed the JSON field "done" to "completed". The README (docs path: README.md) still shows "done". ' +
        'The changed file is src/store.js. Return one recommendation.',
      jsonSchema: z.toJSONSchema(analysisOutputSchema) as Record<string, unknown>,
      // Room for "thinking" tokens, within the configured limit (free tiers may count it).
      maxOutputTokens: Math.min(8192, env.AI_MAX_OUTPUT_TOKENS),
      timeoutMs: env.AI_TIMEOUT_MS,
    });
  };
  let result: Awaited<ReturnType<typeof ask>> | undefined;
  for (let attempt = 1; !result; attempt++) {
    try {
      result = await ask();
    } catch (err) {
      if (!(err instanceof AIProviderError) || !err.transient || attempt === 3) throw err;
      const wait = Math.min(err.retryAfterSeconds ?? 5 * attempt, 20);
      console.warn(`! ${err.code} (${err.message.slice(0, 80)}…) — retrying in ${wait} s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  const parsed = parseModelOutput(result.text);
  console.warn(
    `✓ Response in ${Date.now() - started} ms · tokens in/out: ${result.usage.inputTokens ?? '?'}/${result.usage.outputTokens ?? '?'}`,
  );
  if (!parsed.ok) {
    console.error(
      `✗ The answer did not match DocDrift's schema (${parsed.reason}: ${parsed.detail})`,
    );
    process.exit(1);
  }
  console.warn(
    `✓ Structured output valid · ${parsed.output.recommendations.length} recommendation(s)`,
  );
  console.warn(`  Summary: ${parsed.output.summary.slice(0, 160)}`);
}

main().catch((err) => {
  console.error(
    '✗',
    err instanceof AIProviderError
      ? `${err.code}: ${err.message}`
      : err instanceof Error
        ? err.message
        : err,
  );
  process.exit(1);
});
