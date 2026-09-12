# Interview data collection

Raw material for training the interviewer personas and grounding the grading
rubric. Drop one file per interview/report in this folder — `.md` or `.txt`,
raw is fine (YouTube auto-transcripts with timestamps work as-is; no cleanup
needed).

Everything in this folder except this README is **git-ignored**: transcripts
of other people's interviews don't belong in a public repo.

## What to collect, in order of value

1. **Full verbatim transcripts** of real or realistic mock interviews
   (YouTube mocks, interviewing.io recordings). The interviewer's exact
   wording is the gold — terse acknowledgments, how they answer clarifying
   questions, when they stay silent, how they redirect.
2. **Outcome-labeled reports** — "here's what happened, and I passed/failed."
   Glassdoor, Blind and Reddit interview reports, ideally for the kind of
   role you are targeting. These ground *what interviewers are actually looking for*.
3. **Debrief/feedback text** — anything an interviewer said or wrote about a
   candidate afterwards (including the feedback section of mock videos).
   This is direct rubric evidence.
4. **Your own interviews** — right after any real phone screen, brain-dump
   everything you remember verbatim (their exact phrasings especially),
   even without a recording.

Variety beats volume: strong and weak candidates, pass and fail outcomes,
different interviewer temperaments (cold, chatty, impatient).

## Per-file header

Start each file with whatever you know of this (skip unknowns):

```
company: Example Corp
role: grad SWE
round: phone screen | onsite | behavioral | code review | mock
source: <URL or "own interview" or "friend's report">
outcome: pass | fail | unknown
covers: full interview | one problem | feedback only
```

## What happens with it

Once a handful of files are here: a distiller pass extracts interviewer
behavioral patterns into the persona prompts (with verbatim style exemplars),
a realism eval replays candidate turns against the personas and scores the
replies so prompt changes are measured instead of vibed, and rubric-relevant
findings get reconciled into `interview-grading-system.md`.
