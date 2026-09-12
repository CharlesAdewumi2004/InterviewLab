# Interview Lab

Realistic mock interviews that run on your own machine, on your own Claude
subscription. Five kinds of round, an interviewer who can see your editor and
refuses to rescue you, and an evidence-first scorecard when you finish.

Free, local, and open source. No API key, no per-token billing, no account on
anyone's server, and nothing you write leaves your machine except as part of a
request to Claude on your own plan.

## Quick start

```sh
git clone <this repo> && cd interview-lab
npm install
npm start
```

Open http://localhost:3001. The Setup page inside the app checks everything and
tells you what to fix.

You need two things, and the app will tell you if either is missing:

1. **A linked Claude account.** Install [Claude Code](https://claude.com/claude-code),
   run `claude`, and sign in once with `/login`. That is all. If you would
   rather not install it, or you are running headless, mint a token with
   `claude setup-token` and put it in `.env` as `CLAUDE_CODE_OAUTH_TOKEN=...`.
2. **A toolchain for the language you practise in.** Python, JavaScript and
   TypeScript work out of the box (JS and TS need only Node, which you already
   have). C++, Java, Go and Rust need their compilers installed. The Setup page
   lists each one with the exact install command for your platform.

Everything except running code works regardless of toolchains, so you can start
a system design or behavioral round on a bare machine.

## The rounds

**Coding.** Paste any problem, or pull one from the built in bank. It comes back
re-dressed as a realistic work scenario with its textbook identity hidden, and
the constraints held back: input sizes, edge cases and complexity targets are
the interviewer's private notes, and extracting them by asking is part of what
you are scored on. Write code, hit Ctrl+Enter, and compile and run against
generated tests with the results flowing straight into the interviewer's view,
so "why is case 3 failing?" just works.

**System design.** A 16 question bank from Bitly through Ticketmaster to Uber,
each with a private interviewer brief: requirements answer key, quantified non
functional requirements, expected design, canonical deep dives, common mistakes
and per level bars. The editor becomes your whiteboard. Graded stage by stage
against the delivery framework, with a mid, senior or staff level signal.

**OOP design.** Low level design, talk then code. Scope the ask, name the
classes and their responsibilities, defend the interfaces, then build the
skeleton in the editor.

**Fundamentals.** The verbal CS knowledge round: operating systems, networking,
memory, concurrency, data structure internals, databases, language internals.
Every answer gets drilled into until it either holds up or does not. Includes
debug and optimise exercises where deliberately broken code is seeded into your
editor and you have to find the planted issues by reading.

**Behavioral.** Hiring manager style STAR probing of your actual projects.
Upload your CV and the interviewer reads it first, then cross examines what is
actually on it: ownership, dates, metrics, the parts that shrink under
questioning.

Any round can be run by voice. Replies are spoken, push to talk sends your
answer, and an ambient narration mic transcribes your think aloud while you
code so that silence and explanation both count as evidence.

## Languages

| Language   | Needs                            | Notes |
|------------|----------------------------------|-------|
| Python     | Python 3.10+                     | |
| JavaScript | Node 20+                         | Already installed |
| TypeScript | Node 20+                         | Runs through the bundled tsx, types stripped not checked |
| Java       | JDK 17+                          | |
| C++        | g++ or clang++ with C++20        | Every standard header pre-included, `using namespace std` on, ASan and UBSan when available |
| Go         | Go 1.21+                         | |
| Rust       | rustc                            | |

Switching language regenerates the stub, the tests and the harness in that
language, and the interviewer judges idiomatic code by that language's own
standards.

To check what your machine can actually run:

```sh
npm run smoke
```

That pushes a real two case problem through every toolchain you have installed
and skips the rest.

## Grading

Every session you end is scored against `interview-grading-system.md`: six
behaviorally anchored axes from problem comprehension through communication to
motivation, each scored 1 to 4 with quoted evidence, never a vibe. The model
supplies the evidence and the judgments; the server computes the weighted
average, applies the decision gates and produces the recommendation, so the
arithmetic is the same every time.

Grades persist to `sessions/gradebook.db`, a plain SQLite file. The Progress
page tracks axis trendlines, hint dependency, clarification hit rate, pace and
a readiness bar across sessions, filterable by time window. A daily recap
synthesises everything you practised in one day into what went well, what keeps
recurring, and the drills to do next.

## Your profile

The Setup page holds an optional profile: name, target role, seniority, target
company and free form notes. It calibrates the level bar in every round, and
naming a target company makes motivation questions specific to it. Leave it
blank and every round runs company neutral. It is stored in `sessions/` on your
machine and is git ignored, along with your CV and every transcript.

## Docker

The image carries Node, g++, Python, the JDK and clangd, so the only thing you
bring is your Claude subscription:

```sh
docker compose run --rm auth      # one time: browser login, prints a token
# paste the token into .env as CLAUDE_CODE_OAUTH_TOKEN=...
docker compose up --build         # app on http://localhost:3001
```

Already signed in to Claude Code on the host? Skip the token and uncomment the
`~/.claude` volume mount in `docker-compose.yml` instead. Sessions and grades
persist in `./sessions`.

## Development

```sh
npm run dev        # server on 3001, client on Vite's port with hot reload
npm run typecheck  # both workspaces
npm run smoke      # exercise every installed language end to end
npm start          # build the client and serve everything from 3001
```

Layout:

```
shared/languages.ts    the language registry both sides read
shared/protocol.ts     every WebSocket message, client and server
server/src/languages.ts  how each language becomes files and processes
server/src/runner.ts     executes those plans, parses test output
server/src/prompts/      one file per interviewer persona
server/src/*/bank.ts     the question banks, with their private briefs
client/src/components/   the workspace, the pages, the scorecard
```

Adding a language takes three edits: an entry in `shared/languages.ts`, a
runtime in `server/src/languages.ts` saying how to compile and run it, and an
environment block in `server/src/prompts/intake.ts` describing the stub and
harness contract. Nothing else in the codebase is language aware. Add a fixture
to `server/test/runner-smoke.ts` and `npm run smoke` will cover it.

## Privacy

Sessions, transcripts, grades, your CV and your profile are files in
`sessions/` on your machine, all git ignored. Model calls go to Claude under
your own subscription and draw on your plan's normal rate limits. There is no
telemetry, no server component, and no account.

## License

MIT. See [LICENSE](LICENSE).
