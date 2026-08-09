import { memo, useState } from 'react';
import type { ClientProblem } from '../../../shared/protocol';

interface Props {
  problem: ClientProblem | null;
  loading: boolean;
  error: string | null;
  onIntake: (raw: string, delivery: 'text' | 'oral') => void;
}

// Memoized: props only change on intake events, not per streamed chat token.
export default memo(function ProblemPane({ problem, loading, error, onIntake }: Props) {
  const [raw, setRaw] = useState('');
  const [delivery, setDelivery] = useState<'text' | 'oral'>('text');
  const [showIntake, setShowIntake] = useState(false);

  // When a (re-)intake succeeds, snap back to the problem view — staying on
  // the form made a successful "Format problem" look like a silent failure.
  const [lastProblem, setLastProblem] = useState(problem);
  if (problem !== lastProblem) {
    setLastProblem(problem);
    setShowIntake(false);
    setRaw('');
  }

  if (!problem || showIntake) {
    return (
      <div className="flex h-full flex-col gap-2 p-3">
        <h2 className="text-sm font-semibold text-neutral-300">New problem</h2>
        <p className="text-xs text-neutral-500">
          Paste a rough problem — a LeetCode description, a note from a friend, anything. It gets re-dressed as a
          realistic interview scenario (same underlying algorithm, disguised identity) with a starting stub and
          hidden test cases.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Design a data structure for an LRU cache…"
          className="min-h-0 flex-1 resize-none rounded border border-neutral-700 bg-neutral-900 p-2 text-sm outline-none focus:border-blue-600"
        />
        {error && <div className="rounded bg-red-900/40 px-2 py-1 text-xs text-red-300">{error}</div>}
        <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
          <button
            onClick={() => setDelivery('text')}
            title="The problem statement appears here as text"
            className={
              delivery === 'text'
                ? 'flex-1 bg-blue-700 px-2 py-1 font-medium text-white'
                : 'flex-1 bg-neutral-900 px-2 py-1 text-neutral-400 hover:bg-neutral-800'
            }
          >
            Written
          </button>
          <button
            onClick={() => setDelivery('oral')}
            title="Phone-screen style: the interviewer states the problem in chat/voice — nothing appears here. Listen, take notes, ask for repeats."
            className={
              delivery === 'oral'
                ? 'flex-1 bg-blue-700 px-2 py-1 font-medium text-white'
                : 'flex-1 bg-neutral-900 px-2 py-1 text-neutral-400 hover:bg-neutral-800'
            }
          >
            Oral only
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => raw.trim() && onIntake(raw.trim(), delivery)}
            disabled={loading || !raw.trim()}
            className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium hover:bg-blue-600 disabled:opacity-40"
          >
            {loading ? 'Formatting…' : 'Format problem'}
          </button>
          {problem && (
            <button
              onClick={() => setShowIntake(false)}
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
            >
              Back
            </button>
          )}
        </div>
        {loading && (
          <p className="text-xs text-neutral-500">Generating statement, stub, tests and harness… (~20s)</p>
        )}
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-neutral-100">{problem.title}</h2>
        <button
          onClick={() => setShowIntake(true)}
          className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-700"
        >
          New problem
        </button>
      </div>
      {problem.oral ? (
        <p className="rounded bg-neutral-900 p-2 text-xs leading-relaxed text-neutral-500">
          🎧 The interviewer stated this problem in the chat — there's no written version. Ask them to repeat
          anything you missed (that's normal phone-screen behaviour), and keep your own notes.
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{problem.statement}</p>
          <p className="rounded bg-neutral-900 p-2 text-xs leading-relaxed text-neutral-500">
            That's all you get — like a real interview. Constraints, sizes, edge cases and examples exist, but the
            interviewer only reveals what you ask for.
          </p>
        </>
      )}
    </div>
  );
});
