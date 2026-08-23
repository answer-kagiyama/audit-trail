/**
 * Objective の進行。純関数のみ。
 *
 * React も WASM も知らないので、進行のルールだけを Node のテストで確かめられる。
 * UI 側はこの状態を描くだけにする。
 *
 * @see docs/game-design.md#2-進行モデルデータ構造の語彙
 */
import type { QueryResult } from '../engine/types.ts';
import { evaluateChecks, evaluateFinalAnswer } from './checks.ts';
import type { CaseData, ObjectiveDoc } from './caseTypes.ts';

export interface ProgressState {
  /** 完了した Objective。達成順。 */
  completedObjectives: string[];
  /** 獲得した証拠。獲得順。 */
  evidence: string[];
  /** 開示されたストーリー断片。獲得順。 */
  storyBeats: string[];
  /** Objective ごとの、開示済みヒントの最大レベル。 */
  revealedHints: Record<string, number>;
  /** 実行に成功したクエリの数。クリア時のプレイ記録に使う。 */
  queryCount: number;
  /** 最終回答の試行回数。 */
  finalAnswerAttempts: number;
  /** 開始時刻（epoch ms）。 */
  startedAt: number;
  /** クリア時刻（epoch ms）。未クリアなら null。 */
  clearedAt: number | null;
}

export function initialProgress(now: number): ProgressState {
  return {
    completedObjectives: [],
    evidence: [],
    storyBeats: [],
    revealedHints: {},
    queryCount: 0,
    finalAnswerAttempts: 0,
    startedAt: now,
    clearedAt: null,
  };
}

/**
 * いま取り組める Objective。
 *
 * prerequisites が全て完了していて、まだ自分は完了していないもの。
 * 同時に複数 active になりうる（順不同で解ける）。
 */
export function activeObjectives(caseData: CaseData, state: ProgressState): ObjectiveDoc[] {
  const completed = new Set(state.completedObjectives);
  return caseData.story.objectives.filter(
    (objective) =>
      !completed.has(objective.id) &&
      objective.prerequisites.every((prerequisite) => completed.has(prerequisite)),
  );
}

export function isObjectiveCompleted(state: ProgressState, id: string): boolean {
  return state.completedObjectives.includes(id);
}

export function allObjectivesCompleted(caseData: CaseData, state: ProgressState): boolean {
  return caseData.story.objectives.every((objective) =>
    state.completedObjectives.includes(objective.id),
  );
}

export interface QueryOutcome {
  state: ProgressState;
  /** このクエリで新たに達成された Objective。 */
  completedObjectives: ObjectiveDoc[];
  /** このクエリで新たに獲得した証拠ID。 */
  newEvidence: string[];
  /** このクエリで新たに開示されたストーリー断片ID。 */
  newStoryBeats: string[];
}

/**
 * クエリ成功のたびに、active な全 Objective の checks を評価する。
 *
 * 複数が同時に達成されうる。プレイヤーが先回りして大きなJOINを1発で書いた場合に
 * まとめて達成されるのは仕様であって、バグではない。
 *
 * 逆に prerequisites を満たしていない Objective は、たまたま結果が一致しても
 * 達成しない。ストーリーの順序が壊れるのを防ぐため。
 */
export function applyQueryResult(
  caseData: CaseData,
  state: ProgressState,
  result: QueryResult,
): QueryOutcome {
  const completedObjectives: ObjectiveDoc[] = [];

  for (const objective of activeObjectives(caseData, state)) {
    const checks = caseData.solution.checks[objective.id];
    if (!checks) continue;
    if (evaluateChecks(checks, result).passed) completedObjectives.push(objective);
  }

  const newEvidence = dedupe(
    completedObjectives.flatMap((objective) => objective.rewards.evidence),
  ).filter((id) => !state.evidence.includes(id));

  const newStoryBeats = dedupe(
    completedObjectives.flatMap((objective) => objective.rewards.storyBeats),
  ).filter((id) => !state.storyBeats.includes(id));

  return {
    state: {
      ...state,
      queryCount: state.queryCount + 1,
      completedObjectives: [
        ...state.completedObjectives,
        ...completedObjectives.map((objective) => objective.id),
      ],
      evidence: [...state.evidence, ...newEvidence],
      storyBeats: [...state.storyBeats, ...newStoryBeats],
    },
    completedObjectives,
    newEvidence,
    newStoryBeats,
  };
}

/** そのObjectiveの、次に開示されるヒントのレベル。もう無ければ undefined。 */
export function nextHintLevel(
  caseData: CaseData,
  state: ProgressState,
  objectiveId: string,
): number | undefined {
  const hints = caseData.hints[objectiveId] ?? [];
  const revealed = state.revealedHints[objectiveId] ?? 0;
  return revealed < hints.length ? revealed + 1 : undefined;
}

/** ヒントを1段階開示する。ペナルティは無いが、記録は残す。 */
export function revealHint(
  caseData: CaseData,
  state: ProgressState,
  objectiveId: string,
): ProgressState {
  const level = nextHintLevel(caseData, state, objectiveId);
  if (level === undefined) return state;
  return { ...state, revealedHints: { ...state.revealedHints, [objectiveId]: level } };
}

export function revealedHintsFor(
  caseData: CaseData,
  state: ProgressState,
  objectiveId: string,
): { level: number; body: string }[] {
  const revealed = state.revealedHints[objectiveId] ?? 0;
  return (caseData.hints[objectiveId] ?? []).slice(0, revealed);
}

/** 開示済みヒントの総数。クリア時のプレイ記録に使う。 */
export function totalHintsRevealed(state: ProgressState): number {
  return Object.values(state.revealedHints).reduce((total, level) => total + level, 0);
}

export interface FinalAnswerOutcome {
  state: ProgressState;
  correct: boolean;
}

/**
 * 最終回答。回数制限は設けず、どこが違うかも言わない。
 *
 * 総当たりを防ぐのは選択肢の数（CASE 001 は 10 × 4 = 40通り）であって、
 * 回数制限ではない。
 */
export function submitFinalAnswer(
  caseData: CaseData,
  state: ProgressState,
  answers: Readonly<Record<string, string>>,
  now: number,
): FinalAnswerOutcome {
  const correct = evaluateFinalAnswer(caseData.solution.finalAnswer, answers);
  return {
    state: {
      ...state,
      finalAnswerAttempts: state.finalAnswerAttempts + 1,
      clearedAt: correct ? (state.clearedAt ?? now) : state.clearedAt,
    },
    correct,
  };
}

export function isCleared(state: ProgressState): boolean {
  return state.clearedAt !== null;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
