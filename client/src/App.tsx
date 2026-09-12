import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BuildResult,
  ClientMessage,
  ClientProblem,
  DesignMeta,
  GradeSummary,
  Language,
  OopMeta,
  Persona,
  Scorecard,
  ServerMessage,
  TechTopic,
  TestsResult,
  Turn,
} from '../../shared/protocol';
import { rememberSessionId, useSocket } from './hooks/useSocket';
import Editor, { isPristineBuffer, type EditorApi, type EditorState } from './components/Editor';
import ChatPane from './components/ChatPane';
import ProblemPane from './components/ProblemPane';
import Console from './components/Console';
import NavBar from './components/NavBar';
import WorkspaceBar from './components/WorkspaceBar';
import HomePage from './components/HomePage';
import ScorecardView from './components/ScorecardView';
import ProgressView from './components/ProgressView';
import SetupPage from './components/SetupPage';
import { useHashRoute } from './hooks/useHashRoute';
import { NarrationCapture, SentenceSpeaker } from './lib/voice';
import { bindLspSend, handleLspMessage } from './lib/lsp';

type DebriefState = { scorecard: Scorecard; grade: GradeSummary } | null;

// Personas that belong to the coding workspace, as opposed to a page that
// pins its own (design, OOP, tech, behavioral).
const CODING_PERSONAS: Persona[] = ['interviewer', 'mock', 'tutor'];

