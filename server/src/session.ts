import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { BuildResult, Cursor, Language, Persona, Selection, TestsResult, Turn } from '../../shared/protocol';
import type { EditSummary, NarrationSegment, ServerProblem, Session, UsageEntry } from './types.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SESSIONS_DIR = path.join(REPO_ROOT, 'sessions');

// Total paused time up to the instant `at` (open span counted up to `at`).
export function pausedMsUntil(session: Session, at: number): number {
  let sum = 0;
  for (const sp of session.pauseSpans) {
    if (sp.from >= at) continue;
    sum += Math.min(sp.to ?? at, at) - sp.from;
  }
  return sum;
}

// Active (unpaused) session time at `at` — the clock every grading input
// runs on: pausing must never read as silence or slow progress.
export function activeMs(session: Session, at: number): number {
  return Math.max(0, at - session.startedAt - pausedMsUntil(session, at));
}

// LeetCode semantics: the C++ build force-includes <bits/stdc++.h> and
// `using namespace std;` — buffers need no boilerplate.
const DEFAULT_BUFFERS: Record<Language, string> = {
  cpp: `// All standard headers are pre-included and \`using namespace std\` is on
// (LeetCode-style) — no #includes needed.
// Paste a rough problem into the left pane to generate a stub and tests,
// or just write code here and hit Ctrl/Cmd+Enter to compile and run.

int main() {
    cout << "hello" << endl;
    return 0;
}
`,
  python: `# Paste a rough problem into the left pane to generate a stub and tests,
# or just write code here and hit Ctrl/Cmd+Enter to run.

print("hello")
`,
};

export class SessionStore {
  session: Session;
  // Snapshot of the buffer at the last turn boundary — memory only, never
  // enters model context (§6.2). Used to produce mechanical edit summaries.
  private lastTurnBuffer: string;
  private lastErrorSignature: string | null = null;

