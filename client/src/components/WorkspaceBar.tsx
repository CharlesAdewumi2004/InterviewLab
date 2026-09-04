import { memo, useEffect, useRef, useState } from 'react';
import type { Language, Persona } from '../../../shared/protocol';
import type { Route } from '../hooks/useHashRoute';
import { Segmented } from './ui';

interface Props {
  route: Route; // 'practice' | 'design' | 'behavioral'
  persona: Persona;
  language: Language;
  compiling: boolean;
  onPersona: (p: Persona) => void;
  onLanguage: (l: Language) => void;
  onRun: () => void;
  /** Tell the server the CV changed so the persona context is rebuilt. */
  onCvUpdated: () => void;
}

interface CvStatus {
  present: boolean;
  chars: number;
  preview: string;
  updatedAt: number | null;
}

// CV upload for behavioral rounds: PDF or plain text, parsed server-side and
// injected into the interviewer's context — so it has "read the resume".
function CvWidget({ onCvUpdated }: { onCvUpdated: () => void }) {
  const [status, setStatus] = useState<CvStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/cv')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const body = isPdf ? await file.arrayBuffer() : await file.text();
      const r = await fetch('/api/cv', {
        method: 'PUT',
        headers: { 'Content-Type': isPdf ? 'application/pdf' : 'text/plain' },
        body,
      });
      const data = (await r.json()) as { error?: string; status?: CvStatus };
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
      setStatus(data.status ?? null);
      onCvUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove the uploaded CV? The interviewer will fall back to the standing candidate profile.')) return;
    await fetch('/api/cv', { method: 'DELETE' }).catch(() => {});
    setStatus({ present: false, chars: 0, preview: '', updatedAt: null });
    onCvUpdated();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md,text/plain,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
      {status?.present ? (
        <>
          <span
            className="rounded-md bg-green-950/60 px-2 py-0.5 text-[11px] text-green-300"
            title={status.preview + '…'}
          >
            ✓ CV on file ({(status.chars / 1000).toFixed(1)}k chars) — questions are grounded in it
          </span>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="text-[11px] text-neutral-500 hover:text-neutral-300 disabled:opacity-40"
          >
            replace
          </button>
          <button onClick={() => void remove()} className="text-[11px] text-neutral-500 hover:text-red-300">
            remove
          </button>
        </>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Upload your CV (PDF or .txt/.md) — the interviewer reads it and probes its actual content"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
        >
          {busy ? 'Uploading…' : '📄 Upload CV'}
        </button>
      )}
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  );
}

// The contextual second bar inside the workspace: coding controls on the
// practice page; slim mode headers on design/behavioral (their persona is
// pinned by the page).
export default memo(function WorkspaceBar(props: Props) {
  if (props.route === 'design') {
    return (
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
        <span className="text-xs font-medium text-neutral-300">System design round</span>
        <span className="text-[11px] text-neutral-600">
          the editor is your whiteboard — APIs, data model, capacity math, ASCII boxes
        </span>
      </div>
    );
  }
  if (props.route === 'behavioral') {
    return (
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
        <span className="text-xs font-medium text-neutral-300">Behavioral round</span>
        <span className="text-[11px] text-neutral-600">
          STAR stories, ownership, reflection — the follow-ups are the interview
        </span>
        <div className="flex-1" />
        <CvWidget onCvUpdated={props.onCvUpdated} />
      </div>
    );
  }
  if (props.route === 'oop') {
    return (
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
        <span className="text-xs font-medium text-neutral-300">OOP design round</span>
        <span className="text-[11px] text-neutral-600">
          talk first — scope, classes, interfaces, patterns — then implement the skeleton in the editor
        </span>
        <div className="flex-1" />
        <Segmented
          value={props.language}
          options={[
            { value: 'cpp', label: 'C++' },
            { value: 'python', label: 'Py' },
          ]}
          onChange={props.onLanguage}
        />
        <button
          onClick={props.onRun}
          disabled={props.compiling}
          className="rounded-md bg-green-700 px-3 py-1 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-40"
          title="Compile the skeleton (Ctrl/Cmd+Enter)"
        >
          {props.compiling ? 'Compiling…' : '▶ Run'}
        </button>
      </div>
    );
  }
  if (props.route === 'tech') {
    return (
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
        <span className="text-xs font-medium text-neutral-300">Tech knowledge round</span>
        <span className="text-[11px] text-neutral-600">
          verbal fundamentals with drill-down follow-ups — the editor comes in for escalations and debug exercises
        </span>
        <div className="flex-1" />
        <Segmented
          value={props.language}
          options={[
            { value: 'cpp', label: 'C++' },
            { value: 'python', label: 'Py' },
          ]}
          onChange={props.onLanguage}
        />
        <button
          onClick={props.onRun}
          disabled={props.compiling}
          className="rounded-md bg-green-700 px-3 py-1 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-40"
          title="Ctrl/Cmd+Enter"
        >
          {props.compiling ? 'Compiling…' : '▶ Run'}
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
      <Segmented
        value={props.persona}
        options={[
          { value: 'interviewer', label: 'Technical' },
          { value: 'bloomberg', label: 'Bloomberg' },
          { value: 'tutor', label: 'Tutor' },
        ]}
        onChange={props.onPersona}
      />
      <Segmented
        value={props.language}
        options={[
          { value: 'cpp', label: 'C++' },
          { value: 'python', label: 'Py' },
        ]}
        onChange={props.onLanguage}
      />
      <div className="flex-1" />
      <button
        onClick={props.onRun}
        disabled={props.compiling}
        className="rounded-md bg-green-700 px-3 py-1 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-40"
        title="Ctrl/Cmd+Enter"
      >
        {props.compiling ? 'Compiling…' : '▶ Run'}
      </button>
    </div>
  );
});
