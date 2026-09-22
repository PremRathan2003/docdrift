# Evaluation: keyword-baseline (none)

- **Date:** 2026-09-22 11:24 UTC
- **Prompt version:** n/a (no model)
- **Dataset:** 26 cases (16 drift, 8 no-drift, 2 tricky), 17 documents that need updating, hash `11b94d76209d`
- **Runs per case:** 1

> All cases are synthetic and labelled by the author. Treat these numbers as a regression check on known patterns, not as accuracy on real-world pull requests.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 80% (95% CI 55%–93%) — 12 of 15 |
| Recall (docs needing updates that were found) | 71% (95% CI 47%–87%) — 12 of 17 |
| F1 | 75% |
| Cases exactly right | 73% |
| False alarms on "nothing to update" cases | 10% of 10 |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| drift | 86% | 71% | 63% | — |
| no-drift | 0% | n/a | 88% | 13% |
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
| 007-auth-header | 1 | wrong | — | docs/configuration.md, README.md | — |
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

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
