import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Monaco ships with @monaco-editor/react, but that package fetches the editor
// from a CDN at run time unless it is told otherwise. For a tool that runs on
// your own machine that is the wrong default twice over: the editor does not
// load at all without internet, and its language workers never start, so
// TypeScript and JavaScript lose diagnostics, hovers and completions.
//
// Bundling it here fixes both. Imported for its side effects by main.tsx,
// before anything renders.

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    if (label === 'json') return new jsonWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });
