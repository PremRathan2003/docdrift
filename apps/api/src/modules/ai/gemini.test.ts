import { describe, expect, it } from 'vitest';
import { GeminiProvider, toGeminiSchema } from './gemini.js';
import { AIProviderError } from './provider.js';

const req = {
  system: 'sys',
  user: 'hello',
  jsonSchema: { type: 'object' },
  maxOutputTokens: 100,
  timeoutMs: 1000,
};

function provider(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  }) as unknown as typeof fetch;
  return { p: new GeminiProvider('test-key', 'gemini-test', fetchImpl), calls };
}

describe('GeminiProvider', () => {
  it('sends the key in a header (never the URL) and asks for JSON output', async () => {
    const { p, calls } = provider(200, {
      candidates: [
        {
          content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":1}' }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50 },
    });
    const result = await p.generateJson(req);
    expect(result).toEqual({
      text: '{"a":1}',
      finishReason: 'STOP',
      usage: { inputTokens: 120, outputTokens: 80 },
    });

    const { url, init } = calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    );
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig).toEqual({
      responseMimeType: 'application/json',
      maxOutputTokens: 100,
    });
    // Default "prompt" mode: the schema travels in the system instruction.
    expect(body.systemInstruction.parts[0].text).toMatch(
      /^sys\n\nRespond with one JSON object[\s\S]*"type":"object"/,
    );
  });

  it('can send the schema natively when configured', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }],
        }),
      );
    }) as unknown as typeof fetch;
    await new GeminiProvider('k', 'm', fetchImpl, { schemaMode: 'native' }).generateJson({
      ...req,
      jsonSchema: { type: 'object', properties: { a: { type: 'string', minLength: 1 } } },
    });
    const body = JSON.parse(String(calls[0]!.body));
    expect(body.generationConfig.responseJsonSchema).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
    expect(body.systemInstruction.parts[0].text).toBe('sys');
  });

  it.each([
    [429, { error: { message: 'quota' } }, 'AI_RATE_LIMITED'],
    [403, { error: { message: 'API key not valid' } }, 'AI_AUTH'],
    [400, { error: { message: 'model not found' } }, 'AI_BAD_REQUEST'],
    [503, {}, 'AI_UNAVAILABLE'],
    [200, { promptFeedback: { blockReason: 'SAFETY' } }, 'AI_BLOCKED'],
    [
      200,
      { candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }] },
      'AI_TRUNCATED',
    ],
  ])('maps HTTP %i to %s', async (status, body, code) => {
    const { p } = provider(status, body);
    await expect(p.generateJson(req)).rejects.toMatchObject({ code });
  });

  it('marks only transient errors as retryable', () => {
    expect(new AIProviderError('AI_RATE_LIMITED', 'x').transient).toBe(true);
    expect(new AIProviderError('AI_TIMEOUT', 'x').transient).toBe(true);
    expect(new AIProviderError('AI_AUTH', 'x').transient).toBe(false);
  });

  it('turns timeouts into AI_TIMEOUT', async () => {
    const p = new GeminiProvider('k', 'm', (async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch);
    await expect(p.generateJson(req)).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });
});

describe('toGeminiSchema', () => {
  it('keeps structure and drops the keywords Gemini rejects', () => {
    // Array size limits and additionalProperties made the API answer HTTP 400
    // (ai:diagnose steps 4-6); the value bounds on a number did not.
    expect(
      toGeminiSchema({
        $schema: 'x',
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 5 },
          tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
          score: { type: 'number', minimum: 0, maximum: 1 },
          scope: { type: 'string', enum: ['file', 'section'] },
        },
        required: ['name'],
        additionalProperties: false,
      }),
    ).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        score: { type: 'number', minimum: 0, maximum: 1 },
        scope: { type: 'string', enum: ['file', 'section'] },
      },
      required: ['name'],
    });
  });
});
