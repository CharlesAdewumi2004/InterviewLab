import fs from 'node:fs';
import path from 'node:path';
import { SESSIONS_DIR } from './session.js';

// Who the practising candidate is and what they are preparing for. Entirely
// optional — with an empty profile every round still works, calibrated to a
// generic software-engineering interview. Stored locally (git-ignored) next
// to the sessions; nothing here ever leaves the machine except as part of the
// interviewer's own system prompt.

export type Level = 'intern' | 'new-grad' | 'mid' | 'senior' | 'staff';

export interface Profile {
  /** What the interviewer calls the candidate. Blank is fine. */
  name: string;
  /** e.g. "Backend Engineer", "Software Engineer (Platform)". */
  targetRole: string;
  /** Seniority the questions and the level bar are calibrated to. */
  level: Level;
  /**
   * The company being prepared for, if any. When set, motivation probes get
   * specific ("why us?") and the interviewer adopts that company's public
   * interview shape where it knows it; when blank, everything stays generic.
   */
  targetCompany: string;
  /** Anything the interviewer should know: domain, weak spots, projects to probe. */
  notes: string;
}

export const LEVEL_LABELS: Record<Level, string> = {
  intern: 'Internship',
  'new-grad': 'New grad / early career',
  mid: 'Mid-level',
  senior: 'Senior',
  staff: 'Staff+',
};

// Level calibration handed to the interviewer personas, so "a 3" means the
// same thing the candidate's real loop would mean by it.
const LEVEL_BARS: Record<Level, string> = {
  intern:
    'Internship bar: fundamentals and coachability decide it. Expect one straightforward problem solved cleanly with narration; depth of system thinking is a bonus, not a requirement.',
  'new-grad':
    'New-grad bar: correct, clean code on a medium problem with accurate complexity, plus visible communication. Design depth is expected only at the object level, not at scale.',
  mid: 'Mid-level bar: independent problem-solving, idiomatic code, complexity trade-offs argued rather than asserted, and design answers that survive one round of "what breaks at 10x?".',
  senior:
    'Senior bar: ambiguity is the test. Expect the candidate to scope the problem themselves, justify trade-offs with numbers, anticipate failure modes, and drive the conversation rather than wait for prompts.',
  staff:
    'Staff+ bar: breadth plus depth. Expect explicit prioritisation, cross-cutting concerns (operability, migration, blast radius), and the candidate steering the round like an owner.',
};

const PROFILE_PATH = path.join(SESSIONS_DIR, 'profile.json');

export const EMPTY_PROFILE: Profile = {
  name: '',
  targetRole: '',
  level: 'new-grad',
  targetCompany: '',
  notes: '',
};

let cached: Profile | undefined;

export function getProfile(): Profile {
  if (cached === undefined) {
    try {
      const raw = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8')) as Partial<Profile>;
      cached = { ...EMPTY_PROFILE, ...raw };
    } catch {
      cached = { ...EMPTY_PROFILE };
    }
  }
  return cached;
}

export function setProfile(input: Partial<Profile>): Profile {
  const level = input.level && level_ok(input.level) ? input.level : getProfile().level;
  const next: Profile = {
    name: clamp(input.name ?? getProfile().name, 80),
    targetRole: clamp(input.targetRole ?? getProfile().targetRole, 120),
    level,
    targetCompany: clamp(input.targetCompany ?? getProfile().targetCompany, 80),
    notes: clamp(input.notes ?? getProfile().notes, 2_000),
  };
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(next, null, 2));
  cached = next;
  return next;
}

function level_ok(value: string): value is Level {
  return value in LEVEL_LABELS;
}

function clamp(value: string, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

/**
 * The profile as a prompt block for the interviewer personas. Returns null
 * when the user has told us nothing worth saying — a blank profile must not
 * push an empty template into the system prompt.
 */
export function profileBlock(): string | null {
  const p = getProfile();
  const lines: string[] = [];
  if (p.name) lines.push(`- Candidate: ${p.name}.`);
  if (p.targetRole) lines.push(`- Target role: ${p.targetRole}.`);
  lines.push(`- Seniority being interviewed for: ${LEVEL_LABELS[p.level]}. ${LEVEL_BARS[p.level]}`);
  if (p.targetCompany) {
    lines.push(
      `- Target company: ${p.targetCompany}. Run the round the way that company is publicly known to run it where you genuinely know its process, and make motivation probes specific to it ("why ${p.targetCompany}?"). Never invent internal details about them; if you are unsure how they interview, run a standard loop instead.`,
    );
  } else {
    lines.push(
      '- Target company: not specified. Run a standard, company-neutral loop, and keep motivation probes general ("what are you looking for in your next team?").',
    );
  }
  if (p.notes) lines.push(`- Candidate notes (their own words): ${p.notes}`);
  return `CANDIDATE CONTEXT (standing, applies to every session):\n${lines.join('\n')}`;
}
