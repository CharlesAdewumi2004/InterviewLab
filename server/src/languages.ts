import os from 'node:os';
import path from 'node:path';
import { type Language, languageMeta } from '../../shared/languages';
import {
  BASH,
  CPP_PRELUDE,
  CXX,
  CXX_FOUND,
  GO,
  JAVA,
  JAVAC,
  NODE,
  PRELUDE_FILE,
  PYTHON,
  PYTHON_FOUND,
  RUSTC,
  TSX_CLI,
  toolchainEnv,
} from './toolchain.js';

// How each language is turned into files on disk and then into processes.
// The runner knows nothing language-specific: it asks for a RunPlan and
// executes it. Adding a language is adding a RUNTIMES entry (plus its
// registry entry in shared/languages.ts and its intake environment in
// prompts/intake.ts).

export interface Step {
  cmd: string;
  args: string[];
  timeoutMs: number;
  /** Extra environment for this step, merged over the parent env. */
  env?: NodeJS.ProcessEnv;
  /** Run through `bash -c` with this ulimit prelude (POSIX only). */
  ulimit?: boolean;
}

export interface RunPlan {
  files: { name: string; content: string }[];
  /** Syntax/compile checks. A non-zero exit here is reported as a build error. */
  compile: Step[];
  exec: Step;
}

export interface LanguageRuntime {
  /** Absolute path (or bare name) of the primary binary, for the doctor. */
  tool: () => string | null;
  /** Arguments that print a version — the doctor uses this as a liveness probe. */
  versionArgs: string[];
  /** Build the file layout and commands for one run. */
  plan: (opts: PlanInput) => Promise<RunPlan> | RunPlan;
}

export interface PlanInput {
  workDir: string;
  /** The candidate's editor buffer. */
  buffer: string;
  /** The generated test harness, or null when running the buffer standalone. */
  harness: string | null;
}

const COMPILE_TIMEOUT_MS = 15_000;
const JVM_COMPILE_TIMEOUT_MS = 40_000;
const NATIVE_COMPILE_TIMEOUT_MS = 60_000;
const EXEC_TIMEOUT_MS = 5_000;
const INTERPRETED_EXEC_TIMEOUT_MS = 10_000;

// Explicit .exe on Windows — MinGW output naming and extension-less execution
// are both unreliable outside an MSYS2 shell.
const WIN = process.platform === 'win32';
export const EXE = WIN ? 'prog.exe' : 'a.out';

/** Prefix `harness` with `line` unless it already contains it. */
function withPrefix(harness: string, marker: string, line: string): string {
  return harness.includes(marker) ? harness : `${line}\n${harness}`;
}

// --- C++ ---------------------------------------------------------------------

// Toolchains differ: MSYS2 MinGW gcc ships no libasan/libubsan, and older gcc
// (e.g. Debian bookworm's gcc 12) spells C++23 as -std=c++2b. Probed once per
// server process by the runner, which owns process spawning; the result is
// injected here through setCppFlags.
let cppFlags: { stdFlag: string; sanitize: boolean } = { stdFlag: '-std=c++20', sanitize: false };
export function setCppFlags(flags: { stdFlag: string; sanitize: boolean }): void {
  cppFlags = flags;
}

/**
 * Where the LeetCode prelude and its precompiled header live, shared across
 * runs and sessions.
 *
 * Parsing <bits/stdc++.h> is most of a C++ build here: about two seconds per
 * Run, every Run. Precompiling it once takes that to one second, which is the
 * difference between a build you wait through and one you do not. The header
 * must be found through this directory rather than the work directory, because
 * GCC only uses a .gch that sits beside the header it resolved.
 */
export const CPP_CACHE_DIR = path.join(os.tmpdir(), 'interviewlab', 'cpp-prelude');

/** The exact flags the prelude's precompiled header must be built with. */
export function cppCompileFlags(): string[] {
  return [
    cppFlags.stdFlag,
    '-O2',
    // Debug info is what turns an AddressSanitizer report from a hex address
    // into "solution.hpp:41", which is the whole point of running with
    // sanitizers during practice.
    '-g',
    '-Wall',
    '-Wextra',
    ...(cppFlags.sanitize ? ['-fsanitize=address,undefined'] : []),
  ];
}

