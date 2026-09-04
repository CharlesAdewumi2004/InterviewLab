import { memo } from 'react';
import type { Route } from '../hooks/useHashRoute';
import { Clock, VoicePicker } from './ui';
import { speechInputSupported } from '../lib/voice';

interface Props {
  route: Route;
  connected: boolean;
  startedAt: number;
  paused: boolean;
  pausedMs: number;
  pausedAt: number | null;
  endingSession: boolean;
  voiceMode: boolean;
  narrationOn: boolean;
  narrationActive: boolean;
  onNavigate: (r: Route) => void;
  onPause: () => void;
  onVoiceMode: (on: boolean) => void;
  onNarration: (on: boolean) => void;
  onEndSession: () => void;
  onResetSession: () => void;
}

const NAV: { route: Route; label: string }[] = [
  { route: 'home', label: 'Dashboard' },
  { route: 'practice', label: 'Practice' },
  { route: 'design', label: 'Sys Design' },
  { route: 'oop', label: 'OOP Design' },
  { route: 'tech', label: 'Tech Knowledge' },
  { route: 'behavioral', label: 'Behavioral' },
  { route: 'progress', label: 'Progress' },
];

export default memo(function NavBar(props: Props) {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
      <button
        onClick={() => props.onNavigate('home')}
        className="text-sm font-semibold tracking-tight text-neutral-100"
        title="Dashboard"
      >
        Practice<span className="text-blue-500">IDE</span>
      </button>

      <nav className="ml-2 flex items-center gap-1">
        {NAV.map((n) => (
          <button
            key={n.route}
            onClick={() => props.onNavigate(n.route)}
            className={
              props.route === n.route
                ? 'rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-100'
                : 'rounded-md px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300'
            }
          >
            {n.label}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <Clock startedAt={props.startedAt} pausedMs={props.pausedMs} pausedAt={props.pausedAt} />
      <span
        className={`h-2 w-2 rounded-full ${props.connected ? 'bg-green-500' : 'bg-red-500'}`}
        title={props.connected ? 'connected' : 'disconnected'}
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
            ? 'rounded-md border border-amber-600 bg-amber-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600'
            : 'rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800'
        }
      >
        {props.paused ? '▶ Resume' : '⏸ Pause'}
      </button>

      {speechInputSupported && (
        <button
          onClick={() => props.onNarration(!props.narrationOn)}
          title={
            props.narrationOn
              ? props.narrationActive
                ? 'Narration mic is live — think-aloud is transcribed for the interviewer and grading. Never sends a chat message.'
                : 'Narration on, momentarily paused (interviewer speaking or push-to-talk held).'
              : 'Ambient narration: keep the mic open so your think-aloud counts as communication evidence (Axis D).'
          }
          className={
            props.narrationOn
              ? props.narrationActive
                ? 'rounded-md border border-red-600 bg-red-800 px-2.5 py-1 text-xs font-medium text-white'
                : 'rounded-md border border-red-900 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-red-300'
              : 'rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800'
          }
        >
          {props.narrationOn ? (props.narrationActive ? '● Narrating' : '◌ Narration') : 'Narrate'}
        </button>
      )}

      <button
        onClick={() => props.onVoiceMode(!props.voiceMode)}
        title="Voice mode: replies are read aloud. Tap Ctrl+Space / F8 to toggle the mic (tap again to send), or hold it push-to-talk style"
        className={
          props.voiceMode
            ? 'rounded-md border border-blue-600 bg-blue-700 px-2.5 py-1 text-xs font-medium text-white'
            : 'rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800'
        }
      >
        {props.voiceMode ? 'Voice on' : 'Voice'}
      </button>
      {props.voiceMode && <VoicePicker />}

      <button
        onClick={props.onEndSession}
        disabled={props.endingSession}
        title="End the session and get the graded scorecard"
        className="rounded-md bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-100 hover:bg-neutral-600 disabled:opacity-40"
      >
        {props.endingSession ? 'Debriefing…' : 'End session'}
      </button>
      <button
        onClick={props.onResetSession}
        disabled={props.endingSession}
        title="Discard this session and start a fresh one (no grading; the file stays on disk)"
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-40"
      >
        Reset
      </button>
    </div>
  );
});
