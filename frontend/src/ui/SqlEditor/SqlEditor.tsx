/**
 * SQL入力欄。
 *
 * 補完は入れない。「どのテーブルがあるか調べる」こと自体がゲームの一部であり、
 * その役割は Database 画面が担う（docs/adr/0003-editor.md）。
 */
import { useCallback, useRef, useState } from 'react';
import { useCodeMirror } from './useCodeMirror.ts';
import styles from './SqlEditor.module.css';

export interface SqlEditorProps {
  /** 実行済みクエリ。新しいものが末尾。 */
  history: readonly string[];
  disabled: boolean;
  onRun: (sql: string) => void;
}

export function SqlEditor({ history, disabled, onRun }: SqlEditorProps) {
  const sqlRef = useRef('');
  const [historyOpen, setHistoryOpen] = useState(false);

  /** 履歴を辿る位置。history.length は「履歴から抜けた（＝編集中）」状態。 */
  const cursorRef = useRef(history.length);
  const draftRef = useRef('');

  const stepHistory = useCallback(
    (direction: -1 | 1): string | undefined => {
      if (history.length === 0) return undefined;

      // 履歴に入る直前の内容は退避しておき、下まで戻ったら復元する。
      if (cursorRef.current === history.length && direction === -1) {
        draftRef.current = sqlRef.current;
      }

      const next = cursorRef.current + direction;
      if (next < 0 || next > history.length) return undefined;
      cursorRef.current = next;

      return next === history.length ? draftRef.current : history[next];
    },
    [history],
  );

  const { containerRef, setValue, focus } = useCodeMirror({
    initialValue: '',
    onChange: (value) => {
      sqlRef.current = value;
    },
    onRun: () => {
      if (!disabled) onRun(sqlRef.current);
    },
    onHistoryStep: stepHistory,
  });

  const applyHistoryItem = (sql: string) => {
    setValue(sql);
    sqlRef.current = sql;
    cursorRef.current = history.length;
    setHistoryOpen(false);
    focus();
  };

  return (
    <div className={styles.editor}>
      <div className={styles.surface} ref={containerRef} />

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.run}
          disabled={disabled}
          onClick={() => onRun(sqlRef.current)}
        >
          実行
        </button>
        <span className={styles.hint}>Ctrl / ⌘ + Enter</span>

        <details
          className={`${styles.history} ${styles.spacer}`}
          open={historyOpen}
          onToggle={(e) => setHistoryOpen(e.currentTarget.open)}
        >
          <summary className={styles.historySummary}>履歴 {history.length}</summary>
          {history.length === 0 ? (
            <ul className={styles.historyList}>
              <li className={styles.empty}>まだ実行していません</li>
            </ul>
          ) : (
            <ul className={styles.historyList}>
              {[...history].reverse().map((entry, index) => (
                <li key={`${String(history.length - index)}-${entry}`}>
                  <button
                    type="button"
                    className={styles.historyItem}
                    onClick={() => applyHistoryItem(entry)}
                    title={entry}
                  >
                    {entry.replace(/\s+/g, ' ').slice(0, 120)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>

        <span className={styles.hint}>Alt + ↑ / ↓</span>
      </div>
    </div>
  );
}
