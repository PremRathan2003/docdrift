import { describe, expect, it } from 'vitest';
import { OpenAICompatibleProvider, providerLabel } from './openai-compatible.js';
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
  const p = new OpenAICompatibleProvider(
    'https://api.groq.com/openai/v1/',
    'test-key',
    'openai/gpt-oss-120b',
    fetchImpl,
  );
  return { p, calls };
}

const ok = (content: string, finish = 'stop') => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 120, completion_tokens: 80 },
});

async function failure(status: number, body: unknown, headers?: Record<string, string>) {
  const { p } = provider(status, body, headers);
  try {
    await p.generateJson(req);
  } catch (e) {
    if (e instanceof AIProviderError) return e;
    throw e;
  }
  throw new Error('expected an AIProviderError');
}

describe('OpenAICompatibleProvider', () => {
  it('posts a chat completion with the key in a header and JSON mode on', async () => {
    const { p, calls } = provider(200, ok('{"a":1}'));
    expect(await p.generateJson(req)).toEqual({
      text: '{"a":1}',
      finishReason: 'stop',
      usage: { inputTokens: 120, outputTokens: 80 },
    });
    const { url, init } = calls[0]!;
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: 'openai/gpt-oss-120b',
      response_format: { type: 'json_object' },
      max_completion_tokens: 100,
    });
    expect(body.messages[0].content).toMatch(
      /^sys\n\nRespond with one JSON object[\s\S]*"type":"object"/,
    );
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' });
    expect(p.name).toBe('groq');
  });

  it('passes server-side JSON failures on to validation (and so to a retry)', async () => {
    const { p } = provider(400, {
      error: { code: 'json_validate_failed', message: 'bad json', failed_generation: 'Sure! {' },
    });
    expect(await p.generateJson(req)).toMatchObject({ text: 'Sure! {' });
  });

  it('maps HTTP errors to provider error codes', async () => {
    const limited = await failure(429, { error: { message: 'slow down' } }, { 'retry-after': '7' });
    expect(limited).toMatchObject({ code: 'AI_RATE_LIMITED', retryAfterSeconds: 7 });
    expect(limited.transient).toBe(true);
    expect(await failure(401, { error: { message: 'bad key' } })).toMatchObject({
      code: 'AI_AUTH',
    });
    expect(await failure(413, { error: { message: 'too big' } })).toMatchObject({
      code: 'AI_BAD_REQUEST',
    });
    expect(await failure(503, {})).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(await failure(400, { error: { message: 'no such model' } })).toMatchObject({
      code: 'AI_BAD_REQUEST',
    });
  });

  it('refuses truncated or filtered answers', async () => {
    expect(await failure(200, ok('{"a":', 'length'))).toMatchObject({ code: 'AI_TRUNCATED' });
    expect(await failure(200, ok('', 'content_filter'))).toMatchObject({ code: 'AI_BLOCKED' });
  });

  it('never puts the key in error messages', async () => {
    const err = await failure(401, { error: { message: 'Invalid API Key' } });
    expect(err.message).not.toContain('test-key');
  });

  it('labels known providers by host', () => {
    expect(providerLabel('https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(providerLabel('http://localhost:11434/v1')).toBe('local');
    expect(providerLabel('https://llm.example.com/v1')).toBe('llm.example.com');
  });
});
