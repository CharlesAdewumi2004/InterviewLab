import type { Language } from '../../../shared/protocol';

// The setup doctor's view of this machine, and the practising candidate's
// profile. Both are plain JSON endpoints — see server/src/index.ts.

export interface ToolchainRow {
  language: Language;
  label: string;
  available: boolean;
  version: string | null;
  toolchain: string;
  install: string;
}

export interface SetupStatus {
  model: { linked: boolean; via: 'token' | 'claude-code-login' | null };
  languages: ToolchainRow[];
  clangd: { available: boolean; path: string | null };
  storage: { sessionsDir: string; writable: boolean };
  voice: { note: string };
}

export interface Profile {
  name: string;
  targetRole: string;
  level: 'intern' | 'new-grad' | 'mid' | 'senior' | 'staff';
  targetCompany: string;
  notes: string;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export const fetchSetup = () => json<SetupStatus>('/api/setup');

// Toolchain availability is stable for the life of the server process, and
// several components want it — probe once per page load and share the result.
let cachedStatus: Promise<SetupStatus> | null = null;
export const cachedSetup = (): Promise<SetupStatus> => (cachedStatus ??= fetchSetup());

export const probeModel = () => json<{ ok: boolean; detail: string; model: string }>('/api/setup/probe', { method: 'POST' });

export const fetchProfile = () => json<Profile>('/api/profile');

export const saveProfile = (profile: Profile) =>
  json<Profile>('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
