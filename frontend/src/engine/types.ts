/**
 * SQL実行層の契約。
 *
 * このファイルが「ゲーム」と「SQLエンジン」の唯一の境界である。
 * game/ と ui/ はここで定義された型しか知らず、sql.js の型を一切参照しない。
 * 将来 PostgreSQL 実行エンジンを追加するときは、この SqlEngine を実装するだけでよい。
 *
 * @see docs/architecture.md#2-レイヤ境界最重要
 * @see docs/adr/0001-sql-engine.md
 */

/**
 * 結果セルの値。
 *
 * SQLite 固有の表現（BLOB、bigint など）をここに漏らさない。
 * PostgreSQL でも表現できる形に正規化してから返すこと。
 */
export type SqlValue = string | number | boolean | null | Uint8Array;

export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
  /** 切り捨て前の総行数。rows.length とは一致しないことがある。 */
  rowCount: number;
  /** maxRows で切り捨てたか。 */
  truncated: boolean;
  elapsedMs: number;
}

/**
 * 失敗の分類。
 *
 * 'unknown' 以外への振り分けは Phase 2 の errorMap（Issue #8）で行う。
 * エンジン層は raw メッセージを保持することに責任を持ち、
 * ユーザー向け日本語化は game/ 側の責務とする。
 */
export type QueryErrorKind =
  'syntax' | 'no_such_table' | 'no_such_column' | 'timeout' | 'forbidden' | 'unknown';

export interface QueryError {
  kind: QueryErrorKind;
  /** エンジンの生メッセージ。デバッグと「もしかして」推定に使う。 */
  rawMessage: string;
}

/** execute() が失敗したときに throw される例外。 */
export class SqlExecutionError extends Error implements QueryError {
  readonly kind: QueryErrorKind;
  readonly rawMessage: string;

  constructor(kind: QueryErrorKind, rawMessage: string) {
    super(`[${kind}] ${rawMessage}`);
    this.name = 'SqlExecutionError';
    this.kind = kind;
    this.rawMessage = rawMessage;
  }
}

export function isSqlExecutionError(e: unknown): e is SqlExecutionError {
  return e instanceof SqlExecutionError;
}

export interface ExecuteOptions {
  /** 既定 DEFAULT_TIMEOUT_MS。超過時は kind: 'timeout' で失敗する。 */
  timeoutMs?: number;
  /** 既定 DEFAULT_MAX_ROWS。超過分は捨てるが rowCount には数える。 */
  maxRows?: number;
}

export const DEFAULT_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_ROWS = 500;

export interface SqlEngine {
  init(): Promise<void>;
  /** 読み取り専用のDBをバイト列から読み込む。既存のDBは破棄される。 */
  loadDatabase(bytes: ArrayBuffer): Promise<void>;
  /** @throws {SqlExecutionError} */
  execute(sql: string, opts?: ExecuteOptions): Promise<QueryResult>;
  dispose(): Promise<void>;
}
