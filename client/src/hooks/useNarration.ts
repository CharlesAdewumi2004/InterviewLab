import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage } from '../../../shared/protocol';
import { NarrationCapture } from '../lib/voice';

interface Options {
  send: (msg: ClientMessage) => boolean;
  connected: boolean;
  /** A paused session drops the mic: break-time chatter is not evidence. */
  paused: boolean;
  /** Bumped on every session:ready, so mic state is re-announced to a fresh server session. */
  sessionEpoch: number;
}

export interface Narration {
  /** The toggle: what the user asked for. */
  on: boolean;
  /** Whether the mic is actually capturing right now (it yields around TTS and push to talk). */
  active: boolean;
  /** Live interim transcript, for the chat pane's ghost line. */
  live: string | null;
  error: string | null;
  setOn: (on: boolean) => void;
}

/**
 * The ambient think-aloud channel: a mic that stays open while you code and
 * turns speech into interviewer context and grading evidence. It never sends a
 * chat message.
 *
 * Two details carry most of the weight. Segments captured while the socket is
 * down are queued and flushed on reconnect, because a lost segment is lost
 * grading evidence with no trace. And mic on/off is re-announced whenever the
 * connection or the session changes, since the server starts every session
 * with the mic off and uses those spans to tell real silence from a mic that
 * was simply not running.
 */
export function useNarration({ send, connected, paused, sessionEpoch }: Options): Narration {
  const [on, setOn] = useState(false);
  const [active, setActive] = useState(false);
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queued = useRef<string[]>([]);

  // The capture's lifetime tracks the toggle. It pauses itself around TTS
  // playback and push to talk; a fatal mic error flips the toggle back off.
  useEffect(() => {
    if (!on || paused) return;
    const capture = new NarrationCapture({
      onSegment: (text) => {
        if (!send({ type: 'narration:segment', text })) queued.current.push(text);
      },
      onInterim: (text) => setLive(text || null),
      onStatus: setActive,
      onError: (message) => {
        setError(message);
        setOn(false);
      },
    });
    if (!capture.start()) {
      setOn(false);
      return;
    }
    return () => {
      capture.stop();
      setLive(null);
      setActive(false);
    };
  }, [on, paused, send]);

  useEffect(() => {
    if (!connected) return;
    // Paused counts as mic off for the grader's mic-on spans.
    send({ type: 'narration:state', on: on && !paused });
    for (const text of queued.current.splice(0)) send({ type: 'narration:segment', text });
  }, [on, paused, connected, sessionEpoch, send]);

  const setOnClearingError = useCallback((next: boolean) => {
    setError(null);
    setOn(next);
  }, []);

  return { on, active, live, error, setOn: setOnClearingError };
}
