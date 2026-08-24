/**
 * 進捗の保存と復元。
 *
 * 保存先は localStorage。アカウント機能は MVP の非範囲
 * （docs/vision.md §5）。
 *
 * 壊れたセーブは黙って使わず、捨てて最初からにする。
 * 中途半端に復元して「なぜか進行がおかしい」状態を作るより、
 * 明示的に作り直すほうが分かりやすい（docs/game-design.md §6）。
 */
import type { ProgressState } from './progression.ts';

const KEY_PREFIX = 'audit-trail:progress:v1';

/** セーブ形式そのもののバージョン。CASE の version とは別物。 */
const SAVE_FORMAT = 1;

export interface SaveEnvelope {
  saveFormat: number;
  /** 保存時点の CASE の version。食い違ったら捨てる。 */
  caseVersion: number;
  progress: ProgressState;
}

export type LoadResult =
  | { kind: 'loaded'; progress: ProgressState }
  | { kind: 'empty' }
  /** 捨てた理由。UIで「進捗をリセットしました」と伝えるのに使う。 */
  | { kind: 'discarded'; reason: 'case-updated' | 'corrupt' | 'format-changed' };

export function saveKey(caseId: string): string {
  return `${KEY_PREFIX}:${caseId}`;
}

/**
 * localStorage は無い環境（SSR、プライベートモード、ブロック設定）がある。
 * 保存できないことはゲームを止める理由にならないので、黙って諦める。
 */
function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function saveProgress(caseId: string, caseVersion: number, progress: ProgressState): void {
  const store = storage();
  if (!store) return;
  const envelope: SaveEnvelope = { saveFormat: SAVE_FORMAT, caseVersion, progress };
  try {
    store.setItem(saveKey(caseId), JSON.stringify(envelope));
  } catch {
    // 容量超過など。進捗が残らないだけで、プレイは続けられる。
  }
}

export function loadProgress(caseId: string, caseVersion: number): LoadResult {
  const store = storage();
  if (!store) return { kind: 'empty' };

  let raw: string | null;
  try {
    raw = store.getItem(saveKey(caseId));
  } catch {
    return { kind: 'empty' };
  }
  if (raw === null) return { kind: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearProgress(caseId);
    return { kind: 'discarded', reason: 'corrupt' };
  }

  const envelope = asEnvelope(parsed);
  if (!envelope) {
    clearProgress(caseId);
    return { kind: 'discarded', reason: 'corrupt' };
  }
  if (envelope.saveFormat !== SAVE_FORMAT) {
    clearProgress(caseId);
    return { kind: 'discarded', reason: 'format-changed' };
  }
  // CASEデータが変わっているのに古い進捗を復元すると、
  // 達成済みのはずの Objective が解けない状態で詰む。
  if (envelope.caseVersion !== caseVersion) {
    clearProgress(caseId);
    return { kind: 'discarded', reason: 'case-updated' };
  }

  return { kind: 'loaded', progress: envelope.progress };
}

export function clearProgress(caseId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(saveKey(caseId));
  } catch {
    // 消せなくても続行する。
  }
}

// --- 検証 -------------------------------------------------------------------

function asEnvelope(value: unknown): SaveEnvelope | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;

  if (typeof record['saveFormat'] !== 'number') return undefined;
  if (typeof record['caseVersion'] !== 'number') return undefined;

  const progress = asProgress(record['progress']);
  if (!progress) return undefined;

  return {
    saveFormat: record['saveFormat'],
    caseVersion: record['caseVersion'],
    progress,
  };
}

function asProgress(value: unknown): ProgressState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;

  const completedObjectives = asStringArray(record['completedObjectives']);
  const evidence = asStringArray(record['evidence']);
  const storyBeats = asStringArray(record['storyBeats']);
  const revealedHints = asLevelMap(record['revealedHints']);
  if (!completedObjectives || !evidence || !storyBeats || !revealedHints) return undefined;

  // 「答えを見る」より前のセーブには無い項目。欠けていても捨てない——
  // 表示にしか使わないので、無ければ「一度も見ていない」で辻褄が合う。
  // ここで弾くと、機能を足しただけで全員の進捗が消える。
  const revealedAnswers = asStringArray(record['revealedAnswers'] ?? []);
  if (!revealedAnswers) return undefined;

  const queryCount = asNumber(record['queryCount']);
  const finalAnswerAttempts = asNumber(record['finalAnswerAttempts']);
  const startedAt = asNumber(record['startedAt']);
  if (queryCount === undefined || finalAnswerAttempts === undefined || startedAt === undefined) {
    return undefined;
  }

  const clearedAtRaw = record['clearedAt'];
  const clearedAt = clearedAtRaw === null ? null : asNumber(clearedAtRaw);
  if (clearedAt === undefined) return undefined;

  return {
    completedObjectives,
    revealedAnswers,
    evidence,
    storyBeats,
    revealedHints,
    queryCount,
    finalAnswerAttempts,
    startedAt,
    clearedAt,
  };
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === 'string') ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asLevelMap(value: unknown): Record<string, number> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([, level]) => typeof level === 'number' && Number.isFinite(level))) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<string, number>;
}
