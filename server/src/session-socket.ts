import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { ClientMessage, ClientProblem, Scorecard, ServerMessage, TechTopic, Turn } from '../../shared/protocol';
import { SessionStore } from './session.js';
import { assembleTurn, buildSystemPrompt } from './context.js';
import { ChatSession, maybeCompact, structuredCall } from './claude.js';
import { ClangdSession } from './clangd.js';
import { recordGrade } from './gradebook.js';
import { buildGradingPayload } from './debrief.js';
import { getDesignQuestion, randomDesignQuestion } from './sysdesign/bank.js';
import { sampleTechRound, TECH_TOPIC_LABELS } from './techq/bank.js';
import { debugToProblem, getDebugExercise, randomDebugExercise } from './techq/debug-bank.js';
import { getOopQuestion, randomOopQuestion } from './oop/bank.js';
import { compileAndRun } from './runner.js';
import { intakePrompt, INTAKE_SCHEMA } from './prompts/intake.js';
import { SCORECARD_PROMPT, SCORECARD_SCHEMA } from './prompts/scorecard.js';
import { errorMessage } from './util.js';
import type { ServerProblem } from './types.js';

// One live interview per WebSocket: the session store, the model runtime, the
// language server, and every message that moves between them.

function toClientProblem(p: ServerProblem): ClientProblem {
  // Oral delivery hides even the title — a LeetCode problem name is a solution
  // giveaway, and on a real phone screen you only get what you heard.
  if (p.oral) return { title: 'Problem (delivered orally)', statement: '', signature: p.signature, oral: true };
  return { title: p.title, statement: p.statement, signature: p.signature, oral: false, debug: p.debug === true };
}

// Sessions survive disconnects: on close the store is parked here and a
// reconnect (or page refresh) presenting the same sid re-attaches it — a
// network blip no longer wipes a 40-minute interview. The model runtime is
// rebuilt lazily; buildHistory replays the conversation into it.
const DETACHED_TTL_MS = 60 * 60_000;
const detached = new Map<string, { store: SessionStore; timer: NodeJS.Timeout }>();

// Every store with a live socket, so shutdown can flush them. Without this a
// `tsx watch` restart (SIGTERM) dropped the process with the newest buffer
// only in memory: the reconnect then found no file, answered resumed=false,
// and the client replaced the candidate's code with the default buffer.
const liveStores = new Set<SessionStore>();
const liveClangd = new Set<ClangdSession>();

