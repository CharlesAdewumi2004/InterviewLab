import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuildResult, TestFailure, TestsResult } from '../../shared/protocol';
import type { Session } from './types.js';
import {
  CPP_CACHE_DIR,
  EXE,
  RUNTIMES,
  SHELL,
  cppCompileFlags,
  languageAvailable,
  missingToolchainMessage,
  setCppFlags,
  type RunPlan,
  type Step,
} from './languages.js';
import { LANGUAGES, languageMeta } from '../../shared/languages';
import { CPP_PRELUDE, CXX, PRELUDE_FILE, toolchainEnv } from './toolchain.js';

const PROBE_TIMEOUT_MS = 15_000;

// Toolchains differ: MSYS2 MinGW gcc ships no libasan/libubsan, and older gcc
// (e.g. Debian bookworm's gcc 12) spells C++23 as -std=c++2b. Probe once per
// server process with trivial compiles and adapt. Memoized as a promise so
// concurrent runs share one probe instead of racing in the same directory.
let cppProbe: Promise<void> | null = null;

function probeCpp(): Promise<void> {
  cppProbe ??= (async () => {
    const probeDir = path.join(os.tmpdir(), 'interviewlab', 'toolchain-probe');
    fs.mkdirSync(probeDir, { recursive: true });
    fs.writeFileSync(path.join(probeDir, 'p.cpp'), 'int main(){return 0;}\n');
    const opts = { cwd: probeDir, timeoutMs: PROBE_TIMEOUT_MS, env: toolchainEnv() };

    let stdFlag = '-std=c++23';
    for (const flag of ['-std=c++23', '-std=c++2b', '-std=c++20']) {
      const r = await runProcess(CXX, [flag, '-o', EXE, 'p.cpp'], opts);
      if (r.code === 0) {
        stdFlag = flag;
        break;
      }
    }
    if (stdFlag !== '-std=c++23') console.warn(`${CXX} doesn't accept -std=c++23 — using ${stdFlag}.`);

    const s = await runProcess(CXX, [stdFlag, '-fsanitize=address,undefined', '-o', EXE, 'p.cpp'], opts);
    if (s.code !== 0) console.warn(`ASan/UBSan unavailable with ${CXX}, compiling without sanitizers.`);
    setCppFlags({ stdFlag, sanitize: s.code === 0 });
  })();
  return cppProbe;
}

/**
 * Precompile the prelude in the background.
 *
 * Deliberately not awaited. A build that is still running simply means GCC
 * falls back to parsing the header, which is what it did before, so a Run is
 * never blocked waiting for this. Once it lands, every later compile is about
 * a second faster.
 */
let preludeWarm: Promise<void> | null = null;

export function warmCppPrelude(): Promise<void> {
  preludeWarm ??= (async () => {
    // The flags have to be probed first. A header precompiled with the
    // defaults is silently ignored by every compile that asks for the real
    // standard, which looks exactly like the cache working and being useless.
    await probeCpp();
    fs.mkdirSync(CPP_CACHE_DIR, { recursive: true });
    const header = path.join(CPP_CACHE_DIR, PRELUDE_FILE);
    fs.writeFileSync(header, CPP_PRELUDE);

    // A precompiled header is only valid for the exact compiler and flags that
    // produced it, so the stamp records both. Without this check the server
    // spent five seconds of CPU rebuilding an identical header on every
    // start, which under `tsx watch` means on every code change.
    const stamp = path.join(CPP_CACHE_DIR, 'prelude.stamp');
    const want = `${CXX}\n${cppCompileFlags().join(' ')}\n${CPP_PRELUDE}`;
    const built = path.join(CPP_CACHE_DIR, `${PRELUDE_FILE}.gch`);
    try {
      if (fs.existsSync(built) && fs.readFileSync(stamp, 'utf8') === want) return;
    } catch {
      // no stamp yet, or unreadable: rebuild
    }

    const started = Date.now();
    const result = await runProcess(
      CXX,
      [...cppCompileFlags(), '-x', 'c++-header', PRELUDE_FILE, '-o', `${PRELUDE_FILE}.gch`],
      { cwd: CPP_CACHE_DIR, timeoutMs: 120_000, env: toolchainEnv() },
    );
    if (result.code === 0) {
      fs.writeFileSync(stamp, want);
      console.log(`Precompiled the C++ prelude in ${((Date.now() - started) / 1000).toFixed(1)}s (builds are now about twice as fast).`);
    } else {
      // Not fatal: without the .gch, GCC parses the header as before.
      console.warn('Could not precompile the C++ prelude; builds will parse <bits/stdc++.h> each time.');
    }
  })();
  return preludeWarm;
}

