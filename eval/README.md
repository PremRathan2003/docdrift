# Evaluation

How well does DocDrift find documentation that a pull request made out of date? This folder
holds the labelled cases and the reports. The code is in [`apps/api/eval`](../apps/api/eval).

```bash
npm run eval -- --baseline          # keyword baseline: no AI, free, deterministic
npm run eval                        # DocDrift with the AI settings in apps/api/.env
npm run eval -- --repeat 3          # each case three times (models aren't deterministic)
npm run eval -- --cases 001,021     # only some cases (id prefixes)
npm run eval -- --no-save           # print the summary without writing a report
npm run eval -- --retrieval path-rules   # measure the Phase 1 filename-based document selection
npm run eval -- --model <id>        # another model than AI_MODEL (list them: npm run ai:models)
npm run eval -- --delay-ms 15000    # more time between calls (free tiers allow few per minute)
```

If a case hits a temporary provider error (overloaded, rate-limited, timeout), it is re-run after
30 s and then 60 s. Three errored cases in a row stop the run without writing a report, since a
partial run would give misleading numbers. Answers received before the stop are saved in
`eval/.checkpoints/` (not committed): run the same command again later and it continues where it
stopped, and the report says how many answers came from the earlier attempt. `--fresh` ignores
them. This matters on free tiers, where one model's daily quota may not cover a full run.

Each run writes `reports/<date>-<detector>-<model>.md` (the summary) and a `.json` with every
answer, so any number in the summary can be traced back to what the model actually said.

## What is measured

The same pipeline the app uses (`runPipeline`: file selection, document candidates, prompt,
retries, validation) runs on each case. The repository is read from disk instead of GitHub.

| Metric                   | Question it answers                                                         |
| ------------------------ | --------------------------------------------------------------------------- |
| Precision                | When DocDrift flags a document, how often is it right?                      |
| Recall                   | Of the documents that needed updating, how many did it find?                |
| F1                       | One number balancing the two                                                |
| Cases exactly right      | Did it flag exactly the right set of documents?                             |
| Reached the model        | Of the documents that needed updating, how many were even fetched?          |
| False alarms             | On pull requests that need no doc changes, how often did it flag something? |
| Content checks           | Does the suggested text contain the new wording and drop the stale wording? |
| Original lines dropped   | Does the "complete updated file" keep the rest of the document?             |
| Confidence right / wrong | Is the model's self-reported confidence any use?                            |
| Errors, attempts, tokens | Reliability and cost                                                        |

Counting is per document, summed over all cases. Documents marked _acceptable_ (either answer is
reasonable) are never counted. A run that errors flags nothing, so its documents count as misses.
With about 25 cases, one case moves a percentage by several points, so precision and recall are
shown with 95% confidence intervals.

Recall can never beat the "reached the model" line: document selection decides what the model
ever sees, so a low number there is a retrieval problem, not a model problem.

**Keyword baseline:** flags every candidate document that mentions an identifier or number the
PR removed. It's what you'd get with `grep`, and gives the AI numbers a reference point.

## The cases

26 cases in three groups:

- **drift (16):** renamed fields, endpoints, parameters and settings; changed defaults, limits,
  status codes and sort order; a removed option and endpoint; a new required setting; a Node
  version bump; a setting mentioned in two documents; an OpenAPI file.
- **no-drift (8):** refactors, tests, comments, a lockfile bump, logging, a local rename whose
  old name appears in the docs as an ordinary word, and a PR that already updated the docs.
- **tricky (2):** instructions hidden in the README and PR description (prompt injection), and a
  new optional feature where documenting it is reasonable but not required.

**Limitations.** The synthetic cases and labelled by the author, the repositories are tiny,
and every case fits in the prompt, so they are a regression check on known patterns rather than
real-world accuracy. The real cases are the harder measure, but there are still few of them, they
come from a small number of projects, and `no-drift` labels there are weaker.

## Real cases (`1xx-*`)

Synthetic cases are written by hand; real ones come from merged pull requests of public
repositories:

```bash
npm run eval:import -- find pydantic/pydantic        # recent merged PRs and what they touched
npm run eval:import -- https://github.com/o/r/pull/7 # import one (or several) as cases
```

**Where the right answer comes from.** When a developer changed code _and_ updated a document in
the same pull request, that document needed updating — the developer said so. The importer keeps
the code change and puts every document back to its state before the PR, which is exactly the
situation where the docs have drifted. `mustContain` and `mustNotContain` are distinctive words
the developer added or removed. Changelogs, and scripts that live under `docs/`, are marked
_acceptable_ instead. Code-only PRs become `no-drift` cases; that label is weaker (the docs may
have been stale already), so only clear internal changes are kept.

**What is stored.** The repository's full file list (`tree.txt`), so document selection runs over
the whole repository as it would on GitHub; the documents DocDrift would fetch, at their pre-PR
version; and the changed files. Files over 12 kB are stored as their changed regions with 40
lines of context (`trimmedFiles`), because the analysis only ever sees a file's diff. Every case
records the pull request URL, commit SHAs and the repository's licence; only permissively
licensed repositories are imported, and the files stay under their original licence.

**Always review an imported case** (`case.json`) before committing it: the labels are derived
automatically.

## Adding a case

```
eval/cases/027-short-name/
  case.json   title, body, group, category, expected, acceptable, added, notes, source
  head/       the repository at the PR's head (docs and code)
  base/       only the files the PR changes, as they were before it
```

Files in `base/` are the changed files; files that are new in the PR go in `added`. For each
expected document, `mustContain` is wording the fix needs (e.g. the new name) and
`mustNotContain` is the stale wording. `npm test` checks every case: base and head differ, the
expected document exists, the content checks aren't already true, and the document actually
reaches the model.
