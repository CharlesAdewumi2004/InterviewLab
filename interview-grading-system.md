# Full Interview Grading System

Companion to the Mock Interview Process Spec. This defines exactly how every session is scored, how scores map to a hire decision, and how progress is tracked across sessions.

> **v3 — data-grounded.** Anchors, gates and calibration notes marked *[data]* are derived
> from a corpus of real interviewing.io mock interviews (16 coding, 10 system design,
> 7 behavioral transcripts read in full, plus the written interviewer feedback and
> advance/reject decisions for 89 outcome-labeled sessions). Analyses live in
> `interview-data/work/distilled/rubric-{rejects,passes}.md`.

---

## 1. Principles

1. **Behaviorally anchored.** Every score point is tied to a written description of observable behaviour, never an adjective. The grader compares what happened against the anchor, not against intuition or a previous session.
2. **Evidence before judgment.** No score is assigned without at least two specific behavioural observations (what was said/done, verbatim where useful). If there's no evidence, the axis is marked *Not Observed*, never guessed.
3. **Independent axes.** Each axis is scored on its own. A brilliant algorithm does not buy back silent grinding; strong narration does not buy back a broken solution.
4. **Signal over correctness.** *How* the answer was reached (decomposition, narration, self-correction, hint uptake, testing) carries as much weight as the answer itself — but correctness is still a hard requirement, not optional (Bloomberg explicitly rejects the myth that communication alone carries you).
5. **No mid-session averaging.** Scores are assigned only in the debrief, from notes.

---

## 2. The Scale

All axes use a 1–4 scale (mirrors the poor / borderline / solid / outstanding pattern used in industry BARS):

| Score | Label | Meaning |
|---|---|---|
| 1 | Poor | Would end the loop on its own |
| 2 | Borderline | Real concern; needs other axes to compensate strongly |
| 3 | Solid | Meets the hiring bar for a grad hire |
| 4 | Outstanding | Better than most candidates who get offers; would be cited in the debrief as a reason to fight for the hire |

Half-points (e.g., 2.5) are allowed only when evidence genuinely straddles two anchors, and the writeup must say which behaviours pulled each way.

---

## 3. Axes, Anchors, and Weights

Weights reflect Bloomberg's documented emphasis: coding competence is the baseline; communication, hint uptake, and fit differentiate.

### Coding sessions (Question Practice — axes A–D)

| Axis | Weight |
|---|---|
| A — Problem comprehension & requirements | 20% |
| B — Coding fluency & correctness | 30% |
| C — Algorithms, DS & complexity | 25% |
| D — Communication, collaboration & hint uptake | 25% |

### Full interviews (axes A–D + F)

| Axis | Weight |
|---|---|
| A | 15% |
| B | 25% |
| C | 20% |
| D | 25% |
| F — Motivation & fit | 15% |

### System design rounds (E replaces B/C weighting)

| Axis | Weight |
|---|---|
| A | 15% · E — System design | 45% · D | 25% · F | 15% |

### Behavioral rounds (dedicated STAR sessions — no coding/design axes)

| Axis | Weight |
|---|---|
| D — Communication & delivery | 40% |
| F — Motivation, fit & story substance | 60% |

### Behavioral anchors

**Axis A — Problem comprehension & requirements**
- **1:** Starts coding immediately; misreads the problem; assumptions unstated and wrong.
- **2:** Restates the problem but misses key constraints or edge conditions until prompted (including missing them after the one "anything else to clarify?" nudge).
- **3:** Clarifies inputs/outputs and constraints, states and verifies assumptions, identifies main edge cases up front, writes them down.
- **4:** All of 3, plus surfaces non-obvious constraints or ambiguities the prompt hid; scopes deliberately.
- *Checklist evidence:* clarified input size, empty/null, duplicates, boundaries, mutation, complexity target, ordering, invalid input — each unprompted clarification is logged.

**Axis B — Coding fluency & correctness**
- **1:** Code conceptually wouldn't run; persistent logic failures; visibly unfamiliar with C++.
- **2:** Mostly working only with significant interviewer repair; messy structure; edge cases fail in the trace.
- **3:** Clean, working, idiomatic code; handles the stated edge cases; traces/tests own code unprompted; bugs found and fixed by the candidate.
- **4:** All of 3, plus production instincts: naming, decomposition, error handling, and self-review that would pass a real code review.
- *Calibration note for this candidate:* graded against a strong-C++ bar. Non-idiomatic C++ (raw loops where an algorithm fits, missed const-correctness, gratuitous copies) caps B at 3 even if correct.

