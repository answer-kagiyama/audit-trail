import { describe, expect, it } from 'vitest';
import {
  BOX,
  anchorOn,
  chooseSides,
  computeBox,
  computeRelationGeometry,
  computeBoxes,
  diagramRows,
  endpointMultiplicity,
  footPath,
  orthogonalPoints,
  pathMidpoint,
  rowCenterY,
} from './layout.ts';
import type { RelationDoc, SchemaDoc, TableDoc } from '../../../game/caseTypes.ts';

const employees: TableDoc = {
  name: 'employees',
  description: '社員名簿',
  erLayout: { x: 220, y: 200 },
  columns: [
    { name: 'id', type: 'INTEGER', nullable: false, key: 'pk', description: '' },
    { name: 'name', type: 'TEXT', nullable: false, description: '' },
    { name: 'department', type: 'TEXT', nullable: false, description: '' },
  ],
  sampleRows: [],
};

const transactions: TableDoc = {
  name: 'transactions',
  description: '取引記録',
  erLayout: { x: 220, y: 40 },
  columns: [
    { name: 'id', type: 'INTEGER', nullable: false, key: 'pk', description: '' },
    { name: 'employee_id', type: 'INTEGER', nullable: false, key: 'fk', description: '' },
    { name: 'amount', type: 'INTEGER', nullable: false, description: '' },
  ],
  sampleRows: [],
};

const relation: RelationDoc = {
  id: 'rel-tx-emp',
  from: { table: 'transactions', column: 'employee_id' },
  to: { table: 'employees', column: 'id' },
  cardinality: 'many-to-one',
  label: '実行したアカウント',
  description: '',
};

const schema: SchemaDoc = {
  tables: [employees, transactions],
  relations: [relation],
  erCanvas: { width: 520, height: 380 },
};

describe('diagramRows', () => {
  it('PK/FK の列だけを描く（全列だと図が破綻する）', () => {
    expect(diagramRows(employees).map((r) => r.column)).toEqual(['id']);
    expect(diagramRows(transactions).map((r) => r.column)).toEqual(['id', 'employee_id']);
  });
});

describe('computeBox', () => {
  it('高さは ヘッダ + PK/FK行数 で決まる', () => {
    expect(computeBox(employees).height).toBe(BOX.headerHeight + 1 * BOX.rowHeight);
    expect(computeBox(transactions).height).toBe(BOX.headerHeight + 2 * BOX.rowHeight);
  });

  it('幅は最も長いラベルに合わせ、最小幅を下回らない', () => {
    expect(computeBox(employees).width).toBeGreaterThanOrEqual(BOX.minWidth);
    // 'employee_id  INTEGER' はテーブル名より長いので、その分広い。
    expect(computeBox(transactions).width).toBeGreaterThan(BOX.minWidth);
  });

  it('位置は CASEデータの erLayout をそのまま使う（自動レイアウトしない）', () => {
    const box = computeBox(employees);
    expect([box.x, box.y]).toEqual([220, 200]);
  });
});

describe('rowCenterY', () => {
  it('その列の行の中心を返す', () => {
    const box = computeBox(transactions);
    expect(rowCenterY(box, 'id')).toBe(box.y + BOX.headerHeight + 0.5 * BOX.rowHeight);
    expect(rowCenterY(box, 'employee_id')).toBe(box.y + BOX.headerHeight + 1.5 * BOX.rowHeight);
  });

  it('図に描かれない列なら箱の中心にフォールバックする', () => {
    const box = computeBox(transactions);
    expect(rowCenterY(box, 'amount')).toBe(box.y + box.height / 2);
  });
});

describe('chooseSides', () => {
  it('横に離れていれば左右で結ぶ', () => {
    const a = computeBox({ ...employees, erLayout: { x: 0, y: 100 } });
    const b = computeBox({ ...transactions, erLayout: { x: 400, y: 100 } });
    expect(chooseSides(a, b)).toEqual({ from: 'right', to: 'left' });
    expect(chooseSides(b, a)).toEqual({ from: 'left', to: 'right' });
  });

  it('縦に離れていれば上下で結ぶ', () => {
    const a = computeBox({ ...transactions, erLayout: { x: 220, y: 40 } });
    const b = computeBox({ ...employees, erLayout: { x: 220, y: 300 } });
    expect(chooseSides(a, b)).toEqual({ from: 'bottom', to: 'top' });
    expect(chooseSides(b, a)).toEqual({ from: 'top', to: 'bottom' });
  });
});

