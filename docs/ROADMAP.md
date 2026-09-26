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

| #    | Milestone                       | What                                                                                                                                     |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | **Evaluation harness** ✅       | Labelled dataset (`eval/cases`), `npm run eval`, precision/recall/F1 with CIs, keyword baseline                                          |
| 2.2  | **Real-world cases** ✅         | `npm run eval:import` builds cases from merged PRs (pydantic, execa, click); retrieval measured                                          |
| 2.3  | **Content-ranked retrieval** ✅ | BM25 over every doc + blob-SHA cache: documents reaching the model 27% → 91% on real PRs                                                 |
| 2.3b | **Section-level documents** ✅  | Prompt v3: a long document is shown as its matching sections; the model rewrites one and the API splices it back. Retrieval ceiling 100% |
| 2.4a | **Section-level ground truth** ✅ | `npm run eval:anchors` records which section of each document the developer actually edited; the report now shows a section ceiling alongside the document one |
| 2.4b | **More real cases** ✅          | Nine more merged PRs (fastify, commander, uv, httpx): 16 real cases, 30 documents with anchors — enough to tell retrieval settings apart |
| 2.4c | **Section size** ✅             | `npm run eval:sections` sweeps the settings with no model: sections cut at 2 kB instead of 6 kB put the developer's own section in front of the model 26 times in 30, up from 22, for 3% more prompt |
| 2.5  | **Judgement, not retrieval**    | With the plumbing fixed, 10 of 14 missed documents had been shown to the model. Prompt v3.2 answers what its own summaries said: check every candidate document, and treat an accurate-but-incomplete document as out of date |
| 2.4d | Embeddings (pgvector)           | Parked: the evaluation says retrieval is no longer the constraint. Revisit only if that changes                                          |

## Phase 3 — Engineering (≈ 2–3 weeks)

| #   | Milestone                  | What                                                                                                                                  |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **Webhook endpoint** ✅    | `POST /api/webhooks/github`: timing-safe signature check over the raw body, deduplication by delivery id that still allows a retry after a failure, pull request cache kept fresh. No analysis is started automatically (D18) |
| 3.2 | Background jobs            | pg-boss if the work outgrows a request: analysis queued rather than run inline                                                          |
| 3.3 | **Documentation PR creation** ✅ | `POST /api/analyses/:id/docs-pull-request`: one commit through git's object model, DocDrift's own branch, a pull request into the code branch so docs land with the code. Only approved suggestions, refuses a stale analysis or two rewrites of one file, idempotent per run (D19) |

Original plan: webhooks (signature verification, dedup by delivery id, smee.io for local testing),
pg-boss background jobs if needed, docs PR creation after explicit confirmation
(idempotent branch naming), broader tests.

## Phase 4 — Portfolio polish (≈ 1–2 weeks)

Deploy (Vercel + Render/Railway + managed Postgres), architecture diagram, screenshots,
demo video, evaluation report, CV bullet points based on what was actually built.
