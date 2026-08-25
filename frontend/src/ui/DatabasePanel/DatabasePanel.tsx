/**
 * Database パネル。ER図ビューとテーブル詳細ビューを持つ。
 *
 * ER図で箱をクリックすると詳細タブに切り替えて該当テーブルを開く。
 * 「構造を見る → 中身を見る」という自然な流れを作るため。
 *
 * このパネルは**独立したカラム**を持ち、幅はプレイヤーが掴み手で決める
 * （docs/ui-layout.md §5）。カラム幅 880px で ER図が等倍になる。
 * 「拡大」は、狭い画面やもっと大きく見たいときのためにそのまま残してある。
 */
import { useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import type { Cardinality, SchemaDoc } from '../../game/caseTypes.ts';
import { Panel } from '../Panel/Panel.tsx';
import { ErDiagram } from './ErDiagram/ErDiagram.tsx';
import { TableDetail } from './TableDetail/TableDetail.tsx';
import styles from './DatabasePanel.module.css';

type View = 'er' | 'detail';

function cardinalityLabel(cardinality: Cardinality): string {
  switch (cardinality) {
    case 'many-to-one':
      return '多対1';
    case 'one-to-many':
      return '1対多';
    case 'one-to-one':
      return '1対1';
  }
}

export function DatabasePanel({
  schema,
  onCollapse,
}: {
  schema: SchemaDoc;
  onCollapse: () => void;
}) {
  // タブと選択中のテーブルは小窓と拡大で共有する。
  // 拡大して調べたテーブルが、閉じた瞬間に選び直しになるのは無駄な手間。
  const [view, setView] = useState<View>('er');
  const [selectedTable, setSelectedTable] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const body = (
    <DatabaseTabs
      schema={schema}
      view={view}
      onChangeView={setView}
      selectedTable={selectedTable}
      onSelectTable={setSelectedTable}
    />
  );

  return (
    <>
      <Panel
        title="Database"
        aside={`${String(schema.tables.length)} テーブル`}
        onCollapse={onCollapse}
        onExpand={() => {
          setExpanded(true);
        }}
        padded={false}
      >
        {body}
      </Panel>

      <Dialog.Root open={expanded} onOpenChange={setExpanded}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup ref={popupRef} className={styles.popup} initialFocus={popupRef}>
            <div className={styles.popupHead}>
              <Dialog.Title className={styles.popupTitle}>Database</Dialog.Title>
              <Dialog.Close className={styles.popupClose}>閉じる</Dialog.Close>
            </div>
            {/* 拡大側は別インスタンス。パン/ズームの位置は小窓と独立してよい。 */}
            <div className={styles.popupBody}>{body}</div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function DatabaseTabs({
  schema,
  view,
  onChangeView,
  selectedTable,
  onSelectTable,
}: {
  schema: SchemaDoc;
  view: View;
  onChangeView: (next: View) => void;
  selectedTable: string | undefined;
  onSelectTable: (table: string) => void;
}) {
  // ホバー中のリレーションはその場限りの表示なので、小窓と拡大で共有しない。
  const [highlightedColumns, setHighlightedColumns] = useState<
    readonly { table: string; column: string }[]
  >([]);

  return (
    <Tabs.Root
      value={view}
      onValueChange={(value) => {
        onChangeView(value as View);
      }}
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
            onSelectTable(table);
            onChangeView('detail');
          }}
          onHoverRelation={setHighlightedColumns}
        />

        <div className={styles.erFooter}>
          <div className={styles.legend}>
            <span className={styles.legendItem}>PK = 主キー</span>
            <span className={styles.legendItem}>FK = 外部キー</span>
            <span className={styles.legendItem}>三又の先 = 多側</span>
            <span className={styles.legendItem}>箱をクリックで詳細</span>
          </div>

          {/*
            図の代替表現。スクリーンリーダー利用者や、図が読み取りにくい人にも
            リレーションが伝わるようにする。折りたたみなので通常は邪魔にならない。
          */}
          <details className={styles.relationList}>
            <summary className={styles.relationSummary}>
              リレーションを文章で読む（{schema.relations.length} 件）
            </summary>
            <ul>
              {schema.relations.map((relation) => (
                <li key={relation.id}>
                  <code>
                    {relation.from.table}.{relation.from.column}
                  </code>{' '}
                  は{' '}
                  <code>
                    {relation.to.table}.{relation.to.column}
                  </code>{' '}
                  を指す（{cardinalityLabel(relation.cardinality)}）— {relation.label}
                </li>
              ))}
            </ul>
          </details>
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
  );
}
