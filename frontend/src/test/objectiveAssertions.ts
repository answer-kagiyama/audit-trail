/**
 * CASE検証テストが共通で使う「達成判定できたか」のアサーション。
 *
 * CASEごとのテスト（`game/case-00X.test.ts`）はどれも同じ形をしている:
 * 正解例を並べて**すべて通る**ことを見て、惜しい誤答を並べて**どれも通らない**
 * ことを見る。その足回りを各ファイルに写していたら、CASE 003 を足す頃には
 * エラーメッセージの文言が3通りに分かれていた——同じことをする関数が3つある
 * というのは、いずれ3つとも違う挙動になるということ。
 *
 * `LoadedCase` は `beforeAll` で入るので、値ではなく**取り出す関数**を受け取る。
 *
 * @see docs/case-format.md#8-case追加時のチェックリスト
 */
import { expect } from 'vitest';
import { evaluateChecks } from '../game/checks.ts';
import type { LoadedCase } from './caseFixture.ts';

export interface ObjectiveAssertions {
  /** 正解例は「すべて」通らなければならない。落ちたら理由まで出す。 */
  expectAllSolve: (objectiveId: string, queries: Record<string, string>) => void;
  /** 惜しい誤答は「どれも」通ってはならない。 */
  expectNoneSolve: (objectiveId: string, queries: Record<string, string>) => void;
}

export function objectiveAssertions(caseUnderTest: () => LoadedCase): ObjectiveAssertions {
  function judge(objectiveId: string, sql: string) {
    const c = caseUnderTest();
    const checks = c.solution.checks[objectiveId];
    if (!checks) throw new Error(`checks がありません: ${objectiveId}`);
    return evaluateChecks(checks, c.run(sql));
  }

  return {
    expectAllSolve(objectiveId, queries) {
      for (const [label, sql] of Object.entries(queries)) {
        const outcome = judge(objectiveId, sql);
        if (!outcome.passed) {
          throw new Error(
            `${objectiveId} の正解例「${label}」が達成判定されませんでした。\n` +
              `  理由: ${outcome.reason ?? '(不明)'}\n  SQL: ${sql}`,
          );
        }
        expect(outcome.passed).toBe(true);
      }
    },

    expectNoneSolve(objectiveId, queries) {
      for (const [label, sql] of Object.entries(queries)) {
        const outcome = judge(objectiveId, sql);
        if (outcome.passed) {
          throw new Error(
            `${objectiveId} の不正解例「${label}」が達成判定されてしまいました。\n  SQL: ${sql}`,
          );
        }
        expect(outcome.passed).toBe(false);
      }
    },
  };
}
