import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Resolve toolchain binaries to absolute paths instead of trusting PATH:
// the dev server is often launched from a shell that doesn't have MSYS2 on
// PATH (plain PowerShell/cmd), where spawn('g++') dies with ENOENT.
// Resolution order: env override → PATH → well-known install locations.

const WIN = process.platform === 'win32';

// LeetCode semantics: every standard header is available and unqualified std
// names work, with zero boilerplate in the user's code. Force-included via
// `-include` (compiler) and fallbackFlags (clangd) so editor line numbers
// stay 1:1 with diagnostics — nothing is ever prepended to the buffer itself.
export const CPP_PRELUDE = '#pragma once\n#include <bits/stdc++.h>\nusing namespace std;\n';
export const PRELUDE_FILE = 'prelude.hpp';

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function onPath(exe: string): string | null {
  const exts = WIN ? ['.exe', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    // WSL's System32 bash.exe is not a usable POSIX shell for our purposes
    // (needs a distro, different filesystem view) — never pick it up.
    if (WIN && /\\system32\\?$/i.test(dir)) continue;
    for (const ext of exts) {
      const full = path.join(dir, exe + ext);
      if (isFile(full)) return full;
    }
  }
  return null;
}

const HOME = os.homedir();

/** Expand a `~/...` path against the current user's home directory. */
function home(rest: string): string {
  return path.join(HOME, rest);
}

/**
 * Resolve a tool: explicit env override, then PATH, then the well-known
 * install locations for this platform.
 *
 * The fallbacks matter more than they look. Toolchains installed the way their
 * own documentation recommends (rustup into ~/.cargo, the Go tarball into
 * /usr/local/go, a JDK unpacked into a home directory) are on an interactive
 * shell's PATH but not on the PATH of a server started from a desktop
 * launcher, a systemd unit, or a plain PowerShell window. Without this, Run
 * reports "not installed" for a toolchain sitting right there.
 */
function resolveTool(envVar: string, exe: string, fallbacks: string[]): string | null {
  const override = process.env[envVar];
  if (override) return override;
  return onPath(exe) ?? fallbacks.find(isFile) ?? null;
}

/** C++ compiler. Falls back to bare 'g++' so the error stays legible if truly absent. */
export const CXX =
  resolveTool('CXX', 'g++', [
    'C:/msys64/ucrt64/bin/g++.exe',
    'C:/msys64/mingw64/bin/g++.exe',
    '/usr/bin/g++',
    '/opt/homebrew/bin/g++',
    '/usr/local/bin/g++',
  ]) ?? 'g++';

/** False when no C++ compiler could be found at all (CXX then holds the bare
 * name, so the error message stays legible). Drives the setup doctor. */
export const CXX_FOUND = path.isAbsolute(CXX);

/** POSIX shell for running compiled binaries under ulimit. */
export const BASH =
  resolveTool('BASH', 'bash', [
    'C:/msys64/usr/bin/bash.exe',
    'C:/Program Files/Git/usr/bin/bash.exe',
    'C:/Program Files/Git/bin/bash.exe',
  ]) ?? 'bash';

/** clangd language server — null means semantic completion is unavailable. */
export const CLANGD = resolveTool('CLANGD', 'clangd', [
  'C:/msys64/ucrt64/bin/clangd.exe',
  'C:/msys64/mingw64/bin/clangd.exe',
  'C:/Program Files/LLVM/bin/clangd.exe',
  '/usr/bin/clangd',
  '/opt/homebrew/bin/clangd',
  '/usr/local/bin/clangd',
]);

// A JDK unpacked by hand, or installed by a version manager, is the common
// case on developer machines; JAVA_HOME is checked first when it is set.
function jdkPaths(exe: string): string[] {
  const javaHome = process.env.JAVA_HOME;
  return [
    ...(javaHome ? [path.join(javaHome, 'bin', exe)] : []),
    home(`.local/toolchains/jdk/bin/${exe}`),
    home(`.sdkman/candidates/java/current/bin/${exe}`),
    `/usr/lib/jvm/default-java/bin/${exe}`,
    `/opt/java/openjdk/bin/${exe}`,
    `/usr/local/opt/openjdk/bin/${exe}`,
    `/opt/homebrew/opt/openjdk/bin/${exe}`,
    'C:/Program Files/Java/jdk/bin/' + exe + '.exe',
    'C:/Program Files/Eclipse Adoptium/jdk/bin/' + exe + '.exe',
  ];
}

