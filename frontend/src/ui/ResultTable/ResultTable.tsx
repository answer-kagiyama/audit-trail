/**
 * 結果表。
 *
 * 空結果を「0件でした」と突き放さない。0件は「そこには無い」という捜査結果であり、
 * それ自体が情報である（docs/game-design.md#1-コアループ）。
 */
import type { Ref } from 'react';
import type { QueryResult } from '../../engine/types.ts';
import type { FriendlyError } from '../../game/errorMap.ts';
import { Panel } from '../Panel/Panel.tsx';
import { formatCell } from './formatCell.ts';
import styles from './ResultTable.module.css';

export type ResultState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'result'; result: QueryResult }
  | { kind: 'error'; error: FriendlyError };

export function ResultPanel({
  state,
  panelRef,
}: {
  state: ResultState;
  panelRef?: Ref<HTMLElement> | undefined;
}) {
  return (
    <Panel title="Result" aside={summary(state)} padded={false} panelRef={panelRef}>
      <Body state={state} />
    </Panel>
  );
}

function summary(state: ResultState): string | undefined {
  if (state.kind !== 'result') return undefined;
  const { rowCount, elapsedMs } = state.result;
  return `${rowCount.toLocaleString('en-US')} 行 / ${elapsedMs.toFixed(1)} ms`;
}

function Body({ state }: { state: ResultState }) {
  switch (state.kind) {
    case 'idle':
      return <p className={styles.notice}>SQLを実行すると、ここに記録が表示されます。</p>;
    case 'running':
      return <p className={styles.notice}>照会中…</p>;
    case 'error':
      return <ErrorView error={state.error} />;
    case 'result':
      return <TableView result={state.result} />;
  }
}

function ErrorView({ error }: { error: FriendlyError }) {
  return (
    <div className={styles.error}>
      <p className={styles.errorMessage}>{error.message}</p>

      {error.suggestion !== undefined && (
        <p className={styles.suggestion}>
          もしかして: <code>{error.suggestion}</code>
        </p>
      )}

      {/* 生メッセージは隠さない。翻訳が的外れだったときに調べようがなくなる。 */}
      <details className={styles.rawToggle}>
        <summary className={styles.rawSummary}>元のエラーメッセージ</summary>
        <pre className={styles.raw}>{error.rawMessage}</pre>
      </details>
    </div>
  );
}

function TableView({ result }: { result: QueryResult }) {
  if (result.rowCount === 0) {
    return <p className={styles.notice}>該当する記録は見つかりませんでした。</p>;
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.rowNumber} aria-label="行番号" />
            {result.columns.map((column, index) => (
              <th key={`${column}-${String(index)}`} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className={styles.rowNumber}>{rowIndex + 1}</td>
              {row.map((value, columnIndex) => {
                const cell = formatCell(value);
                return (
                  <td
                    key={columnIndex}
                    className={[
                      cell.isNull ? styles.null : '',
                      cell.isNumeric ? styles.numeric : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {cell.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {result.truncated && (
        <p className={styles.truncated}>
          先頭 {result.rows.length.toLocaleString('en-US')} 行を表示しています（全{' '}
          {result.rowCount.toLocaleString('en-US')} 件）。条件を絞り込んでください。
        </p>
      )}
    </div>
  );
}
