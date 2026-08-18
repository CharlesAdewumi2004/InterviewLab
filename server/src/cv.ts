import fs from 'node:fs';
import path from 'node:path';
import { SESSIONS_DIR } from './session.js';

// The candidate's CV: uploaded once (PDF or plain text), extracted to text,
// stored locally (git-ignored) and injected into the behavioral/Bloomberg
// personas' context so the interviewer has actually "read the resume".

const CV_PATH = path.join(SESSIONS_DIR, 'cv.txt');
// Enough for any real CV; keeps the system prompt sane if someone uploads a
// 40-page portfolio.
const MAX_CHARS = 15_000;

let cached: string | null | undefined; // undefined = not yet loaded from disk

export function getCv(): string | null {
  if (cached === undefined) {
    try {
      cached = fs.readFileSync(CV_PATH, 'utf8');
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function setCv(text: string): { chars: number } {
  const clean = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_CHARS);
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(CV_PATH, clean);
  cached = clean;
  return { chars: clean.length };
}

export function clearCv(): void {
  cached = null;
  try {
    fs.rmSync(CV_PATH);
  } catch {
    // never existed — fine
  }
}

export function cvStatus(): { present: boolean; chars: number; preview: string; updatedAt: number | null } {
  const cv = getCv();
  if (!cv) return { present: false, chars: 0, preview: '', updatedAt: null };
  let updatedAt: number | null = null;
  try {
    updatedAt = Math.round(fs.statSync(CV_PATH).mtimeMs);
  } catch {
    // stat is cosmetic
  }
  return { present: true, chars: cv.length, preview: cv.slice(0, 180), updatedAt };
}
