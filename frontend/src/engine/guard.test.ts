import { describe, expect, it } from 'vitest';
import { guardQuery, stripCommentsAndStrings } from './guard.ts';

function reject(sql: string): string {
  const verdict = guardQuery(sql);
  if (verdict.ok) throw new Error(`expected rejection: ${sql}`);
  return verdict.message;
}

describe('guardQuery', () => {
  it.each([
    'SELECT * FROM employees',
    '  select 1  ',
    'SELECT 1;',
    'WITH x AS (SELECT 1) SELECT * FROM x',
    '-- 捜査メモ\nSELECT 1',
    '/* memo */ SELECT 1',
  ])('許可する: %s', (sql) => {
    expect(guardQuery(sql).ok).toBe(true);
  });

  it.each([
    'INSERT INTO employees VALUES (1)',
    "UPDATE employees SET name = 'x'",
    'DELETE FROM employees',
    'DROP TABLE employees',
    "ATTACH DATABASE 'x' AS y",
    'PRAGMA table_info(employees)',
    'CREATE TABLE t (a INT)',
    'REPLACE INTO employees VALUES (1)',
  ])('拒否する: %s', (sql) => {
    expect(guardQuery(sql).ok).toBe(false);
  });

  it('書き込み系には世界観に沿ったメッセージを返す', () => {
    expect(reject('DELETE FROM employees')).toContain('捜査資料を書き換えることはできません');
  });

  it('複文を拒否する', () => {
    expect(reject('SELECT 1; DROP TABLE employees')).toContain('1文だけ');
  });

  it('末尾のセミコロンは複文とみなさない', () => {
    expect(guardQuery('SELECT 1;').ok).toBe(true);
    expect(guardQuery('SELECT 1;  ').ok).toBe(true);
    expect(guardQuery('SELECT 1;;').ok).toBe(true);
  });

  it('文字列リテラル内のセミコロンは区切りではない', () => {
    expect(guardQuery("SELECT ';' AS a").ok).toBe(true);
    expect(guardQuery("SELECT 'a;b' FROM employees WHERE name = 'x;y'").ok).toBe(true);
  });

  it('コメント内のセミコロンや書き込み語に惑わされない', () => {
    expect(guardQuery('SELECT 1 -- ; DROP TABLE t').ok).toBe(true);
    expect(guardQuery('SELECT 1 /* ; DELETE FROM t */').ok).toBe(true);
  });

  it('コメントで先頭を偽装しても拒否する', () => {
    expect(guardQuery('/* SELECT */ DELETE FROM employees').ok).toBe(false);
  });

  it('WITH から始まる書き込み文も、複文でなければ通ってしまう点は query_only が塞ぐ', () => {
    // 許可リストは「先頭トークン」しか見ない。SQLite の WITH ... DELETE は
    // ここをすり抜けるが、Worker 側の PRAGMA query_only = ON で失敗する。
    // ガードはゲームルール、query_only が実効的な歯止め、という多層防御。
    expect(guardQuery('WITH x AS (SELECT 1) DELETE FROM employees').ok).toBe(true);
  });

  it('空入力とコメントのみを拒否する', () => {
    expect(reject('')).toContain('入力されていません');
    expect(reject('   ')).toContain('入力されていません');
    expect(reject('-- memo only')).toContain('実行できるSQL');
  });
});

describe('stripCommentsAndStrings', () => {
  it('文字列とコメントを取り除く（改行は残る）', () => {
    // 行コメントは改行の手前までを落とすので、改行そのものは残る。
    expect(stripCommentsAndStrings("SELECT 'a;b' -- x\nFROM t")).toBe('SELECT   \nFROM t');
  });

  it('エスケープされたクォートを閉じ記号と誤認しない', () => {
    expect(stripCommentsAndStrings("SELECT 'it''s' , 1").includes("'")).toBe(false);
  });

  it('角括弧・バッククォート識別子も飛ばす', () => {
    expect(stripCommentsAndStrings('SELECT [a;b], `c;d` FROM t').includes(';')).toBe(false);
  });
});
