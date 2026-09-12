// Runner smoke test: push a tiny two-case problem through every language
// runtime installed on this machine, exactly the way a session does, then run
// each language's default scratch buffer. Languages whose toolchain is absent
// are skipped, not failed.
//
//   npm run smoke
import { compileAndRun } from '../src/runner.js';
import { languageAvailable } from '../src/languages.js';
import { LANGUAGES, type Language } from '../../shared/languages';
import type { Session } from '../src/types.js';

interface Fixture {
  buffer: string;
  harness: string;
}

// add(a, b) in each language, plus a harness that prints the ###CASE protocol.
const FIXTURES: Record<Language, Fixture> = {
  python: {
    buffer: 'def add(a, b):\n    return a + b\n',
    harness:
      'from solution import *\n' +
      'print("###CASE 0 " + ("PASS" if add(2, 3) == 5 else "FAIL"))\n' +
      'print("###CASE 1 " + ("PASS" if add(-1, 1) == 0 else "FAIL"))\n' +
      'print("###DONE")\n',
  },
  javascript: {
    buffer: 'function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n',
    harness:
      "const { add } = require('./solution');\n" +
      "console.log('###CASE 0 ' + (add(2, 3) === 5 ? 'PASS' : 'FAIL'));\n" +
      "console.log('###CASE 1 ' + (add(-1, 1) === 0 ? 'PASS' : 'FAIL'));\n" +
      "console.log('###DONE');\n",
  },
  typescript: {
    buffer: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    harness:
      "import { add } from './solution';\n" +
      "console.log('###CASE 0 ' + (add(2, 3) === 5 ? 'PASS' : 'FAIL'));\n" +
      "console.log('###CASE 1 ' + (add(-1, 1) === 0 ? 'PASS' : 'FAIL'));\n" +
      "console.log('###DONE');\n",
  },
  java: {
    buffer: 'class Solution {\n    public int add(int a, int b) {\n        return a + b;\n    }\n}\n',
    harness:
      'public class Main {\n' +
      '    public static void main(String[] args) {\n' +
      '        Solution s = new Solution();\n' +
      '        System.out.println("###CASE 0 " + (s.add(2, 3) == 5 ? "PASS" : "FAIL"));\n' +
      '        System.out.println("###CASE 1 " + (s.add(-1, 1) == 0 ? "PASS" : "FAIL"));\n' +
      '        System.out.println("###DONE");\n' +
      '    }\n' +
      '}\n',
  },
  cpp: {
    buffer: 'class Solution {\npublic:\n    int add(int a, int b) { return a + b; }\n};\n',
    harness:
      '#include "solution.hpp"\n' +
      'int main() {\n' +
      '    std::cout << std::unitbuf;\n' +
      '    Solution s;\n' +
      '    std::cout << "###CASE 0 " << (s.add(2, 3) == 5 ? "PASS" : "FAIL") << "\\n";\n' +
      '    std::cout << "###CASE 1 " << (s.add(-1, 1) == 0 ? "PASS" : "FAIL") << "\\n";\n' +
      '    std::cout << "###DONE\\n";\n' +
      '}\n',
  },
  go: {
    buffer: 'package main\n\nfunc add(a int, b int) int {\n\treturn a + b\n}\n',
    harness:
      'package main\n\nimport "fmt"\n\n' +
      'func main() {\n' +
      '\tif add(2, 3) == 5 {\n\t\tfmt.Println("###CASE 0 PASS")\n\t} else {\n\t\tfmt.Println("###CASE 0 FAIL")\n\t}\n' +
      '\tif add(-1, 1) == 0 {\n\t\tfmt.Println("###CASE 1 PASS")\n\t} else {\n\t\tfmt.Println("###CASE 1 FAIL")\n\t}\n' +
      '\tfmt.Println("###DONE")\n' +
      '}\n',
  },
  rust: {
    buffer: 'pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}\n',
    harness:
      'mod solution;\nuse solution::*;\n\n' +
      'fn main() {\n' +
      '    println!("###CASE 0 {}", if add(2, 3) == 5 { "PASS" } else { "FAIL" });\n' +
      '    println!("###CASE 1 {}", if add(-1, 1) == 0 { "PASS" } else { "FAIL" });\n' +
      '    println!("###DONE");\n' +
      '}\n',
  },
};

function fixtureSession(language: Language, fixture: Fixture): Session {
  return {
    id: `smoke-${language}`,
    startedAt: Date.now(),
    persona: 'interviewer',
    language,
    buffer: fixture.buffer,
    problem: {
      language,
      title: 'Add two numbers',
      statement: 'Return the sum of two integers.',
      signature: fixture.buffer,
      oral: false,
      constraints: [],
      examples: [],
      brief: '',
      tests: [
        { input: '2, 3', expected: '5' },
        { input: '-1, 1', expected: '0' },
      ],
      harness: fixture.harness,
    },
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
    debugExerciseId: null,
    oopQuestionId: null,
  };
}

async function main(): Promise<void> {
  let failures = 0;
  let skipped = 0;

  console.log('Harness runs (problem loaded, tests parsed):');
  for (const meta of LANGUAGES) {
    if (!languageAvailable(meta.id)) {
      skipped++;
      console.log(`  · ${meta.label.padEnd(11)} skipped — ${meta.toolchain} not installed`);
      continue;
    }
    const started = Date.now();
    const { build, tests } = await compileAndRun(fixtureSession(meta.id, FIXTURES[meta.id]));
    const ok = build.status === 'ok' && tests?.passed === 2 && tests.total === 2;
    if (!ok) failures++;
    console.log(
      `  ${ok ? '✓' : '✗'} ${meta.label.padEnd(11)} build=${build.status} tests=${tests ? `${tests.passed}/${tests.total}` : 'none'} ${Date.now() - started}ms`,
    );
    if (!ok) console.log(`      ${build.stderr.split('\n').slice(0, 6).join('\n      ')}`);
  }

  console.log('\nScratch runs (no problem — the default buffer is the program):');
  for (const meta of LANGUAGES) {
    if (!languageAvailable(meta.id)) continue;
    const session = fixtureSession(meta.id, FIXTURES[meta.id]);
    session.problem = null;
    session.buffer = meta.defaultBuffer;
    const { build } = await compileAndRun(session);
    const ok = build.status === 'ok' && build.stdout.includes('hello');
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${meta.label.padEnd(11)} stdout=${JSON.stringify(build.stdout.slice(0, 40))}`);
    if (!ok) console.log(`      ${build.stderr.split('\n').slice(0, 6).join('\n      ')}`);
  }

  console.log(
    failures === 0
      ? `\nAll green (${LANGUAGES.length - skipped} language(s) exercised, ${skipped} skipped).`
      : `\n${failures} failure(s).`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
