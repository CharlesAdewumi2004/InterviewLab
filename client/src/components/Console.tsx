import { memo } from 'react';
import type { BuildResult, TestsResult } from '../../../shared/protocol';

interface Props {
  compiling: boolean;
  build: BuildResult | null;
  tests: TestsResult | null;
}

// Memoized: props only change on build/test events, not per streamed token.
export default memo(function Console({ compiling, build, tests }: Props) {
  return (
    <div className="h-full space-y-2 overflow-y-auto bg-neutral-950 p-3 font-mono text-xs">
      {compiling && <div className="text-yellow-400">compiling…</div>}

      {!compiling && !build && (
        <div className="text-neutral-600">Console. Press Ctrl/Cmd+Enter, or Run, to build and test.</div>
      )}

      {!compiling && build && (
        <>
          <div className={build.status === 'ok' ? 'text-green-400' : 'text-red-400'}>
            build: {build.status === 'ok' ? 'ok' : 'failed'}
          </div>

          {build.stderr && (
            <pre className="whitespace-pre-wrap text-red-300">{build.stderr}</pre>
          )}

          {tests && (
            <div className={tests.passed === tests.total ? 'text-green-400' : 'text-orange-400'}>
              tests: {tests.passed}/{tests.total} passed
            </div>
          )}

          {tests?.failures.map((f) => (
            <div key={f.index} className="rounded border border-neutral-800 p-2">
              <div className="text-orange-300">case {f.index} failed</div>
              <div className="text-neutral-400">input: {f.input}</div>
              <div className="text-neutral-400">expected: {f.expected}</div>
              <div className="text-neutral-400">actual: &nbsp;&nbsp;{f.actual}</div>
            </div>
          ))}

          {build.stdout && (
            <>
              <div className="text-neutral-500">stdout:</div>
              <pre className="whitespace-pre-wrap text-neutral-300">{build.stdout}</pre>
            </>
          )}
        </>
      )}
    </div>
  );
});
