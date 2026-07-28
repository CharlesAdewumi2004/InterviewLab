import { memo, useEffect, useRef } from 'react';
import MonacoEditor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { Cursor, Language, Selection } from '../../../shared/protocol';
import { EDITOR_OPTIONS, setupMonaco } from '../lib/monacoConfig';

export interface EditorState {
  buffer: string;
  selection: Selection | null;
  cursor: Cursor;
}

export interface EditorApi {
  getState: () => EditorState;
  setValue: (value: string) => void;
}

// Mirrors the server's DEFAULT_BUFFER (session.ts) — the session:ready
// snapshot overwrites this either way.
const DEFAULT_BUFFER = `// All standard headers are pre-included and \`using namespace std\` is on
// (LeetCode-style) — no #includes needed.
// Paste a rough problem into the left pane to generate a stub and tests,
// or just write code here and hit Ctrl/Cmd+Enter to compile and run.

int main() {
    cout << "hello" << endl;
    return 0;
}
`;

interface Props {
  language: Language;
  onState: (state: EditorState) => void;
  onRun: () => void;
  onFocusChat: () => void;
  onReady: (api: EditorApi) => void;
}

// Memoized: App re-renders on every streamed chat token, and Monaco is the
// heaviest subtree — with stable props it skips those renders entirely
// (language only changes on an explicit toggle).
export default memo(function Editor({ language, onState, onRun, onFocusChat, onReady }: Props) {
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

  return (
    <MonacoEditor
      language={language}
      theme="vs-dark"
      defaultValue={DEFAULT_BUFFER}
      options={EDITOR_OPTIONS}
      onMount={handleMount}
    />
  );
});
