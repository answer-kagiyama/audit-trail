/**
 * ER図のジオメトリ計算。純関数のみ。
 *
 * 箱の位置は CASEデータが持ち、ここでは箱の大きさ・接続点・経路だけを決める
 * （docs/case-format.md#41-er図のレイアウト）。自動レイアウトはしない。
 *
 * React も SVG も出てこないので、そのままユニットテストできる。
 */
import type { RelationDoc, SchemaDoc, TableDoc } from '../../../game/caseTypes.ts';

export const BOX = {
  headerHeight: 26,
  rowHeight: 20,
  minWidth: 132,
  paddingX: 12,
  /** 等幅フォント前提の1文字あたりの幅（px）。 */
  charWidth: 7.2,
} as const;

export interface Box {
  table: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** ER図に描く行（PK/FK列のみ）。 */
  rows: { column: string; type: string; key: 'pk' | 'fk' }[];
}

/** ER図に描く列は PK/FK のみ。全列を描くと4テーブルでも図が破綻する。 */
export function diagramRows(table: TableDoc): Box['rows'] {
  return table.columns
    .filter((column) => column.key !== undefined)
    .map((column) => ({ column: column.name, type: column.type, key: column.key as 'pk' | 'fk' }));
}

export function computeBox(table: TableDoc): Box {
  const rows = diagramRows(table);
  const labels = [table.name, ...rows.map((row) => `${row.column}  ${row.type}`)];
  const widest = Math.max(...labels.map((label) => label.length));

  return {
    table: table.name,
    x: table.erLayout.x,
    y: table.erLayout.y,
    width: Math.max(BOX.minWidth, Math.ceil(widest * BOX.charWidth + BOX.paddingX * 2)),
    height: BOX.headerHeight + rows.length * BOX.rowHeight,
    rows,
  };
}

