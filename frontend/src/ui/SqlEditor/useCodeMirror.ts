/**
 * CodeMirror 6 を React に載せる最小のフック。
 *
 * react-codemirror 系のラッパーは入れない。必要なのは
 * 「マウントする / 値を出し入れする / キーバインドを足す」だけで、
 * ラッパーの抽象を挟むと CodeMirror 側の都合が見えなくなる。
 */
import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { sql, SQLite } from '@codemirror/lang-sql';
import { auditTrailEditorTheme } from './theme.ts';

export interface UseCodeMirrorOptions {
  initialValue: string;
  onChange: (value: string) => void;
  /** Cmd/Ctrl + Enter。 */
  onRun: () => void;
  /** Alt + ↑ / ↓ で履歴を辿る。戻り値の文字列を差し込む。 */
  onHistoryStep: (direction: -1 | 1) => string | undefined;
}

export interface CodeMirrorHandle {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 外から本文を差し替える（履歴の適用など）。 */
  setValue: (value: string) => void;
  focus: () => void;
}

/** 呼び出し側は分割代入して使うこと（レンダリング中の ref プロパティ参照を避けるため）。 */

export function useCodeMirror(options: UseCodeMirrorOptions): CodeMirrorHandle {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // ハンドラは毎レンダリング変わりうるが、エディタは作り直したくない。
  // ref 越しに最新を呼ぶ。更新はレンダリング中ではなく commit 後に行う
  // （CodeMirror のコールバックはユーザー操作で発火するので、これで間に合う）。
  const handlers = useRef(options);
  useEffect(() => {
    handlers.current = options;
  });

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const applyHistory = (direction: -1 | 1) => (view: EditorView) => {
      const next = handlers.current.onHistoryStep(direction);
      if (next === undefined) return false;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: next.length },
      });
      return true;
    };

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: handlers.current.initialValue,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          indentOnInput(),
          highlightActiveLine(),
          sql({ dialect: SQLite, upperCaseKeywords: true }),
          auditTrailEditorTheme,
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Mod-Enter',
              preventDefault: true,
              run: () => {
                handlers.current.onRun();
                return true;
              },
            },
            { key: 'Alt-ArrowUp', preventDefault: true, run: applyHistory(-1) },
            { key: 'Alt-ArrowDown', preventDefault: true, run: applyHistory(1) },
            indentWithTab,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // エディタは一度だけ作る。initialValue の変更では作り直さない。
  }, []);

  return {
    containerRef,
    setValue: (value: string) => {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === value) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: value.length },
      });
    },
    focus: () => viewRef.current?.focus(),
  };
}