/** JDK compiler, for Java sessions. Null means Java practice is unavailable. */
export const JAVAC = resolveTool('JAVAC', 'javac', jdkPaths('javac'));

/** JVM launcher, paired with JAVAC (a JDK ships both). */
export const JAVA = resolveTool('JAVA', 'java', jdkPaths('java'));

/** Go toolchain. Null means Go practice is unavailable. */
export const GO = resolveTool('GO', 'go', [
  '/usr/local/go/bin/go',
  home('.local/toolchains/go/bin/go'),
  home('go/bin/go'),
  '/opt/go/bin/go',
  '/opt/homebrew/bin/go',
  '/snap/bin/go',
  'C:/Program Files/Go/bin/go.exe',
  'C:/Go/bin/go.exe',
]);

/** Rust compiler. Null means Rust practice is unavailable. */
export const RUSTC = resolveTool('RUSTC', 'rustc', [
  // rustup's default home, which is exactly where the official installer puts
  // it and exactly what a non-login shell does not have on PATH.
  home('.cargo/bin/rustc'),
  '/usr/local/bin/rustc',
  '/opt/homebrew/bin/rustc',
  `${process.env.USERPROFILE ?? ''}/.cargo/bin/rustc.exe`,
]);

/** The Node binary running this server — JavaScript practice always works. */
export const NODE = process.execPath;

/**
 * The bundled tsx CLI, which runs TypeScript directly (transpile-only). It is
 * a runtime dependency of the server, so resolving it through Node's own
 * resolver works in dev and in the pruned production image alike.
 */
export const TSX_CLI = ((): string | null => {
  try {
    const pkg = createRequire(import.meta.url).resolve('tsx/package.json');
    const cli = path.join(path.dirname(pkg), 'dist', 'cli.mjs');
    return isFile(cli) ? cli : null;
  } catch {
    return null;
  }
})();

/** Python interpreter. Windows installs name it `python` (or the `py` launcher); POSIX is `python3`. */
export const PYTHON =
  process.env.PYTHON ??
  onPath(WIN ? 'python' : 'python3') ??
  onPath('python3') ??
  onPath('python') ??
  onPath('py') ??
  ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3'].find(isFile) ??
  (WIN ? 'python' : 'python3');

/** False when no Python interpreter could be found (PYTHON holds a bare name). */
export const PYTHON_FOUND = path.isAbsolute(PYTHON);

// Windows env blocks are case-insensitive but node spreads them as plain
// objects — writing 'PATH' next to an existing 'Path' key would put two PATH
// entries in the child env. Reuse whatever casing the parent env has.
const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';

// Compiled binaries need the compiler's runtime DLLs (libstdc++-6.dll etc.)
// at execution time, and they're resolved via PATH on Windows. Prepend the
// toolchain's bin dir so child processes are self-sufficient.
export function toolchainEnv(): NodeJS.ProcessEnv {
  if (!path.isAbsolute(CXX)) return {};
  return { [PATH_KEY]: `${path.dirname(CXX)}${path.delimiter}${process.env.PATH ?? ''}` };
}

/**
 * The GCC installation clangd should build against, e.g.
 * `/usr/lib/gcc/x86_64-linux-gnu/15`. Probed from CXX itself rather than left
 * to clang's own detection: clang picks the highest-numbered directory under
 * /usr/lib/gcc/<triple>/, and distros ship runtime-only stubs for a newer GCC
 * (crtbegin.o and friends, no headers) alongside the real one. When that stub
 * wins, every libstdc++ header — <bits/stdc++.h> included — resolves to
 * nothing and completion silently returns zero results while g++ still
 * compiles fine. Null when the probe fails; clang then falls back to its own
 * detection, which is correct on any machine with a single GCC.
 */
export const GCC_INSTALL_DIR = ((): string | null => {
  try {
    const out = execFileSync(CXX, ['-print-search-dirs'], {
      encoding: 'utf8',
      timeout: 5_000,
      env: { ...process.env, ...toolchainEnv() },
    });
    const line = out.split(/\r?\n/).find((l) => l.startsWith('install:'));
    if (!line) return null;
    const dir = path.normalize(line.slice('install:'.length).trim());
    return isDir(dir) ? dir : null;
  } catch {
    return null; // not gcc (clang++ ignores this), or not runnable — harmless
  }
})();
