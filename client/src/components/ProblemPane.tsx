import { memo, useEffect, useState } from 'react';
import type { ClientProblem, DesignMeta, OopMeta, Persona, TechTopic } from '../../../shared/protocol';
import TechQPane from './TechQPane';
import OopBank from './OopBank';
import { useApi } from '../hooks/useApi';

interface Props {
  problem: ClientProblem | null;
  loading: boolean;
  error: string | null;
  persona: Persona;
  designQuestion: DesignMeta | null;
  techTopics: TechTopic[] | null;
  oopQuestion: OopMeta | null;
  onIntake: (raw: string, delivery: 'text' | 'oral', framing: 'scenario' | 'plain') => void;
  onDesignPick: (id?: string) => void;
  onTechStart: (topics: TechTopic[]) => void;
  onDebugPick: (id?: string) => void;
  onOopPick: (id?: string) => void;
  /** Bumps when the server re-announces a session — refetch the banks then. */
  sessionEpoch: number;
}

const DIFF_COLORS: Record<DesignMeta['difficulty'], string> = {
  easy: 'bg-green-900/60 text-green-300',
  medium: 'bg-yellow-900/60 text-yellow-300',
  hard: 'bg-red-900/60 text-red-300',
};

// Sysdesign persona: the pane is a HelloInterview-style question bank —
// pick a question (or randomize) and the interviewer states it in chat.
function DesignBank({
  designQuestion,
  onDesignPick,
  sessionEpoch,
}: {
  designQuestion: DesignMeta | null;
  onDesignPick: (id?: string) => void;
  sessionEpoch: number;
}) {
  const { data, error: bankError, retry } = useApi<{ questions: DesignMeta[] }>(
    '/api/design-questions',
    sessionEpoch,
  );
  const bank = data?.questions ?? null;
  const [changing, setChanging] = useState(false);

  if (designQuestion && !changing) {
    return (
      <div className="h-full space-y-3 overflow-y-auto p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-100">{designQuestion.title}</h2>
          <button
            onClick={() => setChanging(true)}
            className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-700"
          >
           Change
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded px-2 py-0.5 font-medium ${DIFF_COLORS[designQuestion.difficulty]}`}>
            {designQuestion.difficulty}
          </span>
          {designQuestion.patterns.map((p) => (
            <span key={p} className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">
              {p}
            </span>
          ))}
        </div>
        <p className="text-xs text-neutral-500">Asked at: {designQuestion.asks.join(', ')}</p>
        <p className="rounded bg-neutral-900 p-2 text-xs leading-relaxed text-neutral-500">
          The interviewer stated the prompt in chat, deliberately vague; requirements, numbers and scope are
          yours to extract. Use the editor as your whiteboard (APIs, data model, capacity math, ASCII diagrams).
        </p>
        <div className="rounded bg-neutral-900 p-2 text-xs leading-relaxed text-neutral-600">
         Delivery framework (you drive it): requirements ~5m · entities ~2m · API ~5m · high-level design ~10-15m ·
          deep dives ~10m. A complete simple design beats a fancy incomplete one.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">Design question bank</h2>
        <button
          onClick={() => {
            setChanging(false);
            onDesignPick();
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
                        onDesignPick(q.id);
                      }}
                      className="block w-full rounded bg-neutral-900 px-2 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-800"
                    >
                      {q.title}
                      <span className="mt-0.5 block truncate text-[10px] text-neutral-600">{q.patterns.join(' · ')}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Memoized: props only change on intake events, not per streamed chat token.
interface CodingSuggestion {
  id: string;
  title: string;
  lc: number | null;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  pools: ('core' | 'extended')[];
  seed: string;
}

export default memo(function ProblemPane({
  problem,
  loading,
  error,
  persona,
  designQuestion,
  techTopics,
  oopQuestion,
  onIntake,
  onDesignPick,
  onTechStart,
  onDebugPick,
  onOopPick,
  sessionEpoch,
}: Props) {
  const [raw, setRaw] = useState('');
  const [delivery, setDelivery] = useState<'text' | 'oral'>('text');
  const [framing, setFraming] = useState<'scenario' | 'plain'>('scenario');
  const [showIntake, setShowIntake] = useState(false);
  // Frequency-grounded suggestions (core screen pool / extended set) — the
  // pick fills the intake box; Format then disguises it as a scenario.
  const [suggestions, setSuggestions] = useState<CodingSuggestion[] | null>(null);
  const [picked, setPicked] = useState<CodingSuggestion | null>(null);

  useEffect(() => {
    fetch('/api/coding-questions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { questions: CodingSuggestion[] }) => setSuggestions(data.questions))
      .catch(() => setSuggestions(null));
  }, []);

  const suggest = (pool: 'core' | 'extended') => {
    if (!suggestions) return;
    const inPool = suggestions.filter((q) => q.pools.includes(pool));
    const q = inPool[Math.floor(Math.random() * inPool.length)];
    if (!q) return;
    setPicked(q);
    setRaw(`${q.title}: ${q.seed}`);
  };

  // When a (re-)intake succeeds, snap back to the problem view — staying on
  // the form made a successful "Format problem" look like a silent failure.
  const [lastProblem, setLastProblem] = useState(problem);
  if (problem !== lastProblem) {
    setLastProblem(problem);
    setShowIntake(false);
    setRaw('');
  }

  if (persona === 'sysdesign') {
    return <DesignBank designQuestion={designQuestion} onDesignPick={onDesignPick} sessionEpoch={sessionEpoch} />;
  }
  if (persona === 'oopdesign') {
    return <OopBank oopQuestion={oopQuestion} onOopPick={onOopPick} sessionEpoch={sessionEpoch} />;
  }
  if (persona === 'techq') {
    return <TechQPane techTopics={techTopics} problem={problem} onTechStart={onTechStart} onDebugPick={onDebugPick} />;
  }

  if (!problem || showIntake) {
    return (
      <div className="flex h-full flex-col gap-2 p-3">
        <h2 className="text-sm font-semibold text-neutral-300">New problem</h2>
        <p className="text-xs text-neutral-500">
         Paste a rough problem, a LeetCode description, a note from a friend, anything. It gets re-dressed as a
          realistic interview scenario (same underlying algorithm, disguised identity) with a starting stub and
          hidden test cases.
        </p>
        {suggestions && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => suggest('core')}
              title="Random pick from the questions that come up most in real screens (2026 frequency data + candidate reports)"
              className="rounded bg-neutral-800 px-2 py-1 text-xs text-orange-300 hover:bg-neutral-700"
            >
              Most-asked
            </button>
            <button
              onClick={() => suggest('extended')}
              title="Random pick from the wider commonly drilled set"
              className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            >
              Wider bank
            </button>
            {picked && (
              <span className="truncate text-[10px] text-neutral-500">
                {picked.topic} · {picked.difficulty}
              </span>
            )}
          </div>
        )}
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setPicked(null);
          }}
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
            title="Phone-screen style: the interviewer states the problem in chat/voice, nothing appears here. Listen, take notes, ask for repeats."
            className={
              delivery === 'oral'
                ? 'flex-1 bg-blue-700 px-2 py-1 font-medium text-white'
                : 'flex-1 bg-neutral-900 px-2 py-1 text-neutral-400 hover:bg-neutral-800'
            }
          >
           Oral only
          </button>
        </div>
        <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
          <button
            onClick={() => setFraming('scenario')}
            title="Bare algorithms get dressed as a realistic work scenario (disguised identity); problems that already have real-world context keep their own setting"
            className={
              framing === 'scenario'
                ? 'flex-1 bg-blue-700 px-2 py-1 font-medium text-white'
                : 'flex-1 bg-neutral-900 px-2 py-1 text-neutral-400 hover:bg-neutral-800'
            }
          >
           Scenario
          </button>
          <button
            onClick={() => setFraming('plain')}
            title="No invented context at all, the problem delivered straight, just phrased the way an interviewer would say it. Constraints still stay hidden until you ask."
            className={
              framing === 'plain'
                ? 'flex-1 bg-blue-700 px-2 py-1 font-medium text-white'
                : 'flex-1 bg-neutral-900 px-2 py-1 text-neutral-400 hover:bg-neutral-800'
            }
          >
           Plain
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => raw.trim() && onIntake(raw.trim(), delivery, framing)}
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
          The interviewer stated this problem in the chat, there's no written version. Ask them to repeat
          anything you missed (that's normal phone-screen behaviour), and keep your own notes.
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{problem.statement}</p>
          <p className="rounded bg-neutral-900 p-2 text-xs leading-relaxed text-neutral-500">
           That's all you get, like a real interview. Constraints, sizes, edge cases and examples exist, but the
            interviewer only reveals what you ask for.
          </p>
        </>
      )}
    </div>
  );
});
