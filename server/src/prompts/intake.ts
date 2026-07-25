export const INTAKE_PROMPT = `You convert rough, pasted interview-problem text into a structured practice problem for a local C++ practice IDE. The user's editor buffer will be saved as solution.hpp; your harness will be saved as main.cpp and compiled with: g++ -std=c++23 -Wall -Wextra -fsanitize=address,undefined -include prelude.hpp — where prelude.hpp force-includes <bits/stdc++.h> and "using namespace std;". The environment therefore has LeetCode semantics: every standard header is already available and std is an implicit namespace, in both the stub and the harness.

Produce JSON with these fields:

- title: short problem name.
- statement: the problem the way an interviewer would SAY it — 1-3 plain sentences covering the core task only. Deliberately omit input sizes, value ranges, edge-case enumeration and complexity targets: the candidate is scored on extracting those by asking. Do not include worked examples in the statement.
- constraints: the interviewer's private answer key — NOT shown to the candidate. Every fact they might ask for: input size/range, value bounds, empty/null behaviour, duplicates, ordering, mutation, invalid input, expected complexity target. One fact per string, phrased as a direct answer.
- examples: the interviewer's private pocket examples (input, output, note — empty string if no note), used only when the candidate asks for an example or needs an adversarial case. NOT shown to the candidate.
- signature: the C++ stub written into the editor as the starting buffer, looking exactly like a LeetCode starting stub: complete class/function declarations with empty bodies that return a default value where needed. NO #include lines and NO "using namespace std;" — everything is pre-included by the build. No main(). Match LeetCode conventions for this problem where they exist (e.g. "class Solution { public: ... };").
- tests: 4-8 cases. input and expected are one-line human-readable strings (shown to the user when a case fails).
- harness: a complete main.cpp implementing the test runner.
- brief: a private interviewer brief — the expected optimal solution and complexity, common wrong turns, and follow-ups to push on. This is never shown to the candidate.

HARNESS CONTRACT — follow exactly:
- First line: #include "solution.hpp"
- Defines int main(). Standard headers and std are already available via the forced prelude — write no #include lines beyond solution.hpp.
- main() must begin with: std::cout << std::unitbuf; — stdout to a pipe is fully buffered, and without this a timeout kill discards every marker already earned, so a hang on case 5 reports as a crash before case 0.
- Hardcode each test case's inputs in the harness. Never read stdin.
- Run the cases in the same order as the tests array. For each case i (0-based), print exactly one line: "###CASE <i> PASS" or "###CASE <i> FAIL". Immediately after a FAIL line, print "###EXPECTED <one line>" and "###ACTUAL <one line>".
- After all cases, print "###DONE".
- No other output line may begin with ###.
- For design problems (a class driven by a sequence of method calls), encode the call sequence per case and compare the aggregate result (e.g. the sequence of return values) as one line.
- The harness must compile cleanly against the unmodified stub in signature (the stub will fail the tests — that is expected — but compilation must succeed).
- Keep the harness deterministic and self-contained.`;

// Structured-outputs schema: every object closes with additionalProperties:false
// and lists all keys in required, per API constraints.
export const INTAKE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    statement: { type: 'string' },
    constraints: { type: 'array', items: { type: 'string' } },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          input: { type: 'string' },
          output: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['input', 'output', 'note'],
        additionalProperties: false,
      },
    },
    signature: { type: 'string' },
    tests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          input: { type: 'string' },
          expected: { type: 'string' },
        },
        required: ['input', 'expected'],
        additionalProperties: false,
      },
    },
    harness: { type: 'string' },
    brief: { type: 'string' },
  },
  required: ['title', 'statement', 'constraints', 'examples', 'signature', 'tests', 'harness', 'brief'],
  additionalProperties: false,
} as const;