export default function App() {
  const [persona, setPersona] = useState<Persona>('interviewer');
  const [language, setLanguage] = useState<Language>('cpp');
  const [problem, setProblem] = useState<ClientProblem | null>(null);
  const [designQuestion, setDesignQuestion] = useState<DesignMeta | null>(null);
  const [techTopics, setTechTopics] = useState<TechTopic[] | null>(null);
  const [oopQuestion, setOopQuestion] = useState<OopMeta | null>(null);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  // Set when a reconnect landed on a session the server could not resume while
  // the editor held real work: the code was kept, but the clock and transcript
  // belong to a new session, and the user should know rather than discover it.
  const [sessionRecreated, setSessionRecreated] = useState(false);

  const [compiling, setCompiling] = useState(false);
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [tests, setTests] = useState<TestsResult | null>(null);

  const [startedAt, setStartedAt] = useState(Date.now());
  // Pause bookkeeping mirrors the server's spans: pausedMs = closed pauses,
  // pausedAt = start of the open one. The clock shows active time only.
  const [pauseState, setPauseState] = useState<{ paused: boolean; pausedMs: number; pausedAt: number | null }>({
    paused: false,
    pausedMs: 0,
    pausedAt: null,
  });
  const pausedRef = useRef(false);
  const [endingSession, setEndingSession] = useState(false);
  const [debrief, setDebrief] = useState<DebriefState>(null);
  const [route, navigate] = useHashRoute();

  const editorApiRef = useRef<EditorApi | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  // Buffer arriving before Monaco mounts (first load / page refresh resume).
  const pendingBufferRef = useRef<string | null>(null);
  // Mirrors for the ws message handler and send-gated callbacks — they must
  // read live state, not the closure from when they were created.
  const sendRef = useRef<(msg: ClientMessage) => boolean>(() => false);
  const chatBusyRef = useRef(false);
  const personaRef = useRef<Persona>('interviewer');
  const streamRef = useRef('');

  // Voice mode (session toggle): replies are spoken sentence-by-sentence as
  // they stream. Refs keep the ws message handler free of stale closures.
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const speakerRef = useRef<SentenceSpeaker>(new SentenceSpeaker());

  // Ambient narration: a hands-free mic that transcribes think-aloud while
  // coding. Segments become interviewer context and Axis D evidence — they
  // never send a chat turn. sessionEpoch bumps on session:ready so the mic
  // state gets re-announced to a fresh server session after a reconnect.
  const [narrationOn, setNarrationOn] = useState(false);
  const [narrationLive, setNarrationLive] = useState<string | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'session:ready': {
        // Every (re)connect: reset transient flags (a reconnect mid-reply
        // would otherwise leave busy states stuck), then restore the session
        // snapshot — on a resumed session that brings back the transcript,
        // problem and clock instead of wiping the interview.
        rememberSessionId(msg.sessionId);
        setStartedAt(msg.startedAt);
        setPauseState({ paused: msg.paused, pausedMs: msg.pausedMs, pausedAt: msg.pausedAt });
        setPersona(msg.persona);
        setLanguage(msg.language);
        setDesignQuestion(msg.designQuestion);
        setTechTopics(msg.techTopics);
        setOopQuestion(msg.oopQuestion);
        setTurns(msg.turns);
        setProblem(msg.problem);
        setStreamText(null);
        streamRef.current = '';
        setDebrief(null);
        setIntakeLoading(false);
        setIntakeError(null);
        setChatBusy(false);
        chatBusyRef.current = false;
        setChatError(null);
        setCompiling(false);
        setBuild(null);
        setTests(null);
        setEndingSession(false);
        setSessionEpoch((e) => e + 1);
        speakerRef.current.cancel();
        const editor = editorApiRef.current;
        if (!editor) {
          pendingBufferRef.current = msg.buffer; // Monaco mounts later
        } else if (msg.reason !== 'connect') {
          // Language toggle or explicit reset: the user asked the server to
          // change the buffer, so the server's copy wins.
          editor.setValue(msg.buffer);
        } else if (isPristineBuffer(editor.getState().buffer)) {
          // Nothing typed yet — no work to lose, take the server snapshot.
          editor.setValue(msg.buffer);
        } else {
          // A (re)connect with real code in the editor. The browser's buffer is
          // by construction at least as new as anything the server holds (the
          // server's copy is debounced), so the client is authoritative — push
          // it up rather than overwriting it. Keying this on `reason` and not
          // on `resumed` is deliberate: a server restart legitimately answers
          // resumed=false, and the old code overwrote the candidate's live
          // code with the default buffer every time that happened.
          sendRef.current({ type: 'editor:state', ...editor.getState() });
          if (!msg.resumed) setSessionRecreated(true);
        }
        break;
      }
      case 'design:ready':
        setDesignQuestion(msg.question);
        // The interviewer's canned statement streams next as chat:delta —
        // prime the speaker so voice mode reads it aloud.
        if (voiceModeRef.current) speakerRef.current.beginReply();
        break;
      case 'techq:ready':
        setTechTopics(msg.topics);
        if (voiceModeRef.current) speakerRef.current.beginReply();
        break;
      case 'oop:ready':
        setOopQuestion(msg.question);
        if (voiceModeRef.current) speakerRef.current.beginReply();
        break;
      case 'problem:ready':
        setIntakeLoading(false);
        setIntakeError(null);
        setProblem(msg.problem);
        setBuild(null);
        setTests(null);
        editorApiRef.current?.setValue(msg.buffer);
        // Oral delivery: the interviewer's spoken statement streams next —
        // prime the speaker so voice mode reads it aloud (and clear any
        // earlier barge-in stop).
        if (msg.problem.oral && voiceModeRef.current) speakerRef.current.beginReply();
        break;
      case 'problem:error':
        setIntakeLoading(false);
        setIntakeError(msg.message);
        break;
      case 'chat:delta':
        streamRef.current += msg.text;
        setStreamText((prev) => (prev ?? '') + msg.text);
        if (voiceModeRef.current) speakerRef.current.feed(msg.text);
        break;
      case 'chat:done':
        streamRef.current = '';
        setStreamText(null);
        setChatBusy(false);
        chatBusyRef.current = false;
        setTurns((prev) => [...prev, msg.turn]);
        if (voiceModeRef.current) speakerRef.current.finish();
        break;
      case 'chat:error': {
        // Keep whatever streamed before the failure — discarding a half-
        // written explanation is worse than showing it marked as cut off.
        const partial = streamRef.current;
        streamRef.current = '';
        if (partial.trim()) {
          setTurns((prev) => [
            ...prev,
            { role: 'assistant', content: `${partial}\n\n*[reply cut off]*`, at: Date.now(), persona: personaRef.current },
          ]);
        }
        setStreamText(null);
        setChatBusy(false);
        chatBusyRef.current = false;
        setChatError(msg.message);
        speakerRef.current.cancel();
        break;
      }
      case 'build:status':
        setCompiling(true);
        setTests(null);
        break;
      case 'build:result':
        setCompiling(false);
        setBuild(msg.result);
        break;
      case 'tests:result':
        setTests(msg.result);
        break;
      case 'debrief:ready':
        setEndingSession(false);
        setDebrief({ scorecard: msg.scorecard, grade: msg.grade });
        break;
      case 'debrief:error':
        setEndingSession(false);
        setChatError(`Debrief failed: ${msg.message}`);
        break;
      case 'lsp:status':
      case 'lsp:result':
        handleLspMessage(msg);
        break;
    }
  }, []);

  const { send, connected } = useSocket(handleMessage);
  sendRef.current = send;
  personaRef.current = persona;
  chatBusyRef.current = chatBusy;
  pausedRef.current = pauseState.paused;

  // Monaco's semantic providers (monacoConfig) reach the server through this.
  useEffect(() => bindLspSend(send), [send]);

  // Segments that couldn't be delivered while the socket was down — flushed
  // on reconnect so grading evidence isn't silently lost.
  const queuedNarrationRef = useRef<string[]>([]);
  const [narrationActive, setNarrationActive] = useState(false);

  // The capture's lifetime tracks the toggle. It pauses itself around TTS
  // playback and push-to-talk; a fatal mic error flips the toggle back off.
  // While the session is paused the mic drops entirely — break-time chatter
  // must not become narration evidence.
  useEffect(() => {
    if (!narrationOn || pauseState.paused) return;
    const capture = new NarrationCapture({
      onSegment: (text) => {
        if (!send({ type: 'narration:segment', text })) queuedNarrationRef.current.push(text);
      },
      onInterim: (text) => setNarrationLive(text || null),
      onStatus: setNarrationActive,
      onError: (message) => {
        setNarrationError(message);
        setNarrationOn(false);
      },
    });
    if (!capture.start()) {
      setNarrationOn(false);
      return;
    }
    return () => {
      capture.stop();
      setNarrationLive(null);
      setNarrationActive(false);
    };
  }, [narrationOn, pauseState.paused, send]);

  // Announce mic on/off so the server records mic-on spans (the grader uses
  // them to tell real silence from a mic that was off). Re-announced on
  // reconnect — a fresh server session defaults to off — and any narration
  // that queued up while disconnected is delivered late rather than never.
  useEffect(() => {
    if (!connected) return;
    // Paused counts as mic-off for the grader's mic-on spans.
    send({ type: 'narration:state', on: narrationOn && !pauseState.paused });
    for (const text of queuedNarrationRef.current.splice(0)) {
      send({ type: 'narration:segment', text });
    }
  }, [narrationOn, pauseState.paused, connected, sessionEpoch, send]);

  const handleNarration = useCallback((on: boolean) => {
    setNarrationError(null);
    setNarrationOn(on);
  }, []);

  const handlePause = useCallback(() => {
    const next = !pausedRef.current;
    if (!send({ type: 'session:pause', paused: next })) {
      setChatError('Not connected — cannot pause/resume right now.');
      return;
    }
    setPauseState((p) =>
      next
        ? { paused: true, pausedMs: p.pausedMs, pausedAt: Date.now() }
        : {
            paused: false,
            pausedMs: p.pausedMs + (p.pausedAt !== null ? Date.now() - p.pausedAt : 0),
            pausedAt: null,
          },
    );
  }, [send]);

  const handleRun = useCallback(() => {
    const state = editorApiRef.current?.getState();
    if (!state) {
      setChatError('The editor is still loading — give it a second.');
      return;
    }
    if (!send({ type: 'run', buffer: state.buffer })) {
      setChatError('Not connected — reconnecting. Try Run again in a moment.');
    }
  }, [send]);

  // Returns whether the message was actually sent — callers keep the draft
  // when it wasn't (disconnected, editor loading, or a send already in
  // flight), instead of silently losing what the user wrote or said.
  const handleChatSend = useCallback(
    (content: string): boolean => {
      const state = editorApiRef.current?.getState();
      if (!state) {
        setChatError('The editor is still loading — give it a second.');
        return false;
      }
      if (chatBusyRef.current) return false; // double-send guard (Enter + PTT race)
      // Bundle the live editor state so the model never sees a stale buffer.
      if (!send({ type: 'chat:send', content, ...state, voice: voiceModeRef.current })) {
        setChatError('Not connected — reconnecting. Your message was not sent.');
        return false;
      }
      setChatError(null);
      setChatBusy(true);
      chatBusyRef.current = true;
      setStreamText('');
      streamRef.current = '';
      setTurns((prev) => [...prev, { role: 'user', content, at: Date.now(), persona }]);
      if (voiceModeRef.current) speakerRef.current.beginReply();
      return true;
    },
    [send, persona],
  );

  const handleVoiceMode = useCallback((on: boolean) => {
    setVoiceMode(on);
    voiceModeRef.current = on;
    if (!on) speakerRef.current.cancel();
  }, []);

  const handleBargeIn = useCallback(() => speakerRef.current.cancel(), []);

  const handlePersona = useCallback(
    (p: Persona) => {
      setPersona(p);
      send({ type: 'persona:set', persona: p });
    },
    [send],
  );

  // The server replies with a fresh session:ready snapshot (possibly with a
  // swapped default buffer) — client state updates from that round trip.
  const handleLanguage = useCallback(
    (l: Language) => {
      send({ type: 'language:set', language: l });
    },
    [send],
  );

  const handleIntake = useCallback(
    (raw: string, delivery: 'text' | 'oral', framing: 'scenario' | 'plain') => {
      if (!send({ type: 'problem:intake', raw, delivery, framing, voice: voiceModeRef.current })) {
        setIntakeError('Not connected — reconnecting. Try again in a moment.');
        return;
      }
      setIntakeLoading(true);
      setIntakeError(null);
    },
    [send],
  );

  const handleTechStart = useCallback(
    (topics: TechTopic[]) => {
      if (!send({ type: 'techq:start', topics })) {
        setChatError('Not connected — reconnecting. Try starting again in a moment.');
      }
    },
    [send],
  );

  const handleDebugPick = useCallback(
    (id?: string) => {
      if (!send({ type: 'debug:pick', id })) {
        setChatError('Not connected — reconnecting. Try picking again in a moment.');
      }
    },
    [send],
  );

  const handleOopPick = useCallback(
    (id?: string) => {
      if (!send({ type: 'oop:pick', id })) {
        setChatError('Not connected — reconnecting. Try picking again in a moment.');
      }
    },
    [send],
  );

  const handleEndSession = useCallback(() => {
    if (!send({ type: 'session:end' })) {
      setChatError('Not connected — cannot end the session right now.');
      return;
    }
    setEndingSession(true);
  }, [send]);

  const handleResetSession = useCallback(() => {
    if (
      !window.confirm(
        'Start a new session? The transcript, problem and clock are discarded without grading (the session file stays on disk). The new session starts paused.',
      )
    ) {
      return;
    }
    if (!send({ type: 'session:reset' })) {
      setChatError('Not connected — cannot reset the session right now.');
    }
    // The fresh session:ready that follows resets all client state.
  }, [send]);

  // Route drives persona: the design/behavioral pages pin their persona, and
  // the practice page restores the last coding persona. Runs on navigation
  // and on fresh sessions (sessionEpoch), guarded to avoid redundant sends.
  const lastCodingPersonaRef = useRef<Persona>('interviewer');
  useEffect(() => {
    if (CODING_PERSONAS.includes(persona)) lastCodingPersonaRef.current = persona;
  }, [persona]);
  useEffect(() => {
    if (!connected) return;
    const coding = CODING_PERSONAS.includes(personaRef.current);
    const want =
      route === 'design'
        ? 'sysdesign'
        : route === 'oop'
          ? 'oopdesign'
          : route === 'tech'
            ? 'techq'
            : route === 'behavioral'
              ? 'behavioral'
              : route === 'practice' && !coding
                ? lastCodingPersonaRef.current
                : null;
    if (want && personaRef.current !== want) handlePersona(want);
  }, [route, connected, sessionEpoch, handlePersona]);

  // After a CV upload/removal over HTTP, tell the server so the persona
  // context is rebuilt on the next turn.
  const handleCvUpdated = useCallback(() => {
    send({ type: 'cv:updated' });
  }, [send]);

  const handleDesignPick = useCallback(
    (id?: string) => {
      if (!send({ type: 'design:pick', id })) {
        setChatError('Not connected — reconnecting. Try picking again in a moment.');
      }
    },
    [send],
  );

  // Stable references so the memoized Editor never re-renders during
  // token-by-token chat streaming (App re-renders on every delta).
  const handleEditorState = useCallback(
    (state: EditorState) => send({ type: 'editor:state', ...state }),
    [send],
  );
  const handleFocusChat = useCallback(() => chatInputRef.current?.focus(), []);
  const handleEditorReady = useCallback((api: EditorApi) => {
    editorApiRef.current = api;
    if (pendingBufferRef.current !== null) {
      api.setValue(pendingBufferRef.current); // session snapshot beat Monaco's mount
      pendingBufferRef.current = null;
    }
  }, []);

  const inWorkspace =
    route === 'practice' || route === 'design' || route === 'oop' || route === 'tech' || route === 'behavioral';

  return (
    <div className="flex h-full flex-col">
      <NavBar
        route={route}
        inSession={inWorkspace}
        connected={connected}
        startedAt={startedAt}
        paused={pauseState.paused}
        pausedMs={pauseState.pausedMs}
        pausedAt={pauseState.pausedAt}
        endingSession={endingSession}
        voiceMode={voiceMode}
        narrationOn={narrationOn}
        narrationActive={narrationActive}
        onNavigate={navigate}
        onPause={handlePause}
        onVoiceMode={handleVoiceMode}
        onNarration={handleNarration}
        onEndSession={handleEndSession}
        onResetSession={handleResetSession}
      />

      {route === 'home' && (
        <div className="min-h-0 flex-1">
          <HomePage onNavigate={navigate} />
        </div>
      )}
      {route === 'progress' && (
        <div className="min-h-0 flex-1">
          <ProgressView asPage />
        </div>
      )}
      {route === 'setup' && (
        <div className="min-h-0 flex-1">
          <SetupPage onCvUpdated={handleCvUpdated} />
        </div>
      )}

      {sessionRecreated && inWorkspace && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b border-amber-800/60 bg-amber-950/60 px-3 py-1.5 text-xs text-amber-200"
        >
          <span>
            The server restarted and this session could not be resumed — your code was kept, but the clock and
            transcript started over.
          </span>
          <button
            onClick={() => setSessionRecreated(false)}
            className="shrink-0 rounded px-2 py-0.5 text-amber-300/80 hover:bg-amber-900/60 hover:text-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* The workspace stays MOUNTED across navigation — Monaco's buffer and
          the live session must survive page switches — pages only toggle
          visibility. Design mode hides the console (whiteboard); behavioral
          hides editor+problem and centers the chat. */}
      <div className={`min-h-0 flex-1 flex-col ${inWorkspace ? 'flex' : 'hidden'}`}>
        <WorkspaceBar
          route={inWorkspace ? route : 'practice'}
          persona={persona}
          language={language}
          compiling={compiling}
          onPersona={handlePersona}
          onLanguage={handleLanguage}
          onRun={handleRun}
          onCvUpdated={handleCvUpdated}
        />
        <div className="flex min-h-0 flex-1">
          <div
            className={`w-[22%] min-w-[260px] border-r border-neutral-800 ${route === 'behavioral' ? 'hidden' : ''}`}
          >
            <ProblemPane
              problem={problem}
              loading={intakeLoading}
              error={intakeError}
              persona={persona}
              designQuestion={designQuestion}
              techTopics={techTopics}
              oopQuestion={oopQuestion}
              sessionEpoch={sessionEpoch}
              onIntake={handleIntake}
              onDesignPick={handleDesignPick}
              onTechStart={handleTechStart}
              onDebugPick={handleDebugPick}
              onOopPick={handleOopPick}
            />
          </div>

          <div className={`min-w-0 flex-1 flex-col ${route === 'behavioral' ? 'hidden' : 'flex'}`}>
            <div className="min-h-0 flex-[3]">
              <Editor
                language={language}
                onState={handleEditorState}
                onRun={handleRun}
                onFocusChat={handleFocusChat}
                onReady={handleEditorReady}
              />
            </div>
            <div className={`min-h-0 flex-1 border-t border-neutral-800 ${route === 'design' ? 'hidden' : ''}`}>
              <Console compiling={compiling} build={build} tests={tests} />
            </div>
          </div>

          <div
            className={
              route === 'behavioral'
                ? 'mx-auto w-full max-w-3xl'
                : 'w-[28%] min-w-[300px] border-l border-neutral-800'
            }
          >
            <ChatPane
              turns={turns}
              streamText={streamText}
              busy={chatBusy}
              error={chatError}
              persona={persona}
              narrationLive={narrationLive}
              narrationError={narrationError}
              inputRef={chatInputRef}
              onSend={handleChatSend}
              onBargeIn={handleBargeIn}
            />
          </div>
        </div>
      </div>

      {debrief && (
        <ScorecardView scorecard={debrief.scorecard} grade={debrief.grade} onClose={() => setDebrief(null)} />
      )}
    </div>
  );
}
