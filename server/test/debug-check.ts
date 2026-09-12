// Every debug exercise must actually behave like one: the seeded code has to
// compile or load, and it has to FAIL, or there is nothing to find. Run with
// --fixed to check a reference fix passes instead.
import { DEBUG_BANK, debugToProblem } from '../src/techq/debug-bank.js';
import { languageAvailable } from '../src/languages.js';
import { compileAndRun } from '../src/runner.js';
import { languageMeta } from '../../shared/languages';
import type { Session } from '../src/types.js';

function sessionFor(exerciseId: string, buffer?: string): Session {
  const exercise = DEBUG_BANK.find((e) => e.id === exerciseId)!;
  const problem = debugToProblem(exercise);
  return {
    id: `debug-${exerciseId}`,
    startedAt: Date.now(),
    persona: 'techq',
    language: exercise.language,
    buffer: buffer ?? problem.signature,
    problem,
    selection: null,
    cursor: { line: 1, column: 1 },
    build: { status: 'clean', stderr: null, at: 0 },
    lastBuild: null,
    consecutiveBuildFailures: 0,
    tests: null,
    runs: [],
    turns: [],
    edits: [],
    narration: [],
    narrationSpans: [],
    pauseSpans: [],
    narrationSentThrough: 0,
    usage: [],
    compactSummary: null,
    compactedThrough: 0,
    debrief: null,
    designQuestionId: null,
    techTopics: null,
    techQuestionIds: null,
    debugExerciseId: exerciseId,
    oopQuestionId: null,
  };
}

let failures = 0;

// A planted issue cites a line the candidate is expected to read. Pointing at
// a blank line or a comment sends the grader, and any hint drawn from it,
// to the wrong place.
for (const exercise of DEBUG_BANK) {
  const codeLines = exercise.code.split('\n');
  for (const issue of exercise.plantedIssues) {
    const line = codeLines[issue.line - 1];
    const usable = line !== undefined && line.trim() !== '' && !/^\s*(\/\/|#)/.test(line);
    if (!usable) {
      failures++;
      console.log(`  FAIL ${exercise.id} cites line ${issue.line}, which is ${JSON.stringify(line ?? null)}`);
    }
  }
}

for (const exercise of DEBUG_BANK) {
  if (!languageAvailable(exercise.language)) {
    console.log(`  ·    ${exercise.id} skipped (${languageMeta(exercise.language).label} not installed)`);
    continue;
  }
  const { build, tests } = await compileAndRun(sessionFor(exercise.id));
  // The seeded code must build (you cannot read what will not compile) and
  // must fail at least one case (otherwise there is nothing planted).
  const buildsAndFails = build.status === 'ok' && tests !== null && tests.passed < tests.total;
  if (!buildsAndFails) failures++;
  console.log(
    `  ${buildsAndFails ? 'ok  ' : 'FAIL'} ${exercise.id.padEnd(30)} ${languageMeta(exercise.language).label.padEnd(11)} build=${build.status} tests=${tests ? `${tests.passed}/${tests.total}` : 'none'}`,
  );
  if (!buildsAndFails && build.stderr) console.log(`       ${build.stderr.split('\n').slice(0, 4).join('\n       ')}`);
}
console.log(failures === 0 ? '\nEvery seeded exercise builds and fails, as intended.' : `\n${failures} exercise(s) misbehaving.`);
process.exit(failures === 0 ? 0 : 1);
