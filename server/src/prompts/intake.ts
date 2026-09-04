import type { Language } from '../../../shared/protocol';

const ENVIRONMENTS: Record<Language, { intro: string; harnessContract: string }> = {
  cpp: {
    intro: `The user's editor buffer will be saved as solution.hpp; your harness will be saved as main.cpp and compiled with: g++ -std=c++23 -Wall -Wextra -fsanitize=address,undefined -include prelude.hpp — where prelude.hpp force-includes <bits/stdc++.h> and "using namespace std;". The environment therefore has LeetCode semantics: every standard header is already available and std is an implicit namespace, in both the stub and the harness. Write the signature stub and harness in C++.`,
    harnessContract: `HARNESS CONTRACT — follow exactly:
- First line: #include "solution.hpp"
- Defines int main(). Standard headers and std are already available via the forced prelude — write no #include lines beyond solution.hpp.
- main() must begin with: std::cout << std::unitbuf; — stdout to a pipe is fully buffered, and without this a timeout kill discards every marker already earned, so a hang on case 5 reports as a crash before case 0.`,
  },
  python: {
    intro: `The user's editor buffer will be saved as solution.py; your harness will be saved as main.py and executed with: python3 -u main.py (Python 3.11+; -u keeps stdout unbuffered). Write the signature stub and harness in Python. The stub must include any imports it needs (e.g. from typing import List) — match LeetCode Python conventions.`,
    harnessContract: `HARNESS CONTRACT — follow exactly:
- First line: from solution import *
- Top-level script (no main() needed). Standard library only.`,
  },
};

const SCENARIO_FRAMING = `SCENARIO FRAMING — first decide which of two cases the pasted problem is. Real interviewers dress bare algorithms in a work scenario, but they never pile fiction on top of a problem that already lives in the real world.

CASE 1 — ALREADY GROUNDED: the pasted text already has a real-world setting. This includes design problems (an LRU cache, an underground-fare tracker, a rate limiter, "design a data structure that...") and any statement already about transactions, users, logs, prices, servers, tickets. KEEP ITS OWN SETTING. Do not invent a new product context, do not rename its entities, do not add backstory or a fictional team. Your only edits: phrase it the way an interviewer would say it out loud (terse, conversational), move constraints/examples into the private fields below, and — only if the canonical problem NAME leaks through the title or stub naming — retitle/rename just enough to hide the name while keeping the same setting. Extra scenario on an already-real problem is noise, not realism.

CASE 2 — BARE ALGORITHM: the statement is abstract ("given an array of integers nums..."). Dress it:
- Invent a concrete product/system context — a service, a feature, a dataset — and phrase the task as that team's actual need. Vary the domain across problems; finance/market-data flavours (orders, ticks, feeds, transactions, logs) fit this candidate's target but must not become a formula.
- Rename everything into the scenario's vocabulary: the data is "per-minute prices" or "server request counts", never "an array of integers nums".
- DISGUISE THE IDENTITY of well-known problems: the title, statement, stub naming and test phrasing must not let the candidate pattern-match the LeetCode name. Recognising the structure through the disguise is part of the exercise.

BOTH CASES:
- FIDELITY RULE: the underlying algorithmic task must stay exactly the pasted problem — same input shape, same required output, same optimal solution. The costume changes; the problem does not. Never add requirements that change what must be implemented.
- PROPORTION: context is one or two sentences, never a paragraph of world-building. The framing exists to hide the pattern and force clarifying questions — anything beyond that is waste.`;

const PLAIN_FRAMING = `PLAIN FRAMING — the candidate turned scenario dressing OFF. Do not invent any context: no product setting, no fictional team, no renamed entities. Deliver the problem as itself — if the pasted text has its own real-world setting, keep it verbatim in spirit; if it is a bare algorithm, it stays a bare algorithm ("given an array of prices..." stays about an array). Still phrase the statement the way an interviewer would SAY it — terse and conversational, not LeetCode legalese — and constraints/examples still move into the private fields below (extracting them by asking is still scored). The title and stub may use natural, even canonical, naming; identity-hiding is off.`;

export const intakePrompt = (
  language: Language,
  framing: 'scenario' | 'plain' = 'scenario',
) => `You convert rough, pasted interview-problem text into a structured practice problem for a local practice IDE. ${ENVIRONMENTS[language].intro}

${framing === 'plain' ? PLAIN_FRAMING : SCENARIO_FRAMING}

Produce JSON with these fields:

- title: ${
  framing === 'plain'
    ? "a short natural name for the task (canonical names are fine in plain framing)."
    : 'a name in the problem\'s setting (Case 1: its own setting; Case 2: the invented scenario\'s, e.g. "Flagging card fraud") — never the canonical algorithm-problem name.'
}
- statement: the scenario the way an interviewer would SAY it — 2-4 conversational sentences: one or two of context, then the task. Deliberately omit input sizes, value ranges, edge-case enumeration and complexity targets: the candidate is scored on extracting those by asking. Do not include worked examples in the statement.
- constraints: the interviewer's private answer key — NOT shown to the candidate. Every fact they might ask for, in the scenario's vocabulary: input size/range, value bounds, empty/null behaviour, duplicates, ordering, mutation, invalid input, expected complexity target. One fact per string, phrased as a direct answer.
- examples: the interviewer's private pocket examples (input, output, note — empty string if no note), used only when the candidate asks for an example or needs an adversarial case. NOT shown to the candidate.
- signature: the stub written into the editor as the starting buffer — LeetCode-shaped${
  framing === 'plain'
    ? ' with natural naming'
    : " but named in the SCENARIO's vocabulary (a stub called largestRectangleArea(heights) would undo the disguise)"
}. Complete class/function declarations with empty bodies that return a default value where needed. ${
  language === 'cpp'
    ? 'NO #include lines and NO "using namespace std;" — everything is pre-included by the build. No main(). Match LeetCode C++ conventions (e.g. "class Solution { public: ... };").'
    : 'Include any imports the stub itself needs (e.g. from typing import List, Optional). No main/driver code. Match LeetCode Python conventions (e.g. "class Solution:\\n    def twoSum(self, nums: List[int], target: int) -> List[int]:").'
}
- tests: 4-8 cases. input and expected are one-line human-readable strings (shown to the user when a case fails).
- harness: a complete ${language === 'cpp' ? 'main.cpp' : 'main.py'} implementing the test runner.
- brief: a private interviewer brief — name the canonical underlying problem if it's a known one (e.g. "this is Largest Rectangle in Histogram in disguise"), the expected optimal solution and complexity, common wrong turns, whether/when to credit the candidate for spotting the underlying structure, and follow-ups to push on. This is never shown to the candidate.

${ENVIRONMENTS[language].harnessContract}
- Hardcode each test case's inputs in the harness. Never read stdin.
- Run the cases in the same order as the tests array. For each case i (0-based), print exactly one line: "###CASE <i> PASS" or "###CASE <i> FAIL". Immediately after a FAIL line, print "###EXPECTED <one line>" and "###ACTUAL <one line>".
- After all cases, print "###DONE".
- No other output line may begin with ###.
- For design problems (a class driven by a sequence of method calls), encode the call sequence per case and compare the aggregate result (e.g. the sequence of return values) as one line.
- The harness must ${language === 'cpp' ? 'compile' : 'load'} cleanly against the unmodified stub in signature (the stub will fail the tests — that is expected — but it must ${language === 'cpp' ? 'compile' : 'import without errors'}).
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
