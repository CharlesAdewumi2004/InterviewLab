import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import type { Persona, Turn } from '../../../shared/protocol';
import { speechInputSupported, startMic, type MicSession } from '../lib/voice';

interface Props {
  turns: Turn[];
  streamText: string | null;
  busy: boolean;
  error: string | null;
  persona: Persona;
  narrationLive: string | null;
  narrationError: string | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Returns false when the message could not be sent — keep the text. */
  onSend: (content: string) => boolean;
  onBargeIn: () => void;
}

// Minimal markdown: fenced code blocks render as <pre>, everything else as
// pre-wrapped text. Enough for tutor snippets without a markdown dependency.
function renderContent(content: string) {
  const parts = content.split(/```(?:\w*\n)?/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <pre key={i} className="my-2 overflow-x-auto rounded bg-black/40 p-2 font-mono text-xs leading-relaxed">
        {part.replace(/\n$/, '')}
      </pre>
    ) : (
      <span key={i} className="whitespace-pre-wrap">
        {part}
      </span>
    ),
  );
}

function personaLabel(p: Persona): string {
  if (p === 'interviewer') return 'Interviewer';
  if (p === 'sysdesign') return 'Sys Design';
  if (p === 'behavioral') return 'Behavioral';
  if (p === 'mock') return 'Interviewer';
  if (p === 'techq') return 'Tech Round';
  if (p === 'oopdesign') return 'OOP Design';
  return 'Tutor';
}

// Reads naturally in a sentence ("talk to the …").
function personaChatLabel(p: Persona): string {
  if (p === 'sysdesign') return 'design interviewer';
  if (p === 'behavioral') return 'behavioral interviewer';
  if (p === 'mock') return 'Full mock interviewer';
  if (p === 'tutor') return 'tutor';
  if (p === 'techq') return 'interviewer';
  if (p === 'oopdesign') return 'design interviewer';
  return 'interviewer';
}

// Memoized: the transcript can get long, and without this every streamed
// token re-renders every historical bubble.
const TurnList = memo(function TurnList({ turns }: { turns: Turn[] }) {
  return (
    <>
      {turns.map((t, i) => (
        <div key={i} className={t.role === 'user' ? 'text-right' : ''}>
          <div
            className={
              t.role === 'user'
                ? 'inline-block max-w-[90%] rounded-lg bg-blue-900/60 px-3 py-2 text-left text-sm'
                : 'inline-block max-w-[95%] rounded-lg bg-neutral-800 px-3 py-2 text-sm'
            }
          >
            {t.role === 'assistant' && (
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {personaLabel(t.persona)}
              </div>
            )}
            {renderContent(t.content)}
          </div>
        </div>
      ))}
    </>
  );
});

export default function ChatPane({
  turns,
  streamText,
  busy,
  error,
  persona,
  narrationLive,
  narrationError,
  inputRef,
  onSend,
  onBargeIn,
}: Props) {
  const [draft, setDraft] = useState('');
  // 'ptt' = chord held (release sends); 'toggle' = chord tapped (mic stays
  // open hands-free, next tap sends); 'click' = Mic button (text lands in the
  // input for review).
  const [listening, setListening] = useState<null | 'click' | 'ptt' | 'toggle'>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const micRef = useRef<MicSession | null>(null);
  const listeningRef = useRef<null | 'click' | 'ptt' | 'toggle'>(null);
  listeningRef.current = listening;
  const pttDownAtRef = useRef(0);
  // The push-to-talk window listeners are registered once; these refs keep
  // them reading fresh state instead of the closures from mount time (a stale
  // `busy=true` here used to kill Ctrl+Space for the rest of the session).
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Follow the stream only while the user is already near the bottom —
  // pinning unconditionally made scrolling back through the transcript
  // impossible during a streaming reply.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns, streamText, error, micError, narrationError]);

  const submit = () => {
    const content = draft.trim();
    if (!content || busy) return;
    if (onSend(content)) setDraft(''); // keep the draft when the send failed
  };

  // Speaking interrupts the interviewer (barge-in) and streams the live
  // transcript into the input. 'click' mode leaves the text for review;
  // 'ptt' (hold Ctrl+Space or F8) sends it on release. Recording works even
  // while a reply is streaming — the words land in the draft instead of
  // being lost, and an existing typed draft is appended to, never wiped.
  const startListening = (mode: 'click' | 'ptt') => {
    if (listeningRef.current) return;
    onBargeIn();
    setMicError(null);
    const base = draftRef.current.trim();
    const compose = (text: string) => (base && text ? `${base} ${text}` : base || text);
    const session = startMic({
      onTranscript: (text) => setDraft(compose(text)),
      onDone: (text) => {
        micRef.current = null;
        setListening(null);
        const full = compose(text);
        if (mode === 'ptt' && full && !busyRef.current && onSend(full)) {
          setDraft('');
        } else {
          // Reply in flight or send failed: preserve the words for review.
          setDraft(full);
          inputRef.current?.focus();
        }
      },
      onError: (message) => {
        micRef.current = null;
        setListening(null);
        setMicError(message);
      },
    });
    if (session) {
      micRef.current = session;
      setListening(mode);
    }
  };

  const stopListening = () => micRef.current?.stop();

  // startListening closes over props (busy via ref, onSend, persona) — the
  // window listeners below go through this ref so they always call the
  // freshest version, not the one from the render they were registered in.
  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;

  // Ctrl+Space (or F8): HOLD to talk, release to send — or TAP to toggle the
  // mic on hands-free and tap again to stop and send. Bound whenever this
  // browser supports speech input, regardless of the Voice/Narrate toggles.
  // Monaco's manual suggest trigger moves to Ctrl+I (suggestions still pop
  // automatically as you type).
  const TAP_MS = 350; // released faster than this = a tap, not a hold
  useEffect(() => {
    if (!speechInputSupported) return;
    const isPttChord = (e: KeyboardEvent) => (e.code === 'Space' && e.ctrlKey) || e.code === 'F8';
    const down = (e: KeyboardEvent) => {
      if (isPttChord(e) && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        if (listeningRef.current === 'toggle') {
          stopListening(); // second tap: stop and send
        } else if (!listeningRef.current) {
          pttDownAtRef.current = Date.now();
          startListeningRef.current('ptt');
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (listeningRef.current === 'ptt' && (e.code === 'Space' || e.key === 'Control' || e.code === 'F8')) {
        e.preventDefault();
        if (Date.now() - pttDownAtRef.current < TAP_MS) {
          // A tap, not a hold: keep the mic open hands-free. The ref updates
          // immediately — the next keydown may arrive before a re-render.
          listeningRef.current = 'toggle';
          setListening('toggle');
        } else {
          stopListening();
        }
      }
    };
    // Alt-tabbing away mid-hold loses the keyup — treat blur as release so
    // the mic doesn't stay hot in the background. A deliberate toggle (like
    // the Mic button's click mode) survives blur.
    const blur = () => {
      if (listeningRef.current === 'ptt') stopListening();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
      micRef.current?.abort();
      micRef.current = null;
      setListening(null);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {turns.length === 0 && !streamText && (
          <p className="text-sm text-neutral-500">
            Talk to the {personaChatLabel(persona)} — they can already see your code, build status and
            test results. No need to paste anything.
            {speechInputSupported &&
              ' Hold Ctrl+Space (or F8) to speak — release to send. Or tap it to toggle the mic on hands-free; tap again to send.'}
          </p>
        )}
        <TurnList turns={turns} />
        {streamText !== null && (
          <div>
            <div className="inline-block max-w-[95%] rounded-lg bg-neutral-800 px-3 py-2 text-sm">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {personaLabel(persona)}
              </div>
              {renderContent(streamText)}
              <span className="animate-pulse">▌</span>
            </div>
          </div>
        )}
        {error && <div className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</div>}
        {micError && <div className="rounded bg-amber-900/40 px-3 py-2 text-sm text-amber-300">{micError}</div>}
        {narrationError && (
          <div className="rounded bg-amber-900/40 px-3 py-2 text-sm text-amber-300">Narration: {narrationError}</div>
        )}
      </div>
      <div className="border-t border-neutral-800 p-2">
        {narrationLive && (
          <div className="mb-1 truncate text-xs italic text-neutral-500" title="Heard as think-aloud — not sent as a message">
            <span className="animate-pulse">●</span> {narrationLive}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              onBargeIn(); // typing cuts the interviewer off, like speaking would
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              listening === 'toggle'
                ? 'Listening — tap Ctrl+Space / F8 again to send'
                : listening
                  ? 'Listening…'
                  : busy
                    ? 'Waiting for response…'
                    : speechInputSupported
                      ? 'Ask a question — or tap/hold Ctrl+Space / F8 to speak'
                      : 'Ask a question (Enter to send, Shift+Enter for newline)'
            }
            rows={2}
            className={`w-full resize-none rounded border bg-neutral-900 p-2 text-sm outline-none ${
              listening ? 'border-red-600' : 'border-neutral-700 focus:border-blue-600'
            }`}
          />
          {speechInputSupported && (
            <button
              onClick={() => (listening ? stopListening() : startListening('click'))}
              title={
                listening === 'toggle'
                  ? 'Stop listening and send'
                  : listening
                    ? 'Stop listening'
                    : 'Speak (transcript lands in the input for review)'
              }
              className={`rounded px-2.5 py-2 text-base leading-none disabled:opacity-40 ${
                listening ? 'animate-pulse bg-red-700 hover:bg-red-600' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {listening ? '■' : 'Mic'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
