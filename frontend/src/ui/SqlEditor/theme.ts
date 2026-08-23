/**
 * CodeMirror のテーマ。色は tokens.css の CSS カスタムプロパティを参照する。
 *
 * CodeMirror は JS でスタイルを組み立てるため CSS Modules を直接は使えないが、
 * 値を var() で引くことで、色の定義箇所は tokens.css の一箇所に保てる。
 * ライト/ダークの切り替えも var() が追従するので、エディタの作り直しは要らない。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

const editorTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text-primary)',
      backgroundColor: 'var(--surface-sunken)',
      fontSize: 'var(--text-md)',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      padding: 'var(--space-3)',
      caretColor: 'var(--accent-strong)',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-strong)' },
    '&.cm-focused': { outline: 'none' },
    // パネル側でフォーカスリングを出すので、エディタ自身は枠を持たない。
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: 'var(--leading-normal)' },
    '.cm-gutters': {
      backgroundColor: 'var(--surface-sunken)',
      color: 'var(--text-muted)',
      border: 'none',
      borderRight: '1px solid var(--border-subtle)',
    },
    '.cm-activeLine': { backgroundColor: 'var(--accent-wash)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-secondary)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--accent-dim)',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'var(--accent-dim)',
      outline: 'none',
    },
  },
  // dark: true を指定しない。色はすべて tokens.css の var() から来るので、
  // CodeMirror 側にテーマの前提を持たせるとライト時に食い違う。
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syntax-string)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: tags.bool, color: 'var(--syntax-number)' },
  { tag: tags.null, color: 'var(--text-muted)' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: tags.operator, color: 'var(--text-secondary)' },
  { tag: tags.punctuation, color: 'var(--text-secondary)' },
  {
    tag: [tags.function(tags.variableName), tags.standard(tags.variableName)],
    color: 'var(--syntax-function)',
  },
]);

export const auditTrailEditorTheme: Extension = [editorTheme, syntaxHighlighting(highlightStyle)];
