/**
 * SQLエラーを、初中級者が次の一手を打てる日本語に翻訳する。
 *
 * SQLite の生メッセージは短く正確だが、初中級者には冷たい。
 * かといって生メッセージを隠すと、調べようがなくなる。
 * **翻訳して見せ、生メッセージも残す**のが方針。
 *
 * ここは game core（純粋TS）。SQLエンジンの実装を知らず、
 * QueryError という契約だけを受け取る。
 *
 * @see docs/game-design.md#5-エラーとフィードバックのux
 */
import type { QueryError, QueryErrorKind } from '../engine/types.ts';
import { closestMatch } from './editDistance.ts';

/** 「もしかして」を出すために必要な、CASE のスキーマ情報。 */
export interface SchemaHints {
  tables: readonly string[];
  columns: readonly string[];
}

export interface FriendlyError {
  kind: QueryErrorKind;
  /** ユーザーに見せる主メッセージ。 */
  message: string;
  /** 「もしかして: `employees`」。候補が無ければ undefined。 */
  suggestion?: string;
  /** エンジンの生メッセージ。折りたたんで見せる。 */
  rawMessage: string;
}

const EMPTY_HINTS: SchemaHints = { tables: [], columns: [] };

const NO_SUCH_TABLE = /no such table:\s*(\S+)/i;
const NO_SUCH_COLUMN = /no such column:\s*(\S+)/i;
const AMBIGUOUS_COLUMN = /ambiguous column name:\s*(\S+)/i;
const NEAR_SYNTAX = /near\s+"([^"]*)":\s*syntax error/i;
const INCOMPLETE = /incomplete input/i;

/**
 * 生メッセージから kind を判定する。
 *
 * エンジン層は分類せず 'unknown' で上げてくる。分類はここに集約し、
 * PostgreSQL エンジンを足すときもこの関数を差し替えれば済むようにする。
 */
export function classifySqliteError(rawMessage: string): QueryErrorKind {
  if (NO_SUCH_TABLE.test(rawMessage)) return 'no_such_table';
  if (NO_SUCH_COLUMN.test(rawMessage)) return 'no_such_column';
  if (NEAR_SYNTAX.test(rawMessage) || INCOMPLETE.test(rawMessage)) return 'syntax';
  return 'unknown';
}

export function toFriendlyError(
  error: QueryError,
  hints: SchemaHints = EMPTY_HINTS,
): FriendlyError {
  const raw = error.rawMessage;

  // forbidden / timeout はエンジン生メッセージではなく、こちらで作った文言。
  if (error.kind === 'forbidden') {
    return { kind: 'forbidden', message: raw, rawMessage: raw };
  }
  if (error.kind === 'timeout') {
    return {
      kind: 'timeout',
      message:
        'クエリの実行に時間がかかりすぎたため中断しました。' +
        '結合する条件（ON 句や WHERE 句）が抜けていないか確認してください。',
      rawMessage: raw,
    };
  }

  const table = NO_SUCH_TABLE.exec(raw)?.[1];
  if (table !== undefined) {
    return withSuggestion(
      {
        kind: 'no_such_table',
        message: `テーブル \`${table}\` は存在しません。Database画面のテーブル一覧を確認してください。`,
        rawMessage: raw,
      },
      table,
      hints.tables,
    );
  }

  const column = NO_SUCH_COLUMN.exec(raw)?.[1];
  if (column !== undefined) {
    // `employees.nmae` のように修飾されている場合、比較するのは列名の部分だけ。
    const bare = column.includes('.') ? (column.split('.').pop() ?? column) : column;
    return withSuggestion(
      {
        kind: 'no_such_column',
        message: `カラム \`${column}\` は存在しません。Database画面でそのテーブルの列を確認してください。`,
        rawMessage: raw,
      },
      bare,
      hints.columns,
    );
  }

  const ambiguous = AMBIGUOUS_COLUMN.exec(raw)?.[1];
  if (ambiguous !== undefined) {
    return {
      kind: 'unknown',
      message:
        `\`${ambiguous}\` がどのテーブルの列か特定できません。` +
        `\`テーブル名.${ambiguous}\` のように、どちらの列かを書いてください。`,
      rawMessage: raw,
    };
  }

  const near = NEAR_SYNTAX.exec(raw)?.[1];
  if (near !== undefined) {
    return {
      kind: 'syntax',
      message:
        near === ''
          ? 'SQLが途中で終わっています。文が完成しているか確認してください。'
          : `\`${near}\` の手前に文法エラーがあります。つづりや括弧の対応を確認してください。`,
      rawMessage: raw,
    };
  }

  if (INCOMPLETE.test(raw)) {
    return {
      kind: 'syntax',
      message: 'SQLが途中で終わっています。文が完成しているか確認してください。',
      rawMessage: raw,
    };
  }

  return {
    kind: 'unknown',
    message: 'SQLを実行できませんでした。',
    rawMessage: raw,
  };
}

function withSuggestion(
  error: FriendlyError,
  input: string,
  candidates: readonly string[],
): FriendlyError {
  const match = closestMatch(input, candidates);
  // 完全一致（大小文字違いだけ等）は「もしかして」にならない。
  if (match === undefined || match.toLowerCase() === input.toLowerCase()) return error;
  return { ...error, suggestion: match };
}

/** schema.json 相当の情報から SchemaHints を作る。 */
export function buildSchemaHints(
  tables: readonly { name: string; columns: readonly { name: string }[] }[],
): SchemaHints {
  return {
    tables: tables.map((t) => t.name),
    columns: [...new Set(tables.flatMap((t) => t.columns.map((c) => c.name)))],
  };
}
