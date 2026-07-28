import { memo, useEffect, useState } from 'react';
import type { Language, Persona } from '../../../shared/protocol';
import {
  getPreferredVoiceName,
  listEnglishVoices,
  onVoicesChanged,
  setPreferredVoice,
  speakSample,
  speechInputSupported,
} from '../lib/voice';

interface Props {
  persona: Persona;
  language: Language;
  compiling: boolean;
  connected: boolean;
  startedAt: number;
  paused: boolean;
  /** Total of closed pause spans (ms). */
  pausedMs: number;
  /** Start of the open pause, or null when running. */
  pausedAt: number | null;
  endingSession: boolean;
  voiceMode: boolean;
  narrationOn: boolean;
  /** False while capture has yielded the mic (TTS speaking, push-to-talk). */
  narrationActive: boolean;
  onPersona: (p: Persona) => void;
  onLanguage: (l: Language) => void;
  onRun: () => void;
  onEndSession: () => void;
  onResetSession: () => void;
  onVoiceMode: (on: boolean) => void;
  onNarration: (on: boolean) => void;
  onPause: () => void;
  onProgress: () => void;
}

// Isolated so the once-a-second tick re-renders this span only, not the
// whole toolbar (voice picker, segmented controls, buttons). Shows ACTIVE
// session time: pauses freeze it (closed pauses in pausedMs, the open one
// via pausedAt).
function Clock({ startedAt, pausedMs, pausedAt }: { startedAt: number; pausedMs: number; pausedAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor(((pausedAt ?? now) - startedAt - pausedMs) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (
    <span className={`font-mono text-xs ${pausedAt !== null ? 'text-amber-400' : 'text-neutral-500'}`}>
      {m}:{String(s).padStart(2, '0')}
      {pausedAt !== null && ' ⏸'}
    </span>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={
            o.value === value
              ? 'bg-blue-700 px-2.5 py-1 font-medium text-white'
              : 'bg-neutral-900 px-2.5 py-1 text-neutral-400 hover:bg-neutral-800'
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function voiceLabel(name: string, lang: string): string {
  const base = name
    .replace(/^(Microsoft|Google) /, '')
    .replace(/ Online/, '')
    .replace(/ - English \([^)]*\)$/, '');
  return `${base} · ${lang}`;
}

function VoicePicker() {
  const [voices, setVoices] = useState(() => listEnglishVoices());
  const [selected, setSelected] = useState(() => getPreferredVoiceName() ?? '');
  // The browser loads its voice list asynchronously — refresh when it lands.
  useEffect(() => onVoicesChanged(() => setVoices(listEnglishVoices())), []);
  if (voices.length === 0) return null;
  const value = selected && voices.some((v) => v.name === selected) ? selected : voices[0].name;
  // Microsoft's neural "Natural" voices are only exposed by Edge; every other
  // browser tops out at network/SAPI voices, so nudge toward the real fix.
  const hasNatural = voices.some((v) => /natural/i.test(v.name));
  return (
    <>
      <select
        value={value}
        onChange={(e) => {
          setSelected(e.target.value);
          setPreferredVoice(e.target.value);
          speakSample(); // audition immediately
        }}
        title="Interviewer voice (best available listed first)"
        className="max-w-[180px] rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-300"
      >
        {voices.map((v) => (
          <option key={v.name} value={v.name}>
            {voiceLabel(v.name, v.lang)}
          </option>
        ))}
      </select>
      {!hasNatural && (
        <span
          className="text-[11px] text-neutral-500"
          title="Microsoft Edge exposes neural 'Natural' voices to this app — noticeably smoother than what this browser offers."
        >
          smoother voices in Edge
        </span>
      )}
    </>
  );
}

export default memo(function Toolbar(props: Props) {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
      <span className="text-sm font-semibold tracking-tight text-neutral-200">Practice IDE</span>
      <Clock startedAt={props.startedAt} pausedMs={props.pausedMs} pausedAt={props.pausedAt} />
      <span
        className={`h-2 w-2 rounded-full ${props.connected ? 'bg-green-500' : 'bg-red-500'}`}
        title={props.connected ? 'connected' : 'disconnected'}
      />

      <div className="flex-1" />

      <button
        onClick={props.onProgress}
        title="Gradebook: scores and trends across sessions"
        className="rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
      >
        Progress
      </button>

      {speechInputSupported && (
        <button
          onClick={() => props.onNarration(!props.narrationOn)}
          title={
            props.narrationOn
              ? props.narrationActive
                ? 'Narration mic is live — everything you say aloud is transcribed as think-aloud for the interviewer and grading. It never sends a chat message.'
                : 'Narration is on but momentarily paused — the mic yields while the interviewer speaks or push-to-talk is held.'
              : 'Ambient narration: keep the mic open while you code so your think-aloud counts as communication evidence (Axis D). No replies are triggered.'
          }
          className={
            props.narrationOn
              ? props.narrationActive
                ? 'rounded border border-red-600 bg-red-800 px-2.5 py-1 text-xs font-medium text-white'
                : 'rounded border border-red-900 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-red-300'
              : 'rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800'
          }
        >
          {props.narrationOn ? (
            props.narrationActive ? (
              <>
                <span className="animate-pulse">●</span> Narrating
              </>
            ) : (
              '◌ Narration paused'
            )
          ) : (
            'Narrate'
          )}
        </button>
      )}

      <button
        onClick={() => props.onVoiceMode(!props.voiceMode)}
        title="Voice mode: replies are read aloud. Tap Ctrl+Space / F8 to toggle the mic (tap again to send), or hold it push-to-talk style"
        className={
          props.voiceMode
            ? 'rounded border border-blue-600 bg-blue-700 px-2.5 py-1 text-xs font-medium text-white'
            : 'rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800'
        }
      >
        {props.voiceMode ? 'Voice on' : 'Voice'}
      </button>
      {props.voiceMode && <VoicePicker />}

      <Segmented
        value={props.language}
        options={[
          { value: 'cpp', label: 'C++' },
          { value: 'python', label: 'Py' },
        ]}
        onChange={props.onLanguage}
      />

      <Segmented
        value={props.persona}
        options={[
          { value: 'interviewer', label: 'Technical' },
          { value: 'sysdesign', label: 'Sys Design' },
          { value: 'behavioral', label: 'Behavioral' },
          { value: 'bloomberg', label: 'Bloomberg' },
          { value: 'tutor', label: 'Tutor' },
        ]}
        onChange={props.onPersona}
      />

      <button
        onClick={props.onPause}
        title={
          props.paused
            ? 'Resume the session — the clock restarts and the narration mic comes back'
            : 'Pause the session — the clock stops, the narration mic yields, and paused time never counts toward grading'
        }
        className={
          props.paused
            ? 'rounded border border-amber-600 bg-amber-700 px-3 py-1 text-sm font-medium text-white hover:bg-amber-600'
            : 'rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-400 hover:bg-neutral-800'
        }
      >
        {props.paused ? '▶ Resume' : '⏸ Pause'}
      </button>

      <button
        onClick={props.onRun}
        disabled={props.compiling}
        className="rounded bg-green-700 px-3 py-1 text-sm font-medium hover:bg-green-600 disabled:opacity-40"
        title="Ctrl/Cmd+Enter"
      >
        {props.compiling ? 'Compiling…' : 'Run'}
      </button>

      <button
        onClick={props.onEndSession}
        disabled={props.endingSession}
        className="rounded bg-neutral-700 px-3 py-1 text-sm hover:bg-neutral-600 disabled:opacity-40"
      >
        {props.endingSession ? 'Debriefing…' : 'End session'}
      </button>

      <button
        onClick={props.onResetSession}
        disabled={props.endingSession}
        title="Discard this session and start a fresh one (no grading; the file stays on disk)"
        className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-400 hover:bg-neutral-800 disabled:opacity-40"
      >
        Reset
      </button>
    </div>
  );
});
