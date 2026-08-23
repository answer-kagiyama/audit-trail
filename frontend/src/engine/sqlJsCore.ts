/**
 * sql.js の薄いラッパー。Worker の中でも Node（Vitest）でも同じコードが動く。
 *
 * ここには Worker も postMessage も出てこない。そのおかげで
 * SQL 実行そのものを WASM だけで（Worker 抜きで）テストできる。
 *
 * @see docs/architecture.md#5-sql実行フロー
 */
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import type { QueryResult, SqlValue } from './types.ts';
import { SqlExecutionError } from './types.ts';

export interface SqlJsCoreOptions {
  /** sql.js が `sql-wasm.wasm` を解決するための関数。環境ごとに与える。 */
  locateFile: (file: string) => string;
}

/** sql.js が返しうるセル値。boolean は返らない。 */
type RawCell = number | string | Uint8Array | null;

function normalizeCell(value: RawCell): SqlValue {
  // sql.js は SQLite の値をそのまま返す。SqlValue に収まる形へ揃えるだけで、
  // ここで型変換（数値文字列→数値など）はしない。判定側の normalize が担う。
  return value;
}

export class SqlJsCore {
  private sqlJs: SqlJsStatic | null = null;
  private db: Database | null = null;

  private readonly options: SqlJsCoreOptions;

  constructor(options: SqlJsCoreOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    if (this.sqlJs) return;
    this.sqlJs = await initSqlJs({ locateFile: this.options.locateFile });
  }

  loadDatabase(bytes: Uint8Array): void {
    const sqlJs = this.sqlJs;
    if (!sqlJs) throw new SqlExecutionError('unknown', 'init() before loadDatabase()');
    this.db?.close();
    this.db = new sqlJs.Database(bytes);
    // 多層防御: 文字列ガード（Issue #7）をすり抜けても、実際の書き込みは失敗する。
    // ゲームDBは読み取り専用として扱う。docs/architecture.md#6-クエリガード
    this.db.run('PRAGMA query_only = ON;');
  }

  get hasDatabase(): boolean {
    return this.db !== null;
  }

  /**
   * 先頭の1文を実行する。
   *
   * 全行を step して総行数を数えるが、保持するのは maxRows 件まで。
   * 巨大な結果でメモリを食い潰さずに rowCount を正確に返せる。
   *
   * @throws {SqlExecutionError}
   */
  execute(sql: string, maxRows: number): QueryResult {
    const db = this.db;
    if (!db) throw new SqlExecutionError('unknown', 'no database loaded');

    const startedAt = performance.now();
    let statement;
    try {
      statement = db.prepare(sql);
    } catch (e) {
      throw new SqlExecutionError('unknown', messageOf(e));
    }

    try {
      const columns = statement.getColumnNames();
      const rows: SqlValue[][] = [];
      let rowCount = 0;

      while (statement.step()) {
        rowCount += 1;
        if (rows.length < maxRows) {
          rows.push((statement.get() as RawCell[]).map(normalizeCell));
        }
      }

      return {
        columns,
        rows,
        rowCount,
        truncated: rowCount > rows.length,
        elapsedMs: performance.now() - startedAt,
      };
    } catch (e) {
      throw new SqlExecutionError('unknown', messageOf(e));
    } finally {
      statement.free();
    }
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
