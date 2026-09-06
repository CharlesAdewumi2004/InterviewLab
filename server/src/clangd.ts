import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { CLANGD, CPP_PRELUDE, GCC_INSTALL_DIR, PRELUDE_FILE, toolchainEnv } from './toolchain.js';

// One clangd per WebSocket connection, speaking LSP over stdio. The client
// ships the whole buffer with every request; we own document sync (full-text
// didChange) so the editor side stays a dumb request/response bridge.
// Booted eagerly at connect: the first parse of <bits/stdc++.h> takes
// seconds, and doing it during pre-warm means completions are instant by the
// time the user types.

export type LspQueryKind = 'completion' | 'signature' | 'hover';

const METHODS: Record<LspQueryKind, string> = {
  completion: 'textDocument/completion',
  signature: 'textDocument/signatureHelp',
  hover: 'textDocument/hover',
};

const RPC_TIMEOUT_MS = 15_000; // generous: the first query may wait on the preamble build
// Upper bound on the readiness probe. Measured cold start on this toolchain is
// ~1.7s; past this we report ready anyway rather than stall autocomplete.
const WARMUP_BUDGET_MS = 20_000;

interface RpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export class ClangdSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuf = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private readyPromise: Promise<boolean> | null = null;
  private dead = false;
  private disposed = false;

  private readonly uri: string;
  private readonly warmupUri: string;
  private readonly preludePath: string;
  private text: string;
  private version = 1;

  constructor(initialBuffer: string) {
    const dir = path.join(os.tmpdir(), 'practice-ide', 'lsp');
    fs.mkdirSync(dir, { recursive: true });
    // Same LeetCode prelude the compiler force-includes — completions must
    // resolve std symbols in buffers that carry no #include lines.
    this.preludePath = path.join(dir, PRELUDE_FILE);
    fs.writeFileSync(this.preludePath, CPP_PRELUDE);
    const stem = randomUUID().slice(0, 8);
    this.uri = pathToFileURL(path.join(dir, `live-${stem}.cpp`)).href;
    this.warmupUri = pathToFileURL(path.join(dir, `warmup-${stem}.cpp`)).href;
    this.text = initialBuffer;
  }

  /** Resolves true once clangd is initialized; false if it can't run here. */
  ready(): Promise<boolean> {
    this.readyPromise ??= this.boot().catch(() => false);
    return this.readyPromise;
  }

  private async boot(): Promise<boolean> {
    if (!CLANGD || this.disposed) return false;
    try {
      this.child = spawn(
        CLANGD,
        ['--header-insertion=never', '--completion-style=detailed', '--background-index=false', '--log=error', '--limit-results=50'],
        { env: { ...process.env, ...toolchainEnv() }, stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch {
      return false;
    }
    this.child.on('error', () => this.fail('clangd failed to start'));
    this.child.on('exit', () => this.fail('clangd exited'));
    this.child.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    this.child.stderr.on('data', () => {}); // --log=error keeps this quiet; drain regardless
    // A write racing clangd's death emits EPIPE on stdin — without a handler
    // that's an uncaught stream error that takes down the whole server.
    this.child.stdin.on('error', () => {});

    await this.rpc('initialize', {
      processId: process.pid,
      rootUri: null,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: { snippetSupport: true, documentationFormat: ['plaintext', 'markdown'] },
          },
          signatureHelp: { signatureInformation: { documentationFormat: ['plaintext', 'markdown'] } },
          hover: { contentFormat: ['markdown', 'plaintext'] },
        },
      },
      initializationOptions: {
        fallbackFlags: [
          '-std=c++23',
          '-xc++',
          '-include',
          this.preludePath,
          // Point clang at the same GCC the runner compiles with, so its
          // libstdc++ headers are the ones we complete against.
          ...(GCC_INSTALL_DIR ? [`--gcc-install-dir=${GCC_INSTALL_DIR}`] : []),
        ],
      },
    });
    this.notify('initialized', {});
    this.notify('textDocument/didOpen', {
      textDocument: { uri: this.uri, languageId: 'cpp', version: this.version, text: this.text },
    });
    await this.warmUp();
    return true;
  }

  /**
   * Block until clangd can actually answer a completion, not merely until it
   * has accepted the document.
   *
   * didOpen is a notification, so boot() used to return in ~20ms while clangd
   * spent another ~1.8s building the <bits/stdc++.h> preamble. During that
   * window it answers every completion with an empty list — so lsp:status said
   * "available" while the semantic tier produced nothing, the client fell
   * through to its curated list, and Monaco cached that dead list for the rest
   * of the identifier. std::function was simply unreachable.
   *
   * Readiness is time-based, not request-based: a documentSymbol round trip
   * (which needs the AST) still returns ~300ms before scope completions work,
   * and a throwaway completion doesn't hurry it along. So probe with a scratch
   * document we fully control — completing after `std::` is exactly the case
   * that stays empty while cold — and poll until it yields. The real document
   * shares the same preamble, so once this answers, the user's buffer will too.
   */
  private async warmUp(): Promise<void> {
    const line = '  std::vec';
    const text = `void __clangd_warmup__() {\n${line}\n}\n`;
    this.notify('textDocument/didOpen', {
      textDocument: { uri: this.warmupUri, languageId: 'cpp', version: 1, text },
    });
    const deadline = Date.now() + WARMUP_BUDGET_MS;
    try {
      while (!this.dead && !this.disposed && Date.now() < deadline) {
        const res = (await this.rpc('textDocument/completion', {
          textDocument: { uri: this.warmupUri },
          position: { line: 1, character: line.length },
        })) as { items?: { label?: string }[] } | null;
        // A non-empty list is NOT the signal: while the preamble is still
        // building, clangd answers with identifier-based fallbacks scraped from
        // the open buffer. Require a symbol that can only come from libstdc++.
        if (res?.items?.some((i) => (i.label ?? '').trim().startsWith('vector'))) return;
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch {
      // Probe only: a timeout still means clangd is up, and query() handles
      // its own failures. Fall through and report ready.
    } finally {
      this.notify('textDocument/didClose', { textDocument: { uri: this.warmupUri } });
    }
  }

  /**
   * Sync the buffer and run one query. Monaco coordinates in (1-based);
   * returns the raw LSP result, or null when clangd is unavailable/errored.
   */
  async query(kind: LspQueryKind, buffer: string, line: number, column: number): Promise<unknown> {
    if (this.dead || this.disposed) return null;
    if (!(await this.ready())) return null;
    if (buffer !== this.text) {
      this.text = buffer;
      this.version += 1;
      this.notify('textDocument/didChange', {
        textDocument: { uri: this.uri, version: this.version },
        contentChanges: [{ text: buffer }], // rangeless change = full document
      });
    }
    try {
      return await this.rpc(METHODS[kind], {
        textDocument: { uri: this.uri },
        position: { line: line - 1, character: column - 1 },
      });
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.fail('session disposed');
    const child = this.child;
    this.child = null;
    if (!child) return;
    // clangd holds the whole preamble AST in memory (~400MB), so a survivor is
    // expensive. Close stdin first — clangd exits on EOF — then SIGTERM, then
    // escalate: a bare kill() left orphans parented to the server process.
    try {
      child.stdin.end();
    } catch {
      // already gone
    }
    child.kill('SIGTERM');
    const hard = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 2_000);
    hard.unref?.();
    child.once('exit', () => clearTimeout(hard));
  }

  // --- JSON-RPC plumbing ------------------------------------------------------

  private fail(reason: string): void {
    this.dead = true;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private write(msg: RpcMessage): void {
    const child = this.child;
    if (!child || this.dead) return;
    const body = Buffer.from(JSON.stringify(msg), 'utf8');
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  private rpc(method: string, params: unknown): Promise<unknown> {
    if (this.dead) return Promise.reject(new Error('clangd is not running'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`clangd ${method} timed out`));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  private onData(chunk: Buffer): void {
    this.stdoutBuf = Buffer.concat([this.stdoutBuf, chunk]);
    for (;;) {
      const headerEnd = this.stdoutBuf.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.stdoutBuf.subarray(0, headerEnd).toString('ascii');
      const lenMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (!lenMatch) {
        this.stdoutBuf = this.stdoutBuf.subarray(headerEnd + 4);
        continue;
      }
      const bodyEnd = headerEnd + 4 + Number(lenMatch[1]);
      if (this.stdoutBuf.length < bodyEnd) return;
      const body = this.stdoutBuf.subarray(headerEnd + 4, bodyEnd).toString('utf8');
      this.stdoutBuf = this.stdoutBuf.subarray(bodyEnd);
      try {
        this.dispatch(JSON.parse(body) as RpcMessage);
      } catch {
        // malformed frame — skip
      }
    }
  }

  private dispatch(msg: RpcMessage): void {
    if (msg.id !== undefined && msg.method) {
      // Server→client request (registerCapability, workDoneProgress/create…):
      // acknowledge with an empty result so clangd doesn't stall.
      this.write({ jsonrpc: '2.0', id: msg.id, result: null });
      return;
    }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result ?? null);
      return;
    }
    // Notifications (publishDiagnostics etc.) are deliberately dropped:
    // surfacing live squiggles would change interview practice conditions —
    // finding out at compile time is part of the drill.
  }
}
