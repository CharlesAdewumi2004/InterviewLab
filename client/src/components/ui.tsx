import { useEffect, useState } from 'react';
import type { Language } from '../../../shared/protocol';
import { LANGUAGES } from '../../../shared/languages';
import { cachedSetup, type ToolchainRow } from '../lib/setup';
import {
  getPreferredVoiceName,
  listEnglishVoices,
  onVoicesChanged,
  setPreferredVoice,
  speakSample,
} from '../lib/voice';

// Shared UI atoms used by the nav bar and workspace bar.

// Isolated so the once-a-second tick re-renders this span only. Shows ACTIVE
// session time: pauses freeze it (closed pauses in pausedMs, open via pausedAt).
export function Clock({ startedAt, pausedMs, pausedAt }: { startedAt: number; pausedMs: number; pausedAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor(((pausedAt ?? now) - startedAt - pausedMs) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (
    <span className={`font-mono text-xs ${pausedAt !== null ? 'text-amber-400' : 'text-neutral-500'}`}>
      {m}:{String(s).padStart(2, '0')}
      {pausedAt !== null && ' ⏸'}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-neutral-700 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={
            o.value === value
              ? 'bg-blue-700 px-2.5 py-1 font-medium text-white'
              : 'bg-neutral-900 px-2.5 py-1 text-neutral-400 hover:bg-neutral-800'
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Working-language picker. Languages whose toolchain is missing stay
 * selectable but are marked, because everything except Run still works in
 * them — and the label is how someone discovers they need to install one.
 */
export function LanguagePicker({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  const [rows, setRows] = useState<ToolchainRow[] | null>(null);
  useEffect(() => {
    let live = true;
    cachedSetup().then(
      (s) => live && setRows(s.languages),
      () => live && setRows(null),
    );
    return () => {
      live = false;
    };
  }, []);

  const available = (id: Language) => rows?.find((r) => r.language === id)?.available ?? true;
  const current = rows?.find((r) => r.language === value);

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Language)}
        title="Language for this session — stubs, tests and grading all follow it"
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
      >
        {LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
            {available(l.id) ? '' : ' — not installed'}
          </option>
        ))}
      </select>
      {current && !current.available && (
        <span
          className="cursor-help text-[11px] text-amber-400"
          title={`Run needs ${current.toolchain}. ${current.install}`}
        >
          no toolchain
        </span>
      )}
    </div>
  );
}

function voiceLabel(name: string, lang: string): string {
  const base = name
    .replace(/^(Microsoft|Google) /, '')
    .replace(/ Online/, '')
    .replace(/ - English \([^)]*\)$/, '');
  return `${base} · ${lang}`;
}

export function VoicePicker() {
  const [voices, setVoices] = useState(() => listEnglishVoices());
  const [selected, setSelected] = useState(() => getPreferredVoiceName() ?? '');
  // The browser loads its voice list asynchronously — refresh when it lands.
  useEffect(() => onVoicesChanged(() => setVoices(listEnglishVoices())), []);
  if (voices.length === 0) return null;
  const value = selected && voices.some((v) => v.name === selected) ? selected : voices[0].name;
  const hasNatural = voices.some((v) => /natural/i.test(v.name));
  return (
    <>
      <select
        value={value}
        onChange={(e) => {
          setSelected(e.target.value);
          setPreferredVoice(e.target.value);
          speakSample(); // audition immediately
        }}
        title="Interviewer voice (best available listed first)"
        className="max-w-[160px] rounded-md border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-300"
      >
        {voices.map((v) => (
          <option key={v.name} value={v.name}>
            {voiceLabel(v.name, v.lang)}
          </option>
        ))}
      </select>
      {!hasNatural && (
        <span
          className="text-[11px] text-neutral-500"
          title="Microsoft Edge exposes neural 'Natural' voices to this app — noticeably smoother than what this browser offers."
        >
          smoother in Edge
        </span>
      )}
    </>
  );
}
