/**
 * SQL入力欄。
 *
 * 補完は入れない。「どのテーブルがあるか調べる」こと自体がゲームの一部であり、
 * その役割は Database 画面が担う（docs/adr/0003-editor.md）。
 *
 * タブを複数持てる。調査中は「さっき書いたクエリを残したまま、別の切り口を試す」
 * 場面が多く、履歴を辿るだけでは2本を**並行して育てられない**（mvp-issues #36）。
 * タブの状態は `workspace.ts` が持ち、ここは描くだけ。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCodeMirror } from './useCodeMirror.ts';
import { MAX_TAB_NAME, MAX_TABS, activeTab } from './workspace.ts';
import type { Workspace } from './workspace.ts';
import styles from './SqlEditor.module.css';

export interface SqlEditorProps {
  workspace: Workspace;
  disabled: boolean;
  onRun: (sql: string) => void;
  onChangeSql: (tabId: string, sql: string) => void;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
}

export function SqlEditor({
  workspace,
  disabled,
  onRun,
  onChangeSql,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab,
}: SqlEditorProps) {
  const tab = activeTab(workspace);
  const history = workspace.history;

  const sqlRef = useRef(tab.sql);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  /** 履歴を辿る位置。history.length は「履歴から抜けた（＝編集中）」状態。 */
  const cursorRef = useRef(history.length);
  const draftRef = useRef('');

  // 履歴はタブをまたいで共有する。タブを移ったら辿り位置は先頭へ戻す。
  useEffect(() => {
    cursorRef.current = history.length;
  }, [tab.id, history.length]);

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

  const { containerRef, setValue, focus, forget } = useCodeMirror({
    docKey: tab.id,
    initialValue: tab.sql,
    onChange: (value) => {
      sqlRef.current = value;
      onChangeSql(tab.id, value);
    },
    onRun: () => {
      if (!disabled) onRun(sqlRef.current);
    },
    onHistoryStep: stepHistory,
  });

  // タブを切り替えたとき、および外から内容が差し替わったとき（答えの提示など）に
  // エディタの表示を合わせる。利用者の入力で来た変更は sqlRef と一致するので何もしない。
  useEffect(() => {
    if (tab.sql === sqlRef.current) return;
    sqlRef.current = tab.sql;
    setValue(tab.sql);
    // 差し込んだ直後に Ctrl+Enter で実行できるよう、焦点を戻す。
    // このキーは CodeMirror に載っているので、ボタンに焦点が残っていると効かない。
    focus();
  }, [tab.id, tab.sql, setValue, focus]);

  const applyHistoryItem = (sql: string) => {
    setValue(sql);
    sqlRef.current = sql;
    onChangeSql(tab.id, sql);
    cursorRef.current = history.length;
    setHistoryOpen(false);
    focus();
  };

  const closeTab = (tabId: string) => {
    forget(tabId);
    onCloseTab(tabId);
  };

  return (
    <div className={styles.editor}>
      <div className={styles.tabs} role="tablist" aria-label="SQLエディタのタブ">
        {workspace.tabs.map((item) => {
          const selected = item.id === tab.id;
          return (
            <span key={item.id} className={`${styles.tab} ${selected ? styles.tabActive : ''}`}>
              {renaming === item.id ? (
                <TabNameInput
                  initial={item.name}
                  onCommit={(name) => {
                    onRenameTab(item.id, name);
                    setRenaming(null);
                    focus();
                  }}
                  onCancel={() => {
                    setRenaming(null);
                    focus();
                  }}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={styles.tabButton}
                  onClick={() => {
                    onSelectTab(item.id);
                  }}
                  onDoubleClick={() => {
                    setRenaming(item.id);
                  }}
                  title="ダブルクリックで名前を変更"
                >
                  {item.name}
                </button>
              )}

              <button
                type="button"
                className={styles.tabClose}
                aria-label={`${item.name} を閉じる`}
                onClick={() => {
                  closeTab(item.id);
                }}
              >
                ×
              </button>
            </span>
          );
        })}

        {workspace.tabs.length < MAX_TABS && (
          <button
            type="button"
            className={styles.tabAdd}
            aria-label="タブを追加"
            title="タブを追加"
            onClick={onAddTab}
          >
            ＋
          </button>
        )}
      </div>

      <div className={styles.surface} ref={containerRef} />

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.run}
          disabled={disabled}
          onClick={() => {
            onRun(sqlRef.current);
          }}
        >
          実行
        </button>
        <span className={styles.hint}>Ctrl / ⌘ + Enter</span>

        <details
          className={`${styles.history} ${styles.spacer}`}
          open={historyOpen}
          onToggle={(e) => {
            setHistoryOpen(e.currentTarget.open);
          }}
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
                    onClick={() => {
                      applyHistoryItem(entry);
                    }}
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

/** タブ名の編集。Enter で確定、Escape で取り消し、フォーカスが外れたら確定。 */
function TabNameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <input
      className={styles.tabInput}
      value={value}
      maxLength={MAX_TAB_NAME}
      autoFocus
      aria-label="タブの名前"
      onChange={(e) => {
        setValue(e.currentTarget.value);
      }}
      onBlur={() => {
        onCommit(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