interface ProcResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<ProcResult> {
  return new Promise((resolve) => {
    // detached → own process group, so on timeout we can kill the whole group
    // (§10: kill the process group, not just the child).
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    // Generous cap: ###CASE markers arrive interleaved with program output, so
    // a tight cap silently ate later markers and misreported passed cases.
    const cap = (s: string) => (s.length > 2_000_000 ? s.slice(0, 2_000_000) + '\n[output truncated]' : s);
    child.stdout.on('data', (d) => (stdout = cap(stdout + d)));
    child.stderr.on('data', (d) => (stderr = cap(stderr + d)));

    const timer = setTimeout(() => {
      timedOut = true;
      if (!child.pid) return;
      if (process.platform === 'win32') {
        // Negative-PID group kill is POSIX-only. child.kill would terminate
        // only the compiler driver and orphan its children (which burn CPU and
        // keep the output locked) — taskkill /T takes down the whole tree.
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () =>
          child.kill('SIGKILL'),
        );
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }, opts.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: stderr + `\n${err.message}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** Run one plan step, applying its ulimit wrapper where it asked for one. */
function runStep(step: Step, workDir: string): Promise<ProcResult> {
  if (step.ulimit) {
    const quoted = [step.cmd, ...step.args].map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
    return runProcess(SHELL, ['-c', `ulimit -f 1024; exec ${quoted}`], {
      cwd: workDir,
      timeoutMs: step.timeoutMs,
      env: step.env,
    });
  }
  return runProcess(step.cmd, step.args, { cwd: workDir, timeoutMs: step.timeoutMs, env: step.env });
}

function parseTestOutput(stdout: string, session: Session): { tests: TestsResult; programOutput: string } {
  const cases = session.problem?.tests ?? [];
  const results = new Map<number, boolean>();
  const failures: TestFailure[] = [];
  const programLines: string[] = [];

  let pendingFail: TestFailure | null = null;
  // MinGW's CRT writes text-mode CRLF even into pipes — split on \r?\n or the
  // anchored marker regexes never match on Windows and every case reads as
  // "crashed before it ran".
  for (const line of stdout.split(/\r?\n/)) {
    const caseMatch = line.match(/^###CASE (\d+) (PASS|FAIL)$/);
    if (caseMatch) {
      const index = Number(caseMatch[1]);
      if (index >= cases.length) continue; // harness bug — don't let stray markers inflate passed/total
      const passed = caseMatch[2] === 'PASS';
      results.set(index, passed);
      if (!passed) {
        pendingFail = {
          index,
          input: cases[index]?.input ?? '',
          expected: cases[index]?.expected ?? '',
          actual: '',
        };
        failures.push(pendingFail);
      }
      continue;
    }
    if (line.startsWith('###EXPECTED ') && pendingFail) {
      pendingFail.expected = line.slice('###EXPECTED '.length);
      continue;
    }
    if (line.startsWith('###ACTUAL ') && pendingFail) {
      pendingFail.actual = line.slice('###ACTUAL '.length);
      pendingFail = null; // consumed — stray later lines must not overwrite it
      continue;
    }
    if (line.startsWith('###')) continue; // ###DONE and anything stray
    programLines.push(line);
  }

  // Crash or timeout before all cases ran: flag the first case that never
  // reported, so the model and console both see where it died.
  if (results.size < cases.length) {
    for (let i = 0; i < cases.length; i++) {
      if (!results.has(i)) {
        failures.push({
          index: i,
          input: cases[i].input,
          expected: cases[i].expected,
          actual: '(crashed or timed out before this case ran)',
        });
        break;
      }
    }
  }

  const passed = [...results.values()].filter(Boolean).length;
  return {
    tests: { passed, total: cases.length, failures },
    programOutput: programLines.join('\n').trim(),
  };
}

function buildError(stderr: string): { build: BuildResult; tests: null } {
  return { build: { status: 'error', stderr, stdout: '' }, tests: null };
}

export async function compileAndRun(
  session: Session,
): Promise<{ build: BuildResult; tests: TestsResult | null }> {
  const language = session.language;
  const meta = languageMeta(language);

  if (!languageAvailable(language)) return buildError(missingToolchainMessage(language));

  const problem = session.problem;
  // A problem's harness is generated for one language. After a mid-problem
  // language switch it would no longer compile against the buffer, so say so
  // plainly instead of drowning the user in a foreign compiler's errors.
  if (problem && problem.tests.length && problem.language && problem.language !== language) {
    return buildError(
      `This problem's tests were generated for ${languageMeta(problem.language).label}, but the session is now in ${meta.label}.\n` +
        `Switch back to ${languageMeta(problem.language).label}, or load the problem again to regenerate it in ${meta.label}.`,
    );
  }

  const hasHarness = Boolean(problem && problem.harness && problem.tests.length);
  const workDir = path.join(os.tmpdir(), 'interviewlab', session.id, language);
  // A stale binary from a previous run must never be executed after a failed
  // compile: clear the directory each run.
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  if (language === 'cpp') {
    await probeCpp();
    void warmCppPrelude(); // fire and forget: a cold cache just means a slower build
  }

  let plan: RunPlan;
  try {
    plan = await RUNTIMES[language].plan({
      workDir,
      buffer: session.buffer,
      harness: hasHarness && problem ? problem.harness : null,
    });
  } catch (err) {
    return buildError(err instanceof Error ? err.message : String(err));
  }

  for (const file of plan.files) fs.writeFileSync(path.join(workDir, file.name), file.content);

  // Compiler and sanitizer output names files by their path on disk. The
  // candidate has never seen that directory, so strip it: a report should read
  // "solution.hpp:41", the way their editor does.
  const localise = (text: string) => text.split(workDir + path.sep).join('').split(workDir).join('');

  for (const step of plan.compile) {
    const result = await runStep(step, workDir);
    if (result.timedOut) {
      return buildError(`[compilation timed out after ${Math.round(step.timeoutMs / 1000)}s]`);
    }
    if (result.code === null && /ENOENT|not found/i.test(result.stderr)) {
      return buildError(missingToolchainMessage(language));
    }
    if (result.code !== 0) {
      // javac and friends put diagnostics on stderr; some tools use stdout.
      const diagnostics = [result.stderr, result.stdout].filter((s) => s.trim()).join('\n').trim();
      return buildError(localise(diagnostics));
    }
  }

  const exec = await runStep(plan.exec, workDir);

  let runtimeStderr = localise(exec.stderr).trim();
  if (exec.timedOut) {
    runtimeStderr = [runtimeStderr, `[execution timed out after ${Math.round(plan.exec.timeoutMs / 1000)}s, killed]`]
      .filter(Boolean)
      .join('\n');
  } else if (exec.code === null) {
    runtimeStderr = [runtimeStderr, '[program failed to launch]'].filter(Boolean).join('\n');
  } else if (exec.code !== 0) {
    runtimeStderr = [runtimeStderr, `[process exited with code ${exec.code}]`].filter(Boolean).join('\n');
  }

  if (hasHarness) {
    const { tests, programOutput } = parseTestOutput(exec.stdout, session);
    return { build: { status: 'ok', stderr: runtimeStderr, stdout: programOutput }, tests };
  }
  return {
    build: { status: 'ok', stderr: runtimeStderr, stdout: exec.stdout.replace(/\r\n/g, '\n').trim() },
    tests: null,
  };
}

/**
 * Which languages this machine can actually run, with the version string the
 * toolchain reports. Powers the setup doctor and the language picker.
 */
export async function toolchainReport(): Promise<
  { language: string; label: string; available: boolean; version: string | null; toolchain: string; install: string }[]
> {
  return Promise.all(
    LANGUAGES.map(async (meta) => {
      const runtime = RUNTIMES[meta.id];
      const tool = runtime.tool();
      if (!tool) {
        return { language: meta.id, label: meta.label, available: false, version: null, toolchain: meta.toolchain, install: meta.install };
      }
      const probeDir = path.join(os.tmpdir(), 'interviewlab');
      fs.mkdirSync(probeDir, { recursive: true });
      const result = await runProcess(tool, runtime.versionArgs, {
        cwd: probeDir,
        timeoutMs: 8_000,
        env: toolchainEnv(),
      });
      const version = `${result.stdout}\n${result.stderr}`.split('\n').map((l) => l.trim()).find(Boolean) ?? null;
      return {
        language: meta.id,
        label: meta.label,
        available: result.code === 0,
        version: result.code === 0 ? version : null,
        toolchain: meta.toolchain,
        install: meta.install,
      };
    }),
  );
}
