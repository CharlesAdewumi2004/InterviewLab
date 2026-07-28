import fs from 'node:fs';
import path from 'node:path';
import type { DailyRecap } from '../../shared/protocol';
import { structuredCall } from './claude.js';
import { listGrades } from './gradebook.js';
import { activeMs, SESSIONS_DIR } from './session.js';
import { RECAP_PROMPT, RECAP_SCHEMA } from './prompts/recap.js';
import type { Session } from './types.js';

// End-of-day recap: gather every meaningful session in the local-day window,
// join with gradebook rows, and synthesize with the heavy model. Cached per
// (date, session-set) so re-opening the recap doesn't re-spend a model call.

const MAX_SESSIONS = 12;
const cache = new Map<string, { key: string; recap: DailyRecap; sessions: number }>();

function dayWindow(date: string): { from: number; to: number } {
  const [y, m, d] = date.split('-').map(Number);
  const from = new Date(y, m - 1, d).getTime();
  return { from, to: from + 24 * 60 * 60_000 };
}

function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function loadDaySessions(from: number, to: number): Session[] {
  const out: Session[] = [];
  for (const file of fs.readdirSync(SESSIONS_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8')) as Session;
      if (typeof s.startedAt !== 'number' || s.startedAt < from || s.startedAt >= to) continue;
      const meaningful = (s.turns?.length ?? 0) > 0 || (s.runs?.length ?? 0) > 0 || s.problem;
      if (meaningful) out.push(s);
    } catch {
      // old-schema or corrupt session file — skip
    }
  }
  return out.sort((a, b) => a.startedAt - b.startedAt).slice(0, MAX_SESSIONS);
}

export async function dailyRecap(date: string): Promise<{ recap: DailyRecap; sessions: number } | { error: string }> {
  const { from, to } = dayWindow(date);
  const sessions = loadDaySessions(from, to);
  if (sessions.length === 0) {
    return { error: `No practice sessions found for ${date}.` };
  }

  const key = sessions.map((s) => `${s.id}:${s.turns?.length ?? 0}:${s.debrief ? 1 : 0}`).join('|');
  const hit = cache.get(date);
  if (hit && hit.key === key) return { recap: hit.recap, sessions: hit.sessions };

  const gradesById = new Map(listGrades().map((g) => [g.sessionId, g]));
  const trunc = (v: unknown, n: number) => String(v ?? '').slice(0, n);

  const payload = {
    date,
    sessions: sessions.map((s) => {
      const g = gradesById.get(s.id);
      const lastRunEnd = s.runs?.length ? s.runs[s.runs.length - 1].at : s.startedAt;
      const end = Math.max(lastRunEnd, s.turns?.length ? s.turns[s.turns.length - 1].at : 0, s.startedAt);
      return {
        startedAt: clock(s.startedAt),
        persona: s.persona,
        language: s.language ?? 'cpp',
        problem: s.problem?.title ?? null,
        turns: s.turns?.length ?? 0,
        activeMinutes: Math.round(activeMs(s, end) / 60_000),
        runs: s.runs?.length ?? 0,
        buildFailures: s.runs?.filter((r) => r.build === 'error').length ?? 0,
        finalTests: s.tests ? `${s.tests.passed}/${s.tests.total}` : null,
        grade: g
          ? {
              weighted: g.weighted,
              recommendation: g.recommendation,
              gates: g.gates,
              axes: g.axes.map((a) => ({ axis: a.axis, score: a.score, evidence: trunc(a.evidence, 300) })),
              hintAvgLevel: g.hintAvgLevel,
              clarificationHits: g.clarificationHits,
              narrationCoveragePct: g.narrationCoveragePct,
              timeToGreenMin: g.timeToGreenMin,
            }
          : null,
        debrief: s.debrief
          ? {
              verdict: trunc(s.debrief.verdict, 600),
              biggest_risk: trunc(s.debrief.biggest_risk, 300),
              highest_leverage_fix: trunc(s.debrief.highest_leverage_fix, 300),
              next_drill: trunc(s.debrief.next_drill, 300),
              hints_given: s.debrief.hints?.length ?? 0,
              red_flags: (s.debrief.red_flags ?? []).map((f) => trunc(f, 200)),
              green_flags: (s.debrief.green_flags ?? []).map((f) => trunc(f, 200)),
            }
          : null,
        graded: Boolean(g || s.debrief),
      };
    }),
  };

  const { data } = await structuredCall<DailyRecap>({
    purpose: 'recap',
    system: RECAP_PROMPT,
    userContent: JSON.stringify(payload, null, 2),
    schema: RECAP_SCHEMA as unknown as Record<string, unknown>,
  });

  cache.set(date, { key, recap: data, sessions: sessions.length });
  return { recap: data, sessions: sessions.length };
}
