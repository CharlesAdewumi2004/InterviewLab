import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ClientProblem, Scorecard, ServerMessage, Turn } from '../../shared/protocol';
import { activeMs, pausedMsUntil, SessionStore } from './session.js';
import { assembleTurn, buildSystemPrompt } from './context.js';
import { ChatSession, maybeCompact, structuredCall } from './claude.js';
import { ClangdSession } from './clangd.js';
import { deleteGrade, listGrades, recordGrade } from './gradebook.js';
import { dailyRecap } from './recap.js';
import { compileAndRun } from './runner.js';
import { intakePrompt, INTAKE_SCHEMA } from './prompts/intake.js';
import { SCORECARD_PROMPT, SCORECARD_SCHEMA } from './prompts/scorecard.js';
import type { ServerProblem } from './types.js';

const PORT = Number(process.env.PORT || 3001);
// 127.0.0.1 for local dev; Docker sets HOST=0.0.0.0 so the published port works.
const HOST = process.env.HOST || '127.0.0.1';

// Model calls run through the Claude Agent SDK on the user's own Claude
// subscription — no API key involved. See claude.ts. Two ways to link an
// account, checked here so a fresh setup gets clear instructions at boot.
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.log('Model access: Claude subscription via CLAUDE_CODE_OAUTH_TOKEN.');
} else if (fs.existsSync(path.join(os.homedir(), '.claude'))) {
  console.log('Model access: Claude Code login found on this machine (run `claude` then `/login` if calls fail with auth errors).');
} else {
  console.warn(
    [
      '',
      '⚠ No Claude account linked yet — model calls will fail until you do ONE of:',
      '  1. Run `claude` then `/login` on this machine (Claude Pro/Max subscription), or',
      '  2. Run `claude setup-token` (on any machine — or `docker compose run --rm auth`),',
      '     then put the token in .env as CLAUDE_CODE_OAUTH_TOKEN=...',
      'Your account, your usage — nothing is stored in this repository.',
      '',
    ].join('\n'),
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// The client never sees the hidden brief, tests, harness — or the constraints
// and examples: those are the interviewer's private ground truth, and the
// candidate is expected to extract them by asking. Strip in one place for
// intake and session-resume alike.
function toClientProblem(p: ServerProblem): ClientProblem {
  // Oral delivery hides even the title — a LeetCode problem name is a solution
  // giveaway, and on a real phone screen you only get what you heard.
  if (p.oral) return { title: 'Problem (delivered orally)', statement: '', signature: p.signature, oral: true };
  return { title: p.title, statement: p.statement, signature: p.signature, oral: false };
}

// Sessions survive disconnects: on close the store is parked here and a
// reconnect (or page refresh) presenting the same sid re-attaches it — a
// network blip no longer wipes a 40-minute interview. The model runtime is
// rebuilt lazily; buildHistory replays the conversation into it.
const DETACHED_TTL_MS = 60 * 60_000;
const detached = new Map<string, { store: SessionStore; timer: NodeJS.Timeout }>();

function handleConnection(socket: WebSocket, request: IncomingMessage): void {
  const sid = new URL(request.url ?? '/', 'http://localhost').searchParams.get('sid');
  const held = sid ? detached.get(sid) : undefined;
  if (held) {
    clearTimeout(held.timer);
    detached.delete(sid as string);
  }
  let store = held ? held.store : new SessionStore();
  const resumed = held !== undefined;
  let chatBusy = false;
  let runBusy = false;
  let endBusy = false;

  // Persistent chat runtime, pre-warmed at connect so the first message skips
  // process-spawn latency. Restarted whenever the system prompt must change
  // (persona switch, new problem) or the runtime dies — a fresh session's
  // first turn replays the conversation history, so nothing is lost.
  let chat = new ChatSession(buildSystemPrompt(store.session));
  const resetChat = () => {
    chat.dispose();
    chat = new ChatSession(buildSystemPrompt(store.session));
  };

  const send = (msg: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  };

  // Sent at connect and again after a session:reset swaps the store.
  const announceSession = (asResumed: boolean) => {
    const s = store.session;
    const lastPause = s.pauseSpans[s.pauseSpans.length - 1];
    const pausedNow = lastPause !== undefined && lastPause.to === null;
    send({
      type: 'session:ready',
      sessionId: s.id,
      persona: s.persona,
      language: s.language,
      resumed: asResumed,
      startedAt: s.startedAt,
      problem: s.problem ? toClientProblem(s.problem) : null,
      buffer: s.buffer,
      turns: s.turns,
      paused: pausedNow,
      pausedMs: s.pauseSpans.reduce((sum, sp) => sum + (sp.to !== null ? sp.to - sp.from : 0), 0),
      pausedAt: pausedNow ? lastPause.from : null,
    });
  };
  announceSession(resumed);

  // Semantic autocomplete: boot clangd eagerly so the expensive first parse
  // of <bits/stdc++.h> happens now, not on the first keystroke.
  const clangd = new ClangdSession(store.session.buffer);
  void clangd.ready().then((available) => send({ type: 'lsp:status', available }));

  async function handleChat(msg: Extract<ClientMessage, { type: 'chat:send' }>): Promise<void> {
    if (chatBusy) {
      send({ type: 'chat:error', message: 'Still responding to the previous message.' });
      return;
    }
    chatBusy = true;
    // Pin the store: a session:reset mid-turn must not write into the new
    // session's history.
    const st = store;
    try {
      // The chat payload carries the authoritative editor state — never trust
      // the debounced copy at the moment the user asks a question.
      st.updateEditor(msg.buffer, msg.selection, msg.cursor);
      const latestEdit = st.recordEditBoundary();

      if (!chat.alive) resetChat();
      const fresh = chat.isNew();
      const turnText = assembleTurn(st.session, msg.content, latestEdit, {
        voice: msg.voice === true,
        includeHistory: fresh, // replay prior turns only when the runtime restarted
        includeBuffer: fresh || latestEdit !== null, // buffer rides along only when it changed
        narration: st.takePendingNarration(), // think-aloud since the last turn
      });

      st.addTurn({ role: 'user', content: msg.content, at: Date.now(), persona: st.session.persona });

      const { text, usage } = await chat.send(turnText, (t) => send({ type: 'chat:delta', text: t }));
      // An empty reply (stream cut off before any text) must be treated as a
      // failure: recording it — or keeping the runtime — would poison the
      // session transcript with an empty assistant block, and the API then
      // rejects every later turn with "text content blocks must be non-empty".
      if (!text.trim()) throw new Error('The model returned an empty reply — send that again.');

      const turn: Turn = { role: 'assistant', content: text, at: Date.now(), persona: st.session.persona };
      st.addTurn(turn);
      st.recordUsage(usage);
      st.save();
      send({ type: 'chat:done', turn });

      maybeCompact(st.session)
        .then((compactUsage) => {
          if (compactUsage) {
            st.recordUsage(compactUsage);
            st.save();
          }
        })
        .catch((err) => console.error('compaction failed:', err));
    } catch (err) {
      // Never reuse a runtime whose turn failed: an interrupted stream can
      // leave an empty assistant block in the SDK's internal transcript,
      // which 400s every subsequent request. A fresh session replays the
      // conversation from our store, so nothing is lost.
      resetChat();
      send({ type: 'chat:error', message: errorMessage(err) });
    } finally {
      chatBusy = false;
    }
  }

  async function handleRun(msg: Extract<ClientMessage, { type: 'run' }>): Promise<void> {
    if (runBusy) return;
    runBusy = true;
    const st = store;
    try {
      st.updateEditor(msg.buffer, st.session.selection, st.session.cursor);
      send({ type: 'build:status', status: 'compiling' });
      const { build, tests } = await compileAndRun(st.session);
      st.recordBuild(build);
      if (tests) st.recordTests(tests);
      st.recordRun(build, tests ?? null);
      st.save();
      send({ type: 'build:result', result: build });
      if (tests) send({ type: 'tests:result', result: tests });
    } catch (err) {
      send({ type: 'build:result', result: { status: 'error', stderr: errorMessage(err), stdout: '' } });
    } finally {
      runBusy = false;
    }
  }

  async function handleIntake(msg: Extract<ClientMessage, { type: 'problem:intake' }>): Promise<void> {
    const st = store;
    try {
      const { data, usage } = await structuredCall<ServerProblem>({
        purpose: 'intake',
        system: intakePrompt(st.session.language),
        userContent: msg.raw,
        schema: INTAKE_SCHEMA as unknown as Record<string, unknown>,
      });
      const problem: ServerProblem = { ...data, oral: msg.delivery === 'oral' };
      st.setProblem(problem);
      st.recordUsage(usage);
      st.save();
      resetChat(); // system prompt now carries the problem + hidden brief
      send({ type: 'problem:ready', problem: toClientProblem(problem), buffer: problem.signature });
      // Phone-screen style: the interviewer states the problem out loud —
      // the pane shows nothing, listening is part of the exercise.
      if (problem.oral) await announceProblemOrally(msg.voice === true);
    } catch (err) {
      send({ type: 'problem:error', message: errorMessage(err) });
    }
  }

  // Server-initiated interviewer turn that delivers the problem verbally.
  // Mirrors handleChat's streaming/error handling, but the instruction that
  // triggers it is never recorded as a candidate turn.
  async function announceProblemOrally(voice: boolean): Promise<void> {
    if (chatBusy) return;
    chatBusy = true;
    const st = store;
    try {
      if (!chat.alive) resetChat();
      const fresh = chat.isNew();
      const instruction =
        'INSTRUCTION (not a message from the candidate — do not acknowledge it): the problem pane is hidden. Deliver the problem to the candidate now, out loud, the way a phone-screen interviewer would: conversational, one or two sentences covering the core task only, no constraints, no examples, no title. Then stop and wait.';
      const turnText = assembleTurn(st.session, instruction, null, {
        voice,
        includeHistory: fresh,
        includeBuffer: fresh,
        narration: st.takePendingNarration(),
      });
      const { text, usage } = await chat.send(turnText, (t) => send({ type: 'chat:delta', text: t }));
      if (!text.trim()) throw new Error('The interviewer failed to state the problem — say "please give me the problem".');
      const turn: Turn = { role: 'assistant', content: text, at: Date.now(), persona: st.session.persona };
      st.addTurn(turn);
      st.recordUsage(usage);
      st.save();
      send({ type: 'chat:done', turn });
    } catch (err) {
      resetChat();
      send({ type: 'chat:error', message: errorMessage(err) });
    } finally {
      chatBusy = false;
    }
  }

  async function handleEnd(): Promise<void> {
    // The debrief is the most expensive call in the app (Opus over the full
    // transcript) — a second session:end while one is running would double it
    // and race the gradebook write.
    if (endBusy) return;
    endBusy = true;
    const st = store;
    try {
      const s = st.session;
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
      const payload = {
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
      // One grading system for every persona (interview-grading-system.md).
      // The model scores axes with evidence; recordGrade applies the §5
      // decision math (weights, band, gates) and persists to the gradebook.
      const { data, usage } = await structuredCall<Scorecard>({
        purpose: 'debrief',
        system: SCORECARD_PROMPT,
        userContent: JSON.stringify(payload, null, 2),
        schema: SCORECARD_SCHEMA as unknown as Record<string, unknown>,
      });
      st.recordUsage(usage);
      st.session.debrief = data;
      const grade = recordGrade({
        session: s,
        persona: s.turns.some((t) => t.persona === 'bloomberg') ? 'bloomberg' : s.persona,
        scorecard: data,
      });
      st.save();
      send({ type: 'debrief:ready', scorecard: data, grade });
    } catch (err) {
      send({ type: 'debrief:error', message: errorMessage(err) });
    } finally {
      endBusy = false;
    }
  }

  socket.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'editor:state':
        store.updateEditor(msg.buffer, msg.selection, msg.cursor);
        break;
      case 'chat:send':
        void handleChat(msg);
        break;
      case 'run':
        void handleRun(msg);
        break;
      case 'problem:intake':
        void handleIntake(msg);
        break;
      case 'persona:set':
        store.setPersona(msg.persona);
        store.save();
        resetChat(); // system prompt now carries the new persona
        break;
      case 'language:set':
        store.setLanguage(msg.language);
        store.save();
        resetChat(); // the persona is told which language the candidate works in
        // Full snapshot back: the buffer may have swapped to the new
        // language's default, and the editor needs its syntax mode updated.
        announceSession(false);
        break;
      case 'narration:segment':
        // Context + grading evidence only — never triggers a model call.
        store.addNarration(msg.text);
        break;
      case 'narration:state':
        store.setNarrationState(msg.on);
        store.save();
        break;
      case 'session:pause':
        store.setPaused(msg.paused);
        store.save();
        break;
      case 'session:reset': {
        // Persist the outgoing session (no-op if nothing happened in it),
        // swap in a fresh store — keeping the chosen persona — and rebuild
        // the model runtime on the clean slate. The new session starts
        // paused, like every session.
        store.save();
        const persona = store.session.persona;
        store = new SessionStore();
        store.setPersona(persona);
        resetChat();
        announceSession(false);
        break;
      }
      case 'lsp:request':
        void clangd
          .query(msg.kind, msg.buffer, msg.line, msg.column)
          .then((result) => send({ type: 'lsp:result', id: msg.id, result }))
          .catch(() => send({ type: 'lsp:result', id: msg.id, result: null }));
        break;
      case 'session:end':
        void handleEnd();
        break;
    }
  });

  socket.on('close', () => {
    chat.dispose();
    clangd.dispose();
    store.save();
    // Park the session for resume instead of discarding it.
    const id = store.session.id;
    // Paranoia (same id parked twice): kill the old timer, or it would fire
    // later and evict the entry we're about to store.
    const stale = detached.get(id);
    if (stale) clearTimeout(stale.timer);
    detached.set(id, {
      store,
      timer: setTimeout(() => detached.delete(id), DETACHED_TTL_MS),
    });
  });
}

