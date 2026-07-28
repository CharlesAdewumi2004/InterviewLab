import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuildResult, TestFailure, TestsResult } from '../../shared/protocol';
import type { Session } from './types.js';
import { BASH, CPP_PRELUDE, CXX, PRELUDE_FILE, PYTHON, toolchainEnv } from './toolchain.js';

const COMPILE_TIMEOUT_MS = 10_000;
const EXEC_TIMEOUT_MS = 5_000;

// Explicit .exe on Windows — MinGW output naming and extension-less
// execution are both unreliable outside an MSYS2 shell.
const EXE = process.platform === 'win32' ? 'prog.exe' : 'a.out';

// Toolchains differ: MSYS2 MinGW gcc ships no libasan/libubsan, and older
// gcc (e.g. Debian bookworm's gcc 12) spells C++23 as -std=c++2b. Probe once
// per server process with trivial compiles and adapt. Memoized as a promise
// so concurrent runs share one probe instead of racing in the same directory.
let cppProbe: Promise<{ stdFlag: string; sanitize: boolean }> | null = null;

function probeCpp(): Promise<{ stdFlag: string; sanitize: boolean }> {
  cppProbe ??= (async () => {
    const probeDir = path.join(os.tmpdir(), 'practice-ide', 'toolchain-probe');
    fs.mkdirSync(probeDir, { recursive: true });
    fs.writeFileSync(path.join(probeDir, 'p.cpp'), 'int main(){return 0;}\n');
    const opts = { cwd: probeDir, timeoutMs: COMPILE_TIMEOUT_MS, env: toolchainEnv() };

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
    return { stdFlag, sanitize: s.code === 0 };
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
        // only the g++ driver and orphan cc1plus/ld (which burn CPU and keep
        // prog.exe locked) — taskkill /T takes down the whole tree.
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

export async function compileAndRun(
  session: Session,
): Promise<{ build: BuildResult; tests: TestsResult | null }> {
  const workDir = path.join(os.tmpdir(), 'practice-ide', session.id);
  fs.mkdirSync(workDir, { recursive: true });
  if (session.language === 'python') return runPython(session, workDir);
  fs.writeFileSync(path.join(workDir, PRELUDE_FILE), CPP_PRELUDE);

  const problem = session.problem;
  const hasHarness = Boolean(problem && problem.harness && problem.tests.length);

  if (hasHarness && problem) {
    fs.writeFileSync(path.join(workDir, 'solution.hpp'), session.buffer);
    const harness = problem.harness.includes('solution.hpp')
      ? problem.harness
      : `#include "solution.hpp"\n${problem.harness}`;
    fs.writeFileSync(path.join(workDir, 'main.cpp'), harness);
  } else {
    // No problem loaded yet: compile the buffer as a standalone program.
    fs.writeFileSync(path.join(workDir, 'main.cpp'), session.buffer);
  }

  const { stdFlag, sanitize } = await probeCpp();
  const compile = await runProcess(
    CXX,
    [
      stdFlag,
      '-O2',
      '-Wall',
      '-Wextra',
      // LeetCode semantics: bits/stdc++.h + using namespace std, force-
      // included so buffer line numbers match diagnostics exactly.
      '-include',
      PRELUDE_FILE,
      ...(sanitize ? ['-fsanitize=address,undefined'] : []),
      '-o',
      EXE,
      'main.cpp',
    ],
    { cwd: workDir, timeoutMs: COMPILE_TIMEOUT_MS, env: toolchainEnv() },
  );

  if (compile.timedOut) {
    return { build: { status: 'error', stderr: '[compilation timed out after 10s]', stdout: '' }, tests: null };
  }
  if (compile.code === null && /ENOENT/.test(compile.stderr)) {
    const installHint =
      process.platform === 'win32'
        ? 'Install MSYS2 g++ (pacman -S mingw-w64-ucrt-x86_64-gcc)'
        : 'Install g++ (or clang++)';
    return {
      build: {
        status: 'error',
        stderr: `Compiler not found (tried: ${CXX}). ${installHint} or set CXX in .env to your compiler's full path.`,
        stdout: '',
      },
      tests: null,
    };
  }
  if (compile.code !== 0) {
    return { build: { status: 'error', stderr: compile.stderr.trim(), stdout: '' }, tests: null };
  }

  // ASan reserves ~20TB of virtual address space, so no ulimit -v — cap RSS
  // through ASan itself instead. Leak detection off to match LeetCode
  // semantics (linked-list problems "leak" by design).
  // On Windows the binary runs directly: ulimit doesn't work under MSYS2
  // bash there, and PATH (via toolchainEnv) must carry the runtime DLLs.
  const execEnv = {
    ...toolchainEnv(),
    ASAN_OPTIONS: 'hard_rss_limit_mb=512:detect_leaks=0',
    UBSAN_OPTIONS: 'print_stacktrace=1',
  };
  const exec =
    process.platform === 'win32'
      ? await runProcess(path.join(workDir, EXE), [], { cwd: workDir, timeoutMs: EXEC_TIMEOUT_MS, env: execEnv })
      : await runProcess(BASH, ['-c', `ulimit -f 1024; exec ./${EXE}`], {
          cwd: workDir,
          timeoutMs: EXEC_TIMEOUT_MS,
          env: execEnv,
        });

  let runtimeStderr = exec.stderr.trim();
  if (exec.timedOut) {
    runtimeStderr = [runtimeStderr, '[execution timed out after 5s — killed]'].filter(Boolean).join('\n');
  } else if (exec.code === null) {
    runtimeStderr = [runtimeStderr, '[program failed to launch]'].filter(Boolean).join('\n');
  } else if (exec.code !== 0) {
    runtimeStderr = [runtimeStderr, `[process exited with code ${exec.code}]`].filter(Boolean).join('\n');
  }

  if (hasHarness) {
    const { tests, programOutput } = parseTestOutput(exec.stdout, session);
    return {
      build: { status: 'ok', stderr: runtimeStderr, stdout: programOutput },
      tests,
    };
  }

  return {
    build: { status: 'ok', stderr: runtimeStderr, stdout: exec.stdout.replace(/\r\n/g, '\n').trim() },
    tests: null,
  };
}

// Python path: the buffer is solution.py, the harness is main.py (importing
// solution). "Compile" is py_compile — it surfaces syntax errors with real
// line numbers the same way the C++ build step does — and execution runs
// unbuffered (-u) so ###CASE markers survive a timeout kill.
const PY_EXEC_TIMEOUT_MS = 10_000; // interpreter startup + LeetCode-ish python allowance

async function runPython(
  session: Session,
  workDir: string,
): Promise<{ build: BuildResult; tests: TestsResult | null }> {
  const problem = session.problem;
  const hasHarness = Boolean(problem && problem.harness && problem.tests.length);

  const sources: string[] = [];
  if (hasHarness && problem) {
    fs.writeFileSync(path.join(workDir, 'solution.py'), session.buffer);
    const harness = problem.harness.includes('from solution import')
      ? problem.harness
      : `from solution import *\n${problem.harness}`;
    fs.writeFileSync(path.join(workDir, 'main.py'), harness);
    sources.push('solution.py', 'main.py');
  } else {
    fs.writeFileSync(path.join(workDir, 'main.py'), session.buffer);
    sources.push('main.py');
  }

  const compile = await runProcess(PYTHON, ['-m', 'py_compile', ...sources], {
    cwd: workDir,
    timeoutMs: COMPILE_TIMEOUT_MS,
    env: toolchainEnv(),
  });
  if (compile.code === null && /ENOENT/.test(compile.stderr)) {
    return {
      build: {
        status: 'error',
        stderr: `Python not found (tried: ${PYTHON}). Install Python 3 or set PYTHON in .env to your interpreter's full path.`,
        stdout: '',
      },
      tests: null,
    };
  }
  if (compile.code !== 0) {
    return { build: { status: 'error', stderr: compile.stderr.trim(), stdout: '' }, tests: null };
  }

  const exec = await runProcess(PYTHON, ['-u', 'main.py'], {
    cwd: workDir,
    timeoutMs: PY_EXEC_TIMEOUT_MS,
    env: toolchainEnv(),
  });

  let runtimeStderr = exec.stderr.trim();
  if (exec.timedOut) {
    runtimeStderr = [runtimeStderr, `[execution timed out after ${PY_EXEC_TIMEOUT_MS / 1000}s — killed]`]
      .filter(Boolean)
      .join('\n');
  } else if (exec.code !== null && exec.code !== 0) {
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