**Axis C — Algorithms, data structures & complexity**
- **1:** No viable approach; complexity analysis absent or wrong even after prompting.
- **2:** Brute force only, or names the optimal approach without being able to implement or justify it; shaky complexity analysis.
- **3:** Progresses brute force → optimised with sound justification; accurate time and space analysis; sensible structure choices.
- **4:** All of 3, plus compares multiple viable approaches with trade-offs (constant factors, memory locality, practical considerations) and picks deliberately.
- *Hard rule:* a wrong complexity claim left uncorrected by the candidate caps C at 2. Self-corrected before the interviewer flags it: no cap.

**Axis D — Communication, collaboration & hint uptake** *(Bloomberg-weighted)*
- **1:** Silent grinding (>30s gaps, repeatedly) or unstructured rambling; ignores or resists interviewer input; reasoning cannot be followed.
- **2:** Explains when asked; absorbs hints slowly or partially; loses the thread under pressure; needed the "keep talking" interrupt more than once.
- **3:** Thinks aloud continuously at intent/invariant level; listens; integrates hints quickly and credits them; corrects course without ego; executes the recovery protocol when blanked.
- **4:** All of 3, plus genuine pair-work: checks in at decision points, invites challenge, hands ambiguity back with structure.
- *Hint-uptake sub-score (logged separately, folds into D):* for each hint given, record level (1–4), latency to integration, and completeness. Rough guide: needed only level-1/2 hints and integrated immediately → no penalty; needed a level-4 hint → D capped at 3; resisted or argued past a correct hint → D capped at 2 (this is a documented Bloomberg rejection cause).
- *Narration channel:* think-aloud is captured by the ambient narration mic (timestamped, separate from chat). D's continuity anchors — "silent grinding" and "thinks aloud continuously" — are scored **only from the narration timeline within mic-on spans**. When the channel was off, absence of narration is absence of evidence, never evidence of silence: D is scored from chat-visible collaboration evidence alone (hint uptake, integration of interviewer input, written check-ins), and if that yields fewer than two specific observations, D is *Not Observed* and its weight is renormalized away (per Principle 2).

**Axis E — System design**
- **1:** Jumps to components without requirements; no trade-off reasoning; hand-waves scale and failure.
- **2:** Reasonable high-level shape but shallow: trade-offs asserted not argued; failure modes and consistency unaddressed until prompted.
- **3:** Gathers requirements and load estimates; justified architecture; explicit trade-offs (latency vs throughput, consistency vs availability, delivery semantics); addresses failure and recovery.
- **4:** All of 3, plus quantified reasoning (latency budgets, capacity math), evolution under changed requirements, domain-appropriate judgment (e.g., ordering guarantees for market data).

