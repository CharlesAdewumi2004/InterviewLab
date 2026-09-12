// Question bank integrity check: ids are unique, every topic chip has
// questions behind it, language-specific questions are filtered to the right
// language, and nothing ships with a thin answer key (the answer key is what
// the grader scores against, so an empty one silently degrades a round).
//
//   npm run smoke   (runs this, then the runner smoke test)
import { TECH_BANK, TECH_TOPIC_LABELS, sampleTechRound } from '../src/techq/bank.js';
import { DESIGN_BANK } from '../src/sysdesign/bank.js';
import { OOP_BANK } from '../src/oop/bank.js';
import { DEBUG_BANK } from '../src/techq/debug-bank.js';
import { CODING_BANK } from '../src/coding-bank.js';
import { LANGUAGES } from '../../shared/languages';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
}

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

console.log('Banks:');
for (const [name, ids] of [
  ['tech knowledge', TECH_BANK.map((q) => q.id)],
  ['system design', DESIGN_BANK.map((q) => q.id)],
  ['OOP design', OOP_BANK.map((q) => q.id)],
  ['debug exercises', DEBUG_BANK.map((e) => e.id)],
  ['coding seeds', CODING_BANK.map((q) => q.id)],
] as [string, string[]][]) {
  const dupes = duplicates(ids);
  check(`${name} (${ids.length} entries), unique ids`, dupes.length === 0, dupes.join(', '));
}

console.log('\nTech knowledge topics:');
const perTopic = new Map<string, number>();
for (const q of TECH_BANK) perTopic.set(q.topic, (perTopic.get(q.topic) ?? 0) + 1);
for (const [topic, label] of Object.entries(TECH_TOPIC_LABELS)) {
  const count = perTopic.get(topic) ?? 0;
  check(`${label} has questions`, count >= 4, `${count} found`);
}

console.log('\nAnswer keys and follow-up ladders:');
const thin = TECH_BANK.filter((q) => q.answerKey.length < 3 || q.followUps.length < 2);
check('every question carries a usable key and ladder', thin.length === 0, thin.map((q) => q.id).join(', '));
const unlabelled = TECH_BANK.filter((q) => !(q.topic in TECH_TOPIC_LABELS));
check('every question has a known topic', unlabelled.length === 0, unlabelled.map((q) => q.id).join(', '));

console.log('\nLanguage-specific sampling:');
// TypeScript inherits JavaScript's internals (same runtime); C++ has its own
// dedicated topic rather than langint entries. Everything else must draw only
// its own language.
const ACCEPTED: Record<string, string[]> = { typescript: ['typescript', 'javascript'] };
for (const meta of LANGUAGES) {
  const round = sampleTechRound(['langint', 'web', 'security'], meta.id, 6);
  const languageQuestions = round.filter((q) => q.language !== undefined || q.topic === 'cpp');
  const accepted = ACCEPTED[meta.id] ?? [meta.id];
  const rightLanguage = languageQuestions.every((q) => accepted.includes(q.language ?? meta.id));
  check(
    `${meta.label} round draws only ${meta.label} internals`,
    round.length > 0 && rightLanguage && languageQuestions.length > 0,
    `${round.length} questions, ${languageQuestions.length} language-specific`,
  );
}

console.log(failures === 0 ? '\nBanks look healthy.' : `\n${failures} bank problem(s).`);
process.exit(failures === 0 ? 0 : 1);
