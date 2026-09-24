# Evaluation: docdrift (gemini/gemini-3.5-flash-lite)

- **Date:** 2026-09-24 20:48 UTC
- **Prompt version:** v3.2
- **Document selection:** content ranking (BM25)
- **Dataset:** 16 cases (15 drift, 1 no-drift), 30 documents that need updating, hash `20523578ddb1`
- **Runs per case:** 3

> 0 of 16 cases are synthetic and labelled by the author.

## Results

| Metric | Value |
| --- | --- |
| Precision (flagged docs that were right) | 92% (95% CI 82%–97%) — 57 of 62 |
| Recall (docs needing updates that were found) | 63% (95% CI 53%–73%) — 57 of 90 |
| F1 | 75% |
| Cases exactly right | 38% |
| Documents that needed updating and reached the model (retrieval ceiling) | 97% — 87 of 90, and 48 of those as selected sections (too long to send whole) |
| Of those, the section the developer actually edited was shown (section ceiling) | 81% — 39 of 48 |
| False alarms on "nothing to update" cases | 0% of 3 |
| Suggested text passes content checks | 68% — 39 of 57 |
| Median original lines dropped per suggestion | 1 |
| Mean self-reported confidence when right / wrong | 0.96 / 0.98 |
| Errors | 0 |
| Model calls / mean attempts | 48 / 1.02 |
| Items removed by validation | 7 |
| Tokens in / out (total) | 866,008 / 61,714 |
| Latency median / max | 2.9 s / 11.8 s |

### Run to run

| Run | Precision | Recall | F1 |
| --- | --- | --- | --- |
| 1 | 90% | 60% | 72% |
| 2 | 90% | 63% | 75% |
| 3 | 95% | 67% | 78% |

Cases with a different verdict between runs: 101-pydantic-13824, 105-execa-1251, 107-click-3818, 113-uv-21423.

## Synthetic cases vs real pull requests

| Cases | Precision | Recall | Reached the model | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- | --- |
| real (48) | 92% | 63% | 97% | 38% | 0% |

## By group

| Group | Precision | Recall | Cases exactly right | False alarms |
| --- | --- | --- | --- | --- |
| drift | 92% | 63% | 33% | — |
| no-drift | n/a | n/a | 100% | 0% |

## Every case

