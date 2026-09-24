# Evaluation: keyword-baseline (none)

- **Date:** 2026-09-24 13:16 UTC
- **Prompt version:** n/a (no model)
- **Document selection:** content ranking (BM25)
- **Dataset:** 7 cases (6 drift, 1 no-drift), 11 documents that need updating, hash `517778716cbe`
- **Runs per case:** 1

> 0 of 7 cases are synthetic and labelled by the author.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 26% (95% CI 13%–46%) — 6 of 23 |
| Recall (docs needing updates that were found) | 55% (95% CI 28%–79%) — 6 of 11 |
| F1 | 35% |
| Cases exactly right | 0% |
| Documents that needed updating and reached the model (retrieval ceiling) | 100% — 11 of 11, and 6 of those as selected sections (too long to send whole) |
| Of those, the section the developer actually edited was shown (section ceiling) | 67% — 4 of 6 |
| False alarms on "nothing to update" cases | 100% of 1 |

## Synthetic cases vs real pull requests

| Cases | Precision | Recall | Reached the model | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- | --- |
| real (7) | 26% | 55% | 100% | 0% | 100% |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| drift | 35% | 55% | 0% | — |
| no-drift | 0% | n/a | 0% | 100% |

## Every case

| Case | Run | Verdict | Missed | Wrongly flagged | Content check |
| --- | --- | --- | --- | --- | --- |
| 101-pydantic-13824 | 1 | wrong | — | docs/concepts/types.md, docs/concepts/json_schema.md, docs/errors/usage_errors.md, docs/concepts/models.md, docs/concepts/experimental.md | — |
| 102-pydantic-13129 | 1 | wrong | — | docs/errors/usage_errors.md, docs/concepts/json_schema.md, docs/concepts/models.md, docs/concepts/fields.md, docs/concepts/types.md, docs/api/standard_library_types.md | — |
| 103-execa-1256 | 1 | wrong | docs/api.md, docs/termination.md | — | — |
| 104-execa-1254 | 1 | wrong | docs/api.md, docs/streams.md | — | — |
| 105-execa-1251 | 1 | wrong | — | docs/shell.md, docs/bash.md | — |
| 106-click-3860 | 1 | wrong | — | docs/testing.md, docs/options.md, docs/advanced.md, docs/complex.md | — |
| 107-click-3818 | 1 | wrong | docs/exceptions.md | — | — |

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Document selection decides which files the model ever sees, so recall can never beat the retrieval line.
- For a document shown in parts, the same holds one level down: a section that was not shown cannot be updated, whatever the model does. That is the section ceiling.
- A document too long to send whole is shown as the sections that match the change; the model rewrites one section and the API splices it back into the file.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