  constructor() {
    const now = Date.now();
    this.session = {
      id: `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
      startedAt: now,
      persona: 'interviewer',
      problem: null,
      buffer: DEFAULT_BUFFERS.cpp,
      language: 'cpp',
      selection: null,
      cursor: { line: 1, column: 1 },
      build: { status: 'clean', stderr: null, at: 0 },
      lastBuild: null,
      consecutiveBuildFailures: 0,
      tests: null,
      runs: [],
      turns: [],
      edits: [],
      narration: [],
      narrationSpans: [],
      // Sessions begin paused: the clock starts on the first ▶ Resume, so
      // setup time (pasting a problem, reading it) never counts as interview
      // time or shows up as a silence gap.
      pauseSpans: [{ from: now, to: null }],
      narrationSentThrough: 0,
      usage: [],
      compactSummary: null,
      compactedThrough: 0,
      debrief: null,
    };
    this.lastTurnBuffer = this.session.buffer;
  }

  updateEditor(buffer: string, selection: Selection | null, cursor: Cursor): void {
    this.session.buffer = buffer;
    this.session.selection = selection;
    this.session.cursor = cursor;
  }

  setPersona(persona: Persona): void {
    this.session.persona = persona;
  }

  // Switch working language. If the buffer is still an untouched default,
  // swap it for the new language's default so the editor isn't left showing
  // the wrong syntax; real work is never overwritten.
  setLanguage(language: Language): void {
    const pristine = Object.values(DEFAULT_BUFFERS).includes(this.session.buffer);
    this.session.language = language;
    if (pristine) {
      this.session.buffer = DEFAULT_BUFFERS[language];
      this.lastTurnBuffer = this.session.buffer;
    }
  }

  setProblem(problem: ServerProblem): void {
    this.session.problem = problem;
    this.session.buffer = problem.signature;
    this.session.selection = null;
    this.session.cursor = { line: 1, column: 1 };
    this.session.build = { status: 'clean', stderr: null, at: 0 };
    this.session.lastBuild = null;
    this.session.consecutiveBuildFailures = 0;
    this.session.tests = null;
    this.lastTurnBuffer = problem.signature;
    this.lastErrorSignature = null;
  }

  // Called just before a user message enters history: if the buffer changed
  // since the previous turn boundary, record a ~15-token mechanical summary.
  recordEditBoundary(): EditSummary | null {
    const prev = this.lastTurnBuffer;
    const next = this.session.buffer;
    if (prev === next) return null;

    const prevLines = prev.split('\n');
    const nextLines = next.split('\n');
    let start = 0;
    while (start < prevLines.length && start < nextLines.length && prevLines[start] === nextLines[start]) {
      start++;
    }
    let endPrev = prevLines.length - 1;
    let endNext = nextLines.length - 1;
    while (endPrev >= start && endNext >= start && prevLines[endPrev] === nextLines[endNext]) {
      endPrev--;
      endNext--;
    }

    const delta = next.length - prev.length;
    const deltaStr = `${delta >= 0 ? '+' : ''}${delta} chars`;
    let linesTouched: [number, number] | null;
    let summary: string;
    if (endNext < start) {
      linesTouched = null;
      summary = `removed lines around ${start + 1} (${deltaStr})`;
    } else {
      linesTouched = [start + 1, endNext + 1];
      summary =
        start === endNext
          ? `modified line ${start + 1} (${deltaStr})`
          : `modified lines ${start + 1}-${endNext + 1} (${deltaStr})`;
    }

    const edit: EditSummary = {
      atTurn: this.session.turns.length,
      linesTouched,
      netCharDelta: delta,
      summary,
    };
    this.session.edits.push(edit);
    this.lastTurnBuffer = next;
    return edit;
  }

  addTurn(turn: Turn): void {
    this.session.turns.push(turn);
  }

  // --- Ambient narration channel ---------------------------------------------

  addNarration(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.session.narration.push({ at: Date.now(), atTurn: this.session.turns.length, text: trimmed });
  }

  // Open/close a mic-on span. Idempotent: repeated 'on' (e.g. the client
  // re-announcing after a reconnect) doesn't open a second span.
  setNarrationState(on: boolean): void {
    const spans = this.session.narrationSpans;
    const open = spans.length > 0 && spans[spans.length - 1].to === null;
    if (on && !open) spans.push({ from: Date.now(), to: null });
    else if (!on && open) spans[spans.length - 1].to = Date.now();
  }

  // Open/close a pause span. Idempotent, same shape as setNarrationState.
  setPaused(on: boolean): void {
    const spans = this.session.pauseSpans;
    const open = spans.length > 0 && spans[spans.length - 1].to === null;
    if (on && !open) spans.push({ from: Date.now(), to: null });
    else if (!on && open) spans[spans.length - 1].to = Date.now();
  }

  // Segments not yet shown to the model — consumed once per chat turn.
  takePendingNarration(): NarrationSegment[] {
    const pending = this.session.narration.slice(this.session.narrationSentThrough);
    this.session.narrationSentThrough = this.session.narration.length;
    return pending;
  }

  recordBuild(result: BuildResult): void {
    this.session.lastBuild = result;
    this.session.build = {
      status: result.status,
      stderr: result.status === 'error' || result.stderr ? result.stderr : null,
      at: Date.now(),
    };
    if (result.status === 'error') {
      const signature = result.stderr.split('\n')[0]?.trim() ?? '';
      this.session.consecutiveBuildFailures =
        signature && signature === this.lastErrorSignature ? this.session.consecutiveBuildFailures + 1 : 1;
      this.lastErrorSignature = signature;
    } else {
      this.session.consecutiveBuildFailures = 0;
      this.lastErrorSignature = null;
    }
  }

  recordTests(result: TestsResult): void {
    this.session.tests = { ...result, at: Date.now() };
  }

  // One entry per compile/run, appended after recordBuild/recordTests.
  recordRun(build: BuildResult, tests: TestsResult | null): void {
    this.session.runs.push({
      at: Date.now(),
      build: build.status,
      passed: tests?.passed ?? null,
      total: tests?.total ?? null,
    });
  }

  recordUsage(entry: UsageEntry): void {
    this.session.usage.push(entry);
  }

  // A session where nothing happened (no problem, no conversation, no runs,
  // no narration) isn't worth a file — without this, every page load and dev
  // StrictMode remount persisted an empty session JSON.
  private hasActivity(): boolean {
    const s = this.session;
    return (
      s.turns.length > 0 ||
      s.runs.length > 0 ||
      s.problem !== null ||
      s.narration.length > 0 ||
      s.edits.length > 0 ||
      s.debrief !== null
    );
  }

  save(): void {
    if (!this.hasActivity()) return;
    try {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(SESSIONS_DIR, `${this.session.id}.json`),
        JSON.stringify(this.session, null, 2),
      );
    } catch (err) {
      console.error('failed to persist session:', err);
    }
  }
}
