import { z } from 'zod';

/**
 * All configuration comes from environment variables and is validated once at
 * startup. If something is missing we crash immediately with a clear message,
 * instead of failing later in a confusing way.
 */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const GITHUB_VARS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_PRIVATE_KEY_BASE64',
] as const;

/**
 * The AI settings, kept separate so a tool that only talks to a model can
 * validate only those. The eval harness needs no database and no GitHub App;
 * refusing to run because one of those is half-configured wastes the user's
 * time on a problem it doesn't have.
 */
const aiFields = {
  // AI provider (optional: without it, analysis answers 503 AI_NOT_CONFIGURED).
  AI_PROVIDER: z.enum(['gemini', 'openai-compatible', 'none']).default('none'),
  /**
   * For openai-compatible: the API base URL, e.g. https://api.groq.com/openai/v1.
   * HTTPS only, except a local server (Ollama) on localhost.
   */
  AI_BASE_URL: optionalString.pipe(
    z
      .string()
      .url()
      .refine(
        (u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u),
        {
          message: 'must be an https:// URL (http:// only for localhost)',
        },
      )
      .optional(),
  ),
  AI_API_KEY: optionalString,
  AI_MODEL: optionalString,
  /** Send the output schema to the provider natively (only if the model accepts it; see ai:diagnose). */
  AI_NATIVE_SCHEMA: z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
  /** Rough budget for one analysis prompt; content beyond it is skipped and reported. */
  AI_MAX_INPUT_TOKENS: z.coerce.number().int().min(2_000).max(1_000_000).default(30_000),
  /**
   * Output limit per call, including a reasoning model's thinking. Some free
   * tiers count the requested limit against tokens-per-minute (e.g. Groq), so
   * lower it there (e.g. 6000).
   */
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1_000).max(65_536).default(16_384),
  /** Prices in USD per 1M tokens. Only if set do we compute a cost — never guessed. */
  AI_INPUT_USD_PER_MTOK: z.coerce.number().min(0).optional(),
  AI_OUTPUT_USD_PER_MTOK: z.coerce.number().min(0).optional(),
};

/** The rules that apply to the AI settings wherever they are loaded. */
function refineAi(
  env: { AI_PROVIDER: string; AI_API_KEY?: string; AI_MODEL?: string; AI_BASE_URL?: string },
  ctx: z.RefinementCtx,
) {
  if (env.AI_PROVIDER !== 'none') {
    for (const k of ['AI_API_KEY', 'AI_MODEL'] as const) {
      if (!env[k])
        ctx.addIssue({
          code: 'custom',
          path: [k],
          message: `required when AI_PROVIDER=${env.AI_PROVIDER}`,
        });
    }
  }
  if (env.AI_PROVIDER === 'openai-compatible' && !env.AI_BASE_URL)
    ctx.addIssue({
      code: 'custom',
      path: ['AI_BASE_URL'],
      message: 'required when AI_PROVIDER=openai-compatible',
    });
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().url(),
    WEB_ORIGIN: z.string().url(),
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must be at least 32 characters')
      .refine((s) => !s.startsWith('replace-me'), {
        message: 'SESSION_SECRET is still the example value from .env.example; generate a real one',
      }),

    // GitHub App (optional as a group: the API runs without it, GitHub features
    // then answer 503 GITHUB_NOT_CONFIGURED). See docs/GITHUB_APP_SETUP.md.
    GITHUB_APP_ID: optionalString,
    GITHUB_APP_SLUG: optionalString,
    GITHUB_APP_CLIENT_ID: optionalString,
    GITHUB_APP_CLIENT_SECRET: optionalString,
    GITHUB_APP_PRIVATE_KEY_BASE64: optionalString,

    ...aiFields,
  })
  .superRefine((env, ctx) => {
    refineAi(env, ctx);
    const set = GITHUB_VARS.filter((k) => env[k] !== undefined);
    if (set.length > 0 && set.length < GITHUB_VARS.length) {
      for (const k of GITHUB_VARS.filter((k) => env[k] === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: [k],
          message: 'required when any GITHUB_APP_* variable is set',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Only variable names and messages are printed — never values.
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

const aiEnvSchema = z.object(aiFields).superRefine(refineAi);

export type AiEnv = z.infer<typeof aiEnvSchema>;

/**
 * Just the AI settings, for tools that use nothing else (the evaluation
 * harness, ai:check, ai:diagnose). Same rules, same messages, no demands
 * about parts of the system the tool never touches.
 */
export function loadAiEnv(source: NodeJS.ProcessEnv = process.env): AiEnv {
  const parsed = aiEnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid AI configuration:\n${problems}`);
  }
  return parsed.data;
}
