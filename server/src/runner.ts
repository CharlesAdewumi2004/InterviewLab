import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuildResult, TestFailure, TestsResult } from '../../shared/protocol';
import type { Session } from './types.js';
import { EXE, RUNTIMES, SHELL, type RunPlan, type Step, languageAvailable, missingToolchainMessage, setCppFlags } from './languages.js';
import { LANGUAGES, languageMeta } from '../../shared/languages';
import { CXX, toolchainEnv } from './toolchain.js';

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
    if (s.code !== 0) console.warn(`ASan/UBSan unavailable with ${CXX} — compiling without sanitizers.`);
    setCppFlags({ stdFlag, sanitize: s.code === 0 });
  })();
  return cppProbe;
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

  if (language === 'cpp') await probeCpp();

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
      return buildError([result.stderr, result.stdout].filter((s) => s.trim()).join('\n').trim());
    }
  }

  const exec = await runStep(plan.exec, workDir);

  let runtimeStderr = exec.stderr.trim();
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
