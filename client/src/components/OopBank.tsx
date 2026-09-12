import { memo, useState } from 'react';
import type { OopMeta } from '../../../shared/protocol';
import { useApi } from '../hooks/useApi';

interface Props {
  oopQuestion: OopMeta | null;
  onOopPick: (id?: string) => void;
  /** Bumps when the server re-announces a session — refetch the bank then. */
  sessionEpoch: number;
}

const DIFF_COLORS: Record<OopMeta['difficulty'], string> = {
  easy: 'bg-green-900/60 text-green-300',
  medium: 'bg-yellow-900/60 text-yellow-300',
  hard: 'bg-red-900/60 text-red-300',
};

// OOP design bank: mirror of the sysdesign bank pane — pick a question (or
// randomize) and the interviewer states it in chat; the brief stays private.
export default memo(function OopBank({ oopQuestion, onOopPick, sessionEpoch }: Props) {
  const { data, error: bankError, retry } = useApi<{ questions: OopMeta[] }>('/api/oop-questions', sessionEpoch);
  const bank = data?.questions ?? null;
  const [changing, setChanging] = useState(false);

  if (oopQuestion && !changing) {
    return (
      <div className="h-full space-y-3 overflow-y-auto p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-100">{oopQuestion.title}</h2>
          <button
            onClick={() => setChanging(true)}
            className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-700"
          >
           Change
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded px-2 py-0.5 font-medium ${DIFF_COLORS[oopQuestion.difficulty]}`}>
            {oopQuestion.difficulty}
          </span>
          {oopQuestion.patterns.map((p) => (
            <span key={p} className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">
              {p}
            </span>
          ))}
        </div>
        <p className="text-xs text-neutral-500">{oopQuestion.asks}</p>
        <p className="rounded bg-neutral-900 p-2 text-xs leading-relaxed text-neutral-500">
          The interviewer stated the prompt in chat. The spec is incomplete on purpose, ask. Questions about what
          the software must do get answered straight; what the classes and methods are is yours to decide.
        </p>
        <div className="rounded bg-neutral-900 p-2 text-xs leading-relaxed text-neutral-600">
         Talk first (you drive it): scope, then core classes with one-line responsibilities, then key interfaces, then where
          behaviour varies (patterns earn their keep here). Then implement the skeleton in the editor, classes,
          signatures, ownership; bodies only where trivial.  Run compiles it.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">OOP design bank</h2>
        <button
          onClick={() => {
            setChanging(false);
            onOopPick();
          }}
          className="rounded bg-blue-700 px-2.5 py-1 text-xs font-medium hover:bg-blue-600"
        >
          Random
        </button>
      </div>
      {bankError && (
        <div className="flex items-center justify-between gap-2 rounded bg-red-900/40 px-2 py-1 text-xs text-red-300">
          <span>{bankError}</span>
          <button onClick={retry} className="shrink-0 rounded bg-red-800/60 px-2 py-0.5 hover:bg-red-700/60">
           Retry
          </button>
        </div>
      )}
      {!bank && !bankError && <p className="text-xs text-neutral-500">Loading bank…</p>}
      {bank && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {(['easy', 'medium', 'hard'] as const).map((tier) => (
            <div key={tier}>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{tier}</h3>
              <div className="space-y-1">
                {bank
                  .filter((q) => q.difficulty === tier)
                  .map((q) => (
                    <button
                      key={q.id}
                      onClick={() => {
                        setChanging(false);
                        onOopPick(q.id);
                      }}
                      className="block w-full rounded bg-neutral-900 px-2 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-800"
                    >
                      {q.title}
                      <span className="mt-0.5 block truncate text-[10px] text-neutral-600">
                        {q.patterns.join(' · ')}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
