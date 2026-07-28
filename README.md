# Practice IDE

A local, single-user coding environment (C++ and Python) with a conversational AI that can
always see the current code. Built for interview practice — you never paste code into a chat
box. Runs on **your own Claude Pro/Max subscription** — no API key, and no credentials in this
repository.

- **LeetCode-style Monaco editor** with C++ config, STL snippets and word-based suggestions.
  True LeetCode build semantics: every standard header is pre-included and `using namespace std`
  is in effect (force-included prelude, so compiler errors still point at your real line numbers) —
  solutions need zero boilerplate.
- **Five AI personas**: technical coding, **system design** and **behavioral** interviewers —
  each distilled from real interviewing.io mock-interview transcripts (register, hint ladders,
  probe patterns, verbatim style exemplars) — plus a tutor who gives direct answers and a
  **Bloomberg mock interviewer** running the full grad-SWE mock process spec.
- **Problem intake**: paste rough problem text; it becomes a bare interview-style statement, a
  starting stub, test cases and a generated test harness. Constraints and examples are generated
  too but stay **interviewer-private** — like a real interview, you only get the facts you ask
  for, and unprompted discovery is what Axis A grades.
- **Compile and run** against the tests locally with ASan/UBSan on, results flowing straight
  into the AI's context — hit run, see three failures, and just type "why is that failing?".
- **Formal grading**: every ended session is scored against `interview-grading-system.md` —
  behaviorally anchored axes (evidence-first, 1-4), with the weighted average, decision gates
  and hire recommendation computed deterministically server-side. Grades persist to
  `sessions/gradebook.db` (SQLite, no setup), and the **📈 Progress** view tracks axis
  trendlines, hint dependency, clarification hit rate, pace (session time and time-to-green)
  and the readiness bar across sessions — filterable by time window (7/30/90 days), with
  per-row delete for scrapping botched or test grades (the db is plain SQLite if you ever
  want to edit it directly with any SQLite tool). A **Today's recap** button synthesizes an
  end-of-day review across every session practised that day: what went well, what needs work
  (recurring weaknesses flagged per §7), and concrete drills for tomorrow.

## Quick start with Docker (everything included)

The image contains Node, g++ (with sanitizers), Python 3, clangd and the app — the only thing
you bring is your Claude subscription:

```sh
docker compose run --rm auth   # one-time: browser login → prints a token
# paste the token into .env:   CLAUDE_CODE_OAUTH_TOKEN=...
docker compose up --build      # app on http://localhost:3001
```

(Already have Claude Code logged in on the host? Skip the token: uncomment the `~/.claude`
volume mount in `docker-compose.yml` instead.) Sessions and the gradebook persist in
`./sessions` on the host.

## Running locally without Docker

Requirements: Node 22+, `g++` supporting C++20 or newer (`clang++` via `CXX` in `.env` works
too), optionally Python 3 for Python practice, optionally `clangd` for semantic completions,
and a Claude Pro/Max subscription linked ONE of two ways:

- run `claude` then `/login` once on this machine, **or**
- `claude setup-token` and put the token in `.env` as `CLAUDE_CODE_OAUTH_TOKEN=...`

```sh
npm install
npm run dev            # server on :3001, client on the Vite port it prints
```

Open the Vite URL. Model calls run through the Claude Agent SDK on your subscription — usage
draws from your plan's rate windows, never pay-per-token billing, and nothing model-related
reaches the frontend.

## Usage

1. Paste a rough problem into the left pane and hit **Format problem** — the stub lands in the
   editor. Choose **Written** (statement shown in the pane) or **Oral only** (phone-screen
   style: the interviewer states the problem in chat/voice, nothing is written down, and asking
   for repeats is part of the exercise).
2. Write code — in **C++ or Python** (toolbar toggle; the problem generator produces stubs,
   tests and harnesses in whichever is active). **Ctrl/Cmd+Enter** runs; **Ctrl/Cmd+K** focuses
   the chat. **Ctrl+Space / F8** drives the chat mic: hold to talk (release sends) or tap to
   toggle it on hands-free (tap again to send). The **Narrate** button separately toggles the
   ambient think-aloud mic.
3. Talk to the interviewer at any time — it sees your buffer, selection, cursor, build errors
   and test results automatically. Flip to **Tutor** when you want direct answers.
4. Sessions **start paused** — setup time (pasting, reading the problem) never counts as
   interview time. Hit **▶ Resume** when you're ready; **⏸ Pause** any time after. Paused time
   is excluded from every grading input (duration, timestamps, silence analysis), the narration
   mic yields, and the persona is told the session is paused so the exchange counts as a
   break/coaching, not interview performance.
5. **End session** for a debrief, or **Reset** to discard the session and start fresh
   (keeps your persona choice; no grading).

Sessions (transcript, edit history, token usage) are saved to `sessions/<id>.json`.

### Bloomberg mock mode

Switch the persona to **Bloomberg** and drive sessions with chat triggers:

| Say this | Get this |
|---|---|
| "question practice" + a problem | Single question under full interview conditions, axes A–D feedback |
| "full interview" | ~60-min phone-screen simulation (intro/resume, two problems, your questions), A–F debrief |
| "behavioral round" | STAR/EM deep-dive on projects and motivation |
| "code review round" | Intentionally flawed C++ (in chat) to critique as a PR review |
| "pause" / "resume" | Suspend the mock for coaching, then continue |

The mode enforces the STACK framework (Scope → Trace → Approach → Code → Kick the tires),
clarification and narration grading, a calibrated hint ladder with hint-uptake scoring, and a
blunt evidence-first feedback format. **End session** produces a Bloomberg scorecard: axis
scores with evidence, biggest interview risk, one rewrite, highest-leverage fix, next drill,
every hint logged, and an overall hire recommendation.

The standing candidate context (projects to probe, language bar) lives in
`server/src/prompts/candidate.ts` — edit it as the profile evolves.

## Notes

- The interviewer's hidden per-problem brief never reaches the browser — it is stripped on the
  server before `problem:ready` is sent.
- Execution runs under ASan + UBSan with `hard_rss_limit_mb=512`, a 5s wall clock, and a file
  size ulimit. Leak detection is off to match LeetCode semantics.
- Models: Claude Sonnet 5 for conversation, Claude Opus 4.8 for problem intake and the debrief
  (falls back to Sonnet automatically if the plan doesn't include Opus), Claude Haiku 4.5 for
  history compaction on long sessions. Usage draws from the subscription's rate windows, not
  pay-per-token billing.
- Chat runs on a **persistent Claude runtime per connection** (pre-warmed at connect,
  restarted on persona/problem changes with history replayed) — no per-message process
  spawn, and context stays cached across turns. Conversational turns run at medium effort;
  intake/scorecard at high; compaction at low.
- A dropped WebSocket reconnects into a **fresh** session (v1 limitation).
- The editor runs under interview conditions (word-based suggestions only). A study mode with
  clangd IntelliSense is planned for phase 3 and will return as a toggle when it's wired up.
