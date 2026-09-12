import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { probeModelAccess } from './claude.js';
import { CLANGD } from './toolchain.js';
import { deleteGrade, listGrades } from './gradebook.js';
import { dailyRecap } from './recap.js';
import { listDesignQuestions } from './sysdesign/bank.js';
import { listDebugExercises } from './techq/debug-bank.js';
import { listOopQuestions } from './oop/bank.js';
import { listCodingQuestions } from './coding-bank.js';
import { clearCv, cvStatus, setCv } from './cv.js';
import { getProfile, setProfile, type Profile } from './profile.js';
import { toolchainReport } from './runner.js';
import { SESSIONS_DIR } from './session.js';
import { errorMessage } from './util.js';

// The HTTP surface: banks, gradebook, profile, CV, the setup doctor, and the
// built client. The interview itself runs over the WebSocket (session-socket).

// The sessions directory holds transcripts, the gradebook and the profile, and
// an unwritable one fails late and confusingly, so the doctor checks it.
function sessionsWritable(): boolean {
  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const probe = path.join(SESSIONS_DIR, '.write-probe');
    fs.writeFileSync(probe, '');
    fs.rmSync(probe);
    return true;
  } catch {
    return false;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
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
  // System-design bank: client-safe metadata only (briefs never leave the server).
  fastify.get('/api/design-questions', async () => ({ questions: listDesignQuestions() }));
  // Coding bank: frequency-grounded suggestions (core screen pool + extended set).
  // Seeds are inputs, not answer keys — intake re-dresses them as scenarios.
  fastify.get('/api/coding-questions', async () => ({ questions: listCodingQuestions() }));
  // OOP design bank: client-safe metadata only (briefs never leave the server).
  fastify.get('/api/oop-questions', async () => ({ questions: listOopQuestions() }));
  // Debug-&-optimize exercises: titles only — the planted issues stay private.
  fastify.get('/api/debug-exercises', async () => ({ exercises: listDebugExercises() }));

  // Setup doctor: what this machine can and cannot do right now. The setup page
  // renders it as a checklist, and every failing row carries its own fix.
  fastify.get('/api/setup', async () => {
    const tokenLinked = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
    const loginDir = path.join(os.homedir(), '.claude');
    const loginFound = fs.existsSync(loginDir);
    return {
      model: {
        // Credentials existing is not the same as credentials working — the
        // page offers a live probe for that.
        linked: tokenLinked || loginFound,
        via: tokenLinked ? 'token' : loginFound ? 'claude-code-login' : null,
      },
      languages: await toolchainReport(),
      // Semantic C++ completion is a bonus, never a requirement.
      clangd: { available: CLANGD !== null, path: CLANGD },
      storage: { sessionsDir: SESSIONS_DIR, writable: sessionsWritable() },
      voice: { note: 'Speech input and playback are browser features. Chrome and Edge support both.' },
    };
  });

  // Live check that model calls actually work on this machine (one cheap call).
  fastify.post('/api/setup/probe', async () => probeModelAccess());

  // The practising candidate's profile: role, level, target company, notes.
  // Entirely optional, stored locally, injected into the interviewer personas.
  fastify.get('/api/profile', async () => getProfile());
  fastify.put('/api/profile', async (request) => setProfile((request.body ?? {}) as Partial<Profile>));

  // Candidate CV: uploaded as PDF (parsed server-side) or plain text, stored
  // locally in sessions/cv.txt (git-ignored), injected into the behavioral and
  // full-mock personas so the interviewer has "read the resume".
  fastify.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => done(null, body));
  fastify.get('/api/cv', async () => cvStatus());
  fastify.put('/api/cv', { bodyLimit: 10 * 1024 * 1024 }, async (request, reply) => {
    try {
      let text: string;
      if (Buffer.isBuffer(request.body)) {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(request.body) });
        try {
          const parsed = await parser.getText();
          text = parsed.text;
        } finally {
          await parser.destroy().catch(() => {});
        }
      } else {
        text = String(request.body ?? '');
      }
      if (!text.trim()) {
        reply.code(400);
        return { error: 'No readable text found. Export the CV as a PDF with selectable text, or upload it as .txt/.md.' };
      }
      setCv(text);
      return { ok: true, status: cvStatus() };
    } catch (err) {
      reply.code(500);
      return { error: errorMessage(err) };
    }
  });
  fastify.delete('/api/cv', async () => {
    clearCv();
    return { ok: true, status: cvStatus() };
  });
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
  return fastify;
}
