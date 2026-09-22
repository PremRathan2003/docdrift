# Roadmap

Sized for 1–2 hours a day. Each milestone ends with the app running and tests green.
Estimates are rough and assume you type and understand the code, not just paste it.

## Phase 1 — MVP (≈ 4–5 weeks)

| #   | Milestone                              | Done when                                                                                                             | Est. sessions |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1.1 | **Scaffold** ✅                        | Monorepo, health check, web ↔ API via proxy, schema, CI, 15 tests                                                     | 2–3           |
| 1.2 | **Auth** ✅                            | Register/login/logout, sessions, protected routes, rate-limited login, tests                                          | 4–5           |
| 1.3 | **GitHub App + connect repository** ✅ | Install App, list installation repos, connect one, repo page                                                          | 4–5           |
| 1.4 | **Pull requests** ✅                   | Sync + list PRs with filters, PR detail, file list, diff viewer                                                       | 4–5           |
| 1.5 | **Analysis v1** ✅                     | Diff filtering, heuristic doc lookup, one LLM provider, structured output, validation, retries, stored run with usage | 6–8           |
| 1.6 | **Review workflow** ✅                 | Suggestion page, edit/approve/reject, state machine, review history, patch preview                                    | 4–5           |
| 1.7 | **Dashboard + E2E** ✅                 | Real stats from DB, Playwright happy path with mocked LLM                                                             | 3–4           |

**MVP scope cut (deliberately out of Phase 1):** webhooks, RAG/embeddings, automatic docs
PR creation, multiple AI providers, background queue, org/team roles. The MVP still tells
the full story: _connect → analyse a real PR with a real LLM → human reviews → audit trail._

## Phase 2 — AI quality (≈ 3–4 weeks)

Measure first, then improve: every later change is judged against the evaluation.

| #   | Milestone                 | What                                                                                            |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| 2.1 | **Evaluation harness** ✅ | Labelled dataset (`eval/cases`), `npm run eval`, precision/recall/F1 with CIs, keyword baseline |
| 2.2 | Real-world cases          | Add labelled cases from public pull requests; re-run the baseline and Gemini                    |
| 2.3 | Documentation index + FTS | Chunk docs, Postgres full-text retrieval instead of path rules; compare with 2.1/2.2 reports    |
| 2.4 | Embeddings (pgvector)     | Semantic retrieval for behaviour changes; keep it only if the evaluation shows a gain           |

## Phase 3 — Engineering (≈ 2–3 weeks)

Webhooks (signature verification, dedup by delivery id, smee.io for local testing),
pg-boss background jobs if needed, docs PR creation after explicit confirmation
(idempotent branch naming), broader tests.

## Phase 4 — Portfolio polish (≈ 1–2 weeks)

Deploy (Vercel + Render/Railway + managed Postgres), architecture diagram, screenshots,
demo video, evaluation report, CV bullet points based on what was actually built.
