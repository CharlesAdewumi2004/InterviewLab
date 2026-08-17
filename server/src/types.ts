import type {
  BuildResult,
  ClientProblem,
  Cursor,
  Example,
  Language,
  Persona,
  Scorecard,
  Selection,
  TestsResult,
  Turn,
} from '../../shared/protocol';

export interface TestCase {
  input: string;
  expected: string;
}

// Full problem, server-side only. `constraints` and `examples` are the
// interviewer's private ground truth — revealed one fact at a time when the
// candidate asks (never shown in the problem pane); `brief` is never sent to
// the client; `tests` and `harness` feed the runner.
export interface ServerProblem extends ClientProblem {
  constraints: string[];
  examples: Example[];
  brief: string;
  tests: TestCase[];
  harness: string;
}

export interface EditSummary {
  atTurn: number;
  linesTouched: [number, number] | null;
  netCharDelta: number;
  summary: string;
}

export interface UsageEntry {
  at: number;
  purpose: 'chat' | 'intake' | 'debrief' | 'compact' | 'recap';
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface BuildState {
  status: 'clean' | 'compiling' | 'error' | 'ok';
  stderr: string | null;
  at: number;
}

// One compile/run event. The full log (not just the latest state) is what the
// grader and the gradebook telemetry are built from — the journey matters.
export interface RunEvent {
  at: number;
  build: 'ok' | 'error';
  passed: number | null;
  total: number | null;
}

// One finalized think-aloud utterance from the ambient narration channel.
// `atTurn` (turns.length at arrival) interleaves it into history replay the
// same way EditSummary is.
export interface NarrationSegment {
  at: number;
  atTurn: number;
  text: string;
}

// A stretch of the session during which the narration mic was on. `to` is
// null while the span is still open. The grader uses these to distinguish
// real silence from a mic that was simply off.
export interface NarrationSpan {
  from: number;
  to: number | null;
}

// A stretch of the session during which the candidate paused the clock. `to`
// is null while the pause is still open. Paused time is excluded from every
// timing input to grading (duration, timestamps, silence analysis).
export interface PauseSpan {
  from: number;
  to: number | null;
}

export interface Session {
  id: string;
  startedAt: number;
  persona: Persona;
  problem: ServerProblem | null;
  buffer: string;
  language: Language;
  selection: Selection | null;
  cursor: Cursor;
  build: BuildState;
  lastBuild: BuildResult | null;
  consecutiveBuildFailures: number;
  tests: (TestsResult & { at: number }) | null;
  runs: RunEvent[];
  turns: Turn[];
  edits: EditSummary[];
  narration: NarrationSegment[];
  narrationSpans: NarrationSpan[];
  pauseSpans: PauseSpan[];
  // narration[0..narrationSentThrough) has already ridden a chat turn's live
  // state — only newer segments are pending for the next turn.
  narrationSentThrough: number;
  usage: UsageEntry[];
  // History compaction (§6.2): turns[0..compactedThrough) are represented by
  // compactSummary instead of being sent verbatim.
  compactSummary: string | null;
  compactedThrough: number;
  // Model-produced scorecard from the last session:end, persisted with the
  // session file (the decision math lives in the gradebook, not here).
  debrief: Scorecard | null;
  // Active system-design bank question (sysdesign persona) — id into
  // DESIGN_BANK; the brief is injected into the persona's system prompt.
  designQuestionId: string | null;
}
