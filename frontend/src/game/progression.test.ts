import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import {
  activeObjectives,
  allObjectivesCompleted,
  applyQueryResult,
  initialProgress,
  isCleared,
  nextHintLevel,
  revealHint,
  revealedHintsFor,
  submitFinalAnswer,
  totalHintsRevealed,
  canRevealAnswer,
  revealAnswer,
} from './progression.ts';
import type { ProgressState } from './progression.ts';
import type { CaseData } from './caseTypes.ts';
import { loadCase } from '../test/caseFixture.ts';
import type { LoadedCase } from '../test/caseFixture.ts';

let fixture: LoadedCase;
let caseData: CaseData;

beforeAll(async () => {
  fixture = await loadCase('case-001');
  caseData = fixture.caseData;
});

afterAll(() => {
  fixture.dispose();
});

const NOW = 1_700_000_000_000;

function fresh(): ProgressState {
  return initialProgress(NOW);
}

/** SQL を実行して進行を1手進める。 */
function step(state: ProgressState, sql: string) {
  return applyQueryResult(caseData, state, fixture.run(sql));
}

/** 各 Objective を解く正解SQL。通しプレイの再現に使う。 */
const WALKTHROUGH: Record<string, string> = {
  'obj-01': `SELECT * FROM transactions WHERE amount >= 1000000`,
  'obj-02': `SELECT e.name, t.amount FROM transactions t
             JOIN employees e ON e.id = t.employee_id WHERE t.id = 4821`,
  'obj-03': `SELECT * FROM login_logs WHERE occurred_at LIKE '2026-03-14 02%'`,
  'obj-04': `SELECT * FROM access_logs WHERE employee_id = 7 ORDER BY occurred_at DESC`,
  'obj-05': `WITH last_move AS (
               SELECT employee_id, direction,
                      ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY occurred_at DESC) AS rn
               FROM access_logs WHERE occurred_at <= '2026-03-14 02:14:33'
             )
             SELECT e.name FROM last_move l JOIN employees e ON e.id = l.employee_id
             WHERE l.rn = 1 AND l.direction = 'in'`,
  'obj-06': `SELECT e.name, l.ip_address FROM login_logs l
             JOIN employees e ON e.id = l.employee_id WHERE l.ip_address = '10.0.4.112'`,
  'obj-07': `SELECT * FROM login_logs WHERE employee_id = 7 AND result = 'failure'`,
};

describe('activeObjectives', () => {
  it('開始時は prerequisites が空のものだけが active', () => {
    const active = activeObjectives(caseData, fresh());
    expect(active.map((objective) => objective.id)).toEqual(['obj-01']);
  });

  it('達成すると次の Objective が active になる', () => {
    const after = step(fresh(), WALKTHROUGH['obj-01'] ?? '').state;
    expect(activeObjectives(caseData, after).map((o) => o.id)).toEqual(['obj-02']);
  });

  it('完了済みは active に含まれない', () => {
    const after = step(fresh(), WALKTHROUGH['obj-01'] ?? '').state;
    expect(activeObjectives(caseData, after).map((o) => o.id)).not.toContain('obj-01');
  });
});

