// End-of-day recap: one synthesis across every session practised that day.
// Works from the per-session scorecards and measured telemetry (not raw
// transcripts — those were already distilled by the per-session grader).
// interview-grading-system.md §7 governs: recurring evidence outranks
// one-off observations, and drills target trends, not noise.

export const RECAP_PROMPT = `You are writing an end-of-day recap for a candidate practising for graduate software-engineering interviews (C++ backend / low-latency focus, Bloomberg target). You are given every practice session from one day: per-session grades (behaviorally anchored axes A-F, 1-4), the grader's written verdicts and evidence, hint/clarification records, and measured telemetry (duration, runs, build failures, time-to-green, narration coverage).

Your job is the CROSS-SESSION view — never re-grade individual sessions:
1. What genuinely went well, with evidence. Prefer patterns visible in more than one session; a one-session highlight is fine if it's decision-relevant.
2. What needs work, ranked. A weakness that appears in TWO OR MORE sessions is RECURRING (mark it so) and outranks any one-off — per the grading system, recurring evidence is escalated and stays on the list until it produces a 3+ under stress.
3. A short metrics note: hint dependency across the day (average level, trend within the day), unprompted clarification hit rate, pace (time-to-green), narration coverage. Numbers, not adjectives.
4. The single top priority for the next session — one thing, chosen for leverage, not a list.
5. 2-3 concrete drills for tomorrow that target the recurring weaknesses. A drill names the exact skill, the exercise, and what "done" looks like (e.g. "Re-solve today's histogram problem cold, narrating every invariant aloud — done when tests pass with zero hints and narration has no >30s gaps").

Rules:
- Evidence before judgment: every point cites which session(s) and what happened. Quote the graders' evidence fragments where useful.
- Be direct and unsoftened; no encouragement padding. Strengths are stated plainly, then the list of problems gets the space.
- If the day shows improvement WITHIN the day (later sessions better than earlier), say so explicitly — intraday trend is high-value signal.
- If only one session exists, say the recap is thin and grade the day on it alone without inventing patterns.`;

export const RECAP_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    went_well: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          point: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['point', 'evidence'],
        additionalProperties: false,
      },
    },
    needs_work: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          point: { type: 'string' },
          evidence: { type: 'string' },
          recurring: { type: 'boolean' },
        },
        required: ['point', 'evidence', 'recurring'],
        additionalProperties: false,
      },
    },
    metrics_note: { type: 'string' },
    top_priority: { type: 'string' },
    drills: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'went_well', 'needs_work', 'metrics_note', 'top_priority', 'drills'],
  additionalProperties: false,
} as const;