const CPP: LanguageRuntime = {
  tool: () => (CXX_FOUND ? CXX : null),
  versionArgs: ['--version'],
  plan({ buffer, harness, workDir }) {
    // The prelude is NOT written here: it lives in CPP_CACHE_DIR next to its
    // precompiled header, and a copy in the work directory would shadow it.
    const files: RunPlan['files'] = [];
    if (harness) {
      files.push({ name: 'solution.hpp', content: buffer });
      files.push({ name: 'main.cpp', content: withPrefix(harness, 'solution.hpp', '#include "solution.hpp"') });
    } else {
      files.push({ name: 'main.cpp', content: buffer });
    }
    return {
      files,
      compile: [
        {
          cmd: CXX,
          args: [
            ...cppCompileFlags(),
            // LeetCode semantics: bits/stdc++.h and using namespace std, force
            // included so buffer line numbers match diagnostics exactly. -I
            // points at the cache so the precompiled header is picked up.
            '-I',
            CPP_CACHE_DIR,
            '-include',
            PRELUDE_FILE,
            '-o',
            EXE,
            'main.cpp',
          ],
          timeoutMs: COMPILE_TIMEOUT_MS,
          env: toolchainEnv(),
        },
      ],
      exec: {
        cmd: WIN ? path.join(workDir, EXE) : `./${EXE}`,
        args: [],
        timeoutMs: EXEC_TIMEOUT_MS,
        // ASan reserves ~20TB of virtual address space, so no ulimit -v — cap
        // RSS through ASan itself. Leak detection off to match LeetCode
        // semantics (linked-list problems "leak" by design).
        env: {
          ...toolchainEnv(),
          ASAN_OPTIONS: 'hard_rss_limit_mb=512:detect_leaks=0',
          UBSAN_OPTIONS: 'print_stacktrace=1',
        },
        ulimit: !WIN,
      },
    };
  },
};

// --- Python ------------------------------------------------------------------

const PYTHON_RT: LanguageRuntime = {
  tool: () => (PYTHON_FOUND ? PYTHON : null),
  versionArgs: ['--version'],
  plan({ buffer, harness }) {
    const files: RunPlan['files'] = [];
    const sources: string[] = [];
    if (harness) {
      files.push({ name: 'solution.py', content: buffer });
      files.push({ name: 'main.py', content: withPrefix(harness, 'from solution import', 'from solution import *') });
      sources.push('solution.py', 'main.py');
    } else {
      files.push({ name: 'main.py', content: buffer });
      sources.push('main.py');
    }
    return {
      files,
      // py_compile surfaces syntax errors with real line numbers, the same way
      // the C++ build step does.
      compile: [{ cmd: PYTHON, args: ['-m', 'py_compile', ...sources], timeoutMs: COMPILE_TIMEOUT_MS, env: toolchainEnv() }],
      // -u so ###CASE markers survive a timeout kill.
      exec: { cmd: PYTHON, args: ['-u', 'main.py'], timeoutMs: INTERPRETED_EXEC_TIMEOUT_MS, env: toolchainEnv() },
    };
  },
};

// --- JavaScript / TypeScript -------------------------------------------------

function nodeStylePlan(ext: 'js' | 'ts', { buffer, harness }: PlanInput): RunPlan {
  const files: RunPlan['files'] = [];
  if (harness) {
    files.push({ name: `solution.${ext}`, content: buffer });
    files.push({
      name: `main.${ext}`,
      // The generated harness normally imports the buffer itself; the prefix
      // is a safety net for a harness that forgot to.
      content: withPrefix(
        harness,
        './solution',
        ext === 'js' ? "const solution = require('./solution');" : "import * as solution from './solution';",
      ),
    });
  } else {
    files.push({ name: `main.${ext}`, content: buffer });
  }
  const runner: Step =
    ext === 'js'
      ? { cmd: NODE, args: ['main.js'], timeoutMs: INTERPRETED_EXEC_TIMEOUT_MS }
      : { cmd: NODE, args: [TSX_CLI ?? '', 'main.ts'], timeoutMs: INTERPRETED_EXEC_TIMEOUT_MS };
  return {
    files,
    // `node --check` gives JavaScript the same "build error with line numbers"
    // step the compiled languages have. tsx transpiles without type checking,
    // so TypeScript has no equivalent pre-pass — syntax errors surface at run.
    compile: ext === 'js' ? files.map((f) => ({ cmd: NODE, args: ['--check', f.name], timeoutMs: COMPILE_TIMEOUT_MS })) : [],
    exec: runner,
  };
}

const JAVASCRIPT: LanguageRuntime = {
  tool: () => NODE,
  versionArgs: ['--version'],
  plan: (input) => nodeStylePlan('js', input),
};

const TYPESCRIPT: LanguageRuntime = {
  // TypeScript needs Node plus the bundled tsx; Node is always present here,
  // so tsx is the only thing that can be missing.
  tool: () => (TSX_CLI ? NODE : null),
  versionArgs: ['--version'],
  plan: (input) => nodeStylePlan('ts', input),
};

// --- Java --------------------------------------------------------------------

/**
 * javac requires a public class's file to be named after it, so the buffer's
 * own declaration decides the filename. LeetCode-style stubs use a
 * package-private `class Solution`, which lands on the Solution.java default.
 */
function javaSourceName(buffer: string): string {
  const publicClass = buffer.match(/\bpublic\s+(?:final\s+|abstract\s+)?(?:class|interface|enum|record)\s+(\w+)/);
  if (publicClass) return `${publicClass[1]}.java`;
  return 'Solution.java';
}

