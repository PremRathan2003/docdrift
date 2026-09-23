# Evaluation: docdrift (gemini/gemini-3.5-flash-lite)

- **Date:** 2026-09-23 09:17 UTC
- **Prompt version:** v2
- **Document selection:** content ranking (BM25)
- **Dataset:** 33 cases (22 drift, 9 no-drift, 2 tricky), 28 documents that need updating, hash `e83faa457fbb`
- **Runs per case:** 1

> 26 of 33 cases are synthetic and labelled by the author.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 100% (95% CI 82%–100%) — 18 of 18 |
| Recall (docs needing updates that were found) | 64% (95% CI 46%–79%) — 18 of 28 |
| F1 | 78% |
| Cases exactly right | 82% |
| Documents that needed updating and reached the model (retrieval ceiling) | 89% — 25 of 28, and 5 of those only in part (too long to rewrite in full) |
| False alarms on "nothing to update" cases | 0% of 11 |
| Suggested text passes content checks | 100% — 18 of 18 |
| Median original lines dropped per suggestion | 2 |
| Mean self-reported confidence when right / wrong | 0.99 / n/a |
| Errors | 1 (AI_INVALID_OUTPUT ×1) |
| Model calls / mean attempts | 30 / 1 |
| Items removed by validation | 0 |
| Tokens in / out (total) | 250,416 / 15,863 |
| Latency median / max | 1.5 s / 6.9 s |

## Synthetic cases vs real pull requests

| Cases | Precision | Recall | Reached the model | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- | --- |
| synthetic (26) | 100% | 100% | 100% | 100% | 0% |
| real (7) | 100% | 9% | 73% | 14% | 0% |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| drift | 100% | 64% | 73% | — |
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
| 103-execa-1256 | 1 | wrong | docs/api.md, docs/termination.md | — | — |
| 104-execa-1254 | 1 | wrong | docs/api.md | — | docs/streams.md ok |
| 105-execa-1251 | 1 | error: AI_INVALID_OUTPUT | docs/windows.md, readme.md | — | — |
| 106-click-3860 | 1 | wrong | docs/arguments.md, docs/documentation.md | — | — |
| 107-click-3818 | 1 | wrong | docs/exceptions.md | — | — |

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Document selection decides which files the model ever sees, so recall can never beat the retrieval line.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
