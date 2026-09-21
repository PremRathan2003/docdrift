import {
  AIProviderError,
  type AIProvider,
  type JsonGenerationRequest,
  type JsonGenerationResult,
} from '../../src/modules/ai/provider.js';

/** Scripted AI: each call returns (or throws) the next item. Records prompts for assertions. */
export class FakeAI implements AIProvider {
  readonly name = 'fake';
  readonly model = 'fake-model-1';
  readonly requests: JsonGenerationRequest[] = [];

  constructor(
    private readonly script: (
      | JsonGenerationResult
      | AIProviderError
      | ((req: JsonGenerationRequest) => JsonGenerationResult)
    )[],
  ) {}

  async generateJson(req: JsonGenerationRequest): Promise<JsonGenerationResult> {
    this.requests.push(req);
    const next = this.script[Math.min(this.requests.length - 1, this.script.length - 1)]!;
    if (next instanceof AIProviderError) throw next;
    return typeof next === 'function' ? next(req) : next;
  }
}

export const reply = (
  body: unknown,
  usage = { inputTokens: 1000, outputTokens: 200 },
): JsonGenerationResult => ({
  text: typeof body === 'string' ? body : JSON.stringify(body),
  usage,
  finishReason: 'STOP',
});
