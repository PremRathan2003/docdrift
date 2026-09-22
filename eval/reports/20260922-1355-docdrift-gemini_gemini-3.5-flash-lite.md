# Evaluation: docdrift (gemini/gemini-3.5-flash-lite)

- **Date:** 2026-09-22 13:55 UTC
- **Prompt version:** v2
- **Dataset:** 26 cases (16 drift, 8 no-drift, 2 tricky), 17 documents that need updating, hash `11b94d76209d`
- **Runs per case:** 1

> All cases are synthetic and labelled by the author. Treat these numbers as a regression check on known patterns, not as accuracy on real-world pull requests.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 100% (95% CI 82%–100%) — 17 of 17 |
| Recall (docs needing updates that were found) | 100% (95% CI 82%–100%) — 17 of 17 |
| F1 | 100% |
| Cases exactly right | 100% |
| False alarms on "nothing to update" cases | 0% of 10 |
| Suggested text passes content checks | 94% — 16 of 17 |
| Median original lines dropped per suggestion | 2 |
| Mean self-reported confidence when right / wrong | 1 / n/a |
| Errors | 0 |
| Model calls / mean attempts | 25 / 1 |
| Items removed by validation | 0 |
| Tokens in / out (total) | 40,229 / 7,505 |
| Latency median / max | 10.8 s / 82 s |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| drift | 100% | 100% | 100% | — |
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
| 015-behaviour-change | 1 | right | — | — | docs/api.md: still has "oldest first" |
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

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
