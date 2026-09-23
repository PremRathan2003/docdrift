# Evaluation: keyword-baseline (none)

- **Date:** 2026-09-23 08:46 UTC
- **Prompt version:** n/a (no model)
- **Dataset:** 33 cases (22 drift, 9 no-drift, 2 tricky), 28 documents that need updating, hash `8d5ede979094`
- **Runs per case:** 1

> 26 of 33 cases are synthetic and labelled by the author.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 46% (95% CI 30%–64%) — 13 of 28 |
| Recall (docs needing updates that were found) | 46% (95% CI 30%–64%) — 13 of 28 |
| F1 | 46% |
| Cases exactly right | 58% |
| Documents that needed updating and reached the model (retrieval ceiling) | 71% — 20 of 28 |
| False alarms on "nothing to update" cases | 18% of 11 |

## Synthetic cases vs real pull requests

| Cases | Precision | Recall | Reached the model | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- | --- |
| synthetic (26) | 80% | 71% | 100% | 73% | 10% |
| real (7) | 8% | 9% | 27% | 0% | 100% |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| drift | 57% | 46% | 45% | — |
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
| 101-pydantic-13824 | 1 | wrong | docs/api/standard_library_types.md, docs/errors/validation_errors.md | docs/errors/usage_errors.md, docs/concepts/config.md, README.md, docs/install.md | — |
| 102-pydantic-13129 | 1 | wrong | — | docs/errors/usage_errors.md, docs/contributing.md, docs/concepts/config.md, README.md | — |
| 103-execa-1256 | 1 | wrong | docs/api.md, docs/termination.md | — | — |
| 104-execa-1254 | 1 | wrong | docs/api.md, docs/streams.md | — | — |
| 105-execa-1251 | 1 | wrong | docs/windows.md, readme.md | docs/bash.md | — |
| 106-click-3860 | 1 | wrong | docs/documentation.md | docs/complex.md, docs/advanced.md, docs/commands-and-groups.md | — |
| 107-click-3818 | 1 | wrong | docs/exceptions.md | — | — |

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Document selection decides which files the model ever sees, so recall can never beat the retrieval line.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
