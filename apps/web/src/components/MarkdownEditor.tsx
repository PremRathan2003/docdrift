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

/**
 * Uncontrolled on purpose: Monaco owns the text while you type and reports
 * changes up. Feeding every keystroke back in as a `value` prop can race with
 * fast typing and drop characters. To replace the text (discard, or a newer
 * version arrives), the parent changes the component's `key`.
 */
export default function MarkdownEditor({
  initialValue,
  onChange,
  dark,
  label,
}: {
  initialValue: string;
  onChange: (v: string) => void;
  dark: boolean;
  label: string;
}) {
  return (
    <Editor
      height="60vh"
      language="markdown"
      theme={dark ? 'vs-dark' : 'light'}
      defaultValue={initialValue}
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
