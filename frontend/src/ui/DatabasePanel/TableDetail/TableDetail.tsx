/**
 * テーブル詳細ビュー。
 *
 * MVPで最も手を抜いてはいけない画面。ここが貧弱だと
 * プレイヤーは「何を調べられるのか」が分からず、SQLを書く前に詰む。
 *
 * @see docs/game-design.md#テーブル詳細ビュー
 */
import { useEffect, useRef } from 'react';
import type { SchemaDoc, TableDoc } from '../../../game/caseTypes.ts';
import { formatCell } from '../../ResultTable/formatCell.ts';
import styles from './TableDetail.module.css';

export interface TableDetailProps {
  schema: SchemaDoc;
  /** ER図で選ばれたテーブル。開いてスクロールする。 */
  selectedTable?: string | undefined;
  /** ER図でホバー中のリレーションの両端。列をハイライトする。 */
  highlightedColumns?: readonly { table: string; column: string }[];
}

export function TableDetail({ schema, selectedTable, highlightedColumns = [] }: TableDetailProps) {
  return (
    <div className={styles.list}>
      {schema.tables.map((table) => (
        <TableEntry
          key={table.name}
          table={table}
          selected={table.name === selectedTable}
          highlightedColumns={highlightedColumns
            .filter((c) => c.table === table.name)
            .map((c) => c.column)}
        />
      ))}
    </div>
  );
}

function TableEntry({
  table,
  selected,
  highlightedColumns,
}: {
  table: TableDoc;
  selected: boolean;
  highlightedColumns: readonly string[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!selected) return;
    const element = ref.current;
    if (!element) return;
    element.open = true;
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  return (
    <details
      ref={ref}
      className={`${styles.table} ${selected ? styles.highlighted : ''}`}
      open={selected}
    >
      <summary className={styles.summary}>
        <span className={styles.name}>{table.name}</span>
        <span className={styles.desc}>{table.description}</span>
      </summary>

      <div className={styles.body}>
        <div>
          <h4 className={styles.sectionTitle}>カラム</h4>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">名前</th>
                <th scope="col">型</th>
                <th scope="col">NULL</th>
                <th scope="col">説明</th>
              </tr>
            </thead>
            <tbody>
              {table.columns.map((column) => (
                <tr
                  key={column.name}
                  className={
                    highlightedColumns.includes(column.name) ? styles.highlightedColumn : ''
                  }
                >
                  <td className={styles.colName}>
                    {column.name}
                    {column.key === 'pk' && (
                      <span className={`${styles.badge} ${styles.pk}`}>PK</span>
                    )}
                    {column.key === 'fk' && (
                      <span className={`${styles.badge} ${styles.fk}`}>FK</span>
                    )}
                  </td>
                  <td className={styles.type}>{column.type}</td>
                  <td className={styles.nullable}>{column.nullable ? '可' : '不可'}</td>
                  <td className={styles.description}>{column.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {table.sampleRows.length > 0 && (
          <div>
            {/* 型と値の見え方を掴ませる。日時が文字列なのか epoch なのかは
                ここを見れば分かる。 */}
            <h4 className={styles.sectionTitle}>サンプル行</h4>
            <div className={styles.sampleScroll}>
              <table className={styles.sample}>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column.name} scope="col">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.sampleRows.map((row, index) => (
                    <tr key={index}>
                      {table.columns.map((column) => {
                        const cell = formatCell(row[column.name] ?? null);
                        return (
                          <td
                            key={column.name}
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
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
