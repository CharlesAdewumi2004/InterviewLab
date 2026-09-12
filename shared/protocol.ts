// WebSocket protocol shared between client and server.

import type { Language } from './languages';

export type { Language };

// interviewer = technical coding round; sysdesign and behavioral are
// dedicated round types (each grades into its own §3 mode via axes E/F).
// techq = technical-knowledge drills (verbal + escalations + debug exercises);
// oopdesign = low-level OOP design, talk-then-code; mock = the full loop
// simulation (intro, two coding questions, your questions back, debrief).
export type Persona = 'interviewer' | 'sysdesign' | 'behavioral' | 'tutor' | 'mock' | 'techq' | 'oopdesign';

// Sessions and gradebook rows written before a persona was renamed still hold
// the old id; normalize on read so history keeps rendering.
const PERSONA_ALIASES: Record<string, Persona> = { bloomberg: 'mock' };

export function normalizePersona(value: string): Persona {
  return PERSONA_ALIASES[value] ?? (value as Persona);
}

// Topic chips for the tech-knowledge round — mirror the bank's topic keys.
export type TechTopic =
  | 'os'
  | 'networking'
  | 'cpp'
  | 'memory'
  | 'lowlevel'
  | 'concurrency'
  | 'dsinternals'
  | 'data';

export interface Selection {
  startLine: number;
  endLine: number;
  text: string;
}

export interface Cursor {
  line: number;
  column: number;
}

export interface Example {
  input: string;
  output: string;
  note: string;
}

// The problem as the client sees it — deliberately bare, like a real
// interview: constraints and examples are the INTERVIEWER's private ground
// truth (extracting them by asking is scored), and the hidden brief, tests
// and harness are server-only. All of it is stripped before this crosses
// the socket.
export interface ClientProblem {
  title: string;
  statement: string;
  signature: string;
  // Oral delivery (phone-screen style): the interviewer STATED the problem in
  // chat/voice instead — title and statement arrive blanked, and listening +
  // asking for repeats is part of the exercise.
  oral: boolean;
  // Debug-&-optimize exercise: the editor was seeded with deliberately flawed
  // code — find the issues by reading, then fix and optimize until the tests
  // (including the timed perf case) pass.
  debug?: boolean;
}

export interface BuildResult {
  status: 'ok' | 'error';
  stderr: string;
  stdout: string;
}

export interface TestFailure {
  index: number;
  input: string;
  expected: string;
  actual: string;
}

export interface TestsResult {
  passed: number;
  total: number;
  failures: TestFailure[];
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  persona: Persona;
}

// --- Grading (interview-grading-system.md is the source of truth) -----------
// The model scores axes against the behavioral anchors and logs evidence,
// hints, clarifications and flags. The SERVER computes the weighted average,
// applies the gates, and produces the recommendation (§5 is mechanical).

export type AxisId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface ScorecardAxis {
  axis: AxisId;
  name: string;
  score: number; // 1-4, half-points allowed when evidence straddles anchors
  evidence: string; // ≥2 specific behavioural observations, or the axis is omitted (Not Observed)
}

export interface HintLogEntry {
  level: number; // 1-4 per the hint ladder
  hint: string;
  uptake: string; // latency / completeness of integration
}

// The 8 unprompted-clarification checklist items (§6). Null when no coding
// problem was attempted.
export interface Clarifications {
  size: boolean;
  empty: boolean;
  duplicates: boolean;
  boundaries: boolean;
  mutation: boolean;
  complexity_target: boolean;
  ordering: boolean;
  invalid_input: boolean;
}

// Model-produced scorecard (evidence + judgments). Decision math lives
// server-side in GradeSummary.
export interface Scorecard {
  verdict: string;
  axes: ScorecardAxis[]; // only axes with actual evidence — never guessed
  hints: HintLogEntry[];
  clarifications: Clarifications | null;
  red_flags: string[];
  green_flags: string[];
  biggest_risk: string;
  rewrite: { original: string; improved: string };
  highest_leverage_fix: string;
  next_drill: string;
  confidence: 'low' | 'medium' | 'high';
  decision_observation: string;
  // Present only for system-design and OOP-design sessions (a bank question
  // was active) — OOP rounds reuse the staged review with OOP stages.
  design_review: DesignReview | null;
  // Present only for tech-knowledge sessions (§10.1).
  knowledge_review: KnowledgeReview | null;
}

// §10.1 — per-question review of a tech-knowledge round, graded against each
// bank question's private answer key. Null for every other round type.
export interface KnowledgeReview {
  items: {
    question: string; // as asked
    topic: TechTopic;
    verdict: 'nailed' | 'partial' | 'missed';
    note: string; // what the follow-ups exposed
  }[];
  strongest: string; // topic-level read, steers drills
  weakest: string;
  // Only when a debug-&-optimize exercise ran: recall vs the planted issues.
  debug: {
    issuesFound: string[];
    issuesMissed: string[];
    falsePositives: string[];
    fixOutcome: string;
    perfGatePassed: boolean | null;
  } | null;
}

