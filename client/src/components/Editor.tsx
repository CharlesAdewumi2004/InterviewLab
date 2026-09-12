import { memo, useEffect, useMemo, useRef } from 'react';
import MonacoEditor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { Cursor, Language, Selection } from '../../../shared/protocol';
import { DEFAULT_LANGUAGE, LANGUAGES, languageMeta } from '../../../shared/languages';
import { editorOptionsFor, setupMonaco } from '../lib/monacoConfig';

export interface EditorState {
  buffer: string;
  selection: Selection | null;
  cursor: Cursor;
}

export interface EditorApi {
  getState: () => EditorState;
  setValue: (value: string) => void;
}

// The same starting buffers the server hands out (shared/languages.ts), so
// "untouched default" means the same thing on both sides.
const DEFAULT_BUFFERS = LANGUAGES.map((l) => l.defaultBuffer.trim());

/**
 * True when the buffer holds no work worth protecting — an untouched language
 * default or whitespace. A reconnect may overwrite a pristine buffer freely;
 * anything else is the candidate's code and the client copy wins. Compared
 * trimmed so a stray trailing newline from a Monaco round trip doesn't read as
 * real work.
 */
export function isPristineBuffer(buffer: string): boolean {
  const b = buffer.trim();
  return b === '' || DEFAULT_BUFFERS.includes(b);
}

interface Props {
  language: Language;
  /** A problem is loaded, so the buffer is the solution file the harness calls. */
  hasProblem: boolean;
  onState: (state: EditorState) => void;
  onRun: () => void;
  onFocusChat: () => void;
  onReady: (api: EditorApi) => void;
}

// Memoized: App re-renders on every streamed chat token, and Monaco is the
// heaviest subtree — with stable props it skips those renders entirely
// (language only changes on an explicit toggle).
export default memo(function Editor({ language, hasProblem, onState, onRun, onFocusChat, onReady }: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // Callbacks live in refs so Monaco commands registered once at mount never
  // capture stale closures.
  const onStateRef = useRef(onState);
  const onRunRef = useRef(onRun);
  const onFocusChatRef = useRef(onFocusChat);
  onStateRef.current = onState;
  onRunRef.current = onRun;
  onFocusChatRef.current = onFocusChat;

  const contentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(contentTimer.current);
      clearTimeout(selectionTimer.current);
    };
  }, []);

  const getState = (): EditorState => {
    const ed = editorRef.current;
    if (!ed) return { buffer: '', selection: null, cursor: { line: 1, column: 1 } };
    const model = ed.getModel();
    const sel = ed.getSelection();
    const pos = ed.getPosition();
    let selection: Selection | null = null;
    if (model && sel && !sel.isEmpty()) {
      selection = {
        startLine: sel.startLineNumber,
        endLine: sel.endLineNumber,
        text: model.getValueInRange(sel),
      };
    }
    return {
      buffer: ed.getValue(),
      selection,
      cursor: pos ? { line: pos.lineNumber, column: pos.column } : { line: 1, column: 1 },
    };
  };

  const handleMount: OnMount = (ed, monaco: Monaco) => {
    editorRef.current = ed;
    setupMonaco(monaco);

    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current());
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => onFocusChatRef.current());
    // Ctrl+Space is push-to-talk app-wide; Ctrl+I is the manual suggest
    // trigger (suggestions still pop automatically while typing).
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () =>
      ed.trigger('keyboard', 'editor.action.triggerSuggest', {}),
    );

    // §9.3: buffer pushed on a 400ms debounce after typing stops; selection
    // and cursor changes push on a short debounce of their own.
    ed.onDidChangeModelContent(() => {
      clearTimeout(contentTimer.current);
      contentTimer.current = setTimeout(() => onStateRef.current(getState()), 400);
    });
    ed.onDidChangeCursorSelection(() => {
      clearTimeout(selectionTimer.current);
      selectionTimer.current = setTimeout(() => onStateRef.current(getState()), 150);
    });

    onReady({
      getState,
      setValue: (value: string) => ed.setValue(value),
    });
  };

  const meta = languageMeta(language);
  // Recomputed only on a language change; a new object identity on every
  // render would make Monaco call updateOptions during chat streaming.
  const options = useMemo(() => editorOptionsFor(meta.monaco), [meta.monaco]);

  return (
    <div className="flex h-full flex-col">
      {/* A real editor tells you what file you are in. It also gives the two
          shortcuts a home, so they stop being folklore. */}
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900/80 px-3 py-1">
        <span className="font-mono text-[11px] text-neutral-300">
          {hasProblem ? 'solution' : 'scratch'}
          {meta.ext}
        </span>
        <span className="text-[11px] text-neutral-600">{meta.label}</span>
        <div className="flex-1" />
        <span className="text-[11px] text-neutral-600">Ctrl+Enter run</span>
        <span className="text-[11px] text-neutral-600">Ctrl+K chat</span>
      </div>
      <div className="min-h-0 flex-1">
        <MonacoEditor
          language={meta.monaco}
          theme="vs-dark"
          defaultValue={languageMeta(DEFAULT_LANGUAGE).defaultBuffer}
          options={options}
          onMount={handleMount}
        />
      </div>
    </div>
  );
});
