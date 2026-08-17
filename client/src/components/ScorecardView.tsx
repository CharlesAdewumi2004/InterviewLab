import { useEffect } from 'react';
import type { GradeSummary, Scorecard } from '../../../shared/protocol';
import GradeBanner from './GradeBanner';

interface Props {
  scorecard: Scorecard;
  grade: GradeSummary;
  onClose: () => void;
}

const CLARIFICATION_LABELS: [key: keyof NonNullable<Scorecard['clarifications']>, label: string][] = [
  ['size', 'input size'],
  ['empty', 'empty/null'],
  ['duplicates', 'duplicates'],
  ['boundaries', 'boundaries'],
  ['mutation', 'mutation'],
  ['complexity_target', 'complexity target'],
  ['ordering', 'ordering'],
  ['invalid_input', 'invalid input'],
];

// The per-session scorecard (grading system doc §6), for every persona.
export default function ScorecardView({ scorecard, grade, onClose }: Props) {
  // Escape closes; the Close button takes focus so a stray Enter dismisses
  // the modal instead of re-triggering whatever was focused underneath
  // (previously: End session, causing a duplicate debrief).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-6">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-neutral-100">Session scorecard</h2>
          <button autoFocus onClick={onClose} className="rounded bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700">
            Close
          </button>
        </div>

        <GradeBanner grade={grade} />

        <p className="mb-4 text-sm leading-relaxed text-neutral-300">{scorecard.verdict}</p>

        <section className="mb-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Axis scores (evidence first)
          </h3>
          {scorecard.axes.map((a) => (
            <div key={a.axis} className="flex items-start gap-3 rounded bg-neutral-800 p-2">
              <div className="w-14 shrink-0 text-center">
                <div className="text-xl font-bold text-blue-400">{a.score}/4</div>
                <div className="text-[10px] text-neutral-500">Axis {a.axis}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-neutral-200">{a.name}</div>
                <div className="text-xs text-neutral-400">{a.evidence}</div>
              </div>
            </div>
          ))}
        </section>

        {scorecard.design_review && (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Delivery framework review (§8)
              <span className="ml-2 rounded bg-blue-900/60 px-2 py-0.5 text-[10px] font-semibold normal-case text-blue-200">
                level signal: {scorecard.design_review.level_signal}
              </span>
            </h3>
            <div className="mb-2 space-y-1.5">
              {scorecard.design_review.stages.map((s) => (
                <div key={s.stage} className="flex items-start gap-3 rounded bg-neutral-800/70 p-2">
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-lg font-bold text-blue-400">{s.score}/4</div>
                    <div className="text-[9px] uppercase text-neutral-500">
                      {
                        {
                          requirements: 'Reqs',
                          entities: 'Entities',
                          api: 'API',
                          high_level: 'High-level',
                          deep_dives: 'Deep dives',
                        }[s.stage]
                      }
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400">{s.evidence}</div>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-neutral-400">
              <span className="font-semibold text-neutral-300">Depth · breadth · proactiveness: </span>
              {scorecard.design_review.dimensions}
            </p>
          </section>
        )}

        {scorecard.hints.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Hint log</h3>
            <ul className="space-y-1 text-sm text-neutral-300">
              {scorecard.hints.map((h, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
                    L{h.level}
                  </span>
                  <span>
                    <span className="text-neutral-400">“{h.hint}”</span> — {h.uptake}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {scorecard.clarifications && (
          <section className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Clarification checklist (unprompted)
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {CLARIFICATION_LABELS.map(([key, label]) => {
                const hit = scorecard.clarifications![key];
                return (
                  <span
                    key={key}
                    className={`rounded px-2 py-0.5 text-xs ${
                      hit ? 'bg-green-900/50 text-green-200' : 'bg-neutral-800 text-neutral-500'
                    }`}
                  >
                    {hit ? '✓' : '✗'} {label}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {(scorecard.red_flags.length > 0 || scorecard.green_flags.length > 0) && (
          <div className="mb-4 grid grid-cols-2 gap-4">
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-400">Red flags</h3>
              {scorecard.red_flags.length === 0 ? (
                <p className="text-sm text-neutral-500">None.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-neutral-300">
                  {scorecard.red_flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-500">Green flags</h3>
              {scorecard.green_flags.length === 0 ? (
                <p className="text-sm text-neutral-500">None.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-neutral-300">
                  {scorecard.green_flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <section className="mb-4 rounded border border-red-900 bg-red-950/30 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-400">Biggest interview risk</h3>
          <p className="text-sm text-neutral-200">{scorecard.biggest_risk}</p>
        </section>

        <section className="mb-4 rounded bg-neutral-800 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">One rewrite</h3>
          <p className="mb-2 border-l-2 border-red-700 pl-2 text-sm italic text-neutral-400">
            {scorecard.rewrite.original}
          </p>
          <p className="border-l-2 border-green-700 pl-2 text-sm text-neutral-200">{scorecard.rewrite.improved}</p>
        </section>

        <div className="mb-4 grid grid-cols-2 gap-4">
          <section className="rounded border border-blue-900 bg-blue-950/40 p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-400">
              Highest-leverage fix
            </h3>
            <p className="text-sm text-neutral-200">{scorecard.highest_leverage_fix}</p>
          </section>
          <section className="rounded border border-blue-900 bg-blue-950/40 p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-400">Next drill</h3>
            <p className="text-sm text-neutral-200">{scorecard.next_drill}</p>
          </section>
        </div>

        <p className="text-sm text-neutral-400">
          <span className="font-semibold text-neutral-300">Decision-relevant observation: </span>
          {scorecard.decision_observation}
          <span className="ml-2 text-xs text-neutral-500">(confidence: {scorecard.confidence})</span>
        </p>
      </div>
    </div>
  );
}
