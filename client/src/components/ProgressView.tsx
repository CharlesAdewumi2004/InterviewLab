import { useEffect, useMemo, useState } from 'react';
import type { DailyRecap, GradeRecord } from '../../../shared/protocol';
import { useApi } from '../hooks/useApi';

// Dark-surface viz tokens (series color validated ≥3:1 on #171717).
const ACCENT = '#3987e5';
const GRID = '#2c2c2a';
const BASELINE = '#383835';
const MUTED = '#898781';
const SURFACE = '#171717';
const DELTA_UP = '#0ca30c';
const DELTA_DOWN = '#d03b3b';

const MODE_LABELS = {
  coding: 'Practice',
  full_interview: 'Full interview',
  system_design: 'System design',
  behavioral: 'Behavioral',
  tech_knowledge: 'Tech knowledge',
  oop_design: 'OOP design',
} as const;

interface Props {
  // Modal mode when onClose is provided; full-page mode when asPage is set.
  onClose?: () => void;
  asPage?: boolean;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Delta({ value, upIsGood = true }: { value: number; upIsGood?: boolean }) {
  if (value === 0) return <span className="text-neutral-500">±0</span>;
  const up = value > 0;
  const good = up === upIsGood;
  // Sign glyph + color — direction never rides on color alone.
  return (
    <span style={{ color: good ? DELTA_UP : DELTA_DOWN }}>
      {up ? '' : ''} {up ? '+' : ''}
      {Math.round(value * 100) / 100}
    </span>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded bg-neutral-800 p-3">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="truncate text-lg font-semibold text-neutral-100">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-neutral-400">{sub}</div>}
    </div>
  );
}

