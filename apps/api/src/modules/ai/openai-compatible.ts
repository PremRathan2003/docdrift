import {
  AIProviderError,
  type AIProvider,
  type JsonGenerationRequest,
  type JsonGenerationResult,
} from './provider.js';

/**
 * Any service that speaks OpenAI's Chat Completions format: Groq, OpenRouter,
 * Cerebras, OpenAI itself, or a local Ollama. One class, many providers; the
 * base URL in .env picks which.
 *
 * JSON is requested with `response_format: json_object` (widely supported) and
 * the schema is described in the system message, the same "prompt" mode that
 * works for Gemini. Zod validation and retries in the pipeline do the rest.
 */

/** Short names for reports ("groq/openai/gpt-oss-120b"); unknown hosts use the hostname. */
const KNOWN_HOSTS: Record<string, string> = {
  'api.groq.com': 'groq',
  'openrouter.ai': 'openrouter',
  'api.cerebras.ai': 'cerebras',
  'api.openai.com': 'openai',
  'api.mistral.ai': 'mistral',
  localhost: 'local',
  '127.0.0.1': 'local',
};

export function providerLabel(baseUrl: string): string {
  const host = new URL(baseUrl).hostname;
  return KNOWN_HOSTS[host] ?? host;
}

interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | null; failed_generation?: string };
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.name = providerLabel(this.baseUrl);
  }

  async generateJson(req: JsonGenerationRequest): Promise<JsonGenerationResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Sent in a header only, so it can't end up in URLs or logs of URLs.
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `${req.system}\n\nRespond with one JSON object that matches this JSON Schema exactly:\n${JSON.stringify(req.jsonSchema)}`,
            },
            { role: 'user', content: req.user },
          ],
          response_format: { type: 'json_object' },
          // Reasoning models count their thinking against this limit too.
          max_completion_tokens: req.maxOutputTokens,
        }),
        signal: AbortSignal.timeout(req.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new AIProviderError(
          'AI_TIMEOUT',
          `${this.name} did not answer within ${req.timeoutMs} ms`,
        );
      }
      throw new AIProviderError('AI_UNAVAILABLE', `Could not reach ${this.name}`);
    }

    const body = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok) {
      const detail = body.error?.message ? `: ${body.error.message.slice(0, 300)}` : '';
      // JSON mode is enforced server-side on some providers (Groq): a malformed
      // answer comes back as a 400. Hand the text to the pipeline, whose
      // validation fails it and retries, exactly like any other bad output.
      if (res.status === 400 && body.error?.code === 'json_validate_failed') {
        return {
          text: body.error.failed_generation ?? '',
          finishReason: 'json_validate_failed',
          usage: { inputTokens: null, outputTokens: null },
        };
      }
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after')) || 30;
        throw new AIProviderError(
          'AI_RATE_LIMITED',
          `${this.name} rate limit or quota reached${detail}`,
          retry,
        );
      }
      if (res.status === 401 || res.status === 403)
        throw new AIProviderError(
          'AI_AUTH',
          `${this.name} rejected the API key or model access${detail}`,
        );
      if (res.status === 413)
        throw new AIProviderError(
          'AI_BAD_REQUEST',
          `${this.name}: request too large for this model or plan${detail}. Lower AI_MAX_INPUT_TOKENS.`,
        );
      if (res.status >= 500)
        throw new AIProviderError('AI_UNAVAILABLE', `${this.name} error ${res.status}${detail}`);
      throw new AIProviderError(
        'AI_BAD_REQUEST',
        `${this.name} rejected the request (${res.status})${detail}`,
      );
    }

    const choice = body.choices?.[0];
    const finishReason = choice?.finish_reason ?? null;
    if (finishReason === 'length')
      throw new AIProviderError(
        'AI_TRUNCATED',
        `${this.name} hit the output token limit; the answer is incomplete`,
      );
    if (finishReason === 'content_filter')
      throw new AIProviderError('AI_BLOCKED', `${this.name} stopped the answer (content filter)`);

    return {
      text: choice?.message?.content ?? '',
      finishReason,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
      },
    };
  }
}