export function handleConnection(socket: WebSocket, request: IncomingMessage): void {
  const sid = new URL(request.url ?? '/', 'http://localhost').searchParams.get('sid');
  const held = sid ? detached.get(sid) : undefined;
  if (held) {
    clearTimeout(held.timer);
    detached.delete(sid as string);
  }
  // Durable resume: not parked in memory (server restarted — tsx reloads on
  // every code change) → rehydrate the live session from its file on disk.
  // Ended sessions never resume; the downtime gap is recorded as a pause.
  const fromDisk = !held && sid ? SessionStore.fromDisk(sid) : null;
  let store = held ? held.store : (fromDisk ?? new SessionStore());
  const resumed = held !== undefined || fromDisk !== null;
  liveStores.add(store);
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
  const announceSession = (asResumed: boolean, reason: 'connect' | 'language' | 'reset' = 'connect') => {
    const s = store.session;
    const lastPause = s.pauseSpans[s.pauseSpans.length - 1];
    const pausedNow = lastPause !== undefined && lastPause.to === null;
    const dq = s.designQuestionId ? getDesignQuestion(s.designQuestionId) : undefined;
    const oq = s.oopQuestionId ? getOopQuestion(s.oopQuestionId) : undefined;
    send({
      type: 'session:ready',
      sessionId: s.id,
      persona: s.persona,
      language: s.language,
      resumed: asResumed,
      reason,
      startedAt: s.startedAt,
      problem: s.problem ? toClientProblem(s.problem) : null,
      buffer: s.buffer,
      turns: s.turns,
      paused: pausedNow,
      pausedMs: s.pauseSpans.reduce((sum, sp) => sum + (sp.to !== null ? sp.to - sp.from : 0), 0),
      pausedAt: pausedNow ? lastPause.from : null,
      designQuestion: dq
        ? { id: dq.id, title: dq.title, difficulty: dq.difficulty, asks: dq.asks, patterns: dq.patterns }
        : null,
      techTopics: s.techTopics,
      oopQuestion: oq
        ? { id: oq.id, title: oq.title, difficulty: oq.difficulty, asks: oq.asks, patterns: oq.patterns }
        : null,
    });
  };
  announceSession(resumed);

  // Model-free interviewer turn (bank-authored text): instant, and it works
  // even when the subscription's rate window is exhausted. The fresh runtime
  // replays it from history on the first real message.
  const cannedTurn = (text: string) => {
    const turn: Turn = { role: 'assistant', content: text, at: Date.now(), persona: store.session.persona };
    store.addTurn(turn);
    store.save();
    send({ type: 'chat:delta', text });
    send({ type: 'chat:done', turn });
  };

  // Semantic autocomplete: boot clangd eagerly so the expensive first parse
  // of <bits/stdc++.h> happens now, not on the first keystroke.
  const clangd = new ClangdSession(store.session.buffer);
  liveClangd.add(clangd);
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
      if (!text.trim()) throw new Error('The model returned an empty reply. Send that again.');

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
        system: intakePrompt(st.session.language, msg.framing === 'plain' ? 'plain' : 'scenario'),
        userContent: msg.raw,
        schema: INTAKE_SCHEMA as unknown as Record<string, unknown>,
      });
      // The model was prompted for this session's language; stamping it here
      // is what lets a later language switch detect a stale harness.
      const problem: ServerProblem = { ...data, language: st.session.language, oral: msg.delivery === 'oral' };
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
      if (!text.trim()) throw new Error('The interviewer failed to state the problem. Say "please give me the problem".');
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
      const payload = buildGradingPayload(s);
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
        persona: s.turns.some((t) => t.persona === 'mock') ? 'mock' : s.persona,
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
        // Debounced: the on-disk copy must track keystrokes closely enough
        // that a server restart (tsx reload) can rehydrate mid-interview.
        store.saveSoon();
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
        announceSession(false, 'language');
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
      case 'cv:updated':
        // CV changed via HTTP — rebuild the runtime so the persona context
        // (behavioral / full mock) picks up the new resume text.
        resetChat();
        break;
      case 'design:pick': {
        // Deliberately model-free: the bank has the exact spoken prompt, so
        // the interviewer "states" it as a canned turn — instant, and it works
        // even when the subscription's rate window is exhausted. The fresh
        // runtime replays this turn from history on the first real message.
        if (chatBusy) {
          send({ type: 'chat:error', message: 'Still responding. Pick a design question after this reply.' });
          break;
        }
        const q = (msg.id ? getDesignQuestion(msg.id) : undefined) ?? randomDesignQuestion();
        store.setDesignQuestion(q.id);
        resetChat(); // system prompt now carries the question's private brief
        send({
          type: 'design:ready',
          question: { id: q.id, title: q.title, difficulty: q.difficulty, asks: q.asks, patterns: q.patterns },
        });
        cannedTurn(q.prompt);
        break;
      }
      case 'techq:start': {
        // Same model-free pattern as design:pick: the bank supplies the first
        // question verbatim; the private set rides the rebuilt system prompt.
        if (chatBusy) {
          send({ type: 'chat:error', message: 'Still responding. Start the round after this reply.' });
          break;
        }
        const topics = msg.topics.length ? msg.topics : (['cpp', 'concurrency'] as TechTopic[]);
        const qs = sampleTechRound(topics, store.session.language);
        if (!qs.length) {
          send({ type: 'chat:error', message: 'No bank questions for those topics yet.' });
          break;
        }
        store.setTechRound(topics, qs.map((q) => q.id));
        store.save();
        resetChat(); // system prompt now carries the sampled question set
        send({ type: 'techq:ready', topics });
        cannedTurn(
          `Alright, fundamentals round: ${topics.map((t) => TECH_TOPIC_LABELS[t].toLowerCase()).join(', ')}. No trick questions, just tell me how things actually work. ${qs[0].question}`,
        );
        break;
      }
      case 'debug:pick': {
        if (chatBusy) {
          send({ type: 'chat:error', message: 'Still responding. Pick an exercise after this reply.' });
          break;
        }
        const ex = (msg.id ? getDebugExercise(msg.id) : undefined) ?? randomDebugExercise(store.session.language);
        if (!ex) {
          send({ type: 'problem:error', message: `No debug exercises for ${store.session.language} yet. Switch language or pick a topic drill.` });
          break;
        }
        // Runs through the standard problem machinery: flawed code becomes the
        // editor seed, the harness (with its timed perf case) feeds Run, and
        // the planted-issue key stays in the private brief.
        const problem = debugToProblem(ex);
        store.setProblem(problem);
        store.setDebugExercise(ex.id);
        store.save();
        resetChat();
        send({ type: 'problem:ready', problem: toClientProblem(problem), buffer: problem.signature });
        cannedTurn(`${ex.scenario} The code's in your editor. Have a read and tell me what you see.`);
        break;
      }
      case 'oop:pick': {
        if (chatBusy) {
          send({ type: 'chat:error', message: 'Still responding. Pick a question after this reply.' });
          break;
        }
        const q = (msg.id ? getOopQuestion(msg.id) : undefined) ?? randomOopQuestion();
        if (!q) {
          send({ type: 'chat:error', message: 'The OOP bank is empty.' });
          break;
        }
        store.setOopQuestion(q.id);
        store.save();
        resetChat(); // system prompt now carries the question's private brief
        send({
          type: 'oop:ready',
          question: { id: q.id, title: q.title, difficulty: q.difficulty, asks: q.asks, patterns: q.patterns },
        });
        cannedTurn(q.prompt);
        break;
      }
      case 'session:reset': {
        // Persist the outgoing session (no-op if nothing happened in it),
        // swap in a fresh store — keeping the chosen persona — and rebuild
        // the model runtime on the clean slate. The new session starts
        // paused, like every session.
        store.save();
        const persona = store.session.persona;
        liveStores.delete(store);
        store = new SessionStore();
        liveStores.add(store);
        store.setPersona(persona);
        resetChat();
        announceSession(false, 'reset');
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
    liveClangd.delete(clangd);
    liveStores.delete(store);
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

/** Flush every session with a live socket, plus the parked ones, to disk. */
export function flushAllSessions(): void {
  for (const store of liveStores) {
    try {
      store.save();
    } catch (err) {
      console.error('shutdown save failed:', err);
    }
  }
  for (const { store } of detached.values()) {
    try {
      store.save();
    } catch {
      // best effort
    }
  }
}

/** Reap the clangd children (each holds a large preamble in memory). */
export function disposeAllClangd(): void {
  for (const session of liveClangd) session.dispose();
}
