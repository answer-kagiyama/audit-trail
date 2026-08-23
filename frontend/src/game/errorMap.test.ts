import { describe, expect, it } from 'vitest';
import { buildSchemaHints, classifySqliteError, toFriendlyError } from './errorMap.ts';
import type { SchemaHints } from './errorMap.ts';
import { SqlExecutionError } from '../engine/types.ts';

const HINTS: SchemaHints = {
  tables: ['employees', 'transactions', 'login_logs', 'access_logs'],
  columns: ['id', 'name', 'department', 'employee_id', 'amount', 'occurred_at', 'ip_address'],
};

function friendly(raw: string) {
  return toFriendlyError(new SqlExecutionError('unknown', raw), HINTS);
}

// docs/game-design.md §5 の4パターン
describe('game-design.md §5 の4パターン', () => {
  it('no such table → 案内 + もしかして', () => {
    const e = friendly('no such table: employee');
    expect(e.kind).toBe('no_such_table');
    expect(e.message).toContain('テーブル `employee` は存在しません');
    expect(e.message).toContain('Database画面');
    expect(e.suggestion).toBe('employees');
  });

  it('no such column → 案内 + もしかして', () => {
    const e = friendly('no such column: nmae');
    expect(e.kind).toBe('no_such_column');
    expect(e.message).toContain('カラム `nmae` は存在しません');
    expect(e.suggestion).toBe('name');
  });

  it('syntax error → どこの手前かを示す', () => {
    const e = friendly('near "FROM": syntax error');
    expect(e.kind).toBe('syntax');
    expect(e.message).toContain('`FROM` の手前に文法エラーがあります');
  });

  it('ambiguous column → 修飾を促す', () => {
    const e = friendly('ambiguous column name: id');
    expect(e.message).toContain('`id` がどのテーブルの列か特定できません');
    expect(e.message).toContain('テーブル名.id');
  });
});

describe('もしかして', () => {
  it('修飾付きカラムは列名部分だけで比較する', () => {
    expect(friendly('no such column: employees.nmae').suggestion).toBe('name');
  });

  it('似ていない語には候補を出さない', () => {
    expect(friendly('no such table: zzzzzzzz').suggestion).toBeUndefined();
  });

  it('短い語では誤爆させない', () => {
    // 'ids' → 'id' は距離1で許容。'xyz' → 何にも近くない。
    expect(friendly('no such column: ids').suggestion).toBe('id');
    expect(friendly('no such column: xyz').suggestion).toBeUndefined();
  });

  it('大小文字違いだけなら候補を出さない（同じ語の言い換えになるため）', () => {
    expect(friendly('no such table: EMPLOYEES').suggestion).toBeUndefined();
  });

  it('スキーマ情報が無ければ候補なしで案内だけ返す', () => {
    const e = toFriendlyError(new SqlExecutionError('unknown', 'no such table: employee'));
    expect(e.message).toContain('存在しません');
    expect(e.suggestion).toBeUndefined();
  });
});

describe('エンジン由来でない kind', () => {
  it('forbidden はガードの文言をそのまま見せる', () => {
    const message = 'このゲームでは記録の閲覧のみ可能です。捜査資料を書き換えることはできません。';
    const e = toFriendlyError(new SqlExecutionError('forbidden', message));
    expect(e.kind).toBe('forbidden');
    expect(e.message).toBe(message);
  });

  it('timeout は次の一手を示す', () => {
    const e = toFriendlyError(new SqlExecutionError('timeout', 'query exceeded 5000ms'));
    expect(e.kind).toBe('timeout');
    expect(e.message).toContain('中断しました');
    expect(e.message).toContain('ON 句や WHERE 句');
  });
});

describe('その他', () => {
  it('未知のエラーでも生メッセージは必ず保持する', () => {
    const e = friendly('database disk image is malformed');
    expect(e.kind).toBe('unknown');
    expect(e.rawMessage).toBe('database disk image is malformed');
  });

  it('incomplete input は文が途中だと伝える', () => {
    expect(friendly('incomplete input').message).toContain('途中で終わって');
  });

  it('near "" は文が途中だと伝える', () => {
    expect(friendly('near "": syntax error').message).toContain('途中で終わって');
  });

  it('classifySqliteError が kind を判定する', () => {
    expect(classifySqliteError('no such table: t')).toBe('no_such_table');
    expect(classifySqliteError('no such column: c')).toBe('no_such_column');
    expect(classifySqliteError('near "x": syntax error')).toBe('syntax');
    expect(classifySqliteError('something else')).toBe('unknown');
  });
});

describe('buildSchemaHints', () => {
  it('テーブル名と、重複を除いた列名を集める', () => {
    const hints = buildSchemaHints([
      { name: 'employees', columns: [{ name: 'id' }, { name: 'name' }] },
      { name: 'transactions', columns: [{ name: 'id' }, { name: 'amount' }] },
    ]);
    expect(hints.tables).toEqual(['employees', 'transactions']);
    expect(hints.columns).toEqual(['id', 'name', 'amount']);
  });
});
