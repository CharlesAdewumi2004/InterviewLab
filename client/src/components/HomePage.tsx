import { useEffect, useMemo, useState } from 'react';
import type { GradeRecord } from '../../../shared/protocol';
import type { Route } from '../hooks/useHashRoute';
import { cachedSetup, type SetupStatus } from '../lib/setup';

interface Props {
  onNavigate: (r: Route) => void;
}

const MODE_LABELS: Record<string, string> = {
  coding: 'Coding',
  full_interview: 'Full interview',
  system_design: 'System design',
  behavioral: 'Behavioral',
  tech_knowledge: 'Fundamentals',
  oop_design: 'OOP design',
};

const ROUNDS: { route: Route; title: string; desc: string; accent: string }[] = [
  {
    route: 'practice',
    title: 'Coding',
    desc: 'Problems re-dressed as real interview scenarios, with the constraints hidden until you ask. Write, compile and run against generated tests.',
    accent: 'text-blue-400',
  },
  {
    route: 'design',
    title: 'System design',
    desc: 'A 16-question bank from Bitly to Uber. The editor is your whiteboard; you are graded stage by stage with a level signal.',
    accent: 'text-purple-400',
  },
  {
    route: 'oop',
    title: 'OOP design',
    desc: 'Low-level design, talk-then-code: scope it, name the classes, defend the interfaces, then build the skeleton.',
    accent: 'text-amber-400',
  },
  {
    route: 'tech',
    title: 'Fundamentals',
    desc: 'Verbal CS fundamentals with drill-down follow-ups, plus debug-and-optimise exercises on deliberately broken code.',
    accent: 'text-cyan-400',
  },
  {
    route: 'behavioral',
    title: 'Behavioral',
    desc: 'Hiring-manager STAR probing of your actual projects, ownership pinned, outcomes verified, reflection expected.',
    accent: 'text-green-400',
  },
];

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold text-neutral-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

// Landing page: whether the machine is ready, where you stand, and one click
// into a round.
export default function HomePage({ onNavigate }: Props) {
  const [grades, setGrades] = useState<GradeRecord[] | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);

  useEffect(() => {
    fetch('/api/progress')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { grades: GradeRecord[] }) => setGrades(data.grades))
      .catch(() => setGrades([]));
    cachedSetup().then(setSetup, () => setSetup(null));
  }, []);

  const derived = useMemo(() => {
    if (!grades || grades.length === 0) return null;
    const latest = grades[grades.length - 1];
    const week = grades.filter((g) => g.gradedAt >= Date.now() - 7 * 24 * 60 * 60_000);
    // §7 readiness streak (same rules as the Progress page).
    let streak = 0;
    for (let i = grades.length - 1; i >= 0; i--) {
      const g = grades[i];
      if (g.mode !== 'full_interview') break;
      const d = g.axes.find((a) => a.axis === 'D')?.score ?? 0;
      const hireUp = g.recommendation === 'hire' || g.recommendation === 'strong hire';
      const hintsOk = g.hintAvgLevel === null || g.hintAvgLevel <= 2;
      const narrated = (g.narrationCoveragePct ?? 0) >= 50;
      if (hireUp && g.redFlagCount === 0 && d >= 3 && hintsOk && narrated) streak++;
      else break;
    }
    return { latest, week: week.length, streak };
  }, [grades]);

  const needsSetup = setup !== null && !setup.model.linked;
  const fresh = grades !== null && grades.length === 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
         Practice interviews that behave like the real thing
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
         Five kinds of round, an interviewer who watches your editor and refuses to rescue you, and an
          evidence-first scorecard at the end. Runs locally on your own Claude subscription.
        </p>

        {needsSetup && (
          <button
            onClick={() => onNavigate('setup')}
            className="mt-5 flex w-full items-center justify-between gap-3 rounded-lg border border-amber-800/70 bg-amber-950/40 px-4 py-3 text-left hover:bg-amber-950/60"
          >
            <span>
              <span className="text-sm font-medium text-amber-200">Finish setup, no Claude account linked yet</span>
              <span className="mt-0.5 block text-xs text-amber-200/70">
               One command links your existing Claude subscription. Nothing else is billed or required.
              </span>
            </span>
            <span className="shrink-0 text-xs text-amber-300">Set up</span>
          </button>
        )}

        {!fresh && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Sessions graded" value={grades === null ? '…' : String(grades.length)} />
            <StatCard
              label="Latest"
              value={derived ? derived.latest.weighted.toFixed(2) : 'n/a'}
              sub={derived ? derived.latest.recommendation : 'no graded sessions yet'}
            />
            <StatCard
              label="This week"
              value={derived ? String(derived.week) : grades === null ? '…' : '0'}
              sub="graded sessions"
            />
            <StatCard
              label="Readiness"
              value={derived ? `${Math.min(derived.streak, 3)}/3` : '0/3'}
              sub="full sims at Hire+, narrated"
            />
          </div>
        )}

        {fresh && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ['1 · Pick a round', 'Coding, system design, OOP, fundamentals or behavioral. Every round is a real interview, not a quiz.'],
              ['2 · Do the work', 'Think out loud, ask for the constraints, write and run code. The interviewer only answers what you actually ask.'],
              ['3 · Get graded', 'An evidence-first scorecard: axis scores with quotes, the hints you needed, and the one fix worth most next time.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <div className="text-xs font-semibold text-neutral-200">{title}</div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">{body}</p>
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-neutral-500">Start a round</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROUNDS.map((r) => (
            <button
              key={r.route}
              onClick={() => onNavigate(r.route)}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-800/70"
            >
              <div className="text-base font-semibold text-neutral-100">{r.title}</div>
              <div className="mt-1 text-sm leading-relaxed text-neutral-500">{r.desc}</div>
              <div className={`mt-3 text-xs font-medium ${r.accent}`}>Start</div>
            </button>
          ))}
        </div>

        {grades !== null && grades.length > 0 && (
          <>
            <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent sessions</h2>
            <div className="mt-2 overflow-hidden rounded-lg border border-neutral-800">
              <table className="w-full text-left text-xs">
                <tbody className="tabular-nums">
                  {[...grades]
                    .reverse()
                    .slice(0, 5)
                    .map((g) => (
                      <tr
                        key={g.sessionId}
                        className="border-b border-neutral-800/70 bg-neutral-900 text-neutral-300 last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                          {new Date(g.gradedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2">{g.problemTitle ?? 'n/a'}</td>
                        <td className="px-3 py-2 text-neutral-500">{MODE_LABELS[g.mode] ?? g.mode}</td>
                        <td className="px-3 py-2 text-right font-medium text-neutral-100">{g.weighted.toFixed(2)}</td>
                        <td className="px-3 py-2">{g.recommendation}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => onNavigate('progress')} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
             Full progress, trendlines and daily recap
            </button>
          </>
        )}
      </div>
    </div>
  );
}
