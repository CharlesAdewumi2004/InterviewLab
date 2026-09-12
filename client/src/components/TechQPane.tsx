import { memo, useEffect, useState } from 'react';
import type { ClientProblem, TechTopic } from '../../../shared/protocol';

interface Props {
  techTopics: TechTopic[] | null; // non-null once a round has started
  problem: ClientProblem | null; // active debug exercise shows as a problem
  onTechStart: (topics: TechTopic[]) => void;
  onDebugPick: (id?: string) => void;
}

const TOPIC_LABELS: Record<TechTopic, string> = {
  os: 'OS',
  networking: 'Networking',
  cpp: 'C++ internals',
  memory: 'Memory',
  lowlevel: 'Low-level & arch',
  concurrency: 'Concurrency',
  dsinternals: 'DS/STL internals',
  data: 'Databases & caching',
};
const ALL_TOPICS = Object.keys(TOPIC_LABELS) as TechTopic[];
// Default chips: the topics the research flagged as highest yield.
const DEFAULT_TOPICS: TechTopic[] = ['cpp', 'concurrency', 'memory', 'dsinternals'];

interface DebugExerciseMeta {
  id: string;
  title: string;
  topic: TechTopic;
  language: 'cpp' | 'python';
}

export default memo(function TechQPane({ techTopics, problem, onTechStart, onDebugPick }: Props) {
  const [selected, setSelected] = useState<TechTopic[]>(DEFAULT_TOPICS);
  const [exercises, setExercises] = useState<DebugExerciseMeta[] | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    fetch('/api/debug-exercises')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { exercises: DebugExerciseMeta[] }) => setExercises(data.exercises))
      .catch(() => setExercises(null));
  }, []);

  // Active debug exercise: show its handover card instead of the pickers.
  if (problem?.debug && !changing) {
    return (
      <div className="h-full space-y-3 overflow-y-auto p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-100">{problem.title}</h2>
          <button
            onClick={() => setChanging(true)}
            className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-700"
          >
           Change
          </button>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{problem.statement}</p>
        <p className="rounded bg-neutral-900 p-2 text-xs leading-relaxed text-neutral-500">
          The code in your editor has real problems, read it and tell the interviewer what you see before you
          touch anything. Then fix and optimize. Run checks correctness AND a large timed case, so a slow fix
          still fails. The interviewer will never tell you how many issues there are.
        </p>
      </div>
    );
  }

  const toggle = (t: TechTopic) =>
    setSelected((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-300">Knowledge drill</h2>
        <p className="mt-1 text-xs text-neutral-500">
         Pick topics; the interviewer runs a question set with follow-up drills. Answers are graded against a
          private key at the debrief.
        </p>
        {techTopics && !changing && (
          <p className="mt-1 rounded bg-neutral-900 px-2 py-1 text-[11px] text-neutral-500">
           Round in progress: {techTopics.map((t) => TOPIC_LABELS[t]).join(' · ')}, starting again resamples the
            questions.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ALL_TOPICS.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={
                selected.includes(t)
                  ? 'rounded-full bg-blue-700 px-2.5 py-1 text-xs font-medium text-white'
                  : 'rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-700'
              }
            >
              {TOPIC_LABELS[t]}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            if (selected.length) {
              setChanging(false);
              onTechStart(selected);
            }
          }}
          disabled={!selected.length}
          className="mt-2 rounded bg-blue-700 px-3 py-1.5 text-sm font-medium hover:bg-blue-600 disabled:opacity-40"
        >
          Start round
        </button>
      </div>

      <div className="border-t border-neutral-800 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Debug &amp; optimize</h2>
          <button
            onClick={() => {
              setChanging(false);
              onDebugPick();
            }}
            className="rounded bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          >
            Random
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
         Flawed code lands in your editor, find the issues by reading, then fix and optimize until the timed
          tests pass.
        </p>
        {!exercises && <p className="mt-2 text-xs text-neutral-600">Loading exercises…</p>}
        {exercises && (
          <div className="mt-2 space-y-1">
            {exercises.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setChanging(false);
                  onDebugPick(e.id);
                }}
                className="block w-full rounded bg-neutral-900 px-2 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-800"
              >
                {e.title}
                <span className="mt-0.5 block text-[10px] text-neutral-600">
                  {TOPIC_LABELS[e.topic]} · {e.language === 'cpp' ? 'C++' : 'Python'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