/** The class to launch when running a buffer with no harness: the one with a main. */
function javaEntryClass(buffer: string, fallback: string): string {
  const types = [...buffer.matchAll(/\b(?:class|record|enum)\s+(\w+)/g)];
  for (const match of types) {
    const start = match.index ?? 0;
    const next = types.find((t) => (t.index ?? 0) > start);
    const body = buffer.slice(start, next?.index ?? buffer.length);
    if (/static\s+void\s+main\s*\(/.test(body)) return match[1];
  }
  return fallback;
}

const JAVA_RT: LanguageRuntime = {
  tool: () => JAVAC,
  versionArgs: ['-version'],
  plan({ buffer, harness }) {
    const sourceName = javaSourceName(buffer);
    const files: RunPlan['files'] = [{ name: sourceName, content: buffer }];
    let entry: string;
    if (harness) {
      files.push({ name: 'Main.java', content: harness });
      entry = 'Main';
    } else {
      entry = javaEntryClass(buffer, path.basename(sourceName, '.java'));
    }
    return {
      files,
      compile: [
        {
          cmd: JAVAC ?? 'javac',
          args: ['-nowarn', '-d', '.', ...files.map((f) => f.name)],
          timeoutMs: JVM_COMPILE_TIMEOUT_MS,
        },
      ],
      exec: {
        cmd: JAVA ?? 'java',
        // -XX:+UseSerialGC and a small heap keep a runaway solution from eating
        // the host: the JVM otherwise sizes its heap from total machine RAM.
        args: ['-XX:+UseSerialGC', '-Xmx512m', '-XX:TieredStopAtLevel=1', '-cp', '.', entry],
        timeoutMs: INTERPRETED_EXEC_TIMEOUT_MS,
      },
    };
  },
};

// --- Go ----------------------------------------------------------------------

const GO_MOD = 'module practice\n\ngo 1.21\n';

const GO_RT: LanguageRuntime = {
  tool: () => GO,
  versionArgs: ['version'],
  plan({ buffer, harness, workDir }) {
    const files: RunPlan['files'] = [{ name: 'go.mod', content: GO_MOD }];
    if (harness) {
      files.push({ name: 'solution.go', content: buffer });
      files.push({ name: 'main.go', content: harness });
    } else {
      files.push({ name: 'main.go', content: buffer });
    }
    // Go insists on a writable cache and a HOME; a server running as a daemon
    // may have neither, so both are pinned inside the session's work dir.
    const env: NodeJS.ProcessEnv = {
      HOME: workDir,
      // Shared across runs (the per-run work dir is wiped): a cold Go build
      // cache costs seconds on every single Run.
      GOCACHE: path.join(os.tmpdir(), 'interviewlab', 'gocache'),
      GOPATH: path.join(os.tmpdir(), 'interviewlab', 'gopath'),
      GOFLAGS: '-mod=mod',
      GO111MODULE: 'on',
      GOTOOLCHAIN: 'local',
    };
    return {
      files,
      compile: [{ cmd: GO ?? 'go', args: ['build', '-o', EXE, '.'], timeoutMs: NATIVE_COMPILE_TIMEOUT_MS, env }],
      exec: {
        cmd: WIN ? path.join(workDir, EXE) : `./${EXE}`,
        args: [],
        timeoutMs: EXEC_TIMEOUT_MS,
        env,
        ulimit: !WIN,
      },
    };
  },
};

// --- Rust --------------------------------------------------------------------

const RUST: LanguageRuntime = {
  tool: () => RUSTC,
  versionArgs: ['--version'],
  plan({ buffer, harness, workDir }) {
    const files: RunPlan['files'] = [];
    if (harness) {
      files.push({ name: 'solution.rs', content: buffer });
      files.push({ name: 'main.rs', content: withPrefix(harness, 'mod solution;', 'mod solution;\nuse solution::*;') });
    } else {
      files.push({ name: 'main.rs', content: buffer });
    }
    return {
      files,
      compile: [
        {
          cmd: RUSTC ?? 'rustc',
          // -O for realistic timings; the edition matters for idiomatic code.
          args: ['-O', '--edition', '2021', '-A', 'dead_code', '-o', EXE, 'main.rs'],
          timeoutMs: NATIVE_COMPILE_TIMEOUT_MS,
        },
      ],
      exec: {
        cmd: WIN ? path.join(workDir, EXE) : `./${EXE}`,
        args: [],
        timeoutMs: EXEC_TIMEOUT_MS,
        ulimit: !WIN,
      },
    };
  },
};

export const RUNTIMES: Record<Language, LanguageRuntime> = {
  cpp: CPP,
  python: PYTHON_RT,
  javascript: JAVASCRIPT,
  typescript: TYPESCRIPT,
  java: JAVA_RT,
  go: GO_RT,
  rust: RUST,
};

/** Shell used to apply ulimit around native binaries (POSIX only). */
export const SHELL = BASH;

/**
 * Message shown when a language's toolchain is missing. Names the binary that
 * was looked for and how to install it, so a fresh machine is one apt/brew
 * line away from working.
 */
export function missingToolchainMessage(language: Language): string {
  const meta = languageMeta(language);
  return [
    `${meta.label} is not set up on this machine. The runner needs ${meta.toolchain}.`,
    `Install it: ${meta.install}`,
    'Then restart the server. Other languages keep working in the meantime.',
  ].join('\n');
}

/** True when this machine can actually run the language. */
export function languageAvailable(language: Language): boolean {
  return RUNTIMES[language].tool() !== null;
}