describe('applyQueryResult', () => {
  it('達成すると証拠とストーリー断片を獲得する', () => {
    const outcome = step(fresh(), WALKTHROUGH['obj-01'] ?? '');
    expect(outcome.completedObjectives.map((o) => o.id)).toEqual(['obj-01']);
    expect(outcome.newEvidence).toEqual(['ev-01']);
    expect(outcome.newStoryBeats).toEqual(['beat-01']);
    expect(outcome.state.evidence).toEqual(['ev-01']);
  });

  it('達成しないクエリでも queryCount は増える', () => {
    const outcome = step(fresh(), `SELECT 1`);
    expect(outcome.completedObjectives).toEqual([]);
    expect(outcome.state.queryCount).toBe(1);
    expect(outcome.state.evidence).toEqual([]);
  });

  it('prerequisites 未達成なら、結果が一致しても達成しない', () => {
    // obj-03 の正解SQLを、obj-01 も解いていない状態でいきなり実行する。
    const outcome = step(fresh(), WALKTHROUGH['obj-03'] ?? '');
    expect(outcome.completedObjectives).toEqual([]);
    expect(outcome.state.completedObjectives).toEqual([]);
  });

  it('同じ Objective を二重に達成しない', () => {
    const first = step(fresh(), WALKTHROUGH['obj-01'] ?? '').state;
    const second = step(first, WALKTHROUGH['obj-01'] ?? '');
    expect(second.completedObjectives).toEqual([]);
    expect(second.state.completedObjectives).toEqual(['obj-01']);
  });

  it('並行 active な複数 Objective を1クエリで同時達成できる', () => {
    // obj-06 と obj-07 は obj-05 の後、並行して active になる。
    let state = fresh();
    for (const id of ['obj-01', 'obj-02', 'obj-03', 'obj-04', 'obj-05']) {
      state = step(state, WALKTHROUGH[id] ?? '').state;
    }
    expect(
      activeObjectives(caseData, state)
        .map((o) => o.id)
        .sort(),
    ).toEqual(['obj-06', 'obj-07']);

    // 端末と当日で絞り、名前・IP・時刻・結果を一度に出す欲張りなクエリ。
    // 5行に収まるので obj-06 / obj-07 の maxRows を両方満たす。
    const outcome = step(
      state,
      `SELECT e.name, l.ip_address, l.occurred_at, l.result FROM login_logs l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.ip_address = '10.0.4.112' AND l.occurred_at LIKE '2026-03-14%'`,
    );
    expect(outcome.completedObjectives.map((o) => o.id).sort()).toEqual(['obj-06', 'obj-07']);
    expect(outcome.newEvidence.sort()).toEqual(['ev-06', 'ev-07']);
  });

  it('絞りが甘いクエリは、maxRows を満たす Objective だけを達成する', () => {
    let state = fresh();
    for (const id of ['obj-01', 'obj-02', 'obj-03', 'obj-04', 'obj-05']) {
      state = step(state, WALKTHROUGH[id] ?? '').state;
    }

    // 端末だけで絞ると41行。obj-06(maxRows 60) は満たすが obj-07(maxRows 30) は満たさない。
    const outcome = step(
      state,
      `SELECT e.name, l.ip_address, l.occurred_at, l.result FROM login_logs l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.ip_address = '10.0.4.112'`,
    );
    expect(outcome.completedObjectives.map((o) => o.id)).toEqual(['obj-06']);
  });
});

describe('通しプレイ', () => {
  it('順に解くと全 Objective を達成し、証拠が7件揃う', () => {
    let state = fresh();
    for (const id of Object.keys(WALKTHROUGH)) {
      const outcome = step(state, WALKTHROUGH[id] ?? '');
      expect(
        outcome.completedObjectives.map((o) => o.id),
        `${id} が達成されない`,
      ).toContain(id);
      state = outcome.state;
    }

    expect(allObjectivesCompleted(caseData, state)).toBe(true);
    expect(activeObjectives(caseData, state)).toEqual([]);
    expect(state.evidence).toHaveLength(7);
    expect(state.queryCount).toBe(7);
  });

  it('最終回答に正解するとクリアになる', () => {
    let state = fresh();
    for (const id of Object.keys(WALKTHROUGH)) state = step(state, WALKTHROUGH[id] ?? '').state;

    const wrong = submitFinalAnswer(
      caseData,
      state,
      { culprit: '山田 咲', method: '他人のアカウントの認証情報を使って送金した' },
      NOW + 1000,
    );
    expect(wrong.correct).toBe(false);
    expect(isCleared(wrong.state)).toBe(false);
    expect(wrong.state.finalAnswerAttempts).toBe(1);

    const right = submitFinalAnswer(
      caseData,
      wrong.state,
      { culprit: '田中 誠', method: '他人のアカウントの認証情報を使って送金した' },
      NOW + 2000,
    );
    expect(right.correct).toBe(true);
    expect(isCleared(right.state)).toBe(true);
    expect(right.state.clearedAt).toBe(NOW + 2000);
    expect(right.state.finalAnswerAttempts).toBe(2);
  });

  it('クリア後に誤答してもクリア時刻は書き換わらない', () => {
    let state = fresh();
    for (const id of Object.keys(WALKTHROUGH)) state = step(state, WALKTHROUGH[id] ?? '').state;
    const cleared = submitFinalAnswer(
      caseData,
      state,
      { culprit: '田中 誠', method: '他人のアカウントの認証情報を使って送金した' },
      NOW + 1000,
    ).state;
    const after = submitFinalAnswer(caseData, cleared, { culprit: '山田 咲' }, NOW + 5000).state;
    expect(after.clearedAt).toBe(NOW + 1000);
  });
});

