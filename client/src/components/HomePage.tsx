import { useEffect, useMemo, useState } from 'react';
import type { GradeRecord } from '../../../shared/protocol';
import type { Route } from '../hooks/useHashRoute';

interface Props {
  onNavigate: (r: Route) => void;
}

const MODE_LABELS: Record<string, string> = {
  coding: 'Coding',
  full_interview: 'Full interview',
  system_design: 'System design',
  behavioral: 'Behavioral',
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold text-neutral-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function ActionCard({
  title,
  desc,
  accentClass,
  onClick,
}: {
  title: string;
  desc: string;
  accentClass: string; // literal Tailwind classes — interpolation is invisible to the scanner
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-800/70"
    >
      <div className="text-base font-semibold text-neutral-100">{title}</div>
      <div className="mt-1 text-sm leading-relaxed text-neutral-500">{desc}</div>
      <div className={`mt-3 text-xs font-medium ${accentClass}`}>Start →</div>
    </button>
  );
}

// Landing page: quick read on where you stand, and one click into a round.
export default function HomePage({ onNavigate }: Props) {
  const [grades, setGrades] = useState<GradeRecord[] | null>(null);

  useEffect(() => {
    fetch('/api/progress')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { grades: GradeRecord[] }) => setGrades(data.grades))
      .catch(() => setGrades([]));
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
          Interview practice<span className="text-blue-500">.</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Realism-first mock interviews on your own Claude subscription — graded against a behaviorally anchored
          rubric, tracked over time.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Sessions graded" value={grades === null ? '…' : String(grades.length)} />
          <StatCard
            label="Latest"
            value={derived ? derived.latest.weighted.toFixed(2) : '—'}
            sub={derived ? derived.latest.recommendation : 'no graded sessions yet'}
          />
          <StatCard label="This week" value={derived ? String(derived.week) : grades === null ? '…' : '0'} sub="graded sessions" />
          <StatCard
            label="Readiness"
            value={derived ? `${Math.min(derived.streak, 3)}/3` : '0/3'}
            sub="full sims at Hire+, narrated"
          />
        </div>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-neutral-500">Start a round</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard
            title="Coding practice"
            desc="LeetCode-style problems re-dressed as real interview scenarios. C++ or Python, hidden constraints, compile-and-run against generated tests."
            accentClass="text-blue-400"
            onClick={() => onNavigate('practice')}
          />
          <ActionCard
            title="System design"
            desc="A 16-question bank (Bitly → Uber) with a whiteboard editor. Graded stage-by-stage against the delivery framework with a level signal."
            accentClass="text-purple-400"
            onClick={() => onNavigate('design')}
          />
          <ActionCard
            title="Behavioral"
            desc="Hiring-manager style STAR probing of your actual projects — ownership pinned, outcomes verified, reflection expected."
            accentClass="text-green-400"
            onClick={() => onNavigate('behavioral')}
          />
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
                      <tr key={g.sessionId} className="border-b border-neutral-800/70 bg-neutral-900 text-neutral-300 last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                          {new Date(g.gradedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2">{g.problemTitle ?? '—'}</td>
                        <td className="px-3 py-2 text-neutral-500">{MODE_LABELS[g.mode] ?? g.mode}</td>
                        <td className="px-3 py-2 text-right font-medium text-neutral-100">{g.weighted.toFixed(2)}</td>
                        <td className="px-3 py-2">{g.recommendation}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => onNavigate('progress')} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
              Full progress, trendlines and daily recap →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