**Axis F — Motivation & fit** *(Bloomberg-weighted)*
- **1:** Generic or contradictory motivation; no curiosity back; behavioral answers are vague "we" stories with no personal role.
- **2:** Plausible but interchangeable motivation ("great engineering, good culture"); STAR answers lack specifics or measurable outcomes.
- **3:** Specific, credible motivation tied to Bloomberg's product/domain; STAR answers with clear personal actions, outcomes, lessons; asks informed questions back.
- **4:** All of 3, plus survives deep probing on own past decisions (why, what failed, what they'd change) with visible genuine domain engagement.
- *Auto-caps:* "salary/prestige"-shaped motivation → F ≤ 2. Answer that would fit any tech company unchanged → F ≤ 2. Hiding behind "we" after the "what did *you* do?" probe → F ≤ 2.

### Data-grounded calibration (v3) *[data]*

How real interviewers actually weighed these axes, from the outcome-labeled corpus:

- **B — working code is the hard gate.** "Could not get working code at the end" is the most-cited verbatim rejection reason; "ten more minutes and you'd have it" was still a no. Proximity doesn't count. Tolerated within an advance: syntax slips ("I don't care"), naming nits, minor complexity slips, an edge case the interviewer caught, slow starts.
- **C — problem-solving ≤2 is the modal rejection predictor** (~two-thirds of rejects). Needing 2+ hints to reach the core insight, or patching brute force instead of rethinking, are its anchor behaviors.
- **D — narration is the single most-cited advance reason** ("kept me convinced you were thinking in the right direction" — through bugs and hints). The 3-vs-4 divider is *unprompted*: strong candidates state complexity, generate tests, and drive phase transitions on their own initiative; merely-passing ones do the same when prompted.
- **Hints are not disqualifying by themselves.** Many advances needed algorithm-level hints; what matters is converting a hint into visible progress within minutes. Hint *dependence* (2+ hints to the core idea, or needing the why explained) is what rejects.
- **A — clarifying questions are table stakes, not signal.** The questions axis scored 4/4 in almost every reject; do not inflate A for volume of questions. But *failure* to clarify is decision-relevant: never asking about scale was a headline system-design rejection.
- **Communication cannot rescue problem-solving.** Rejects with 4/4 communication are common; one interviewer gave "10/10 communication" and voted no. Likability is scored independently (would-work-with was yes in 46/47 rejects).
- **E — process over knowledge.** System-design rejects had good component vocabulary but: no capacity numbers (leading to undersized designs), 20 minutes spent on requirements, options listed without committing, or a parts list with no connected request flow. Advances pinned scale numbers, committed to choices with trade-offs stated aloud, and drove the design without intervention.
- **F — the probe layer decides.** Stories fail on scope inflation discovered under probing, missing quantified impact, and answering the vibe instead of the literal question; they pass on natural STAR, "golden nuggets" (money, timelines, team sizes), and plainly-owned failures.

---

## 4. Flags (Outside the Weighted Score)

Some behaviours are decision-relevant beyond their axis score. Logged separately:

**Red flags (any one of these overrides a passing weighted score → at best Lean No Hire):**
- Bluffing: confidently asserting something false and defending it when challenged (honest "I don't know, but here's how I'd reason" is *positive* signal).
- Resisting interviewer input across multiple instances ("leading your own way").
- Solving an entire problem silently despite interrupts *(only assessable when the narration channel was on, or when interrupts in chat were visibly ignored — never inferred from transcript gaps with the mic off)*.
- (Code review) contempt for legacy code / "rewrite it all" instinct.
- Final solution materially incorrect with the candidate unaware after testing phase.

**Green flags (logged as debrief ammunition, can lift a borderline decision):**
- Found and fixed own bug before the interviewer saw it.
- Volunteered a trade-off unprompted ("if memory were tight, I'd…").
- Correctly pushed back on an interviewer's deliberate wrong steer — with reasoning, then checked in.
- Recovered from a blank via the protocol without visible spiral.

---

## 5. Mapping Scores to a Decision

Compute the weighted average, then apply gates:

| Weighted avg | Provisional recommendation |
|---|---|
| ≥ 3.5 | Strong Hire |
| 3.0 – 3.49 | Hire |
| 2.5 – 2.99 | Lean No Hire (borderline — D and F decide, per Bloomberg pattern) |
| < 2.5 | No Hire |

**Gates (applied after the average):**
1. Any axis at 1 → recommendation cannot exceed Lean No Hire.
2. D ≤ 2 → cannot exceed Lean No Hire regardless of technical scores (technically-clean loops fail on this at Bloomberg).
3. B ≤ 2 on both problems in a session → No Hire (correctness is the baseline).
4. Any red flag → at best Lean No Hire.
5. In the 2.5–2.99 band, D and F act as tiebreakers: both ≥ 3 → round up to Hire; either ≤ 2 → round down to No Hire.
6. C ≤ 2 → cannot exceed Lean No Hire *[data: problem-solving ≤2 was the modal rejection predictor; no reject scored ≥3 on both technical axes]*.
7. Two or more scored axes ≤ 2 → No Hire *[data: no advanced candidate in the corpus had two dimensions below 3 — a single crater was survivable, two never was]*.

Every recommendation is stated with a confidence (low / medium / high) and the **single most decision-relevant observation**.

---

## 6. Per-Session Scorecard Template

```
SESSION SCORECARD
Date:                Mode:                Problem(s):
Duration:            Frames enforced/skipped:

AXIS SCORES (evidence first, then number)
A — evidence: …            score:  /4
B — evidence: …            score:  /4
C — evidence: …            score:  /4
D — evidence: …            score:  /4
E — evidence: …            score:  /4   (if applicable)
F — evidence: …            score:  /4   (if applicable)

HINT LOG
#  level  what was said  →  uptake (latency / completeness)

CLARIFICATION CHECKLIST (unprompted? y/n)
size · empty · duplicates · boundaries · mutation · complexity target · ordering · invalid input

FLAGS
Red: …        Green: …

WEIGHTED SCORE:        GATES TRIGGERED:
RECOMMENDATION:  Strong Hire / Hire / Lean No Hire / No Hire
Confidence:            Most decision-relevant observation:

BIGGEST RISK:
ONE REWRITE (weak answer → stronger version):
HIGHEST-LEVERAGE FIX:
NEXT DRILL:
```

---

## 7. Progress Tracking Across Sessions

Maintained as a running log so drills target real trends, not one-off noise:

- **Axis trendline:** per-axis scores across the last 5 sessions. A drill is triggered by any axis averaging < 3 over 3 sessions.
- **Hint dependency curve:** average hint level needed per session — should trend toward 0–1.
- **Clarification hit rate:** fraction of the 8 checklist items raised unprompted — target ≥ 6/8 consistently.
- **Recovery record:** blanks encountered vs. protocol executed cleanly — graded on recovery, not on whether the blank happened.
- **Recurring evidence:** any identical weakness quoted in two consecutive debriefs is escalated: subsequent sessions deliberately stress it, and it stays on the list until it produces a 3+ under stress.

**Readiness bar (when to book the real interview):** three consecutive full-interview sims at Hire or better, no red flags, D ≥ 3 in all of them **with the narration channel on** (a D scored without captured think-aloud doesn't count toward readiness — the real interview is spoken), and at most one level-1/2 hint per problem.

---

## 8. System-Design Delivery Rubric (rubric v4)

System-design sessions run against a question from the design bank and are additionally
reviewed stage-by-stage against the delivery framework (modeled on HelloInterview's published
framework and evaluation guidance). This review is **structured evidence for Axis E** — the §5
decision math is unchanged; the stage scores and Axis E must tell the same story.

**The stages and budgets** (the candidate drives them unprompted; drift is signal):

| Stage | Budget | What good looks like |
|---|---|---|
| Requirements | ~5 min | Top ~3 functional requirements as "users can…" statements — a long list is a NEGATIVE; non-functional requirements contextualized and quantified. No ritual capacity math. |
| Core entities | ~2 min | The nouns of the system, quickly — not a full schema. |
| API | ~5 min | REST by default; reasonable > perfect (pagination present beats pagination optimal). **Time overrun here is the failure mode, not imperfection — grade the API leniently and the clock strictly.** |
| High-level design | ~10-15 min | A simple, COMPLETE, end-to-end design satisfying the functional requirements before any complexity. Failing to deliver a working whole is the single biggest failure mode in the round. |
| Deep dives | ~10 min | Depth in ~2 areas. Capacity math appears here, exactly where a number changes a decision. |

**Stage anchors (1-4, same scale as the axes):** 1 = stage skipped or actively harmful (e.g.
requirement sprawl, API rabbit-hole eating the design time); 2 = present but shallow or badly
budgeted; 3 = solid — meets the bar above; 4 = exemplary and proactively driven.

**Level calibration** — evaluation shifts across three dimensions: **depth**, **breadth**, and
**proactiveness**. Breadth expectations *decrease* with seniority; depth and proactiveness
increase. The grader reports a `level_signal`:

- **below mid-level** — did not deliver a working end-to-end design even with steering.
- **mid-level** — drove the early stages (requirements, API, entities, high-level design) to a
  working whole; needed the interviewer to point at weaknesses for deep dives.
- **senior** — proactively identified and led ~2 deep dives with practical, mechanism-level
  detail (never "I'll just use NoSQL"); owned the trade-offs.
- **staff+** — led the entire round as a peer; proactively surfaced the question's hardest
  corners (multi-region, failure modes, evolution) without prompting.

The four evaluation lenses (problem solving, solution design, technical excellence,
communication) map onto the existing axes: problem solving → A, solution design + technical
excellence → E, communication → D. The stage review, level signal and a one-paragraph
depth/breadth/proactiveness read are recorded alongside the axes in the gradebook.