export type SessionMode = 'coding' | 'full_interview' | 'system_design' | 'behavioral' | 'tech_knowledge' | 'oop_design';
export type Recommendation = 'strong hire' | 'hire' | 'lean no hire' | 'no hire';

// Server-computed decision + measured telemetry (§5 + §7 inputs).
export interface GradeSummary {
  mode: SessionMode; // inferred from observed axes (E → system design, F → full interview)
  weighted: number; // weighted average of axes, 0-4, per-mode weights (§3)
  provisional: Recommendation; // from the weighted band, incl. the D/F tiebreak
  recommendation: Recommendation; // after gates
  gates: string[]; // human-readable list of triggered gates
  hintAvgLevel: number | null; // hint dependency curve input (§7)
  clarificationHits: number | null; // 0-8 unprompted (§7 hit rate)
  redFlagCount: number;
  greenFlagCount: number;
  durationMin: number;
  runs: number;
  buildFailures: number;
  testsPassed: number | null;
  testsTotal: number | null;
  timeToGreenMin: number | null; // first run with all tests passing
  // % of the session with the narration mic on. The §7 readiness bar only
  // counts sessions where think-aloud was actually captured. Null on grades
  // recorded before this was tracked.
  narrationCoveragePct: number | null;
}

// A stored gradebook row, as served by GET /api/progress.
export interface GradeRecord extends GradeSummary {
  sessionId: string;
  gradedAt: number;
  rubricVersion: number;
  persona: Persona;
  problemTitle: string | null;
  axes: ScorecardAxis[];
  designReview: DesignReview | null;
  knowledgeReview: KnowledgeReview | null;
}

// System-design question bank (HelloInterview-style): client-safe metadata
// only — the interviewer's per-question ground truth never crosses the socket.
export interface DesignMeta {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  asks: string[];
  patterns: string[];
}

// Per-stage review of a system-design session (HelloInterview delivery
// framework stages), produced by the grader alongside the axes. Null for
// non-design sessions.
export interface DesignReview {
  stages: {
    // System-design rounds use requirements/entities/api/high_level/deep_dives;
    // OOP rounds use requirements/entities/interfaces/patterns/implementation.
    stage:
      | 'requirements'
      | 'entities'
      | 'api'
      | 'high_level'
      | 'deep_dives'
      | 'interfaces'
      | 'patterns'
      | 'implementation';
    score: number; // 1-4, same scale as axes
    evidence: string;
  }[];
  level_signal: 'below mid-level' | 'mid-level' | 'senior' | 'staff+';
  // One-paragraph read on the three level dimensions: depth, breadth, proactiveness.
  dimensions: string;
}

// End-of-day recap across every session practised that day, produced by the
// heavy model from the day's scorecards + telemetry (POST /api/recap).
export interface DailyRecap {
  headline: string; // 1-2 sentence verdict on the day
  went_well: { point: string; evidence: string }[];
  needs_work: { point: string; evidence: string; recurring: boolean }[];
  metrics_note: string; // hint dependency, clarification rate, pace across the day
  top_priority: string; // the single thing to fix first
  drills: string[]; // concrete exercises for tomorrow
}

// System-design bank metadata is DesignMeta; the OOP bank's client-safe shape
// differs slightly (asks is a one-line "what's being designed", not companies).
export interface OopMeta {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  asks: string;
  patterns: string[];
}

