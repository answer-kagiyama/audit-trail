/**
 * ER図ビューア。インラインSVGで自前描画する。
 *
 * これは補助情報ではなくゲーム要素の一つ。ER図が読めることが JOIN を書く
 * 前提の思考であり、ER図の読み方を学ぶこと自体を副次的な価値として意図している
 * （docs/game-design.md#er図ビュー）。
 *
 * 図描画ライブラリも自動レイアウトも使わない。座標は CASEデータが持つ。
 */
import { useMemo, useState } from 'react';
import type { RelationDoc, SchemaDoc } from '../../../game/caseTypes.ts';
import { BOX, computeBoxes, computeContentBounds, computeRelationGeometry } from './layout.ts';
import type { Box } from './layout.ts';
import { usePanZoom } from './usePanZoom.ts';
import styles from './ErDiagram.module.css';

export interface ErDiagramProps {
  schema: SchemaDoc;
  selectedTable?: string | undefined;
  onSelectTable: (table: string) => void;
  /** ホバー中のリレーションの両端。テーブル詳細側で列をハイライトする。 */
  onHoverRelation: (endpoints: readonly { table: string; column: string }[]) => void;
}

/** 内容の外側に取る余白（クロウズフット記号とラベルのぶん）。 */
const PADDING = 40;

export function ErDiagram({
  schema,
  selectedTable,
  onSelectTable,
  onHoverRelation,
}: ErDiagramProps) {
  const [activeRelation, setActiveRelation] = useState<string | null>(null);

  const boxes = useMemo(() => computeBoxes(schema), [schema]);
  const geometries = useMemo(
    () =>
      schema.relations
        .map((relation) => computeRelationGeometry(relation, boxes))
        .filter((geometry) => geometry !== undefined),
    [schema.relations, boxes],
  );

  // 初期表示は内容の外接矩形にフィットさせる。erCanvas をそのまま使うと、
  // 宣言された縦横比とパネルの縦横比がずれたときに図が小さくなる。
  const initialViewBox = useMemo(() => {
    const bounds = computeContentBounds(boxes);
    return {
      x: bounds.x - PADDING,
      y: bounds.y - PADDING,
      width: bounds.width + PADDING * 2,
      height: bounds.height + PADDING * 2,
    };
  }, [boxes]);

  const { svgRef, viewBox, reset, handlers } = usePanZoom(initialViewBox);

  const highlightedColumns = useMemo(() => {
    const relation = schema.relations.find((r) => r.id === activeRelation);
    return relation ? [relation.from, relation.to] : [];
  }, [activeRelation, schema.relations]);

  const setActive = (relation: RelationDoc | null) => {
    setActiveRelation(relation?.id ?? null);
    onHoverRelation(relation ? [relation.from, relation.to] : []);
  };

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`${String(viewBox.x)} ${String(viewBox.y)} ${String(viewBox.width)} ${String(viewBox.height)}`}
        role="img"
        aria-label={`ER図: ${schema.tables.map((t) => t.name).join('、')} の ${String(schema.relations.length)} 本のリレーション`}
        {...handlers}
      >
        <title>テーブル間のリレーション</title>

        {/* 線を先に描き、箱を上に重ねる。 */}
        {geometries.map((geometry) => (
          <g
            key={geometry.relation.id}
            className={`${styles.relation} ${activeRelation === geometry.relation.id ? styles.relationActive : ''}`}
            onPointerEnter={() => setActive(geometry.relation)}
            onPointerLeave={() => setActive(null)}
          >
            <path className={styles.hitArea} d={geometry.path} />
            <path className={styles.line} d={geometry.path} />
            <path className={styles.foot} d={geometry.fromFoot} />
            <path className={styles.foot} d={geometry.toFoot} />

            {/* 記号だけでは意味が伝わらないので、線に日本語ラベルを添える。 */}
            <rect
              className={styles.labelBg}
              x={geometry.label.x - geometry.relation.label.length * 5 - 4}
              y={geometry.label.y - 8}
              width={geometry.relation.label.length * 10 + 8}
              height={16}
              rx={3}
            />
            <text className={styles.label} x={geometry.label.x} y={geometry.label.y}>
              {geometry.relation.label}
            </text>
          </g>
        ))}

        {schema.tables.map((table) => {
          const box = boxes.get(table.name);
          if (!box) return null;
          return (
            <TableBox
              key={table.name}
              box={box}
              selected={table.name === selectedTable}
              highlightedColumns={highlightedColumns
                .filter((c) => c.table === table.name)
                .map((c) => c.column)}
              onSelect={() => onSelectTable(table.name)}
            />
          );
        })}
      </svg>

      <div className={styles.toolbar}>
        <button type="button" className={styles.toolButton} onClick={reset}>
          全体表示
        </button>
      </div>
    </div>
  );
}

function TableBox({
  box,
  selected,
  highlightedColumns,
  onSelect,
}: {
  box: Box;
  selected: boolean;
  highlightedColumns: readonly string[];
  onSelect: () => void;
}) {
  return (
    <g
      className={`${styles.box} ${selected ? styles.boxSelected : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${box.table} の詳細を開く`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <rect className={styles.boxFrame} x={box.x} y={box.y} width={box.width} height={box.height} />
      <path
        className={styles.boxHeader}
        d={`M${String(box.x + 4)},${String(box.y)} h${String(box.width - 8)} a4,4 0 0 1 4,4 v${String(BOX.headerHeight - 4)} h${String(-box.width)} v${String(-(BOX.headerHeight - 4))} a4,4 0 0 1 4,-4 z`}
      />
      <text className={styles.boxTitle} x={box.x + BOX.paddingX} y={box.y + BOX.headerHeight / 2}>
        {box.table}
      </text>
      <line
        className={styles.divider}
        x1={box.x}
        y1={box.y + BOX.headerHeight}
        x2={box.x + box.width}
        y2={box.y + BOX.headerHeight}
      />

      {box.rows.map((row, index) => {
        const top = box.y + BOX.headerHeight + index * BOX.rowHeight;
        const middle = top + BOX.rowHeight / 2;
        const isHighlighted = highlightedColumns.includes(row.column);
        return (
          <g key={row.column}>
            {isHighlighted && (
              <rect
                className={styles.rowHighlightBg}
                x={box.x + 1}
                y={top}
                width={box.width - 2}
                height={BOX.rowHeight}
              />
            )}
            <text
              className={`${styles.rowText} ${isHighlighted ? styles.rowHighlighted : ''}`}
              x={box.x + BOX.paddingX}
              y={middle}
            >
              {row.column}
            </text>
            <text
              className={styles.rowKey}
              x={box.x + box.width - BOX.paddingX}
              y={middle}
              textAnchor="end"
            >
              {row.key.toUpperCase()}
            </text>
          </g>
        );
      })}
    </g>
  );
}
