import type { Session } from './types.js';
import { activeMs, pausedMsUntil } from './session.js';
import { getDesignQuestion } from './sysdesign/bank.js';
import { getTechQuestion, TECH_TOPIC_LABELS } from './techq/bank.js';
import { getDebugExercise } from './techq/debug-bank.js';
import { getOopQuestion } from './oop/bank.js';
import { languageMeta } from '../../shared/languages';

/**
 * Everything the grader sees, assembled from one finished session.
 *
 * It is deliberately a pure function of the session: the grade has to be
 * reproducible from the stored session file alone, and a payload built inside
 * the socket handler could not be re-run or inspected. Every timestamp here
 * runs on the ACTIVE clock, so a paused break never reads as a gap in
 * conversation or narration.
 */
export function buildGradingPayload(session: Session): Record<string, unknown> {
  const s = session;
  // All grading timestamps run on the ACTIVE clock — paused time is
  // invisible to the grader, so a break never reads as a gap.
  const minutesIn = (at: number) => `${Math.round(activeMs(s, at) / 60_000)}m`;
  // mm:ss for narration — Axis D reasons about >30s gaps, so whole
  // minutes are too coarse there.
  const clockIn = (at: number) => {
    const sec = Math.round(activeMs(s, at) / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const now = Date.now();
  const sessionActiveMs = activeMs(s, now);
  const micOnMs = s.narrationSpans.reduce((sum, sp) => sum + ((sp.to ?? now) - sp.from), 0);
  return {
    language: languageMeta(s.language).label,
    problem: s.problem
      ? {
          title: s.problem.title,
          statement: s.problem.statement,
          // The candidate saw ONLY the statement; these were the
          // interviewer's private facts — clarification scoring should
          // weigh what was actually there to discover.
          hiddenConstraints: s.problem.constraints,
          brief: s.problem.brief,
        }
      : null,
    // System-design session: the bank question's full ground truth, so
    // the grader judges the design against what was actually expected
    // (stages, deep dives, level bars) rather than its own improvisation.
    design_question: (() => {
      const q = s.designQuestionId ? getDesignQuestion(s.designQuestionId) : undefined;
      return q
        ? { title: q.title, difficulty: q.difficulty, prompt: q.prompt, ground_truth: q.brief }
        : null;
    })(),
    // Tech-knowledge round: the sampled questions with their answer keys —
    // per-question verdicts are graded against these, never the grader's
    // own recall.
    tech_round: s.techQuestionIds?.length
      ? {
          topics: (s.techTopics ?? []).map((t) => TECH_TOPIC_LABELS[t]),
          questions: s.techQuestionIds
            .map((id) => getTechQuestion(id))
            .filter((q): q is NonNullable<typeof q> => q !== undefined)
            .map((q) => ({
              topic: q.topic,
              question: q.question,
              answer_key: q.answerKey,
              follow_ups: q.followUps,
            })),
        }
      : null,
    // Debug exercise: the planted-issue key for find-phase recall grading.
    debug_exercise: (() => {
      const ex = s.debugExerciseId ? getDebugExercise(s.debugExerciseId) : undefined;
      return ex
        ? {
            title: ex.title,
            scenario: ex.scenario,
            planted_issues: ex.plantedIssues,
            expected_fix: ex.brief,
          }
        : null;
    })(),
    // OOP round: the question's private ground truth for the staged review.
    oop_question: (() => {
      const q = s.oopQuestionId ? getOopQuestion(s.oopQuestionId) : undefined;
      return q
        ? { title: q.title, difficulty: q.difficulty, prompt: q.prompt, patterns: q.patterns, ground_truth: q.brief }
        : null;
    })(),
    transcript: s.turns.map((t) => ({
      at: minutesIn(t.at),
      role: t.role,
      persona: t.persona,
      content: t.content,
    })),
    edits: s.edits.map((e) => e.summary),
    // Ambient think-aloud channel: what the candidate said out loud while
    // coding, and when the mic was actually on — so silence is only ever
    // judged where speech could have been captured.
    narrationChannel: {
      enabled: s.narrationSpans.length > 0,
      micOnSpans: s.narrationSpans.map((sp) => ({
        from: clockIn(sp.from),
        to: sp.to === null ? 'session end' : clockIn(sp.to),
      })),
      coveragePctOfSession: sessionActiveMs > 0 ? Math.min(100, Math.round((micOnMs / sessionActiveMs) * 100)) : 0,
    },
    // Sanctioned breaks: the candidate paused the clock. Timestamps above
    // already exclude this time entirely.
    pauses: {
      count: s.pauseSpans.length,
      totalPausedMinutes: Math.round((pausedMsUntil(s, now) / 60_000) * 10) / 10,
    },
    narration: s.narration.map((n) => ({ at: clockIn(n.at), text: n.text })),
    finalBuffer: s.buffer,
    build: s.build.status,
    tests: s.tests ? { passed: s.tests.passed, total: s.tests.total } : null,
    // The journey, not just the destination: every compile/run with its
    // outcome, so the grader can weigh trajectory (failed builds, when
    // tests first went green) as evidence.
    runHistory: s.runs.map((r) => ({
      at: minutesIn(r.at),
      build: r.build,
      tests: r.total !== null ? `${r.passed}/${r.total}` : null,
    })),
    durationMinutes: Math.round(sessionActiveMs / 60_000),
  };
}
