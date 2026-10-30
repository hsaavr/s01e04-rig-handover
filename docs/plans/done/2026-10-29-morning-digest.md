---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-10-29
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

| Issue | Plan requirement | Requirement status |
|---|---|---|
| [#1 — Define digest types and reader contract](https://github.com/hsaavr/s01e04-rig-handover/issues/1) | 1 — types and reader contract | Complete |
| [#2 — Read and aggregate nightly run logs](https://github.com/hsaavr/s01e04-rig-handover/issues/2) | 1 — run log reader | Complete |
| [#3 — Render the nightly digest HTML page](https://github.com/hsaavr/s01e04-rig-handover/issues/3) | 2a — digest page | Complete |
| [#4 — Serve nightly digest JSON](https://github.com/hsaavr/s01e04-rig-handover/issues/4) | 2b — JSON | Complete |
| [#5 — Link status-board nights to digests with event counts](https://github.com/hsaavr/s01e04-rig-handover/issues/5) | 2c — board links | Complete |
| [#6 — Test digest HTML and JSON routes](https://github.com/hsaavr/s01e04-rig-handover/issues/6) | 2d — route tests | Complete |
| [#7 — Publish digest HTML preview and submit for review](https://github.com/hsaavr/s01e04-rig-handover/issues/7) | 3 — preview review | Complete |
| [#8 — Remove preview marker after review and archive plan](https://github.com/hsaavr/s01e04-rig-handover/issues/8) | 4 — cleanup and archive | Complete |

## Completion record

The reader and routes passed 18 tests and typecheck; the run fixtures remained unchanged.
Both nights linked from the status board rendered in the browser. The page and JSON
used the same sorted reader output.

The reviewer confirmed seeing the preview on 2026-10-29 at 23:38 (America/Mazatlan,
UTC−07:00). Delivery alone did not
complete the review requirement; #7 requires reviewer confirmation before closure.

After renewed human approval, the digest was exported with `LANE_MARKER` unset and
uploaded over the same [public preview URL](https://s01e04-rig-preview.vercel.app/).
A fresh browser inspection on 2026-10-29 at 23:45 (America/Mazatlan, UTC−07:00)
confirmed **no marker set**,
five sorted jobs, and the original malformed-line, retry, and failure warnings.
An anonymous HTTP check at 23:46 in the same zone returned 200 with bytes matching the clean
export. Verification evidence is retained privately.

This archive records completed requirements; GitHub issue state is tracked in the
linked issues.
