/**
 * Database パネル。ER図ビューとテーブル詳細ビューを持つ。
 *
 * ER図で箱をクリックすると詳細タブに切り替えて該当テーブルを開く。
 * 「構造を見る → 中身を見る」という自然な流れを作るため。
 */
import { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import type { SchemaDoc } from '../../game/caseTypes.ts';
import { Panel } from '../Panel/Panel.tsx';
import { ErDiagram } from './ErDiagram/ErDiagram.tsx';
import { TableDetail } from './TableDetail/TableDetail.tsx';
import styles from './DatabasePanel.module.css';

type View = 'er' | 'detail';

export function DatabasePanel({ schema }: { schema: SchemaDoc }) {
  const [view, setView] = useState<View>('er');
  const [selectedTable, setSelectedTable] = useState<string | undefined>(undefined);
  const [highlightedColumns, setHighlightedColumns] = useState<
    readonly { table: string; column: string }[]
  >([]);

  return (
    <Panel title="Database" aside={`${String(schema.tables.length)} テーブル`} padded={false}>
      <Tabs.Root
        value={view}
        onValueChange={(value) => setView(value as View)}
        className={styles.root}
      >
        <Tabs.List className={styles.tabList}>
          <Tabs.Tab value="er" className={styles.tab}>
            ER図
          </Tabs.Tab>
          <Tabs.Tab value="detail" className={styles.tab}>
            テーブル詳細
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="er" className={styles.erPanel}>
          <ErDiagram
            schema={schema}
            selectedTable={selectedTable}
            onSelectTable={(table) => {
              setSelectedTable(table);
              setView('detail');
            }}
            onHoverRelation={setHighlightedColumns}
          />
          <div className={styles.legend}>
            <span className={styles.legendItem}>PK = 主キー</span>
            <span className={styles.legendItem}>FK = 外部キー</span>
            <span className={styles.legendItem}>三又の先 = 多側</span>
            <span className={styles.legendItem}>箱をクリックで詳細</span>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="detail" className={styles.panel}>
          <TableDetail
            schema={schema}
            selectedTable={selectedTable}
            highlightedColumns={highlightedColumns}
          />
        </Tabs.Panel>
      </Tabs.Root>
    </Panel>
  );
}
