// The languages a session can be worked in — one registry shared by the
// client (picker, editor mode, pristine-buffer detection) and the server
// (runner, toolchain probe, problem generation).
//
// Adding a language means: an entry here, a runtime spec in
// server/src/languages.ts, and an intake environment in
// server/src/prompts/intake.ts. Nothing else is language-aware.

export type Language = 'cpp' | 'python' | 'java' | 'javascript' | 'typescript' | 'go' | 'rust';

export interface LanguageMeta {
  id: Language;
  /** Full name, e.g. for menus and docs. */
  label: string;
  /** Compact label for the in-workspace picker. */
  short: string;
  /** Monaco's language id (drives syntax highlighting and its own tooling). */
  monaco: string;
  /** Editor file extension, used in scratch dirs and messages. */
  ext: string;
  /** Human name of the toolchain the runner needs. */
  toolchain: string;
  /** What to install when it's missing — shown in setup and run errors. */
  install: string;
  /** Starting buffer for a session with no problem loaded yet. */
  defaultBuffer: string;
}

const HINT_TEXT = 'Paste a problem in the left pane to generate a stub and tests, or just write code here and press Ctrl/Cmd+Enter to run.';

export const LANGUAGES: LanguageMeta[] = [
  {
    id: 'python',
    label: 'Python',
    short: 'Py',
    monaco: 'python',
    ext: '.py',
    toolchain: 'Python 3.10+',
    install: 'Debian/Ubuntu: sudo apt install python3 · macOS: brew install python · Windows: python.org installer',
    defaultBuffer: `# ${HINT_TEXT}

print("hello")
`,
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    short: 'JS',
    monaco: 'javascript',
    ext: '.js',
    toolchain: 'Node.js 20+',
    install: 'Already installed: this app runs on Node.',
    defaultBuffer: `// CommonJS: the harness requires this file, so exported names are what it calls.
// ${HINT_TEXT}

console.log('hello');
`,
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    short: 'TS',
    monaco: 'typescript',
    ext: '.ts',
    toolchain: 'Node.js 20+ (TypeScript runs through the bundled tsx)',
    install: 'Already installed: this app runs on Node.',
    defaultBuffer: `// Types are stripped at run time (tsx), so type errors do not stop execution.
// ${HINT_TEXT}

console.log('hello');
`,
  },
  {
    id: 'java',
    label: 'Java',
    short: 'Java',
    monaco: 'java',
    ext: '.java',
    toolchain: 'JDK 17+ (javac and java)',
    install: 'Debian/Ubuntu: sudo apt install default-jdk · macOS: brew install openjdk · Windows: Temurin (adoptium.net)',
    defaultBuffer: `// Your code lives in Solution.java. The test harness calls into it.
// ${HINT_TEXT}

class Solution {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}
`,
  },
  {
    id: 'cpp',
    label: 'C++',
    short: 'C++',
    monaco: 'cpp',
    ext: '.cpp',
    toolchain: 'g++ (or clang++) with C++20 or newer',
    install: 'Debian/Ubuntu: sudo apt install g++ · macOS: xcode-select --install · Windows: MSYS2 (pacman -S mingw-w64-ucrt-x86_64-gcc)',
    defaultBuffer: `// Every standard header is pre-included and \`using namespace std\` is on
// (LeetCode-style) — your code needs no boilerplate.
// ${HINT_TEXT}

int main() {
    cout << "hello" << endl;
    return 0;
}
`,
  },
  {
    id: 'go',
    label: 'Go',
    short: 'Go',
    monaco: 'go',
    ext: '.go',
    toolchain: 'Go 1.21+',
    install: 'Debian/Ubuntu: sudo apt install golang · macOS: brew install go · Windows: go.dev/dl',
    defaultBuffer: `// package main, alongside the harness, so it calls your functions directly.
// ${HINT_TEXT}

package main

import "fmt"

func main() {
	fmt.Println("hello")
}
`,
  },
  {
    id: 'rust',
    label: 'Rust',
    short: 'Rust',
    monaco: 'rust',
    ext: '.rs',
    toolchain: 'Rust (rustc)',
    install: 'Any platform: rustup.rs · Debian/Ubuntu: sudo apt install rustc',
    defaultBuffer: `// Your code is a module the harness imports, so items it calls must be \`pub\`.
// ${HINT_TEXT}

fn main() {
    println!("hello");
}
`,
  },
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

export function languageMeta(id: Language): LanguageMeta {
  const meta = BY_ID.get(id);
  if (!meta) throw new Error(`Unknown language: ${id}`);
  return meta;
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && BY_ID.has(value as Language);
}

export const DEFAULT_LANGUAGE: Language = 'python';
