# Evaluation: docdrift (gemini/gemini-3.5-flash-lite)

- **Date:** 2026-09-23 12:10 UTC
- **Prompt version:** v3
- **Document selection:** content ranking (BM25)
- **Dataset:** 8 cases (2 no-drift, 6 drift), 11 documents that need updating, hash `24e26a182602`
- **Runs per case:** 3

> 1 of 8 cases are synthetic and labelled by the author.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 100% (95% CI 77%–100%) — 13 of 13 |
| Recall (docs needing updates that were found) | 39% (95% CI 25%–56%) — 13 of 33 |
| F1 | 57% |
| Cases exactly right | 38% |
| Documents that needed updating and reached the model (retrieval ceiling) | 100% — 33 of 33, and 18 of those as selected sections (too long to send whole) |
| False alarms on "nothing to update" cases | 0% of 6 |
| Suggested text passes content checks | 92% — 12 of 13 |
| Median original lines dropped per suggestion | 1 |
| Mean self-reported confidence when right / wrong | 0.94 / n/a |
| Errors | 1 (AI_INVALID_OUTPUT ×1) |
| Model calls / mean attempts | 23 / 1.09 |
| Items removed by validation | 1 |
| Tokens in / out (total) | 497,508 / 31,844 |
| Latency median / max | 5.7 s / 99.8 s |

Re-run after a temporary provider error: 104-execa-1254 (AI_TIMEOUT), 105-execa-1251 (AI_UNAVAILABLE). Only the final attempt is scored.

### Run to run

| Run | Precision | Recall | F1 |
| --- | --- | --- | --- |
| 1 | 100% | 45% | 63% |
| 2 | 100% | 18% | 31% |
| 3 | 100% | 55% | 71% |

Cases with a different verdict between runs: 105-execa-1251, 107-click-3818.

## Synthetic cases vs real pull requests

| Cases | Precision | Recall | Reached the model | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- | --- |
| synthetic (3) | n/a | n/a | n/a | 100% | 0% |
| real (21) | 100% | 39% | 100% | 29% | 0% |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| no-drift | n/a | n/a | 100% | 0% |
| drift | 100% | 39% | 17% | — |

## Every case

| Case | Run | Verdict | Missed | Wrongly flagged | Content check |
| --- | --- | --- | --- | --- | --- |
| 023-docs-already-updated | 1 | right | — | — | — |
| 101-pydantic-13824 | 1 | wrong | docs/errors/validation_errors.md | — | docs/api/standard_library_types.md ok |
| 102-pydantic-13129 | 1 | right | — | — | — |
| 103-execa-1256 | 1 | wrong | docs/api.md | — | docs/termination.md ok |
| 104-execa-1254 | 1 | wrong | docs/api.md | — | docs/streams.md ok |
| 105-execa-1251 | 1 | right | — | — | docs/windows.md ok; readme.md ok |
| 106-click-3860 | 1 | wrong | docs/arguments.md, docs/documentation.md | — | — |
| 107-click-3818 | 1 | wrong | docs/exceptions.md | — | — |
| 023-docs-already-updated | 2 | right | — | — | — |
| 101-pydantic-13824 | 2 | wrong | docs/errors/validation_errors.md | — | docs/api/standard_library_types.md ok |
| 102-pydantic-13129 | 2 | right | — | — | — |
| 103-execa-1256 | 2 | wrong | docs/api.md, docs/termination.md | — | — |
| 104-execa-1254 | 2 | wrong | docs/api.md | — | docs/streams.md ok |
| 105-execa-1251 | 2 | error: AI_INVALID_OUTPUT | docs/windows.md, readme.md | — | — |
| 106-click-3860 | 2 | wrong | docs/arguments.md, docs/documentation.md | — | — |
| 107-click-3818 | 2 | wrong | docs/exceptions.md | — | — |
| 023-docs-already-updated | 3 | right | — | — | — |
| 101-pydantic-13824 | 3 | wrong | docs/errors/validation_errors.md | — | docs/api/standard_library_types.md ok |
| 102-pydantic-13129 | 3 | right | — | — | — |
| 103-execa-1256 | 3 | wrong | docs/api.md | — | docs/termination.md ok |
| 104-execa-1254 | 3 | wrong | docs/api.md | — | docs/streams.md ok |
| 105-execa-1251 | 3 | right | — | — | docs/windows.md ok; readme.md ok |
| 106-click-3860 | 3 | wrong | docs/arguments.md, docs/documentation.md | — | — |
| 107-click-3818 | 3 | right | — | — | docs/exceptions.md: missing "click.Abort", missing "click.ClickException", missing "e.exit_code" |

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Document selection decides which files the model ever sees, so recall can never beat the retrieval line.
- A document too long to send whole is shown as the sections that match the change; the model rewrites one section and the API splices it back into the file.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
