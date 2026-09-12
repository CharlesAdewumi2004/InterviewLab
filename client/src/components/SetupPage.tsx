import { useEffect, useState } from 'react';
import {
  fetchProfile,
  fetchSetup,
  probeModel,
  saveProfile,
  type Profile,
  type SetupStatus,
} from '../lib/setup';
import CvWidget from './CvWidget';

interface Props {
  onCvUpdated: () => void;
}

const LEVELS: { value: Profile['level']; label: string }[] = [
  { value: 'intern', label: 'Internship' },
  { value: 'new-grad', label: 'New grad / early career' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff+' },
];

function Copyable({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded bg-neutral-950 px-2.5 py-1.5 font-mono text-xs text-neutral-300">
        {command}
      </code>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(command).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => setCopied(false),
          );
        }}
        className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:bg-neutral-800"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 px-5 py-3">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? 'bg-green-500' : warn ? 'bg-amber-500' : 'bg-neutral-600';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

const inputClass =
  'w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-blue-600 focus:outline-none';

// First-run home base: is this machine ready, and who is practising. Every
// failing check carries the exact command that fixes it.
export default function SetupPage({ onCvUpdated }: Props) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; detail: string }>({
    state: 'idle',
    detail: '',
  });

  const [profile, setProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSetup().then(setStatus, (err: Error) => setStatusError(err.message));
    fetchProfile().then(setProfile, () => setProfile(null));
  }, []);

  const runProbe = () => {
    setProbe({ state: 'running', detail: '' });
    probeModel().then(
      (r) => setProbe({ state: r.ok ? 'ok' : 'fail', detail: r.detail }),
      (err: Error) => setProbe({ state: 'fail', detail: err.message }),
    );
  };

  const persist = (next: Profile) => {
    setProfile(next);
    setSaving(true);
    setSaved(false);
    saveProfile(next)
      .then(() => setSaved(true))
      .catch(() => setSaved(false))
      .finally(() => setSaving(false));
  };

  const ready = status?.languages.filter((l) => l.available) ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-100">Setup</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Two things make this work: a linked Claude account for the interviewer, and a toolchain for whichever
          language you practise in. Everything here stays on this machine.
        </p>

        {statusError && (
          <p className="mt-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            Could not reach the server ({statusError}). Is it still running?
          </p>
        )}

        <Section
          title="1 · Claude account"
          subtitle="Interviewer, problem generation and grading all run on your own Claude subscription — no API key, no per-token billing."
        >
          <div className="flex items-center gap-2 text-sm">
            <Dot ok={status?.model.linked === true} warn={status?.model.linked === false} />
            <span className="text-neutral-200">
              {status === null
                ? 'Checking…'
                : status.model.linked
                  ? status.model.via === 'token'
                    ? 'Linked with a subscription token (CLAUDE_CODE_OAUTH_TOKEN).'
                    : 'Linked through the Claude Code login on this machine.'
                  : 'Not linked yet — model calls will fail until you do one of the two below.'}
            </span>
          </div>

          {status !== null && !status.model.linked && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="text-xs font-medium text-neutral-300">Option A — log in once (simplest)</div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Install Claude Code, run it, and sign in with your Claude account. This app then reuses that login.
                </p>
                <Copyable command="npm install -g @anthropic-ai/claude-code && claude" />
                <p className="mt-1 text-[11px] text-neutral-600">Then type /login inside Claude Code.</p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="text-xs font-medium text-neutral-300">Option B — a token (headless / Docker)</div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Mint a long-lived subscription token and put it in <code className="text-neutral-400">.env</code> as{' '}
                  <code className="text-neutral-400">CLAUDE_CODE_OAUTH_TOKEN=…</code>, then restart the server.
                </p>
                <Copyable command="claude setup-token" />
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={runProbe}
              disabled={probe.state === 'running'}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-40"
            >
              {probe.state === 'running' ? 'Testing…' : 'Test connection'}
            </button>
            {probe.state === 'ok' && <span className="text-xs text-green-400">Model replied — you are good to go.</span>}
            {probe.state === 'fail' && (
              <span className="max-w-[28rem] text-xs text-red-400">Failed: {probe.detail}</span>
            )}
            {probe.state === 'idle' && (
              <span className="text-xs text-neutral-600">Runs one tiny request to confirm it really works.</span>
            )}
          </div>
        </Section>

        <Section
          title="2 · Languages"
          subtitle="Practise in any language whose toolchain is installed. Everything else in the app works regardless."
        >
          {status === null ? (
            <p className="text-sm text-neutral-500">Checking your toolchains…</p>
          ) : (
            <>
              <ul className="divide-y divide-neutral-800">
                {status.languages.map((l) => (
                  <li key={l.language} className="flex items-start gap-3 py-2.5">
                    <span className="pt-1.5">
                      <Dot ok={l.available} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-neutral-200">{l.label}</span>
                        <span className="truncate text-[11px] text-neutral-600">{l.version ?? l.toolchain}</span>
                      </div>
                      {!l.available && <p className="mt-0.5 text-xs text-neutral-500">{l.install}</p>}
                    </div>
                    <span className={`shrink-0 text-xs ${l.available ? 'text-green-400' : 'text-neutral-600'}`}>
                      {l.available ? 'ready' : 'not installed'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-neutral-600">
                {ready.length} of {status.languages.length} ready. Install a toolchain and restart the server to pick
                it up.
              </p>
            </>
          )}
        </Section>

        <Section title="3 · Who is practising" subtitle="Optional, but it calibrates the level bar and makes the behavioral round specific to you.">
          {profile === null ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-neutral-400">Name</span>
                <input
                  className={`mt-1 ${inputClass}`}
                  value={profile.name}
                  placeholder="What the interviewer calls you"
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  onBlur={() => persist(profile)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-400">Target role</span>
                <input
                  className={`mt-1 ${inputClass}`}
                  value={profile.targetRole}
                  placeholder="e.g. Backend Engineer"
                  onChange={(e) => setProfile({ ...profile, targetRole: e.target.value })}
                  onBlur={() => persist(profile)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-400">Level</span>
                <select
                  className={`mt-1 ${inputClass}`}
                  value={profile.level}
                  onChange={(e) => persist({ ...profile, level: e.target.value as Profile['level'] })}
                >
                  {LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-neutral-400">Target company (optional)</span>
                <input
                  className={`mt-1 ${inputClass}`}
                  value={profile.targetCompany}
                  placeholder="Leave blank for a company-neutral loop"
                  onChange={(e) => setProfile({ ...profile, targetCompany: e.target.value })}
                  onBlur={() => persist(profile)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-neutral-400">
                  Anything the interviewer should know (weak spots, domain, projects to probe)
                </span>
                <textarea
                  className={`mt-1 h-24 resize-y ${inputClass}`}
                  value={profile.notes}
                  placeholder="I keep fumbling graph problems under time pressure. Probe my payments work hard."
                  onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
                  onBlur={() => persist(profile)}
                />
              </label>
              <div className="sm:col-span-2 text-xs text-neutral-600">
                {saving ? 'Saving…' : saved ? 'Saved.' : 'Changes save when you leave a field.'}
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-neutral-800 pt-4">
            <div className="text-xs font-medium text-neutral-300">Your CV</div>
            <p className="mb-2 mt-0.5 text-xs text-neutral-500">
              Behavioral and full-mock rounds read it, then cross-examine what is actually on it — dates, ownership,
              metrics. Stored locally in your sessions folder, never uploaded anywhere.
            </p>
            <CvWidget variant="panel" onCvUpdated={onCvUpdated} />
          </div>
        </Section>

        <Section title="Extras" subtitle="Nice to have — nothing here blocks a session.">
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-start gap-3">
              <span className="pt-1.5">
                <Dot ok={status?.clangd.available === true} />
              </span>
              <div>
                <div className="text-neutral-200">Semantic C++ autocomplete (clangd)</div>
                <p className="text-xs text-neutral-500">
                  {status?.clangd.available
                    ? 'Installed — C++ completions know real types.'
                    : 'Not installed. C++ still compiles and runs; completions fall back to a curated list. Install clangd to enable it.'}
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="pt-1.5">
                <Dot ok={status?.storage.writable === true} warn={status?.storage.writable === false} />
              </span>
              <div>
                <div className="text-neutral-200">Local storage</div>
                <p className="break-all text-xs text-neutral-500">
                  Sessions, grades and your profile live in{' '}
                  <code className="text-neutral-400">{status?.storage.sessionsDir ?? '…'}</code>
                  {status?.storage.writable === false && ' — and it is not writable right now.'}
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="pt-1.5">
                <Dot ok={typeof window !== 'undefined' && 'speechSynthesis' in window} />
              </span>
              <div>
                <div className="text-neutral-200">Voice and think-aloud</div>
                <p className="text-xs text-neutral-500">{status?.voice.note ?? 'Browser feature.'}</p>
              </div>
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
