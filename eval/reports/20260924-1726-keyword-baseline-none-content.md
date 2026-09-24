# Evaluation: keyword-baseline (none)

- **Date:** 2026-09-24 17:26 UTC
- **Prompt version:** n/a (no model)
- **Document selection:** content ranking (BM25)
- **Dataset:** 42 cases (31 drift, 9 no-drift, 2 tricky), 47 documents that need updating, hash `68418ac05e2d`
- **Runs per case:** 1

> 26 of 42 cases are synthetic and labelled by the author.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 39% (95% CI 29%–51%) — 29 of 74 |
| Recall (docs needing updates that were found) | 62% (95% CI 47%–74%) — 29 of 47 |
| F1 | 48% |
| Cases exactly right | 45% |
| Documents that needed updating and reached the model (retrieval ceiling) | 98% — 46 of 47, and 16 of those as selected sections (too long to send whole) |
| Of those, the section the developer actually edited was shown (section ceiling) | 56% — 9 of 16 |
| False alarms on "nothing to update" cases | 18% of 11 |

## Synthetic cases vs real pull requests

| Cases | Precision | Recall | Reached the model | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- | --- |
| synthetic (26) | 80% | 71% | 100% | 73% | 10% |
| real (16) | 29% | 57% | 97% | 0% | 100% |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| drift | 43% | 62% | 32% | — |
| no-drift | 0% | n/a | 78% | 22% |
| tricky | n/a | n/a | 100% | 0% |

## Every case

| Case | Run | Verdict | Missed | Wrongly flagged | Content check |
| --- | --- | --- | --- | --- | --- |
| 001-renamed-json-field | 1 | right | — | — | — |
| 002-changed-default | 1 | right | — | — | — |
| 003-new-required-setting | 1 | wrong | docs/configuration.md | — | — |
| 004-renamed-endpoint | 1 | right | — | — | — |
| 005-removed-cli-flag | 1 | right | — | — | — |
| 006-pagination-default | 1 | right | — | — | — |
| 007-auth-header | 1 | wrong | — | README.md, docs/configuration.md | — |
| 008-renamed-export | 1 | right | — | — | — |
| 009-renamed-parameter | 1 | wrong | docs/usage.md | — | — |
| 010-runtime-version | 1 | right | — | — | — |
| 011-renamed-setting-two-docs | 1 | right | — | — | — |
| 012-status-code | 1 | right | — | — | — |
| 013-removed-endpoint | 1 | wrong | docs/api.md | — | — |
| 014-rate-limit | 1 | right | — | — | — |
| 015-behaviour-change | 1 | wrong | docs/api.md | — | — |
| 016-openapi-parameter | 1 | wrong | openapi.yaml | — | — |
| 017-internal-refactor | 1 | right | — | — | — |
| 018-tests-only | 1 | right | — | — | — |
| 019-comments-only | 1 | right | — | — | — |
| 020-lockfile-only | 1 | right | — | — | — |
| 021-keyword-trap | 1 | wrong | — | README.md | — |
| 022-equivalent-code | 1 | right | — | — | — |
| 023-docs-already-updated | 1 | right | — | — | — |
| 024-internal-logging | 1 | right | — | — | — |
| 025-prompt-injection | 1 | right | — | — | — |
| 026-new-optional-feature | 1 | right | — | — | — |
| 101-pydantic-13824 | 1 | wrong | — | docs/concepts/types.md, docs/concepts/json_schema.md, docs/errors/usage_errors.md, docs/concepts/models.md, docs/concepts/experimental.md | — |
| 102-pydantic-13129 | 1 | wrong | — | docs/errors/usage_errors.md, docs/concepts/json_schema.md, docs/concepts/models.md, docs/concepts/fields.md, docs/concepts/types.md, docs/api/standard_library_types.md | — |
| 103-execa-1256 | 1 | wrong | docs/api.md, docs/termination.md | — | — |
| 104-execa-1254 | 1 | wrong | docs/api.md, docs/streams.md | — | — |
| 105-execa-1251 | 1 | wrong | — | docs/shell.md, docs/bash.md | — |
| 106-click-3860 | 1 | wrong | — | docs/testing.md, docs/options.md, docs/advanced.md, docs/complex.md | — |
| 107-click-3818 | 1 | wrong | docs/exceptions.md | — | — |
| 108-fastify-6909 | 1 | wrong | — | docs/Guides/Testing.md, docs/Reference/Routes.md, docs/Reference/Hooks.md, docs/Reference/Validation-and-Serialization.md | — |
| 109-fastify-6920 | 1 | wrong | — | docs/Reference/Request.md, docs/Reference/Server.md, docs/Reference/Validation-and-Serialization.md, docs/Reference/Hooks.md, docs/Guides/Plugins-Guide.md, docs/Guides/Serverless.md, docs/Reference/Reply.md | — |
| 110-fastify-6932 | 1 | wrong | docs/Reference/Reply.md | — | — |
| 111-fastify-6832 | 1 | wrong | docs/Reference/Errors.md, docs/Reference/Server.md | — | — |
| 112-commander-js-2312 | 1 | wrong | — | Readme_zh-CN.md, docs/zh-CN/不再推荐使用的功能.md, docs/options-in-depth.md, docs/terminology.md, .github/PULL_REQUEST_TEMPLATE.md | — |
| 113-uv-21423 | 1 | wrong | — | docs/guides/integration/aws-lambda.md, agents/prompts/triage-issue.md, docs/concepts/indexes.md, agents/references/threat-model.md, docs/concepts/projects/build.md | — |
| 114-uv-17455 | 1 | wrong | docs/concepts/projects/dependencies.md, docs/guides/integration/pytorch.md | agents/references/threat-model.md, docs/pip/compatibility.md, docs/concepts/configuration-files.md | — |
| 115-httpx-3139 | 1 | wrong | README.md, docs/index.md, docs/quickstart.md | — | — |
| 116-httpx-3592 | 1 | wrong | — | docs/advanced/authentication.md | — |

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Document selection decides which files the model ever sees, so recall can never beat the retrieval line.
- For a document shown in parts, the same holds one level down: a section that was not shown cannot be updated, whatever the model does. That is the section ceiling.
- A document too long to send whole is shown as the sections that match the change; the model rewrites one section and the API splices it back into the file.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
