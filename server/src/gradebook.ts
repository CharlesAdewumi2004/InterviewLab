import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AxisId,
  DesignReview,
  GradeRecord,
  GradeSummary,
  KnowledgeReview,
  Persona,
  Recommendation,
  Scorecard,
  ScorecardAxis,
  SessionMode,
} from '../../shared/protocol';
import { activeMs, SESSIONS_DIR } from './session.js';
import type { Session } from './types.js';

// interview-grading-system.md is the source of truth for everything in this
// file. Bump when that doc changes materially — grades store the version they
// were produced under so trends stay honest.
// v2: ambient narration channel — D's continuity anchors are scored from the
// narration timeline; with the mic off, D comes from chat-visible evidence
// only or is Not Observed (never inferred from transcript gaps).
// v3: data-grounded against the outcome-labeled interviewing.io corpus —
// behavioral mode added, gates 6 (C ≤ 2) and 7 (two axes ≤ 2 → No Hire),
// per-axis calibration notes in the doc and scorecard prompt.
// v4: §8 system-design delivery rubric — per-stage review + level signal for
// design-bank sessions, stored alongside the axes.
// v5: §9 grader calibration from verified interviewer-training sources —
// difficulty-dependent signal, anchor-at-3, structure-aware hint cost,
// anti-leniency tiebreak, teaching-mode exclusion.
// v6: §10 tech-knowledge and OOP-design rounds — persona-set modes with their
// own weights, knowledge_review (per-question verdicts vs answer keys, debug
// planted-issue recall), OOP staged review sharing the design_review column.
// v7: §10.2 OOD calibration from 10 real OOD mock transcripts — API-signature
// gate as the requirements checkpoint, top-down-from-contracts, promote-
// primitives-to-classes, notice-the-incomplete-spec, hint-resistance weighting.
export const RUBRIC_VERSION = 7;

// §3 — per-mode axis weights.
const WEIGHTS: Record<SessionMode, Partial<Record<AxisId, number>>> = {
  coding: { A: 20, B: 30, C: 25, D: 25 },
  full_interview: { A: 15, B: 25, C: 20, D: 25, F: 15 },
  system_design: { A: 15, E: 45, D: 25, F: 15 },
  behavioral: { D: 40, F: 60 },
  // §10 — B renormalizes away when the round never reached code.
  tech_knowledge: { C: 45, D: 30, B: 25 },
  oop_design: { A: 15, E: 40, B: 20, D: 25 },
};

const RANK: Recommendation[] = ['no hire', 'lean no hire', 'hire', 'strong hire'];

// Mode is inferred from which axes have evidence — E means a system-design
// discussion happened; F with coding evidence means a full interview; F with
// no coding axes at all means a dedicated behavioral round. The techq and
// oopdesign personas set their mode directly (their axis sets overlap the
// coding modes, so inference can't tell them apart).
export function inferMode(axes: ScorecardAxis[], persona?: Persona): SessionMode {
  if (persona === 'techq') return 'tech_knowledge';
  if (persona === 'oopdesign') return 'oop_design';
  const ids = new Set(axes.map((a) => a.axis));
  if (ids.has('E')) return 'system_design';
  if (ids.has('F')) return ids.has('B') || ids.has('C') ? 'full_interview' : 'behavioral';
  return 'coding';
}

