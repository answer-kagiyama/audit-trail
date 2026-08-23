/**
 * CASEデータのTS型。JSONの構造と1対1に対応させる。
 *
 * @see docs/case-format.md
 */
import type { SqlValue } from '../engine/types.ts';
import type { Check, FinalAnswerSpec } from './checks.ts';

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

// --- metadata.json ----------------------------------------------------------

export interface CaseMetadata {
  id: string;
  /**
   * セーブ互換性のキー。CASEデータを変えたら必ず上げる。
   * 据え置くと、古いセーブを持つプレイヤーが詰む。
   */
  version: number;
  title: string;
  subtitle: string;
  difficulty: number;
  estimatedMinutes: [number, number];
  sqlConcepts: string[];
  dialect: 'sqlite' | 'postgres';
  files: {
    story: string;
    schema: string;
    hints: string;
    solution: string;
    database: string;
  };
}

// --- story.json -------------------------------------------------------------

export interface ObjectiveDoc {
  id: string;
  title: string;
  /** 「何を知りたいか」を書く。「どう書くか」はヒント側の役割。 */
  brief: string;
  /** これが全て完了すると active になる。空なら開始時から active。 */
  prerequisites: string[];
  rewards: { evidence: string[]; storyBeats: string[] };
}

export interface EvidenceDoc {
  id: string;
  title: string;
  body: string;
}

export interface StoryBeatDoc {
  id: string;
  body: string;
}

export interface StoryDoc {
  prologue: { title: string; body: string };
  objectives: ObjectiveDoc[];
  evidence: EvidenceDoc[];
  storyBeats: StoryBeatDoc[];
  epilogue: { title: string; body: string };
}

// --- solution.json / hints.json ---------------------------------------------

export interface SolutionDoc {
  checks: Record<string, Check[]>;
  finalAnswer: FinalAnswerSpec;
}

export interface HintDoc {
  level: number;
  body: string;
}

export type HintsDoc = Record<string, HintDoc[]>;

// --- 読み込み済みの CASE 一式 -------------------------------------------------

export interface CaseData {
  metadata: CaseMetadata;
  schema: SchemaDoc;
  story: StoryDoc;
  solution: SolutionDoc;
  hints: HintsDoc;
  /** CASE DB のバイト列。SqlEngine.loadDatabase に渡す。 */
  database: ArrayBuffer;
}

export function findObjective(story: StoryDoc, id: string): ObjectiveDoc | undefined {
  return story.objectives.find((objective) => objective.id === id);
}

export function findEvidence(story: StoryDoc, id: string): EvidenceDoc | undefined {
  return story.evidence.find((item) => item.id === id);
}

export function findStoryBeat(story: StoryDoc, id: string): StoryBeatDoc | undefined {
  return story.storyBeats.find((item) => item.id === id);
}
