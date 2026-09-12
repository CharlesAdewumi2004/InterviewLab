import { memo } from 'react';
import type { Language, Persona } from '../../../shared/protocol';
import type { Route } from '../hooks/useHashRoute';
import { LanguagePicker, Segmented } from './ui';
import CvWidget from './CvWidget';

interface Props {
  route: Route;
  persona: Persona;
  language: Language;
  compiling: boolean;
  onPersona: (p: Persona) => void;
  onLanguage: (l: Language) => void;
  onRun: () => void;
  /** Tell the server the CV changed so the persona context is rebuilt. */
  onCvUpdated: () => void;
}

function RunButton({ compiling, onRun }: { compiling: boolean; onRun: () => void }) {
  return (
    <button
      onClick={onRun}
      disabled={compiling}
      className="rounded-md bg-green-700 px-3 py-1 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-40"
      title="Build and run against the tests (Ctrl/Cmd+Enter)"
    >
      {compiling ? 'Running…' : 'Run'}
    </button>
  );
}

function Bar({ title, hint, children }: { title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
      <span className="shrink-0 text-xs font-medium text-neutral-300">{title}</span>
      <span className="truncate text-[11px] text-neutral-600">{hint}</span>
      <div className="flex-1" />
      {children}
    </div>
  );
}

// The contextual second bar inside the workspace: coding controls on the
// practice page; slim mode headers on the rounds whose persona is pinned by
// the page they live on.
export default memo(function WorkspaceBar(props: Props) {
  if (props.route === 'design') {
    return (
      <Bar
        title="System design round"
        hint="the editor is your whiteboard, APIs, data model, capacity math, ASCII boxes"
      />
    );
  }
  if (props.route === 'behavioral') {
    return (
      <Bar title="Behavioral round" hint="STAR stories, ownership, reflection, the follow-ups are the interview">
        <CvWidget onCvUpdated={props.onCvUpdated} />
      </Bar>
    );
  }
  if (props.route === 'oop') {
    return (
      <Bar
        title="OOP design round"
        hint="talk first, scope, classes, interfaces, patterns, then implement the skeleton"
      >
        <LanguagePicker value={props.language} onChange={props.onLanguage} />
        <RunButton compiling={props.compiling} onRun={props.onRun} />
      </Bar>
    );
  }
  if (props.route === 'tech') {
    return (
      <Bar
        title="Tech knowledge round"
        hint="verbal fundamentals with drill-down follow-ups, the editor comes in for debug exercises"
      >
        <LanguagePicker value={props.language} onChange={props.onLanguage} />
        <RunButton compiling={props.compiling} onRun={props.onRun} />
      </Bar>
    );
  }
  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
      <Segmented
        value={props.persona}
        options={[
          { value: 'interviewer', label: 'Technical' },
          { value: 'mock', label: 'Full mock' },
          { value: 'tutor', label: 'Tutor' },
        ]}
        onChange={props.onPersona}
      />
      <span className="truncate text-[11px] text-neutral-600">
        {props.persona === 'interviewer'
          ? 'a real coding round: terse, hidden constraints, no rescue'
          : props.persona === 'mock'
            ? 'the whole loop, say "full interview" or "question practice" in chat to start'
            : 'straight answers and explanations, nothing is graded against you here'}
      </span>
      <div className="flex-1" />
      <LanguagePicker value={props.language} onChange={props.onLanguage} />
      <RunButton compiling={props.compiling} onRun={props.onRun} />
    </div>
  );
});