// §5 — weighted average, band, tiebreak, gates. Entirely mechanical: the
// model supplies scores and flags; this function supplies the decision.
export function computeDecision(
  axes: ScorecardAxis[],
  redFlags: string[],
  persona?: Persona,
): Pick<GradeSummary, 'mode' | 'weighted' | 'provisional' | 'recommendation' | 'gates'> {
  const mode = inferMode(axes, persona);
  const table = WEIGHTS[mode];

  // Weights renormalized over the axes actually observed — an axis with no
  // evidence is Not Observed (§1.2), never scored as zero.
  const scored = axes.filter((a) => table[a.axis] !== undefined);
  const weightSum = scored.reduce((s, a) => s + (table[a.axis] as number), 0);
  const weighted =
    weightSum === 0
      ? 0
      : Math.round((scored.reduce((s, a) => s + a.score * (table[a.axis] as number), 0) / weightSum) * 100) / 100;

  const score = (id: AxisId): number | null => axes.find((a) => a.axis === id)?.score ?? null;

  // Provisional band.
  let provisional: Recommendation =
    weighted >= 3.5 ? 'strong hire' : weighted >= 3.0 ? 'hire' : weighted >= 2.5 ? 'lean no hire' : 'no hire';

  // Gate 5 — in the 2.5-2.99 band, D and F are tiebreakers.
  if (weighted >= 2.5 && weighted < 3.0) {
    const tie = [score('D'), score('F')].filter((v): v is number => v !== null);
    if (tie.length > 0 && tie.every((v) => v >= 3)) provisional = 'hire';
    else if (tie.some((v) => v <= 2)) provisional = 'no hire';
  }

  // Gates 1-4 — caps applied after the average.
  const gates: string[] = [];
  let cap: Recommendation | null = null;
  const capAt = (r: Recommendation, why: string) => {
    gates.push(why);
    if (cap === null || RANK.indexOf(r) < RANK.indexOf(cap)) cap = r;
  };
  for (const a of axes) {
    if (a.score <= 1) capAt('lean no hire', `Axis ${a.axis} at 1 — capped at Lean No Hire`);
  }
  const d = score('D');
  if (d !== null && d <= 2) capAt('lean no hire', 'D ≤ 2 — capped at Lean No Hire');
  // Spec gate 3 requires B ≤ 2 on BOTH problems for No Hire; sessions here are
  // single-problem, so a lone B ≤ 2 caps at Lean No Hire instead.
  const b = score('B');
  if (b !== null && b <= 2) capAt('lean no hire', 'B ≤ 2 — capped at Lean No Hire (correctness is the baseline)');
  // Gate 6 [data]: problem-solving ≤ 2 was the modal rejection predictor.
  const c = score('C');
  if (c !== null && c <= 2) capAt('lean no hire', 'C ≤ 2 — capped at Lean No Hire (problem-solving is the modal reject driver)');
  // Gate 7 [data]: no advanced candidate had two dimensions below 3.
  if (axes.filter((a) => a.score <= 2).length >= 2) {
    capAt('no hire', 'Two or more axes ≤ 2 — No Hire (one crater is survivable, two never was)');
  }
  if (redFlags.length > 0) {
    capAt('lean no hire', `${redFlags.length} red flag${redFlags.length > 1 ? 's' : ''} — capped at Lean No Hire`);
  }

  const recommendation =
    cap !== null && RANK.indexOf(cap) < RANK.indexOf(provisional) ? cap : provisional;
  return { mode, weighted, provisional, recommendation, gates };
}

// Objective, measured telemetry — no AI judgment involved.
export function computeTelemetry(
  session: Session,
): Pick<
  GradeSummary,
  'durationMin' | 'runs' | 'buildFailures' | 'testsPassed' | 'testsTotal' | 'timeToGreenMin' | 'narrationCoveragePct'
> {
  const now = Date.now();
  // All durations run on the active clock — paused time is not session time.
  const active = activeMs(session, now);
  const firstGreen = session.runs.find((r) => r.total !== null && r.total > 0 && r.passed === r.total);
  const micOnMs = session.narrationSpans.reduce((sum, sp) => sum + ((sp.to ?? now) - sp.from), 0);
  return {
    durationMin: Math.round((active / 60_000) * 10) / 10,
    runs: session.runs.length,
    buildFailures: session.runs.filter((r) => r.build === 'error').length,
    testsPassed: session.tests?.passed ?? null,
    testsTotal: session.tests?.total ?? null,
    timeToGreenMin: firstGreen ? Math.round((activeMs(session, firstGreen.at) / 60_000) * 10) / 10 : null,
    narrationCoveragePct: active > 0 ? Math.min(100, Math.round((micOnMs / active) * 100)) : 0,
  };
}

let db: DatabaseSync | null = null;