// Weighted score (1-4) per graded session, with hover tooltip.
function TrendLine({ grades }: { grades: GradeRecord[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 150;
  const pad = { l: 26, r: 16, t: 12, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = grades.length;
  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (w: number) => pad.t + (1 - (w - 1) / 3) * ih; // domain 1..4

  const linePath = grades.map((g, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(g.weighted)}`).join(' ');
  const areaPath = `${linePath} L${x(n - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`;
  const g = hover !== null ? grades[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label="Weighted score per graded session"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const fx = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          for (let i = 1; i < n; i++) if (Math.abs(x(i) - fx) < Math.abs(x(best) - fx)) best = i;
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4].map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 1 ? BASELINE : v === 3 ? MUTED : GRID} // 3 = the hiring bar, slightly louder
              strokeWidth={1}
              strokeOpacity={v === 3 ? 0.5 : 1}
              vectorEffect="non-scaling-stroke"
            />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={MUTED}>
              {v}
            </text>
          </g>
        ))}
        {n > 1 && <path d={areaPath} fill={ACCENT} fillOpacity={0.1} />}
        {n > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad.t}
            y2={pad.t + ih}
            stroke={MUTED}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {[...(hover !== null && hover !== n - 1 ? [hover] : []), n - 1].map((i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(grades[i].weighted)} r={6} fill={SURFACE} />
            <circle cx={x(i)} cy={y(grades[i].weighted)} r={4} fill={ACCENT} />
          </g>
        ))}
        <text x={pad.l} y={H - 6} fontSize={9} fill={MUTED}>
          {fmtDate(grades[0].gradedAt)}
        </text>
        {n > 1 && (
          <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize={9} fill={MUTED}>
            {fmtDate(grades[n - 1].gradedAt)}
          </text>
        )}
      </svg>
      {g && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-200 shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}
        >
          <div className="font-semibold">
            {g.weighted.toFixed(2)} · {g.recommendation}
          </div>
          <div className="text-neutral-400">
            {fmtDate(g.gradedAt)} · {g.problemTitle ?? 'no problem'} · {MODE_LABELS[g.mode]}
          </div>
        </div>
      )}
    </div>
  );
}

// Small-multiple sparkline: one axis, one series (1-4) — no legend needed.
function AxisSparkline({ points }: { points: number[] }) {
  const W = 160;
  const H = 32;
  const n = points.length;
  const x = (i: number) => 4 + (n === 1 ? (W - 8) / 2 : (i * (W - 8)) / (n - 1));
  const y = (v: number) => 4 + (1 - (v - 1) / 3) * (H - 8);
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={W} height={H} role="img" aria-label="score trend">
      <line x1={4} x2={W - 4} y1={H - 4} y2={H - 4} stroke={GRID} strokeWidth={1} />
      {n > 1 && (
        <path d={path} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      <circle cx={x(n - 1)} cy={y(points[n - 1])} r={5} fill={SURFACE} />
      <circle cx={x(n - 1)} cy={y(points[n - 1])} r={3.5} fill={ACCENT} />
    </svg>
  );
}

const RANGES = [
  { key: 'all', label: 'All', days: null },
  { key: '90d', label: '90d', days: 90 },
  { key: '30d', label: '30d', days: 30 },
  { key: '7d', label: '7d', days: 7 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

export default function ProgressView({ onClose, asPage }: Props) {
  const [grades, setGrades] = useState<GradeRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('all');
  const [recap, setRecap] = useState<{ date: string; sessions: number; recap: DailyRecap } | null>(null);
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  // Today's recap: synthesized by the heavy model across every session
  // practised today (server caches it until the session set changes).
  const handleRecap = async () => {
    if (recapBusy) return;
    setRecapBusy(true);
    setRecapError(null);
    try {
      const r = await fetch('/api/recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await r.json()) as { error?: string; date: string; sessions: number; recap: DailyRecap };
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
      setRecap(data);
    } catch (err) {
      setRecapError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecapBusy(false);
    }
  };

  const { data: progress, error: fetchError, retry } = useApi<{ grades: GradeRecord[] }>('/api/progress');
  useEffect(() => {
    if (progress) setGrades(progress.grades);
  }, [progress]);
  useEffect(() => {
    setError(fetchError);
  }, [fetchError]);

  // Remove a grade from the gradebook (the session JSON on disk is kept).
  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('Delete this graded session from the gradebook? The session JSON on disk is kept.')) return;
    try {
      const r = await fetch(`/api/progress/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setGrades((g) => (g ? g.filter((x) => x.sessionId !== sessionId) : g));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // The selected time window drives everything below — stats, charts, table.
  const filtered = useMemo(() => {
    if (!grades) return null;
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    if (days === null) return grades;
    const cutoff = Date.now() - days * 24 * 60 * 60_000;
    return grades.filter((g) => g.gradedAt >= cutoff);
  }, [grades, range]);

  // Per-axis series across sessions (only sessions that scored the axis).
  const axisSeries = useMemo(() => {
    if (!filtered) return [];
    const byKey = new Map<string, { label: string; points: number[] }>();
    for (const g of filtered) {
      for (const a of g.axes) {
        const entry = byKey.get(a.axis) ?? { label: `${a.axis}, ${a.name}`, points: [] };
        entry.points.push(a.score);
        byKey.set(a.axis, entry);
      }
    }
    return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({ key, ...v }));
  }, [filtered]);

  const derived = useMemo(() => {
    const grades = filtered;
    if (!grades || grades.length === 0) return null;
    const latest = grades[grades.length - 1];
    const prev = grades.length > 1 ? grades[grades.length - 2] : null;

    // §7 drill trigger: any axis averaging < 3 over its last 3 scored sessions.
    let drill: { axis: string; avg: number } | null = null;
    for (const s of axisSeries) {
      if (s.points.length < 3) continue;
      const last3 = s.points.slice(-3);
      const avg = last3.reduce((a, b) => a + b, 0) / 3;
      if (avg < 3 && (!drill || avg < drill.avg)) drill = { axis: s.key, avg: Math.round(avg * 10) / 10 };
    }

    // §7 readiness bar: three consecutive full-interview sims at Hire+, no red
    // flags, D ≥ 3 in each with the narration channel on (a D scored without
    // captured think-aloud doesn't count — the real interview is spoken), and
    // minimal hint dependency (avg level ≤ 2 approximates "at most one
    // level-1/2 hint per problem" — hint counts aren't stored).
    let streak = 0;
    for (let i = grades.length - 1; i >= 0; i--) {
      const g = grades[i];
      if (g.mode !== 'full_interview') break;
      const d = g.axes.find((a) => a.axis === 'D')?.score ?? 0;
      const hireUp = g.recommendation === 'hire' || g.recommendation === 'strong hire';
      const hintsOk = g.hintAvgLevel === null || g.hintAvgLevel <= 2;
      // Mic on for at least half the session; null = recorded before coverage
      // was tracked, which can't be verified, so it doesn't count.
      const narrated = (g.narrationCoveragePct ?? 0) >= 50;
      if (hireUp && g.redFlagCount === 0 && d >= 3 && hintsOk && narrated) streak++;
      else break;
    }

    // §7 hint dependency curve + clarification hit rate (latest values).
    const hinted = grades.filter((g) => g.hintAvgLevel !== null);
    const hintLatest = hinted.length ? hinted[hinted.length - 1].hintAvgLevel : null;
    const hintPrev = hinted.length > 1 ? hinted[hinted.length - 2].hintAvgLevel : null;
    const clarified = grades.filter((g) => g.clarificationHits !== null);
    const clarLatest = clarified.length ? clarified[clarified.length - 1].clarificationHits : null;

    // Pace over the window: average active session time, and average time to
    // the first all-green run (sessions that got there).
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const avgDuration = avg(grades.map((g) => g.durationMin));
    const greens = grades.map((g) => g.timeToGreenMin).filter((v): v is number => v !== null);
    const avgGreen = avg(greens);

    return { latest, prev, drill, streak, hintLatest, hintPrev, clarLatest, avgDuration, avgGreen, greenCount: greens.length };
  }, [filtered, axisSeries]);

  const shell = asPage
    ? { outer: 'h-full overflow-y-auto', inner: 'mx-auto max-w-4xl px-6 py-8' }
    : {
        outer: 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6',
        inner: 'max-h-full w-full max-w-3xl overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-6',
      };
  return (
    <div className={shell.outer}>
      <div className={shell.inner}>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-neutral-100">Progress</h2>
            <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={
                    r.key === range
                      ? 'bg-blue-700 px-2.5 py-1 font-medium text-white'
                      : 'bg-neutral-900 px-2.5 py-1 text-neutral-400 hover:bg-neutral-800'
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleRecap()}
              disabled={recapBusy}
              title="End-of-day feedback across every session practised today: what went well, what needs work, drills for tomorrow"
              className="rounded border border-blue-800 bg-blue-950/60 px-3 py-1 text-sm text-blue-200 hover:bg-blue-900/60 disabled:opacity-40"
            >
              {recapBusy ? 'Recapping…' : "Today's recap"}
            </button>
            {onClose && (
              <button onClick={onClose} className="rounded bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700">
               Close
              </button>
            )}
          </div>
        </div>

        {recapError && (
          <div className="mb-3 rounded bg-amber-900/40 px-3 py-2 text-sm text-amber-300">Recap: {recapError}</div>
        )}
        {recap && (
          <section className="mb-5 rounded border border-blue-900 bg-blue-950/20 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-blue-200">
               Daily recap, {recap.date} · {recap.sessions} session{recap.sessions === 1 ? '' : 's'}
              </h3>
              <button onClick={() => setRecap(null)} className="text-xs text-neutral-500 hover:text-neutral-300">
                dismiss
              </button>
            </div>
            <p className="mb-3 text-sm font-medium leading-relaxed text-neutral-100">{recap.recap.headline}</p>
            <div className="mb-3 grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-500">Went well</h4>
                <ul className="space-y-1.5 text-sm text-neutral-300">
                  {recap.recap.went_well.map((w, i) => (
                    <li key={i}>
                      {w.point}
                      <span className="block text-xs text-neutral-500">{w.evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-400">Needs work</h4>
                <ul className="space-y-1.5 text-sm text-neutral-300">
                  {recap.recap.needs_work.map((w, i) => (
                    <li key={i}>
                      {w.point}
                      {w.recurring && (
                        <span className="ml-1.5 rounded bg-orange-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-orange-300">
                          recurring
                        </span>
                      )}
                      <span className="block text-xs text-neutral-500">{w.evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mb-3 text-xs text-neutral-400">{recap.recap.metrics_note}</p>
            <div className="mb-3 rounded border border-red-900 bg-red-950/30 p-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-red-400">Top priority: </span>
              <span className="text-sm text-neutral-200">{recap.recap.top_priority}</span>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-400">Drills for tomorrow</h4>
              <ul className="list-inside list-decimal space-y-1 text-sm text-neutral-300">
                {recap.recap.drills.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">
            <span>{error}</span>
            <button onClick={retry} className="shrink-0 rounded bg-red-800/60 px-2 py-1 text-xs hover:bg-red-700/60">
             Retry
            </button>
          </div>
        )}
        {!error && grades === null && <p className="text-sm text-neutral-500">Loading…</p>}
        {grades !== null && grades.length === 0 && (
          <p className="text-sm text-neutral-500">
           No graded sessions yet. Practise, then hit <span className="text-neutral-300">End session</span>, the
            scorecard records a grade here automatically.
          </p>
        )}
        {grades !== null && grades.length > 0 && filtered !== null && filtered.length === 0 && (
          <p className="text-sm text-neutral-500">
           No graded sessions in this window, {grades.length} in total. Widen the range above.
          </p>
        )}

        {filtered !== null && filtered.length > 0 && derived && (
          <>
            <div className="mb-5 grid grid-cols-3 gap-2">
              <StatTile
                label="Sessions graded"
                value={String(filtered.length)}
                sub={range !== 'all' && grades !== null ? `of ${grades.length} total` : undefined}
              />
              <StatTile
                label="Latest"
                value={`${derived.latest.weighted.toFixed(2)} · ${derived.latest.recommendation}`}
                sub={derived.prev ? <Delta value={derived.latest.weighted - derived.prev.weighted} /> : 'first graded session'}
              />
              <StatTile
                label="Readiness (3 full sims at Hire+)"
                value={`${Math.min(derived.streak, 3)}/3`}
                sub={derived.streak >= 3 ? 'bar met, book it' : 'consecutive, no red flags, D ≥ 3, narrated'}
              />
              <StatTile
                label="Drill trigger (§7)"
                value={derived.drill ? `Axis ${derived.drill.axis}` : 'none'}
                sub={
                  derived.drill
                    ? `avg ${derived.drill.avg}/4 over last 3, drill it`
                    : 'no axis averaging < 3 over last 3'
                }
              />
              <StatTile
                label="Hint dependency"
                value={derived.hintLatest !== null ? `L${derived.hintLatest}` : 'n/a'}
                sub={
                  derived.hintLatest !== null && derived.hintPrev !== null ? (
                    <Delta value={derived.hintLatest - derived.hintPrev} upIsGood={false} />
                  ) : (
                    'avg hint level, target 0 to 1'
                  )
                }
              />
              <StatTile
                label="Clarification hit rate"
                value={derived.clarLatest !== null ? `${derived.clarLatest}/8` : 'n/a'}
                sub="unprompted · target ≥ 6/8"
              />
              <StatTile
                label="Pace (avg over window)"
                value={derived.avgDuration !== null ? `${derived.avgDuration}m` : 'n/a'}
                sub={
                  derived.avgGreen !== null
                    ? `tests green at ${derived.avgGreen}m (${derived.greenCount} session${derived.greenCount === 1 ? '' : 's'})`
                    : 'no all-green runs in window'
                }
              />
            </div>

            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
             Weighted score over sessions
            </h3>
            <TrendLine grades={filtered} />

            <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
             Axis trendlines
            </h3>
            <div className="mb-5 space-y-1.5">
              {axisSeries.map((s) => {
                const latest = s.points[s.points.length - 1];
                const delta = s.points.length > 1 ? latest - s.points[0] : 0;
                return (
                  <div key={s.key} className="flex items-center gap-3 rounded bg-neutral-800/60 px-3 py-1.5">
                    <div className="w-56 shrink-0 truncate text-sm text-neutral-300">{s.label}</div>
                    <AxisSparkline points={s.points} />
                    <div className="ml-auto text-right text-sm tabular-nums text-neutral-200">
                      {latest}/4
                      <span className="ml-2 text-[11px]">
                        <Delta value={delta} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Sessions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-neutral-500">
                    <th className="py-1 pr-2 font-medium">Date</th>
                    <th className="py-1 pr-2 font-medium">Problem</th>
                    <th className="py-1 pr-2 font-medium">Mode</th>
                    <th className="py-1 pr-2 text-right font-medium">Score</th>
                    <th className="py-1 pr-2 font-medium">Recommendation</th>
                    <th className="py-1 pr-2 text-right font-medium" title="Active session time (pauses excluded)">
                     Time
                    </th>
                    <th className="py-1 pr-2 text-right font-medium" title="First run with all tests passing">
                     Green
                    </th>
                    <th className="py-1 pr-2 text-right font-medium">Hints</th>
                    <th className="py-1 pr-2 text-right font-medium">Clarif.</th>
                    <th className="py-1 pr-2 text-right font-medium">Tests</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {[...filtered].reverse().map((g) => (
                    <tr key={g.sessionId} className="border-t border-neutral-800 text-neutral-300">
                      <td className="whitespace-nowrap py-1 pr-2">{fmtDate(g.gradedAt)}</td>
                      <td className="max-w-[160px] truncate py-1 pr-2">{g.problemTitle ?? 'n/a'}</td>
                      <td className="py-1 pr-2">{MODE_LABELS[g.mode]}</td>
                      <td className="py-1 pr-2 text-right font-medium text-neutral-100">{g.weighted.toFixed(2)}</td>
                      <td className="py-1 pr-2">
                        {g.recommendation}
                        {g.gates.length > 0 && (
                          <span className="ml-1 text-orange-400" title={g.gates.join('\n')}>
                            !{g.gates.length}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-2 text-right">{g.durationMin}m</td>
                      <td className="py-1 pr-2 text-right">{g.timeToGreenMin !== null ? `${g.timeToGreenMin}m` : 'n/a'}</td>
                      <td className="py-1 pr-2 text-right">{g.hintAvgLevel !== null ? `L${g.hintAvgLevel}` : 'n/a'}</td>
                      <td className="py-1 pr-2 text-right">
                        {g.clarificationHits !== null ? `${g.clarificationHits}/8` : 'n/a'}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {g.testsTotal !== null ? `${g.testsPassed}/${g.testsTotal}` : 'n/a'}
                      </td>
                      <td className="py-1 text-right">
                        <button
                          onClick={() => void handleDelete(g.sessionId)}
                          title="Delete this grade from the gradebook (session JSON on disk is kept)"
                          className="rounded px-1.5 py-0.5 text-neutral-600 hover:bg-red-900/40 hover:text-red-300"
                        >
                          
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