const fastify = Fastify({ logger: false });

// Production/Docker: serve the built client from the same port (no Vite). In
// dev the Vite server proxies here instead, and this simply doesn't register.
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (process.env.SERVE_CLIENT !== '0' && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  await fastify.register(fastifyStatic, { root: CLIENT_DIST });
  console.log('Serving built client from client/dist on the same port.');
}

fastify.get('/health', async () => ({ ok: true }));
// Gradebook, oldest-first — powers the Progress view.
fastify.get('/api/progress', async () => ({ grades: listGrades() }));
// Gradebook row removal (the session JSON on disk is kept). The db is plain
// SQLite at sessions/gradebook.db for anything beyond delete.
fastify.delete('/api/progress/:sessionId', async (request, reply) => {
  const { sessionId } = request.params as { sessionId: string };
  const deleted = deleteGrade(sessionId);
  if (!deleted) reply.code(404);
  return { deleted };
});
// End-of-day recap across every session practised that day (heavy model
// call; cached per day until the session set changes). POST because it
// spends a model call — never triggered by a stray prefetch.
fastify.post('/api/recap', async (request, reply) => {
  const body = (request.body ?? {}) as { date?: string };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')
    ? (body.date as string)
    : new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD
  try {
    const result = await dailyRecap(date);
    if ('error' in result) {
      reply.code(404);
      return result;
    }
    return { date, ...result };
  } catch (err) {
    reply.code(500);
    return { error: errorMessage(err) };
  }
});

await fastify.listen({ port: PORT, host: HOST });
const wss = new WebSocketServer({ server: fastify.server, path: '/ws' });
wss.on('connection', handleConnection);
console.log(`practice-ide server listening on http://${HOST}:${PORT} (ws at /ws)`);