function open(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  db = new DatabaseSync(path.join(SESSIONS_DIR, 'gradebook.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS grades (
      session_id        TEXT PRIMARY KEY,
      graded_at         INTEGER NOT NULL,
      rubric_version    INTEGER NOT NULL,
      mode              TEXT    NOT NULL,
      persona           TEXT    NOT NULL,
      problem_title     TEXT,
      weighted          REAL    NOT NULL,
      provisional       TEXT    NOT NULL,
      recommendation    TEXT    NOT NULL,
      gates_json        TEXT    NOT NULL,
      axes_json         TEXT    NOT NULL,
      hint_avg_level    REAL,
      clarification_hits INTEGER,
      red_flags         INTEGER NOT NULL,
      green_flags       INTEGER NOT NULL,
      duration_min      REAL    NOT NULL,
      runs              INTEGER NOT NULL,
      build_failures    INTEGER NOT NULL,
      tests_passed      INTEGER,
      tests_total       INTEGER,
      time_to_green_min REAL,
      narration_coverage_pct REAL,
      design_review_json TEXT,
      knowledge_review_json TEXT
    );
  `);
  // Migration for gradebooks created before narration coverage was tracked.
  try {
    db.exec('ALTER TABLE grades ADD COLUMN narration_coverage_pct REAL');
  } catch {
    // column already exists
  }
  // Migration for gradebooks created before the §8 design review (rubric v4).
  try {
    db.exec('ALTER TABLE grades ADD COLUMN design_review_json TEXT');
  } catch {
    // column already exists
  }
  // Migration for gradebooks created before the §10 knowledge review (rubric v6).
  try {
    db.exec('ALTER TABLE grades ADD COLUMN knowledge_review_json TEXT');
  } catch {
    // column already exists
  }
  return db;
}

// Grade a completed session: decision math + §7 metrics, persisted. Ending
// the same session twice re-grades it (INSERT OR REPLACE by session id).
export function recordGrade(opts: {
  session: Session;
  persona: Persona;
  scorecard: Scorecard;
}): GradeSummary {
  const { session, persona, scorecard } = opts;
  // The model's numbers are inputs, not gospel: clamp scores to the 1-4 scale
  // (half-points allowed) and hint levels to the 1-4 ladder before any math —
  // one out-of-range value would otherwise corrupt the weighted average and
  // the gradebook trendlines.
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const axes = scorecard.axes.map((a) => ({ ...a, score: clamp(Math.round(a.score * 2) / 2, 1, 4) }));
  const decision = computeDecision(axes, scorecard.red_flags, persona);
  const telemetry = computeTelemetry(session);
  const hintAvgLevel =
    scorecard.hints.length > 0
      ? Math.round(
          (scorecard.hints.reduce((s, h) => s + clamp(Math.round(h.level), 1, 4), 0) / scorecard.hints.length) * 10,
        ) / 10
      : null;
  const clarificationHits = scorecard.clarifications
    ? Object.values(scorecard.clarifications).filter(Boolean).length
    : null;
  const grade: GradeSummary = {
    ...decision,
    ...telemetry,
    hintAvgLevel,
    clarificationHits,
    redFlagCount: scorecard.red_flags.length,
    greenFlagCount: scorecard.green_flags.length,
  };
  open()
    .prepare(
      `INSERT OR REPLACE INTO grades
       (session_id, graded_at, rubric_version, mode, persona, problem_title, weighted, provisional,
        recommendation, gates_json, axes_json, hint_avg_level, clarification_hits, red_flags, green_flags,
        duration_min, runs, build_failures, tests_passed, tests_total, time_to_green_min, narration_coverage_pct,
        design_review_json, knowledge_review_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      session.id,
      Date.now(),
      RUBRIC_VERSION,
      grade.mode,
      persona,
      session.problem?.title ?? null,
      grade.weighted,
      grade.provisional,
      grade.recommendation,
      JSON.stringify(grade.gates),
      JSON.stringify(axes),
      grade.hintAvgLevel,
      grade.clarificationHits,
      grade.redFlagCount,
      grade.greenFlagCount,
      grade.durationMin,
      grade.runs,
      grade.buildFailures,
      grade.testsPassed,
      grade.testsTotal,
      grade.timeToGreenMin,
      grade.narrationCoveragePct,
      scorecard.design_review ? JSON.stringify(scorecard.design_review) : null,
      scorecard.knowledge_review ? JSON.stringify(scorecard.knowledge_review) : null,
    );
  return grade;
}

// Remove a graded session from the gradebook (the session JSON on disk is
// untouched). Ending that session again would simply re-grade it.
export function deleteGrade(sessionId: string): boolean {
  const result = open().prepare('DELETE FROM grades WHERE session_id = ?').run(sessionId);
  return Number(result.changes) > 0;
}

export function listGrades(): GradeRecord[] {
  const rows = open().prepare('SELECT * FROM grades ORDER BY graded_at ASC').all() as Record<
    string,
    string | number | null
  >[];
  return rows.map((r) => ({
    sessionId: r.session_id as string,
    gradedAt: r.graded_at as number,
    rubricVersion: r.rubric_version as number,
    mode: r.mode as SessionMode,
    persona: r.persona as Persona,
    problemTitle: r.problem_title as string | null,
    weighted: r.weighted as number,
    provisional: r.provisional as Recommendation,
    recommendation: r.recommendation as Recommendation,
    gates: JSON.parse(r.gates_json as string) as string[],
    axes: JSON.parse(r.axes_json as string) as ScorecardAxis[],
    hintAvgLevel: r.hint_avg_level as number | null,
    clarificationHits: r.clarification_hits as number | null,
    redFlagCount: r.red_flags as number,
    greenFlagCount: r.green_flags as number,
    durationMin: r.duration_min as number,
    runs: r.runs as number,
    buildFailures: r.build_failures as number,
    testsPassed: r.tests_passed as number | null,
    testsTotal: r.tests_total as number | null,
    timeToGreenMin: r.time_to_green_min as number | null,
    narrationCoveragePct: r.narration_coverage_pct as number | null,
    designReview: r.design_review_json ? (JSON.parse(r.design_review_json as string) as DesignReview) : null,
    knowledgeReview: r.knowledge_review_json
      ? (JSON.parse(r.knowledge_review_json as string) as KnowledgeReview)
      : null,
  }));
}
