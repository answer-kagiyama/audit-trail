/**
 * CASEデータのTS型。JSONの構造と1対1に対応させる。
 *
 * Phase 2 の時点では schema.json 相当だけを定義する。
 * story / hints / solution とローダー・検証は Issue #21, #22 で足す。
 *
 * @see docs/case-format.md
 */
import type { SqlValue } from '../engine/types.ts';

/** ER図の箱に描く印。通常列は付けない。 */
export type ColumnKey = 'pk' | 'fk';

export interface ColumnDoc {
  name: string;
  /** SQLite の宣言型をそのまま書く。日時列が TEXT であることを隠さない。 */
  type: string;
  nullable: boolean;
  key?: ColumnKey;
  description: string;
}

export interface TableDoc {
  name: string;
  description: string;
  /** ER図での箱の左上角。自動レイアウトは使わない（case-format.md §4.1）。 */
  erLayout: { x: number; y: number };
  columns: ColumnDoc[];
  /**
   * サンプル行。型と値の見え方を掴ませるために必須。
   * occurred_at が 'YYYY-MM-DD HH:MM:SS' なのか epoch なのかが
   * 分からないとプレイヤーは詰む。
   */
  sampleRows: Record<string, SqlValue>[];
}

export type Cardinality = 'many-to-one' | 'one-to-many' | 'one-to-one';

export interface RelationEndpoint {
  table: string;
  column: string;
}

export interface RelationDoc {
  id: string;
  from: RelationEndpoint;
  to: RelationEndpoint;
  cardinality: Cardinality;
  /** ER図の線に添える日本語ラベル。記号だけでは意味が伝わらない。 */
  label: string;
  description: string;
}

export interface SchemaDoc {
  tables: TableDoc[];
  relations: RelationDoc[];
  erCanvas: { width: number; height: number };
}

export function findTable(schema: SchemaDoc, name: string): TableDoc | undefined {
  return schema.tables.find((table) => table.name === name);
}
