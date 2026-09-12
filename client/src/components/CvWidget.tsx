import { useEffect, useRef, useState } from 'react';

export interface CvStatus {
  present: boolean;
  chars: number;
  preview: string;
  updatedAt: number | null;
}

// CV upload for behavioral and full-mock rounds: PDF or plain text, parsed
// server-side and injected into the interviewer's context — so it has "read
// the resume" and can cross-examine what is actually on it.
export default function CvWidget({
  onCvUpdated,
  variant = 'bar',
}: {
  onCvUpdated: () => void;
  /** 'bar' is the compact workspace control; 'panel' is the setup page block. */
  variant?: 'bar' | 'panel';
}) {
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
    if (!window.confirm('Remove the uploaded CV? Interviewers fall back to the profile below.')) return;
    await fetch('/api/cv', { method: 'DELETE' }).catch(() => {});
    setStatus({ present: false, chars: 0, preview: '', updatedAt: null });
    onCvUpdated();
  };

  const picker = (
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
  );

  if (variant === 'panel') {
    return (
      <div>
        {picker}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
          >
            {busy ? 'Uploading…' : status?.present ? 'Replace CV' : 'Upload CV'}
          </button>
          {status?.present && (
            <>
              <span className="text-xs text-green-400">
               On file · {(status.chars / 1000).toFixed(1)}k characters
              </span>
              <button onClick={() => void remove()} className="text-xs text-neutral-500 hover:text-red-300">
                remove
              </button>
            </>
          )}
          {!status?.present && <span className="text-xs text-neutral-500">PDF, .txt or .md, optional</span>}
        </div>
        {status?.present && (
          <p className="mt-2 line-clamp-2 rounded bg-neutral-900 p-2 font-mono text-[11px] leading-relaxed text-neutral-500">
            {status.preview}…
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {picker}
      {status?.present ? (
        <>
          <span
            className="rounded-md bg-green-950/60 px-2 py-0.5 text-[11px] text-green-300"
            title={status.preview + '…'}
          >
            CV on file ({(status.chars / 1000).toFixed(1)}k chars), questions are grounded in it
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
          title="Upload your CV (PDF or .txt/.md), the interviewer reads it and probes its actual content"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
        >
          {busy ? 'Uploading…' : 'Upload CV'}
        </button>
      )}
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  );
}
