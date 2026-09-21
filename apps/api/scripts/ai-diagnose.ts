/**
 * Pinpoints which part of a Gemini request is rejected, by sending a series of
 * small requests that add one feature at a time. Sends no repository data and
 * prints only status codes and Gemini's error messages (never the key).
 *   npm run ai:diagnose -w @docdrift/api
 */
import { analysisOutputSchema } from '@docdrift/shared';
import { z } from 'zod';
import { loadEnv } from '../src/config/env.js';
import { toGeminiSchema } from '../src/modules/ai/gemini.js';

const env = loadEnv();
if (env.AI_PROVIDER !== 'gemini') {
  console.error('✗ AI_PROVIDER is not gemini');
  process.exit(1);
}
const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.AI_MODEL!)}:generateContent`;
const full = toGeminiSchema(z.toJSONSchema(analysisOutputSchema)) as Record<string, unknown>;
const withoutAdditional = JSON.parse(
  JSON.stringify(full, (k, v) => (k === 'additionalProperties' ? undefined : v)),
);
const tiny = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] };
const contents = [{ role: 'user', parts: [{ text: 'Reply with a JSON object. Say hello.' }] }];

const variants: [string, Record<string, unknown>][] = [
  ['1 plain request', { contents }],
  ['2 + JSON mime type', { contents, generationConfig: { responseMimeType: 'application/json' } }],
  [
    '3 + tiny responseJsonSchema',
    {
      contents,
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: tiny },
    },
  ],
  [
    '4 + DocDrift responseJsonSchema',
    {
      contents,
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: full },
    },
  ],
  [
    '5 + same, no additionalProperties',
    {
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: withoutAdditional,
      },
    },
  ],
  [
    '6 + DocDrift as responseSchema',
    {
      contents,
      generationConfig: { responseMimeType: 'application/json', responseSchema: withoutAdditional },
    },
  ],
  ['7 + temperature 0.2', { contents, generationConfig: { temperature: 0.2 } }],
  ['8 + maxOutputTokens 8192', { contents, generationConfig: { maxOutputTokens: 8192 } }],
  [
    '9 + systemInstruction',
    { contents, systemInstruction: { parts: [{ text: 'You are concise.' }] } },
  ],
];

for (const [name, body] of variants) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.AI_API_KEY! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    console.warn(
      `${res.ok ? '✓' : '✗'} ${name}: HTTP ${res.status}${json.error?.message ? ` — ${json.error.message.slice(0, 300)}` : ''}`,
    );
  } catch (err) {
    console.warn(`✗ ${name}: ${err instanceof Error ? err.message : err}`);
  }
}
