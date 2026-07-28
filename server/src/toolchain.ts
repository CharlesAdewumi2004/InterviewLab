import fs from 'node:fs';
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

function resolveTool(envVar: string, exe: string, winFallbacks: string[]): string | null {
  const override = process.env[envVar];
  if (override) return override;
  return onPath(exe) ?? (WIN ? winFallbacks.find(isFile) ?? null : null);
}

/** C++ compiler. Falls back to bare 'g++' so the error stays legible if truly absent. */
export const CXX =
  resolveTool('CXX', 'g++', ['C:/msys64/ucrt64/bin/g++.exe', 'C:/msys64/mingw64/bin/g++.exe']) ?? 'g++';

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
]);

/** Python interpreter. Windows installs name it `python` (or the `py` launcher); POSIX is `python3`. */
export const PYTHON =
  process.env.PYTHON ??
  onPath(WIN ? 'python' : 'python3') ??
  onPath('python3') ??
  onPath('python') ??
  onPath('py') ??
  (WIN ? 'python' : 'python3');

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
