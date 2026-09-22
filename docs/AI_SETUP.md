# AI provider setup (Google Gemini)

DocDrift talks to the LLM through a small `AIProvider` interface
(`apps/api/src/modules/ai/provider.ts`). Gemini is the first implementation.

## 1. Get an API key

1. Open **Google AI Studio** (https://aistudio.google.com) and sign in.
2. **Get API key → Create API key.** Copy it.
3. Keep it secret: never commit it, never put it in the web app, never paste it into chats.
   If it leaks, delete it in AI Studio and create a new one.

## 2. Choose a model

Pick a current model id from https://ai.google.dev/gemini-api/docs/models. A fast, low-cost
"Flash" or "Flash-Lite" model is enough for this task. Model names change over time, so DocDrift
has no built-in default — you choose it explicitly.

## 3. Configure `apps/api/.env`

```bash
AI_PROVIDER=gemini
AI_MODEL=<model id from step 2>
AI_API_KEY=<your key>
```

Optional:

| Variable                                          | Default | Meaning                                                                                                         |
| ------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `AI_TIMEOUT_MS`                                   | `90000` | Per-request timeout                                                                                             |
| `AI_MAX_INPUT_TOKENS`                             | `30000` | Prompt budget; content beyond it is skipped and listed in the run details                                       |
| `AI_INPUT_USD_PER_MTOK`, `AI_OUTPUT_USD_PER_MTOK` | unset   | Prices from the provider's pricing page. Only when both are set does DocDrift show a cost; it never guesses one |

## 4. Verify

If a model rejects requests with a bare "invalid argument", `npm run ai:diagnose -w @docdrift/api`
sends nine tiny requests, adding one feature at a time, and shows which one the model rejects.
By default DocDrift asks for JSON output and describes the schema in the instructions
(`gemini-3.6-flash` rejected DocDrift's schema as a native response schema). Set
`AI_NATIVE_SCHEMA=true` only if the diagnosis shows your model accepts it.

**Free-tier quotas are small** (a handful of requests per minute, and a daily cap). A `429`
means wait a minute; DocDrift retries rate limits automatically, but a daily cap only resets
the next day.

## 5. Check

```bash
npm run ai:check -w @docdrift/api
```

Sends one tiny request with **no repository data** and checks that the answer matches
DocDrift's output schema.

## What is sent to the provider

For each analysis: the PR title and description, the diffs of changed source/config/test/doc
files, and the current content of the most relevant documentation files — within the token
budget. Never sent: files that usually hold secrets (`.env`, keys, certificates…), generated
files (lockfiles, `dist/`), binaries. Common secret patterns inside diffs are replaced with
`[REDACTED]`. Redaction is best-effort, so **only connect repositories you are allowed to share
with the AI provider.** Every run lists exactly what was sent and skipped.

**Free tier note:** check Google's current Gemini API terms. On free (unpaid) usage, Google has
stated it may use submitted content to improve its products — fine for a public sandbox, not
for private company code.

## Limitations of the analysis

- The model can miss drift (false negatives) or flag docs that are fine (false positives).
- Its "confidence" is self-reported, not a measured accuracy.
- Phase 1 finds candidate docs with path rules and keyword matching; semantic retrieval
  arrives in Phase 2, and real accuracy numbers come from the evaluation dataset, not claims.

## Choosing another model

`npm run ai:models` lists the Gemini models your key can call. Free-tier limits are per model and
per project (see your limits at https://aistudio.google.com/rate-limit), so when one model is
overloaded or out of quota, another may still work. To try one without editing `.env`:
`npm run eval -- --model <id>`. To switch the app, change `AI_MODEL` and run `npm run ai:check`.

## Other providers (OpenAI-compatible)

`AI_PROVIDER=openai-compatible` works with any service that speaks OpenAI's Chat Completions
API. The base URL decides which one:

| Service        | `AI_BASE_URL`                    | Notes                                            |
| -------------- | -------------------------------- | ------------------------------------------------ |
| Groq           | `https://api.groq.com/openai/v1` | Free tier, no card; e.g. `openai/gpt-oss-120b`   |
| OpenRouter     | `https://openrouter.ai/api/v1`   | Free models end in `:free`; low daily limit      |
| Cerebras       | `https://api.cerebras.ai/v1`     | Free tier                                        |
| OpenAI         | `https://api.openai.com/v1`      | Paid                                             |
| Ollama (local) | `http://localhost:11434/v1`      | Runs on your machine; the only allowed `http://` |

JSON output is requested with `response_format: json_object` and the schema is described in the
system message; Zod validation and retries apply exactly as for Gemini. Check each provider's
current free-tier terms, including whether prompts may be used for training, before sending
private code.

### Groq setup

1. Create a free account at https://console.groq.com and an API key under **API Keys**. Copy it
   (it's shown once). Don't paste it into chats or commit it.
2. From the repository root, back up your Gemini settings and switch (the key is typed hidden):

   ```bash
   cp apps/api/.env apps/api/.env.gemini          # ignored by git; restore with cp back
   read -rs "GROQ_KEY?Groq API key: "; echo       # zsh; in bash: read -rsp "Groq API key: " GROQ_KEY
   sed -i '' -E '/^(AI_PROVIDER|AI_API_KEY|AI_MODEL|AI_BASE_URL|AI_MAX_OUTPUT_TOKENS|AI_NATIVE_SCHEMA)=/d' apps/api/.env
   printf 'AI_PROVIDER=openai-compatible\nAI_BASE_URL=https://api.groq.com/openai/v1\nAI_API_KEY=%s\nAI_MODEL=openai/gpt-oss-120b\nAI_MAX_OUTPUT_TOKENS=6000\n' "$GROQ_KEY" >> apps/api/.env
   unset GROQ_KEY
   npm run ai:check
   ```

3. Groq's free tier limits tokens per minute, and may count the requested output limit, hence
   `AI_MAX_OUTPUT_TOKENS=6000`. For the evaluation, leave room between calls:
   `npm run eval -- --delay-ms 20000`.
