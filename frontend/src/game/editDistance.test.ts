import { describe, expect, it } from 'vitest';
import { closestMatch, editDistance } from './editDistance.ts';

describe('editDistance', () => {
  it('同一文字列は0', () => {
    expect(editDistance('name', 'name')).toBe(0);
  });

  it('置換・挿入・削除をそれぞれ1と数える', () => {
    expect(editDistance('name', 'namn')).toBe(1);
    expect(editDistance('name', 'names')).toBe(1);
    expect(editDistance('names', 'name')).toBe(1);
  });

  it('隣接文字の入れ替わりを1と数える（Damerau）', () => {
    // これが素のレーベンシュタインだと2になり、短い語で候補から外れてしまう。
    expect(editDistance('nmae', 'name')).toBe(1);
    expect(editDistance('amount', 'amonut')).toBe(1);
  });

  it('空文字列は相手の長さ', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
  });
});

describe('closestMatch', () => {
  const columns = ['id', 'name', 'department', 'employee_id', 'occurred_at'];

  it('最も近い候補を返す', () => {
    expect(closestMatch('nmae', columns)).toBe('name');
    expect(closestMatch('departmnet', columns)).toBe('department');
    expect(closestMatch('employe_id', columns)).toBe('employee_id');
  });

  it('似ていなければ undefined', () => {
    expect(closestMatch('zzzzzzzzzz', columns)).toBeUndefined();
  });

  it('大小文字を無視して比較し、候補は元の表記で返す', () => {
    expect(closestMatch('NAME', columns)).toBe('name');
  });

  it('候補が空なら undefined', () => {
    expect(closestMatch('name', [])).toBeUndefined();
  });
});