export function computeBoxes(schema: SchemaDoc): Map<string, Box> {
  return new Map(schema.tables.map((table) => [table.name, computeBox(table)]));
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 実際に描かれる内容の外接矩形。
 *
 * 初期表示はこれに合わせる。erCanvas をそのまま viewBox にすると、
 * 宣言された キャンバス の縦横比とパネルの縦横比がずれたときに
 * 大きく余白が入って図が小さくなってしまう。
 * 座標そのものは CASEデータのものを使い続ける（自動レイアウトはしない）。
 */
export function computeContentBounds(boxes: Map<string, Box>): Bounds {
  const list = [...boxes.values()];
  if (list.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

  const left = Math.min(...list.map((b) => b.x));
  const top = Math.min(...list.map((b) => b.y));
  const right = Math.max(...list.map((b) => b.x + b.width));
  const bottom = Math.max(...list.map((b) => b.y + b.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface Anchor {
  x: number;
  y: number;
  side: Side;
}

/** 列の行の中心の y 座標。列が図に描かれていなければ箱の中心。 */
export function rowCenterY(box: Box, column: string): number {
  const index = box.rows.findIndex((row) => row.column === column);
  if (index === -1) return box.y + box.height / 2;
  return box.y + BOX.headerHeight + (index + 0.5) * BOX.rowHeight;
}

/**
 * 2つの箱をどの辺で結ぶか決める。
 *
 * 中心間の距離が横に大きければ左右、縦に大きければ上下。
 * CASE 001 は中央のテーブルから放射状に配置するので、これで線が交差しない。
 */
export function chooseSides(a: Box, b: Box): { from: Side; to: Side } {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
  }
  return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
}

export function anchorOn(box: Box, side: Side, column: string): Anchor {
  switch (side) {
    case 'left':
      return { x: box.x, y: rowCenterY(box, column), side };
    case 'right':
      return { x: box.x + box.width, y: rowCenterY(box, column), side };
    case 'top':
      return { x: box.x + box.width / 2, y: box.y, side };
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height, side };
  }
}

/**
 * 直交折れ線（L字/Z字）の経路。ベジエは使わない。
 *
 * 横接続なら「水平 → 中間で垂直 → 水平」、縦接続なら「垂直 → 中間で水平 → 垂直」。
 */
export function orthogonalPath(from: Anchor, to: Anchor): string {
  const points = orthogonalPoints(from, to);
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join(' ');
}

export function orthogonalPoints(from: Anchor, to: Anchor): { x: number; y: number }[] {
  const horizontal = from.side === 'left' || from.side === 'right';
  const stub = 16;

  if (horizontal) {
    const fx = from.side === 'right' ? from.x + stub : from.x - stub;
    const tx = to.side === 'right' ? to.x + stub : to.x - stub;
    const midX = (fx + tx) / 2;
    return [
      { x: from.x, y: from.y },
      { x: midX, y: from.y },
      { x: midX, y: to.y },
      { x: to.x, y: to.y },
    ];
  }

  const fy = from.side === 'bottom' ? from.y + stub : from.y - stub;
  const ty = to.side === 'bottom' ? to.y + stub : to.y - stub;
  const midY = (fy + ty) / 2;
  return [
    { x: from.x, y: from.y },
    { x: from.x, y: midY },
    { x: to.x, y: midY },
    { x: to.x, y: to.y },
  ];
}

/** ラベルを置く位置＝経路の中点。 */
export function pathMidpoint(from: Anchor, to: Anchor): { x: number; y: number } {
  const points = orthogonalPoints(from, to);
  const a = points[1];
  const b = points[2];
  if (!a || !b) return { x: from.x, y: from.y };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export type Multiplicity = 'one' | 'many';

/** cardinality を両端の多重度に分解する。 */
export function endpointMultiplicity(relation: RelationDoc): {
  from: Multiplicity;
  to: Multiplicity;
} {
  switch (relation.cardinality) {
    case 'many-to-one':
      return { from: 'many', to: 'one' };
    case 'one-to-many':
      return { from: 'one', to: 'many' };
    case 'one-to-one':
      return { from: 'one', to: 'one' };
  }
}

/**
 * クロウズフット記号のパス。
 *
 * 'many' は三又、'one' は直交する短い線。箱の外側へ向けて描く。
 */
export function footPath(anchor: Anchor, multiplicity: Multiplicity): string {
  const length = 11;
  const spread = 6;
  const { x, y, side } = anchor;

  // 箱の外向きの単位ベクトル
  const ox = side === 'left' ? -1 : side === 'right' ? 1 : 0;
  const oy = side === 'top' ? -1 : side === 'bottom' ? 1 : 0;
  // 直交方向
  const px = oy;
  const py = ox;

  const tipX = x + ox * length;
  const tipY = y + oy * length;

  if (multiplicity === 'one') {
    // 線を横切る1本の棒
    const bx = x + ox * (length * 0.6);
    const by = y + oy * (length * 0.6);
    return `M${round(bx - px * spread)},${round(by - py * spread)} L${round(bx + px * spread)},${round(by + py * spread)}`;
  }

  // 三又: 先端（箱の外側）から根元の3点へ
  return [
    `M${round(tipX)},${round(tipY)} L${round(x)},${round(y)}`,
    `M${round(tipX)},${round(tipY)} L${round(x - px * spread)},${round(y - py * spread)}`,
    `M${round(tipX)},${round(tipY)} L${round(x + px * spread)},${round(y + py * spread)}`,
  ].join(' ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface RelationGeometry {
  relation: RelationDoc;
  fromAnchor: Anchor;
  toAnchor: Anchor;
  path: string;
  label: { x: number; y: number };
  fromFoot: string;
  toFoot: string;
}

export function computeRelationGeometry(
  relation: RelationDoc,
  boxes: Map<string, Box>,
): RelationGeometry | undefined {
  const fromBox = boxes.get(relation.from.table);
  const toBox = boxes.get(relation.to.table);
  if (!fromBox || !toBox) return undefined;

  const sides = chooseSides(fromBox, toBox);
  const fromAnchor = anchorOn(fromBox, sides.from, relation.from.column);
  const toAnchor = anchorOn(toBox, sides.to, relation.to.column);
  const multiplicity = endpointMultiplicity(relation);

  return {
    relation,
    fromAnchor,
    toAnchor,
    path: orthogonalPath(fromAnchor, toAnchor),
    label: pathMidpoint(fromAnchor, toAnchor),
    fromFoot: footPath(fromAnchor, multiplicity.from),
    toFoot: footPath(toAnchor, multiplicity.to),
  };
}
