# Interview Lab

Mock interview practice that runs on your machine and uses your own Claude
subscription. Five round types, a code editor the interviewer can see, and a
written scorecard when the session ends.

No API key, no billing, no account, no server. Your sessions stay in a folder
on your disk.

## Quick start

```sh
git clone <this repo> && cd interview-lab
npm install
npm start
```

Open http://localhost:3001. The Setup page checks your machine and tells you
what is missing.

Two requirements:

1. **A linked Claude account.** Install [Claude Code](https://claude.com/claude-code),
   run `claude`, sign in once with `/login`. Or run `claude setup-token` and put
   the token in `.env` as `CLAUDE_CODE_OAUTH_TOKEN=...`.
2. **A toolchain for your language.** Python, JavaScript and TypeScript work
   immediately. C++, Java, Go and Rust need their compilers installed. The Setup
   page lists the install command for each.

Only the Run button needs a toolchain. Every round works without one.

## What it does

**Coding.** Paste a problem or pick one from the bank. It is rewritten as a work
scenario with the original problem name hidden. Input sizes, edge cases and
complexity targets are not shown; you get them by asking, and asking is part of
the score. Ctrl+Enter compiles and runs against generated tests, and the results
go into the interviewer's view, so you can ask why case 3 fails.

**System design.** 16 questions from Bitly to Uber. Each has a hidden brief with
the requirements answer key, expected design, deep dives and level bars. The
editor is the whiteboard. Scored per stage with a mid, senior or staff signal.

**OOP design.** Low level design. Scope the problem, name the classes, defend
the interfaces, then write the skeleton.

**Fundamentals.** 113 questions across operating systems, networking, memory,
concurrency, databases, web and HTTP, security, testing, CI and deploys, and
your language's internals. Each has a follow up ladder, so answers get drilled
into. Also includes debug exercises: broken code is put in your editor and you
find the planted issues by reading.

**Behavioral.** STAR questions about your own projects. Upload a CV and the
interviewer reads it first, then asks about what is on it: ownership, dates,
numbers.

Any round can run by voice. Replies are spoken, push to talk sends your answer,
and an ambient mic transcribes what you say while coding so silence and
explanation both count as evidence.

## Languages

| Language | Needs | Notes |
|---|---|---|
| Python | Python 3.10+ | |
| JavaScript | Node 20+ | Already installed |
| TypeScript | Node 20+ | Runs through the bundled tsx, types stripped not checked |
| Java | JDK 17+ | |
| C++ | g++ or clang++ with C++20 | Standard headers and `using namespace std` are already in scope; ASan and UBSan when available |
| Go | Go 1.21+ | |
| Rust | rustc | |

Switching language regenerates the stub, tests and harness, and the interviewer
judges idiomatic code by that language's standards.

```sh
npm run smoke
```

Runs a real two case problem through every toolchain you have and skips the rest.

## Grading

Ending a session scores it against `interview-grading-system.md`. Six axes from
problem comprehension to communication to motivation, each 1 to 4 with quoted
evidence. The model supplies the evidence and scores; the server computes the
weighted average, applies the gates and produces the recommendation, so the
arithmetic is identical every time.

Grades go to `sessions/gradebook.db`, a plain SQLite file. The Progress page
tracks axis trends, hint dependency, clarification rate, pace and a readiness
bar, filterable by time window. A daily recap summarises everything practised in
one day and suggests drills.

## Your profile

The Setup page holds an optional profile: name, target role, seniority, target
company, notes. It sets the level bar for every round, and naming a company
makes motivation questions specific to it. Leave it blank and rounds stay
company neutral. Stored in `sessions/`, git ignored, along with your CV and
transcripts.

## Docker

The image includes Node, g++, Python, the JDK and clangd:

```sh
docker compose run --rm auth      # browser login, prints a token
# paste the token into .env as CLAUDE_CODE_OAUTH_TOKEN=...
docker compose up --build         # http://localhost:3001
```

Already signed in to Claude Code on the host? Skip the token and uncomment the
`~/.claude` volume in `docker-compose.yml`. Sessions and grades persist in
`./sessions`.

## Development

```sh
npm run dev        # server on 3001, client on Vite's port, hot reload
npm run typecheck  # both workspaces
npm run smoke      # bank checks, then every installed language
npm start          # build the client, serve everything from 3001
```

```
shared/languages.ts        language registry, read by both sides
shared/protocol.ts         every WebSocket message
server/src/languages.ts    how each language becomes files and processes
server/src/runner.ts       runs those plans, parses test output
server/src/prompts/        one file per interviewer persona
server/src/*/bank*.ts      question banks with their hidden briefs
client/src/components/     workspace, pages, scorecard
```

Adding a language takes three edits: an entry in `shared/languages.ts`, a
runtime in `server/src/languages.ts` saying how to compile and run it, and an
environment block in `server/src/prompts/intake.ts` describing the stub and
harness contract. Nothing else is language aware. Add a fixture to
`server/test/runner-smoke.ts` and `npm run smoke` covers it.

## Privacy

Sessions, transcripts, grades, your CV and your profile are files in
`sessions/`, all git ignored. Model calls go to Claude under your subscription
and use your plan's normal rate limits. No telemetry, no server, no account.

## License

MIT. See [LICENSE](LICENSE).
