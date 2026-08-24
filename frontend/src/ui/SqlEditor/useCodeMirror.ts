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
  /**
   * いま編集している文書の識別子（＝タブID）。
   *
   * これが変わると、**いまの EditorState を退避して、その文書のものに差し替える**。
   * タブごとに EditorView を作ると重いので、View は1つのまま State だけ入れ替える。
   * undo 履歴は EditorState に載っているので、これでタブごとに分かれる。
   */
  docKey: string;
  /** docKey の文書の内容。docKey が変わったときだけ反映する。 */
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
  /** 閉じたタブの EditorState を捨てる。放っておくとメモリに残る。 */
  forget: (docKey: string) => void;
}

/** 呼び出し側は分割代入して使うこと（レンダリング中の ref プロパティ参照を避けるため）。 */

export function useCodeMirror(options: UseCodeMirrorOptions): CodeMirrorHandle {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** タブID → 退避した EditorState。undo 履歴もここに乗っている。 */
  const statesRef = useRef(new Map<string, EditorState>());
  const currentKeyRef = useRef(options.docKey);
  /** State 差し替え中の更新通知を、利用者の編集と区別するための目印。 */
  const swappingRef = useRef(false);
  /** 拡張一式を持った EditorState を作る関数。マウント時に確定する。 */
  const createStateRef = useRef<((doc: string) => EditorState) | null>(null);

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
    // cleanup で参照するので、effect の中で掴んでおく。
    const states = statesRef.current;

    const applyHistory = (direction: -1 | 1) => (view: EditorView) => {
      const next = handlers.current.onHistoryStep(direction);
      if (next === undefined) return false;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: next.length },
      });
      return true;
    };

    const createState = (doc: string) =>
      EditorState.create({
        doc,
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
            // 差し替え中の変更はタブ切替であって、利用者の編集ではない。
            if (update.docChanged && !swappingRef.current) {
              handlers.current.onChange(update.state.doc.toString());
            }
          }),
        ],
      });

    const view = new EditorView({ parent, state: createState(handlers.current.initialValue) });
    createStateRef.current = createState;

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      states.clear();
    };
    // エディタは一度だけ作る。initialValue の変更では作り直さない。
  }, []);

  /** タブが変わったら、いまの State を退避して、切替先の State に差し替える。 */
  useEffect(() => {
    const view = viewRef.current;
    const createState = createStateRef.current;
    if (!view || !createState) return;

    const previousKey = currentKeyRef.current;
    if (previousKey === options.docKey) return;

    statesRef.current.set(previousKey, view.state);
    currentKeyRef.current = options.docKey;

    swappingRef.current = true;
    try {
      view.setState(statesRef.current.get(options.docKey) ?? createState(options.initialValue));
    } finally {
      swappingRef.current = false;
    }
    view.focus();
  }, [options.docKey, options.initialValue]);

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
    focus: () => {
      viewRef.current?.focus();
    },
    forget: (docKey: string) => {
      statesRef.current.delete(docKey);
    },
  };
}
