import {
  AIProviderError,
  type AIProvider,
  type JsonGenerationRequest,
  type JsonGenerationResult,
} from './provider.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini supports a subset of JSON Schema for structured output. We keep the
 * structural keywords and drop the rest; Zod re-checks everything after the
 * response arrives, so the contract is unchanged — the schema only steers how
 * the model writes, it is not what enforces the rules.
 *
 * `minItems`, `maxItems` and `additionalProperties` are deliberately absent:
 * `npm run ai:diagnose` showed gemini-3.5-flash-lite answering HTTP 400
 * "invalid argument" to our schema until the array size limits were removed
 * (steps 4–6 failed, 6b passed). `minimum` and `maximum` survived that test
 * and stay.
 */
const ALLOWED_KEYS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'description',
  'minimum',
  'maximum',
  'anyOf',
  'format',
  'title',
]);
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v).map(([name, s]) => [name, toGeminiSchema(s)]));
    } else {
      out[k] = toGeminiSchema(v);
    }
  }
  return out;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

export interface GeminiOptions {
  /**
   * 'prompt' (default): ask for JSON via the MIME type and describe the schema in
   * the system instruction. 'native': also send it as responseJsonSchema, which
   * constrains decoding — the model then cannot produce a broken string, the
   * failure that made case 105 of the evaluation fail intermittently.
   * The default stays 'prompt' because acceptance is per model: run
   * `npm run ai:diagnose` and turn on AI_NATIVE_SCHEMA if it passes. Zod
   * validation and retries make both modes safe.
   */
  schemaMode?: 'prompt' | 'native';
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly schemaMode: 'prompt' | 'native';

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
    options: GeminiOptions = {},
  ) {
    this.schemaMode = options.schemaMode ?? 'prompt';
  }

  async generateJson(req: JsonGenerationRequest): Promise<JsonGenerationResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${BASE_URL}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    this.schemaMode === 'prompt'
                      ? `${req.system}\n\nRespond with one JSON object that matches this JSON Schema exactly:\n${JSON.stringify(req.jsonSchema)}`
                      : req.system,
                },
              ],
            },
            contents: [{ role: 'user', parts: [{ text: req.user }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              ...(this.schemaMode === 'native'
                ? { responseJsonSchema: toGeminiSchema(req.jsonSchema) }
                : {}),
              // Temperature stays at the model default: Google advises against
              // lowering it for Gemini 3 models (it can cause repetitive output).
              maxOutputTokens: req.maxOutputTokens,
            },
          }),
          signal: AbortSignal.timeout(req.timeoutMs),
        },
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new AIProviderError('AI_TIMEOUT', `Gemini did not answer within ${req.timeoutMs} ms`);
      }
      throw new AIProviderError('AI_UNAVAILABLE', 'Could not reach Gemini');
    }

    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      // The API key is sent in a header, never in the URL, so error messages can't contain it.
      const detail = body.error?.message ? `: ${body.error.message.slice(0, 300)}` : '';
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after')) || 30;
        throw new AIProviderError(
          'AI_RATE_LIMITED',
          `Gemini rate limit or quota reached${detail}`,
          retry,
        );
      }
      if (res.status === 401 || res.status === 403) {
        // A 403 without Google's JSON error body came from something in between (proxy, firewall).
        if (!body.error)
          throw new AIProviderError(
            'AI_UNAVAILABLE',
            `Request blocked before reaching Gemini (HTTP ${res.status})`,
          );
        throw new AIProviderError(
          'AI_AUTH',
          `Gemini rejected the API key or model access${detail}`,
        );
      }
      if (res.status >= 500)
        throw new AIProviderError('AI_UNAVAILABLE', `Gemini error ${res.status}${detail}`);
      throw new AIProviderError(
        'AI_BAD_REQUEST',
        `Gemini rejected the request (${res.status})${detail}`,
      );
    }

    if (body.promptFeedback?.blockReason) {
      throw new AIProviderError(
        'AI_BLOCKED',
        `Gemini blocked the prompt (${body.promptFeedback.blockReason})`,
      );
    }
    const candidate = body.candidates?.[0];
    const finishReason = candidate?.finishReason ?? null;
    if (
      finishReason === 'SAFETY' ||
      finishReason === 'BLOCKLIST' ||
      finishReason === 'RECITATION'
    ) {
      throw new AIProviderError('AI_BLOCKED', `Gemini stopped the answer (${finishReason})`);
    }
    if (finishReason === 'MAX_TOKENS') {
      throw new AIProviderError(
        'AI_TRUNCATED',
        'Gemini hit the output token limit; the answer is incomplete',
      );
    }
    // Skip "thought" parts (thinking models) — only the answer is JSON.
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('');

    const usage = body.usageMetadata;
    return {
      text,
      finishReason,
      usage: {
        inputTokens: usage?.promptTokenCount ?? null,
        // Thinking tokens are billed as output tokens.
        outputTokens:
          usage?.candidatesTokenCount !== undefined
            ? usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0)
            : null,
      },
    };
  }
}
