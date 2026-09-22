# Evaluation

How well does DocDrift find documentation that a pull request made out of date? This folder
holds the labelled cases and the reports. The code is in [`apps/api/eval`](../apps/api/eval).

```bash
npm run eval -- --baseline          # keyword baseline: no AI, free, deterministic
npm run eval                        # DocDrift with the AI settings in apps/api/.env
npm run eval -- --repeat 3          # each case three times (models aren't deterministic)
npm run eval -- --cases 001,021     # only some cases (id prefixes)
npm run eval -- --no-save           # print the summary without writing a report
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
| False alarms             | On pull requests that need no doc changes, how often did it flag something? |
| Content checks           | Does the suggested text contain the new wording and drop the stale wording? |
| Original lines dropped   | Does the "complete updated file" keep the rest of the document?             |
| Confidence right / wrong | Is the model's self-reported confidence any use?                            |
| Errors, attempts, tokens | Reliability and cost                                                        |

Counting is per document, summed over all cases. Documents marked _acceptable_ (either answer is
reasonable) are never counted. A run that errors flags nothing, so its documents count as misses.
With about 25 cases, one case moves a percentage by several points, so precision and recall are
shown with 95% confidence intervals.

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

**Limitations.** All cases are synthetic and labelled by the author, the repositories are tiny,
and every case fits in the prompt. So the numbers are a regression check on known patterns, not
the accuracy you'd see on real repositories. Real-world cases are milestone 2.2.

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
