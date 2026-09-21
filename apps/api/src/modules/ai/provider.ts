/**
 * The only thing the analysis pipeline knows about LLMs. Swapping Gemini for
 * another provider means writing one new class that implements this.
 */
export interface JsonGenerationRequest {
  system: string;
  user: string;
  /** JSON Schema the provider should constrain its output to (if it supports that). */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface JsonGenerationResult {
  /** Raw text the model produced; the caller parses and validates it. */
  text: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
  finishReason: string | null;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateJson(req: JsonGenerationRequest): Promise<JsonGenerationResult>;
}

export type AIErrorCode =
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_AUTH' // bad or revoked API key
  | 'AI_BAD_REQUEST' // e.g. unknown model name, schema rejected
  | 'AI_UNAVAILABLE' // 5xx or network
  | 'AI_BLOCKED' // provider safety filter refused
  | 'AI_TRUNCATED'; // hit the output token limit

export class AIProviderError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }

  /** Worth retrying the same request? */
  get transient() {
    return (
      this.code === 'AI_TIMEOUT' ||
      this.code === 'AI_RATE_LIMITED' ||
      this.code === 'AI_UNAVAILABLE'
    );
  }
}
