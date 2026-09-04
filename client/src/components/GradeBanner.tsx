import type { GradeSummary, Recommendation } from '../../../shared/protocol';

const REC_COLORS: Record<Recommendation, string> = {
  'strong hire': 'bg-green-800 text-green-100',
  hire: 'bg-green-900 text-green-200',
  'lean no hire': 'bg-orange-900 text-orange-200',
  'no hire': 'bg-red-900 text-red-200',
};

const MODE_LABELS = {
  coding: 'Question practice',
  full_interview: 'Full interview',
  system_design: 'System design',
  behavioral: 'Behavioral',
  tech_knowledge: 'Tech knowledge',
  oop_design: 'OOP design',
} as const;

// Headline decision + measured telemetry. The weighted score and the
// recommendation (incl. gates) are computed server-side from the grading
// system doc — deterministic formula, not model judgment.
export default function GradeBanner({ grade }: { grade: GradeSummary }) {
  const parts: string[] = [
    MODE_LABELS[grade.mode],
    `${grade.durationMin}m`,
    `${grade.runs} run${grade.runs === 1 ? '' : 's'} (${grade.buildFailures} failed)`,
  ];
  if (grade.testsTotal !== null) parts.push(`tests ${grade.testsPassed}/${grade.testsTotal}`);
  if (grade.timeToGreenMin !== null) parts.push(`green at ${grade.timeToGreenMin}m`);
  if (grade.hintAvgLevel !== null) parts.push(`avg hint level ${grade.hintAvgLevel}`);
  if (grade.clarificationHits !== null) parts.push(`clarifications ${grade.clarificationHits}/8 unprompted`);
  if (grade.narrationCoveragePct !== null && grade.narrationCoveragePct > 0) {
    parts.push(`narration ${grade.narrationCoveragePct}% of session`);
  }

  return (
    <div className="mb-4 rounded border border-neutral-700 bg-neutral-800/60 px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-neutral-100">{grade.weighted.toFixed(2)}</div>
          <div className="text-[11px] text-neutral-500">weighted / 4</div>
        </div>
        <div className="min-w-0">
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${REC_COLORS[grade.recommendation]}`}
          >
            {grade.recommendation}
          </span>
          <div className="mt-1 text-sm text-neutral-400">{parts.join(' · ')}</div>
        </div>
      </div>
      {grade.gates.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-neutral-700/60 pt-2 text-xs text-orange-300">
          {grade.gates.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      )}
      <div className="mt-1 text-[11px] text-neutral-500">
        Recorded to gradebook — see Progress for trends.
        {grade.gates.length > 0 && ` Provisional (pre-gate): ${grade.provisional}.`}
      </div>
    </div>
  );
}
