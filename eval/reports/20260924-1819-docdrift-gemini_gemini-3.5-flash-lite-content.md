# Evaluation: docdrift (gemini/gemini-3.5-flash-lite)

- **Date:** 2026-09-24 18:19 UTC
- **Prompt version:** v3
- **Document selection:** content ranking (BM25)
- **Dataset:** 42 cases (31 drift, 9 no-drift, 2 tricky), 47 documents that need updating, hash `68418ac05e2d`
- **Runs per case:** 1

> 26 of 42 cases are synthetic and labelled by the author.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 97% (95% CI 85%–99%) — 33 of 34 |
| Recall (docs needing updates that were found) | 70% (95% CI 56%–81%) — 33 of 47 |
| F1 | 81% |
| Cases exactly right | 76% |
| Documents that needed updating and reached the model (retrieval ceiling) | 98% — 46 of 47, and 16 of those as selected sections (too long to send whole) |
| Of those, the section the developer actually edited was shown (section ceiling) | 81% — 13 of 16 |
| False alarms on "nothing to update" cases | 0% of 11 |
| Suggested text passes content checks | 82% — 27 of 33 |
| Median original lines dropped per suggestion | 2 |
| Mean self-reported confidence when right / wrong | 0.98 / 1 |
| Errors | 0 |
| Model calls / mean attempts | 40 / 1.03 |
| Items removed by validation | 2 |
| Tokens in / out (total) | 360,786 / 27,426 |
| Latency median / max | 8.5 s / 59.3 s |

## Synthetic cases vs real pull requests

| Cases | Precision | Recall | Reached the model | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- | --- |
| synthetic (26) | 100% | 100% | 100% | 100% | 0% |
| real (16) | 94% | 53% | 97% | 38% | 0% |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| drift | 97% | 70% | 68% | — |
| no-drift | n/a | n/a | 100% | 0% |
| tricky | n/a | n/a | 100% | 0% |

## Every case

| Case | Run | Verdict | Missed | Wrongly flagged | Content check |
| --- | --- | --- | --- | --- | --- |
| 001-renamed-json-field | 1 | right | — | — | README.md ok |
| 002-changed-default | 1 | right | — | — | docs/configuration.md ok |
| 003-new-required-setting | 1 | right | — | — | docs/configuration.md ok |
| 004-renamed-endpoint | 1 | right | — | — | docs/api.md ok |
| 005-removed-cli-flag | 1 | right | — | — | README.md ok |
| 006-pagination-default | 1 | right | — | — | docs/api.md ok |
| 007-auth-header | 1 | right | — | — | docs/api.md ok |
| 008-renamed-export | 1 | right | — | — | README.md ok |
| 009-renamed-parameter | 1 | right | — | — | docs/usage.md ok |
| 010-runtime-version | 1 | right | — | — | README.md ok |
| 011-renamed-setting-two-docs | 1 | right | — | — | README.md ok; docs/configuration.md ok |
| 012-status-code | 1 | right | — | — | docs/api.md ok |
| 013-removed-endpoint | 1 | right | — | — | docs/api.md ok |
| 014-rate-limit | 1 | right | — | — | docs/api.md ok |
| 015-behaviour-change | 1 | right | — | — | docs/api.md ok |
| 016-openapi-parameter | 1 | right | — | — | openapi.yaml ok |
| 017-internal-refactor | 1 | right | — | — | — |
| 018-tests-only | 1 | right | — | — | — |
| 019-comments-only | 1 | right | — | — | — |
| 020-lockfile-only | 1 | right | — | — | — |
| 021-keyword-trap | 1 | right | — | — | — |
| 022-equivalent-code | 1 | right | — | — | — |
| 023-docs-already-updated | 1 | right | — | — | — |
| 024-internal-logging | 1 | right | — | — | — |
| 025-prompt-injection | 1 | right | — | — | — |
| 026-new-optional-feature | 1 | right | — | — | — |
| 101-pydantic-13824 | 1 | wrong | docs/api/standard_library_types.md, docs/errors/validation_errors.md | — | — |
| 102-pydantic-13129 | 1 | right | — | — | — |
| 103-execa-1256 | 1 | wrong | docs/termination.md | — | docs/api.md ok |
| 104-execa-1254 | 1 | right | — | — | docs/api.md: missing "subprocess.readableStream"; docs/streams.md ok |
| 105-execa-1251 | 1 | wrong | readme.md | — | docs/windows.md ok |
| 106-click-3860 | 1 | wrong | docs/arguments.md, docs/documentation.md | — | — |
| 107-click-3818 | 1 | right | — | — | docs/exceptions.md: missing "click.Abort", missing "click.ClickException", missing "e.exit_code" |
| 108-fastify-6909 | 1 | wrong | docs/Reference/Errors.md | — | docs/Reference/Server.md ok; docs/Reference/Warnings.md ok |
| 109-fastify-6920 | 1 | right | — | — | docs/Reference/TypeScript.md: still has "context.d.ts", still has "fastify.FastifyReplyContext" |
| 110-fastify-6932 | 1 | right | — | — | docs/Reference/Reply.md: missing "reply.mediaType" |
| 111-fastify-6832 | 1 | wrong | docs/Reference/Errors.md | docs/Reference/Routes.md | docs/Reference/Server.md ok |
| 112-commander-js-2312 | 1 | wrong | Readme.md, docs/deprecated.md | — | — |
| 113-uv-21423 | 1 | wrong | docs/guides/package.md | — | — |
| 114-uv-17455 | 1 | wrong | docs/concepts/projects/dependencies.md, docs/guides/integration/pytorch.md | — | docs/concepts/indexes.md: missing "--preview-features", missing "index-by-name" |
| 115-httpx-3139 | 1 | right | — | — | README.md ok; docs/index.md ok; docs/quickstart.md: missing "zstandard" |
| 116-httpx-3592 | 1 | wrong | docs/async.md | — | README.md ok; docs/index.md ok |

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Document selection decides which files the model ever sees, so recall can never beat the retrieval line.
- For a document shown in parts, the same holds one level down: a section that was not shown cannot be updated, whatever the model does. That is the section ceiling.
- A document too long to send whole is shown as the sections that match the change; the model rewrites one section and the API splices it back into the file.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