describe('ヒント', () => {
  it('1段階ずつ開示される', () => {
    let state = fresh();
    expect(revealedHintsFor(caseData, state, 'obj-01')).toEqual([]);
    expect(nextHintLevel(caseData, state, 'obj-01')).toBe(1);

    state = revealHint(caseData, state, 'obj-01');
    expect(revealedHintsFor(caseData, state, 'obj-01')).toHaveLength(1);
    expect(nextHintLevel(caseData, state, 'obj-01')).toBe(2);

    state = revealHint(caseData, state, 'obj-01');
    state = revealHint(caseData, state, 'obj-01');
    expect(revealedHintsFor(caseData, state, 'obj-01')).toHaveLength(3);
  });

  it('全部開示した後は増えない', () => {
    let state = fresh();
    for (let i = 0; i < 5; i += 1) state = revealHint(caseData, state, 'obj-01');
    expect(revealedHintsFor(caseData, state, 'obj-01')).toHaveLength(3);
    expect(nextHintLevel(caseData, state, 'obj-01')).toBeUndefined();
  });

  it('Objective ごとに独立している', () => {
    const state = revealHint(caseData, fresh(), 'obj-01');
    expect(revealedHintsFor(caseData, state, 'obj-02')).toEqual([]);
  });

  it('開示数を合計できる（プレイ記録用）', () => {
    let state = fresh();
    state = revealHint(caseData, state, 'obj-01');
    state = revealHint(caseData, state, 'obj-01');
    state = revealHint(caseData, state, 'obj-03');
    expect(totalHintsRevealed(state)).toBe(3);
  });
});

// ============================================================================
// 答えを見る（詰まったときの最後の逃げ道）
// ============================================================================
describe('答えの開示', () => {
  it('ヒントが残っているうちは出さない', () => {
    // 最初から押せる場所にあると、考える前に押せてしまう。
    const state = initialProgress(0);
    expect(canRevealAnswer(fixture.caseData, state, 'obj-01')).toBe(false);
  });

  it('ヒントを全部開いたら出る', () => {
    let state = initialProgress(0);
    const levels = fixture.caseData.hints['obj-01']?.length ?? 0;
    for (let i = 0; i < levels; i += 1) {
      state = revealHint(fixture.caseData, state, 'obj-01');
    }
    expect(canRevealAnswer(fixture.caseData, state, 'obj-01')).toBe(true);
  });

  it('一度見たら、もう出ない', () => {
    let state = initialProgress(0);
    const levels = fixture.caseData.hints['obj-01']?.length ?? 0;
    for (let i = 0; i < levels; i += 1) {
      state = revealHint(fixture.caseData, state, 'obj-01');
    }
    state = revealAnswer(state, 'obj-01');
    expect(canRevealAnswer(fixture.caseData, state, 'obj-01')).toBe(false);
    expect(state.revealedAnswers).toEqual(['obj-01']);
  });

  it('達成済みの Objective には出ない', () => {
    let state = initialProgress(0);
    const levels = fixture.caseData.hints['obj-01']?.length ?? 0;
    for (let i = 0; i < levels; i += 1) {
      state = revealHint(fixture.caseData, state, 'obj-01');
    }
    state = { ...state, completedObjectives: ['obj-01'] };
    expect(canRevealAnswer(fixture.caseData, state, 'obj-01')).toBe(false);
  });

  it('同じ Objective を二重に記録しない', () => {
    const state = revealAnswer(revealAnswer(initialProgress(0), 'obj-01'), 'obj-01');
    expect(state.revealedAnswers).toEqual(['obj-01']);
  });

  it('答えを見ても、その Objective が達成扱いにはならない', () => {
    // 自分で実行して結果を見るところまで残す。読まずに次へ進ませない。
    const state = revealAnswer(initialProgress(0), 'obj-01');
    expect(state.completedObjectives).toEqual([]);
  });
});
