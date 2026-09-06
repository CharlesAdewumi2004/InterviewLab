import type { ClientMessage, ServerMessage } from '../../../shared/protocol';

// Thin request/response bridge to the server-side clangd over the app's one
// WebSocket. Monaco providers call lspQuery(); when clangd is unavailable or
// slow, they fall back to the curated lists in monacoConfig — so every reply
// here resolves (with null), never rejects.

type LspKind = 'completion' | 'signature' | 'hover';

// The slices of LSP result shapes the Monaco mapping needs.
export interface LspPosition {
  line: number;
  character: number;
}
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}
export type LspDoc = string | { kind?: string; value: string } | undefined;
export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: LspDoc;
  insertText?: string;
  insertTextFormat?: number; // 2 = snippet
  filterText?: string;
  sortText?: string;
  textEdit?: { newText: string; range?: LspRange; insert?: LspRange; replace?: LspRange };
}
export interface LspCompletionList {
  isIncomplete?: boolean;
  items: LspCompletionItem[];
}
export interface LspSignatureHelp {
  signatures: {
    label: string;
    documentation?: LspDoc;
    parameters?: { label: string | [number, number]; documentation?: LspDoc }[];
  }[];
  activeSignature?: number;
  activeParameter?: number;
}
export interface LspHover {
  contents: LspDoc | LspDoc[];
}

export function docString(doc: LspDoc): string | undefined {
  if (doc === undefined) return undefined;
  return typeof doc === 'string' ? doc : doc.value;
}

let sendFn: ((msg: ClientMessage) => boolean) | null = null;
let available = false;
let nextId = 1;
const pending = new Map<number, { resolve: (r: unknown) => void; timer: number }>();

/** Wire the app's socket send function (idempotent, survives reconnects). */
export function bindLspSend(fn: (msg: ClientMessage) => boolean): void {
  sendFn = fn;
}

/**
 * Socket went down: clangd lives per-connection, so nothing on the other end
 * can answer until a new one is established and re-announces lsp:status.
 * Without this, `available` stays true across the gap and every keystroke pays
 * the full 2s timeout before falling back to the curated list — which is what
 * made autocomplete feel dead-and-laggy for seconds after each server restart.
 */
export function resetLsp(): void {
  available = false;
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.resolve(null);
  }
  pending.clear();
}

export function lspAvailable(): boolean {
  return available;
}

/** Feed lsp:* server messages here from the app's socket handler. */
export function handleLspMessage(msg: ServerMessage): void {
  if (msg.type === 'lsp:status') {
    available = msg.available;
    return;
  }
  if (msg.type === 'lsp:result') {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      clearTimeout(p.timer);
      p.resolve(msg.result);
    }
  }
}

/**
 * One semantic query at a Monaco (1-based) position. Resolves null when
 * clangd is off or slower than timeoutMs — callers then use curated lists.
 * (A late server reply is discarded; the server request itself still warms
 * clangd for the next keystroke.)
 */
export function lspQuery(
  kind: LspKind,
  buffer: string,
  line: number,
  column: number,
  timeoutMs = 2_000,
): Promise<unknown> {
  const send = sendFn;
  if (!available || !send) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    // A socket that closed between the availability check and here would
    // otherwise leave this promise hanging for the full timeout.
    if (!send({ type: 'lsp:request', id, kind, buffer, line, column })) {
      pending.delete(id);
      clearTimeout(timer);
      resolve(null);
    }
  });
}
