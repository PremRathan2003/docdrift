/**
 * Monaco (the editor inside VS Code), bundled with the app instead of loaded
 * from a CDN at runtime: no third-party script on the page, and it works
 * offline. It's lazy-loaded (see LazyMarkdownEditor) so the ~3 MB only
 * downloads when someone actually opens the editor.
 */
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/markdown/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

export default function MarkdownEditor({
  value,
  onChange,
  dark,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  dark: boolean;
  label: string;
}) {
  return (
    <Editor
      height="60vh"
      language="markdown"
      theme={dark ? 'vs-dark' : 'light'}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      options={{
        ariaLabel: label,
        wordWrap: 'on',
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        accessibilitySupport: 'auto',
      }}
    />
  );
}
