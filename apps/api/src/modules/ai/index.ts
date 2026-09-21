import type { Env } from '../../config/env.js';
import { GeminiProvider } from './gemini.js';
import type { AIProvider } from './provider.js';

export function createAIProvider(env: Env, fetchImpl?: typeof fetch): AIProvider | null {
  if (env.AI_PROVIDER === 'gemini') {
    return new GeminiProvider(env.AI_API_KEY!, env.AI_MODEL!, fetchImpl, {
      schemaMode: env.AI_NATIVE_SCHEMA ? 'native' : 'prompt',
    });
  }
  return null;
}

export * from './provider.js';