export type ClientMessage =
  // delivery 'oral' = the interviewer speaks the problem (pane text hidden);
  // 'text' (default) = statement shown in the pane as well. `voice` mirrors
  // chat:send: when on, the oral statement is styled for text-to-speech.
  // framing 'plain' = no invented scenario at all: the problem delivered
  // straight (still interviewer-voiced, constraints still private);
  // 'scenario' (default) = bare algorithms get dressed, grounded ones kept.
  | { type: 'problem:intake'; raw: string; delivery?: 'text' | 'oral'; voice?: boolean; framing?: 'scenario' | 'plain' }
  | { type: 'editor:state'; buffer: string; selection: Selection | null; cursor: Cursor }
  // chat:send and run carry the buffer so the backend never acts on a stale
  // debounced copy — the payload is authoritative at that instant.
  // `voice` marks messages sent while voice mode is on — the reply will be
  // read aloud, so the persona shifts to a short, speakable style.
  | { type: 'chat:send'; content: string; buffer: string; selection: Selection | null; cursor: Cursor; voice?: boolean }
  | { type: 'run'; buffer: string }
  | { type: 'persona:set'; persona: Persona }
  // Switch working language. The server answers with a fresh session:ready
  // snapshot (buffer may swap if it was still the untouched default) and the
  // problem generator produces stubs/harnesses in this language from then on.
  | { type: 'language:set'; language: Language }
  // Ambient narration channel: think-aloud spoken while coding, transcribed
  // continuously. Segments are context + Axis D evidence, never chat turns —
  // the interviewer does not reply to them. `narration:state` marks when the
  // channel is on so the grader can tell "was silent" from "mic was off".
  | { type: 'narration:state'; on: boolean }
  | { type: 'narration:segment'; text: string }
  // Pause/resume the session: the clock stops, and paused time is excluded
  // from every grading input (duration, timestamps, silence analysis).
  | { type: 'session:pause'; paused: boolean }
  // Discard the current session and start a fresh one on the same connection
  // (the old session is persisted to disk if anything happened in it).
  | { type: 'session:reset' }
  // Pick a system-design question from the bank (random when id is omitted).
  // The interviewer states the prompt in chat; the private brief becomes its
  // ground truth. Only meaningful with the sysdesign persona.
  | { type: 'design:pick'; id?: string }
  // Start a tech-knowledge round over the chosen topic chips: the server
  // samples a question set from the bank (private answer keys + follow-up
  // ladders become the interviewer's ground truth) and the interviewer opens
  // with the first question. Only meaningful with the techq persona.
  | { type: 'techq:start'; topics: TechTopic[] }
  // Pick a debug-&-optimize exercise (random when id omitted, filtered to the
  // session language): flawed code is seeded into the editor as a problem
  // whose planted-issue key stays server-side. techq persona.
  | { type: 'debug:pick'; id?: string }
  // Pick an OOP design question — mirrors design:pick for the oopdesign
  // persona (canned prompt turn; private brief becomes ground truth).
  | { type: 'oop:pick'; id?: string }
  // The CV changed via HTTP upload (PUT/DELETE /api/cv) — rebuild the chat
  // runtime so the persona's context picks it up.
  | { type: 'cv:updated' }
  // Semantic autocomplete: clangd runs server-side; the client ships the whole
  // buffer per request (the server owns LSP document sync) and gets the raw
  // LSP result back. line/column are Monaco's 1-based coordinates.
  | { type: 'lsp:request'; id: number; kind: 'completion' | 'signature' | 'hover'; buffer: string; line: number; column: number }
  | { type: 'session:end' };

export type ServerMessage =
  // Sent on every (re)connect. `resumed` means the server re-attached a
  // detached session (reconnect/refresh): the snapshot fields restore the
  // client UI so a network blip no longer wipes a 40-minute interview.
  //
  // `reason` says WHY the snapshot arrived, which decides who wins when the
  // client and server disagree about the buffer. On 'connect' the browser's
  // Monaco buffer is by construction at least as new as the server's, so the
  // client is authoritative; on 'language' and 'reset' the user asked the
  // server to change the buffer, so the server is. Required, not optional:
  // shipping the client half of this without the server half must fail to
  // compile rather than silently restore the clobbering behaviour.
  | {
      type: 'session:ready';
      sessionId: string;
      persona: Persona;
      language: Language;
      resumed: boolean;
      reason: 'connect' | 'language' | 'reset';
      startedAt: number;
      problem: ClientProblem | null;
      buffer: string;
      turns: Turn[];
      // Pause snapshot: the clock shows active time only. `pausedMs` is the
      // total of closed pause spans; `pausedAt` is the start of the currently
      // open one (null when not paused).
      paused: boolean;
      pausedMs: number;
      pausedAt: number | null;
      designQuestion: DesignMeta | null;
      techTopics: TechTopic[] | null;
      oopQuestion: OopMeta | null;
    }
  | { type: 'design:ready'; question: DesignMeta }
  | { type: 'techq:ready'; topics: TechTopic[] }
  | { type: 'oop:ready'; question: OopMeta }
  | { type: 'problem:ready'; problem: ClientProblem; buffer: string }
  | { type: 'problem:error'; message: string }
  | { type: 'chat:delta'; text: string }
  | { type: 'chat:done'; turn: Turn }
  | { type: 'chat:error'; message: string }
  | { type: 'build:status'; status: 'compiling' }
  | { type: 'build:result'; result: BuildResult }
  | { type: 'tests:result'; result: TestsResult }
  | { type: 'debrief:ready'; scorecard: Scorecard; grade: GradeSummary }
  | { type: 'debrief:error'; message: string }
  // lsp:status false (or absent) → the client uses its curated fallback lists.
  | { type: 'lsp:status'; available: boolean }
  | { type: 'lsp:result'; id: number; result: unknown };