describe('orthogonalPoints', () => {
  it('横接続は 水平 → 垂直 → 水平 の4点になる', () => {
    const points = orthogonalPoints(
      { x: 0, y: 50, side: 'right' },
      { x: 200, y: 150, side: 'left' },
    );
    expect(points).toHaveLength(4);
    expect(points[0]!.y).toBe(points[1]!.y); // 水平
    expect(points[1]!.x).toBe(points[2]!.x); // 垂直
    expect(points[2]!.y).toBe(points[3]!.y); // 水平
  });

  it('縦接続は 垂直 → 水平 → 垂直 の4点になる', () => {
    const points = orthogonalPoints(
      { x: 50, y: 0, side: 'bottom' },
      { x: 150, y: 200, side: 'top' },
    );
    expect(points[0]!.x).toBe(points[1]!.x);
    expect(points[1]!.y).toBe(points[2]!.y);
    expect(points[2]!.x).toBe(points[3]!.x);
  });

  it('斜め線を作らない（全区間が水平か垂直）', () => {
    const points = orthogonalPoints(
      { x: 0, y: 50, side: 'right' },
      { x: 200, y: 150, side: 'left' },
    );
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1]!;
      const current = points[i]!;
      expect(previous.x === current.x || previous.y === current.y).toBe(true);
    }
  });
});

describe('pathMidpoint', () => {
  it('中間の折れ線区間の中点を返す', () => {
    const mid = pathMidpoint({ x: 0, y: 50, side: 'right' }, { x: 200, y: 150, side: 'left' });
    expect(mid).toEqual({ x: 100, y: 100 });
  });
});

describe('endpointMultiplicity', () => {
  it('many-to-one を両端に分解する', () => {
    expect(endpointMultiplicity(relation)).toEqual({ from: 'many', to: 'one' });
  });

  it('one-to-many / one-to-one も分解する', () => {
    expect(endpointMultiplicity({ ...relation, cardinality: 'one-to-many' })).toEqual({
      from: 'one',
      to: 'many',
    });
    expect(endpointMultiplicity({ ...relation, cardinality: 'one-to-one' })).toEqual({
      from: 'one',
      to: 'one',
    });
  });
});

describe('footPath', () => {
  it('many は三又（3本のストローク）', () => {
    const path = footPath({ x: 100, y: 50, side: 'right' }, 'many');
    expect(path.match(/M/g)).toHaveLength(3);
  });

  it('one は1本の横棒', () => {
    const path = footPath({ x: 100, y: 50, side: 'right' }, 'one');
    expect(path.match(/M/g)).toHaveLength(1);
  });

  it('記号は箱の外側へ伸びる', () => {
    // right 側なら x が増える方向
    expect(footPath({ x: 100, y: 50, side: 'right' }, 'many')).toContain('111');
    // left 側なら x が減る方向
    expect(footPath({ x: 100, y: 50, side: 'left' }, 'many')).toContain('89');
  });
});

describe('computeRelationGeometry', () => {
  const boxes = computeBoxes(schema);

  it('両端のアンカーと経路を返す', () => {
    const geometry = computeRelationGeometry(relation, boxes);
    expect(geometry).toBeDefined();
    expect(geometry!.path.startsWith('M')).toBe(true);
    expect(geometry!.relation.label).toBe('実行したアカウント');
  });

  it('FK 側のアンカーはその列の行に付く', () => {
    const geometry = computeRelationGeometry(relation, boxes)!;
    const txBox = boxes.get('transactions')!;
    // transactions は employees の上にあるので bottom で出る。
    expect(geometry.fromAnchor.side).toBe('bottom');
    expect(geometry.fromAnchor.y).toBe(txBox.y + txBox.height);
  });

  it('存在しないテーブルを指すリレーションは undefined', () => {
    const broken = { ...relation, to: { table: 'ghost', column: 'id' } };
    expect(computeRelationGeometry(broken, boxes)).toBeUndefined();
  });
});

describe('anchorOn', () => {
  it('4辺それぞれの座標を返す', () => {
    const box = computeBox(employees);
    expect(anchorOn(box, 'left', 'id').x).toBe(box.x);
    expect(anchorOn(box, 'right', 'id').x).toBe(box.x + box.width);
    expect(anchorOn(box, 'top', 'id').y).toBe(box.y);
    expect(anchorOn(box, 'bottom', 'id').y).toBe(box.y + box.height);
  });
});
