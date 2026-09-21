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