| Case | Run | Verdict | Missed | Wrongly flagged | Content check |
| --- | --- | --- | --- | --- | --- |
| 101-pydantic-13824 | 1 | wrong | docs/api/standard_library_types.md, docs/errors/validation_errors.md | — | — |
| 102-pydantic-13129 | 1 | right | — | — | — |
| 103-execa-1256 | 1 | wrong | docs/termination.md | — | docs/api.md ok |
| 104-execa-1254 | 1 | wrong | docs/api.md | — | docs/streams.md ok |
| 105-execa-1251 | 1 | wrong | — | docs/shell.md | docs/windows.md ok; readme.md ok |
| 106-click-3860 | 1 | wrong | docs/arguments.md, docs/documentation.md | — | — |
| 107-click-3818 | 1 | right | — | — | docs/exceptions.md: missing "click.Abort", missing "click.ClickException", missing "e.exit_code" |
| 108-fastify-6909 | 1 | wrong | docs/Reference/Errors.md | — | docs/Reference/Server.md: missing "FST_ERR_ROUTE_METHOD_ALREADY_SUPPORTED"; docs/Reference/Warnings.md ok |
| 109-fastify-6920 | 1 | right | — | — | docs/Reference/TypeScript.md: still has "context.d.ts", still has "fastify.FastifyReplyContext" |
| 110-fastify-6932 | 1 | right | — | — | docs/Reference/Reply.md: missing "reply.mediaType" |
| 111-fastify-6832 | 1 | wrong | docs/Reference/Errors.md | docs/Reference/Routes.md | docs/Reference/Server.md ok |
| 112-commander-js-2312 | 1 | wrong | docs/deprecated.md | — | Readme.md ok |
| 113-uv-21423 | 1 | right | — | — | docs/guides/package.md: missing "invalidate" |
| 114-uv-17455 | 1 | wrong | docs/concepts/projects/dependencies.md, docs/guides/integration/pytorch.md | — | docs/concepts/indexes.md: missing "--preview-features", missing "index-by-name" |
| 115-httpx-3139 | 1 | right | — | — | README.md ok; docs/index.md ok; docs/quickstart.md: missing "zstandard" |
| 116-httpx-3592 | 1 | wrong | docs/async.md | — | README.md ok; docs/index.md ok |
| 101-pydantic-13824 | 2 | right | — | — | docs/api/standard_library_types.md: missing "collections.Counter", missing "counter_type", missing "typing.Counter"; docs/errors/validation_errors.md: missing "collections.Counter" |
| 102-pydantic-13129 | 2 | right | — | — | — |
| 103-execa-1256 | 2 | wrong | docs/termination.md | docs/execution.md | docs/api.md ok |
| 104-execa-1254 | 2 | wrong | docs/api.md | — | docs/streams.md ok |
| 105-execa-1251 | 2 | right | — | — | docs/windows.md ok; readme.md ok |
| 106-click-3860 | 2 | wrong | docs/arguments.md, docs/documentation.md | — | — |
| 107-click-3818 | 2 | wrong | docs/exceptions.md | — | — |
| 108-fastify-6909 | 2 | wrong | docs/Reference/Errors.md | — | docs/Reference/Server.md ok; docs/Reference/Warnings.md ok |
| 109-fastify-6920 | 2 | right | — | — | docs/Reference/TypeScript.md: still has "context.d.ts", still has "fastify.FastifyReplyContext" |
| 110-fastify-6932 | 2 | right | — | — | docs/Reference/Reply.md: missing "reply.mediaType" |
| 111-fastify-6832 | 2 | wrong | — | docs/Reference/Routes.md | docs/Reference/Errors.md ok; docs/Reference/Server.md ok |
| 112-commander-js-2312 | 2 | wrong | docs/deprecated.md | — | Readme.md: missing "--workspace", missing "--ws" |
| 113-uv-21423 | 2 | wrong | docs/guides/package.md | — | — |
| 114-uv-17455 | 2 | wrong | docs/concepts/projects/dependencies.md, docs/guides/integration/pytorch.md | — | docs/concepts/indexes.md: missing "--preview-features", missing "index-by-name" |
| 115-httpx-3139 | 2 | right | — | — | README.md ok; docs/index.md ok; docs/quickstart.md ok |
| 116-httpx-3592 | 2 | wrong | docs/async.md | — | README.md ok; docs/index.md ok |
| 101-pydantic-13824 | 3 | right | — | — | docs/api/standard_library_types.md ok; docs/errors/validation_errors.md: missing "collections.Counter" |
| 102-pydantic-13129 | 3 | right | — | — | — |
| 103-execa-1256 | 3 | wrong | docs/termination.md | — | docs/api.md ok |
| 104-execa-1254 | 3 | wrong | docs/api.md | — | docs/streams.md ok |
| 105-execa-1251 | 3 | right | — | — | docs/windows.md ok; readme.md ok |
| 106-click-3860 | 3 | wrong | docs/documentation.md | — | docs/arguments.md ok |
| 107-click-3818 | 3 | wrong | docs/exceptions.md | — | — |
| 108-fastify-6909 | 3 | wrong | docs/Reference/Errors.md | — | docs/Reference/Server.md ok; docs/Reference/Warnings.md ok |
| 109-fastify-6920 | 3 | right | — | — | docs/Reference/TypeScript.md: still has "context.d.ts", still has "fastify.FastifyReplyContext" |
| 110-fastify-6932 | 3 | right | — | — | docs/Reference/Reply.md: missing "reply.mediaType" |
| 111-fastify-6832 | 3 | wrong | — | docs/Reference/Routes.md | docs/Reference/Errors.md ok; docs/Reference/Server.md ok |
| 112-commander-js-2312 | 3 | wrong | docs/deprecated.md | — | Readme.md ok |
| 113-uv-21423 | 3 | wrong | docs/guides/package.md | — | — |
| 114-uv-17455 | 3 | wrong | docs/concepts/projects/dependencies.md, docs/guides/integration/pytorch.md | — | docs/concepts/indexes.md: missing "--preview-features", missing "index-by-name" |
| 115-httpx-3139 | 3 | right | — | — | README.md ok; docs/index.md ok; docs/quickstart.md: missing "zstandard" |
| 116-httpx-3592 | 3 | wrong | docs/async.md | — | README.md ok; docs/index.md ok |

## How to read this

- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.
- Runs that errored flagged nothing, so their expected documents count as misses.
- Document selection decides which files the model ever sees, so recall can never beat the retrieval line.
- For a document shown in parts, the same holds one level down: a section that was not shown cannot be updated, whatever the model does. That is the section ceiling.
- A document too long to send whole is shown as the sections that match the change; the model rewrites one section and the API splices it back into the file.
- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.
- Self-reported confidence is the model’s own estimate, not a probability.
