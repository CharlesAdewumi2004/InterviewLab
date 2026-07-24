import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Session, UsageEntry } from './types.js';

// Model routing is unchanged from the API-key version. The heavy tier falls
// back to the chat model at call time when the plan doesn't include Opus.
export const MODELS = {
  chat: 'claude-sonnet-5',
  heavy: 'claude-opus-4-8',
  compact: 'claude-haiku-4-5',
} as const;

// Auth comes from this machine's Claude Code login (Pro/Max subscription). The
// Agent SDK resolves credentials in precedence order and an API key outranks
// subscription OAuth, so strip key vars from the child environment. A
// CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) is deliberately kept —
// it is subscription auth too and useful for headless setups.
function subscriptionEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key === 'ANTHROPIC_API_KEY' || key === 'ANTHROPIC_AUTH_TOKEN') continue;
    env[key] = value;
  }
  return env;
}

function usageEntry(
  purpose: UsageEntry['purpose'],
  model: string,
  usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number },
): UsageEntry {
  return {
    at: Date.now(),
    purpose,
    model,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

// An unbounded async queue — the streaming-input channel for a ChatSession.
class Pushable<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.queue.push(value);
  }

  end(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as never, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) return Promise.resolve({ value: this.queue.shift() as T, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

// One long-lived Claude Code runtime per connection: booted once (pre-warmed
// at WS connect), fed user turns via streaming input. Kills the per-message
// process-spawn cost and keeps the accumulated context cached across turns.
// Chat turns are strictly serialized by the caller (chatBusy in index.ts).
export class ChatSession {
  private input = new Pushable<SDKUserMessage>();
  private pending: {
    onDelta?: (text: string) => void;
    resolve: (r: { text: string; usage: UsageEntry }) => void;
    reject: (err: Error) => void;
    text: string;
  } | null = null;
  private turns = 0;
  private dead = false;

  constructor(systemPrompt: string) {
    const q = query({
      prompt: this.input,
      options: {
        model: MODELS.chat,
        systemPrompt,
        tools: [], // pure text generation — no file/bash/web tools
        env: subscriptionEnv(),
        includePartialMessages: true,
        effort: 'medium', // conversational replies: medium ≈ prior-gen high, much faster to first token
      },
    });
    void this.pump(q);
  }

  /** True until the first turn — the caller replays history on fresh sessions. */
  isNew(): boolean {
    return this.turns === 0;
  }

  get alive(): boolean {
    return !this.dead;
  }

  private async pump(q: AsyncIterable<{ type: string; [key: string]: unknown }>): Promise<void> {
    try {
      for await (const message of q as AsyncIterable<
        | { type: 'stream_event'; event: { type: string; delta?: { type: string; text?: string } } }
        | { type: 'result'; subtype: string; result?: string; usage: Record<string, number> }
        | { type: string }
      >) {
        const p = this.pending;
        if (message.type === 'stream_event' && 'event' in message) {
          const ev = message.event;
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text && p) {
            p.text += ev.delta.text;
            p.onDelta?.(ev.delta.text);
          }
        } else if (message.type === 'result' && 'subtype' in message) {
          if (!p) continue; // result with no waiter (shouldn't happen) — ignore
          this.pending = null;
          if (message.subtype === 'success') {
            p.resolve({
              text: (message.result as string) || p.text,
              usage: usageEntry('chat', MODELS.chat, message.usage ?? {}),
            });
          } else {
            p.reject(new Error(`Chat turn failed (${message.subtype}).`));
          }
        }
      }
      this.fail(new Error('Chat session ended.'));
    } catch (err) {
      this.fail(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private fail(err: Error): void {
    this.dead = true;
    const p = this.pending;
    this.pending = null;
    p?.reject(err);
  }

  send(text: string, onDelta?: (delta: string) => void): Promise<{ text: string; usage: UsageEntry }> {
    if (this.dead) return Promise.reject(new Error('Chat session is not alive.'));
    if (this.pending) return Promise.reject(new Error('Still responding to the previous message.'));
    // An empty message would put an empty text block in the transcript and
    // the API rejects those (400) — refuse it here instead.
    if (!text.trim()) return Promise.reject(new Error('Cannot send an empty message.'));
    this.turns += 1;
    return new Promise((resolve, reject) => {
      this.pending = { onDelta, resolve, reject, text: '' };
      this.input.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        session_id: '',
      } as SDKUserMessage);
    });
  }

  /** Graceful shutdown: the runtime exits once its input ends. */
  dispose(): void {
    this.dead = true;
    this.input.end();
  }
}

async function runQuery(opts: {
  purpose: UsageEntry['purpose'];
  model: string;
  systemPrompt: string;
  prompt: string;
  schema?: Record<string, unknown>;
  onDelta?: (text: string) => void;
  // Latency/quality dial: conversational turns don't need deep reasoning, and
  // thinking time is the bulk of time-to-first-token. Default (unset) = high.
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}): Promise<{ text: string; structured: unknown; usage: UsageEntry }> {
  const q = query({
    prompt: opts.prompt,
    options: {
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      tools: [], // pure text generation — no file/bash/web tools
      env: subscriptionEnv(),
      includePartialMessages: opts.onDelta !== undefined,
      ...(opts.effort && { effort: opts.effort }),
      ...(opts.schema && {
        outputFormat: { type: 'json_schema' as const, schema: opts.schema },
      }),
    },
  });

  let text = '';
  let structured: unknown;
  let usage: UsageEntry | null = null;

  for await (const message of q) {
    if (message.type === 'stream_event') {
      const event = message.event;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        opts.onDelta?.(event.delta.text);
      }
    } else if (message.type === 'result') {
      usage = usageEntry(opts.purpose, opts.model, message.usage);
      if (message.subtype === 'success') {
        text = message.result;
        structured = 'structured_output' in message ? message.structured_output : undefined;
      } else {
        throw new Error(`Claude query failed (${message.subtype}).`);
      }
    }
  }

  if (!usage) {
    throw new Error(
      'Claude produced no result — is Claude Code logged in on this machine? Run `claude` and `/login`.',
    );
  }
  return { text, structured, usage };
}

// Intake and debrief prefer Opus; a Pro plan may not include it, so retry once
// on the chat model before surfacing an error.
async function runHeavy(
  opts: Omit<Parameters<typeof runQuery>[0], 'model'>,
): Promise<{ text: string; structured: unknown; usage: UsageEntry }> {
  try {
    return await runQuery({ ...opts, model: MODELS.heavy });
  } catch (err) {
    console.warn(
      `${MODELS.heavy} call failed (${err instanceof Error ? err.message : String(err)}); retrying on ${MODELS.chat}`,
    );
    return await runQuery({ ...opts, model: MODELS.chat });
  }
}

export async function structuredCall<T>(opts: {
  purpose: UsageEntry['purpose'];
  system: string;
  userContent: string;
  schema: Record<string, unknown>;
  maxTokens?: number; // kept for signature compatibility; the Agent SDK manages output budgets itself
}): Promise<{ data: T; usage: UsageEntry }> {
  const { text, structured, usage } = await runHeavy({
    purpose: opts.purpose,
    systemPrompt: opts.system,
    prompt: opts.userContent,
    schema: opts.schema,
  });
  let data: T;
  if (structured !== undefined) {
    data = structured as T;
  } else {
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new Error('Model returned malformed JSON — try again.');
    }
  }
  return { data, usage };
}

// §6.2: past 20 live turns, fold the older ones into a ~150-word summary and
// keep the last 10 verbatim. Runs off the hot path after a turn completes.
// One compaction per session at a time: it's fire-and-forget, so a fast next
// turn could otherwise start a second pass over an overlapping range.
const compacting = new WeakSet<Session>();

export async function maybeCompact(session: Session): Promise<UsageEntry | null> {
  const live = session.turns.length - session.compactedThrough;
  if (live <= 20 || compacting.has(session)) return null;

  const keepFrom = session.turns.length - 10;
  // Interleave think-aloud narration chronologically — folded turns are the
  // only place these older segments survive once compaction moves past them.
  const narrationByTurn = new Map<number, string[]>();
  for (const n of session.narration) {
    if (n.atTurn >= session.compactedThrough && n.atTurn < keepFrom) {
      const group = narrationByTurn.get(n.atTurn) ?? [];
      group.push(n.text);
      narrationByTurn.set(n.atTurn, group);
    }
  }
  const lines: string[] = [];
  for (let i = session.compactedThrough; i < keepFrom; i++) {
    for (const text of narrationByTurn.get(i) ?? []) lines.push(`CANDIDATE (thinking aloud): ${text}`);
    const t = session.turns[i];
    lines.push(`${t.role === 'user' ? 'CANDIDATE' : t.persona.toUpperCase()}: ${t.content}`);
  }
  const transcript = lines.join('\n\n');
  const prior = session.compactSummary ? `Earlier summary:\n${session.compactSummary}\n\n` : '';

  compacting.add(session);
  try {
    const { text, usage } = await runQuery({
      purpose: 'compact',
      model: MODELS.compact,
      effort: 'low', // mechanical summarization
      systemPrompt:
        'Summarize this C++ interview-practice conversation segment in at most 150 words: what was discussed, decisions made, mistakes and corrections, and any points the interviewer already raised (so they are not repeated). Output only the summary.',
      prompt: `${prior}${transcript}`,
    });
    if (!text.trim()) return null;

    session.compactSummary = text.trim();
    session.compactedThrough = keepFrom;
    return usage;
  } finally {
    compacting.delete(session);
  }
}
