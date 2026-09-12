import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { buildServer } from './routes.js';
import { disposeAllClangd, flushAllSessions, handleConnection } from './session-socket.js';
import { toolchainReport, warmCppPrelude } from './runner.js';

// Bootstrap: start the HTTP server, attach the WebSocket endpoint, say what
// this machine can do, and flush sessions on the way out. The HTTP API lives
// in routes.ts and one live interview lives in session-socket.ts.

const PORT = Number(process.env.PORT || 3001);
// 127.0.0.1 for local dev; Docker sets HOST=0.0.0.0 so the published port works.
const HOST = process.env.HOST || '127.0.0.1';

// Model calls run through the Claude Agent SDK on the user's own Claude
// subscription, no API key involved (see claude.ts). Credentials come from
// either a Claude Code login on this machine or a subscription token, so a
// fresh install gets told which one it found, or how to link one.
function modelAccessNote(): string {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return 'Claude subscription linked via CLAUDE_CODE_OAUTH_TOKEN.';
  if (fs.existsSync(path.join(os.homedir(), '.claude'))) {
    return 'Claude subscription linked via the Claude Code login on this machine.';
  }
  return '';
}

const fastify = await buildServer();
await fastify.listen({ port: PORT, host: HOST });

const wss = new WebSocketServer({ server: fastify.server, path: '/ws' });
wss.on('connection', handleConnection);

// Precompile the C++ prelude in the background, so the first Run of the day
// is as fast as the tenth. Never awaited: a cold cache only costs speed.
void warmCppPrelude();

const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
const access = modelAccessNote();
const ready = (await toolchainReport()).filter((l) => l.available).map((l) => l.label);
console.log(
  [
    '',
    `  InterviewLab is running at ${url}`,
    '',
    `  Model access  ${access || 'NOT LINKED. Open the Setup page, or run: claude setup-token'}`,
    `  Languages     ${ready.length ? ready.join(', ') : 'none detected. Install a toolchain, then see the Setup page'}`,
    `  Setup check   ${url}/#/setup`,
    '',
  ].join('\n'),
);

// tsx watch restarts on every code change, and Ctrl-C sends SIGINT: flush live
// sessions to disk so the reconnect resumes instead of handing the client an
// empty session, and reap the clangd children rather than orphaning them.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    flushAllSessions();
    disposeAllClangd();
    process.exit(0);
  });
}
