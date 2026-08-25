/**
 * 画面の見た目に関する好み。CASEにも進捗にも属さない。
 *
 * カラムの幅と、左右を畳んでいるか。
 * テーマ（ThemeToggle）と同じ性質のもので、**CASEをまたいで持ち越す**。
 * 事件が変わるたびに調整し直させるのは、ただの手間なので。
 *
 * 幅は「利用者が望んだ値」をそのまま持つ。画面に収まるかどうかは
 * 描画時に `columns.ts` の `clampColumns` が見る——狭い画面で一度詰めた値を
 * 保存してしまうと、広い画面に戻したときに戻らなくなる。
 */
import { useCallback, useState } from 'react';

const KEY = 'audit-trail:layout:v1';

export interface LayoutPreference {
  /** 未設定なら画面幅から既定を計算する。 */
  storyWidth?: number | undefined;
  databaseWidth?: number | undefined;
  storyCollapsed: boolean;
  databaseCollapsed: boolean;
}

const DEFAULT: LayoutPreference = { storyCollapsed: false, databaseCollapsed: false };

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** 幅として妥当な数だけ受け取る。壊れた値は「未設定」に落として既定を使わせる。 */
function readWidth(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function load(): LayoutPreference {
  const store = storage();
  if (!store) return DEFAULT;
  try {
    const raw = store.getItem(KEY);
    if (raw === null) return DEFAULT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT;
    const record = parsed as Record<string, unknown>;
    return {
      storyWidth: readWidth(record['storyWidth']),
      databaseWidth: readWidth(record['databaseWidth']),
      storyCollapsed: record['storyCollapsed'] === true,
      databaseCollapsed: record['databaseCollapsed'] === true,
    };
  } catch {
    return DEFAULT;
  }
}

export interface LayoutHandle extends LayoutPreference {
  setStoryWidth: (width: number) => void;
  setDatabaseWidth: (width: number) => void;
  /** 既定へ戻す（掴み手のダブルクリック）。 */
  resetStoryWidth: () => void;
  resetDatabaseWidth: () => void;
  toggleStory: () => void;
  toggleDatabase: () => void;
}

export function useLayoutPreference(): LayoutHandle {
  const [preference, setPreference] = useState<LayoutPreference>(load);

  const change = useCallback((update: (previous: LayoutPreference) => LayoutPreference) => {
    setPreference((previous) => {
      const next = update(previous);
      try {
        storage()?.setItem(KEY, JSON.stringify(next));
      } catch {
        // 保存できなくても、そのセッション中は保つ。
      }
      return next;
    });
  }, []);

  return {
    ...preference,
    setStoryWidth: useCallback(
      (storyWidth: number) => {
        change((previous) => ({ ...previous, storyWidth }));
      },
      [change],
    ),
    setDatabaseWidth: useCallback(
      (databaseWidth: number) => {
        change((previous) => ({ ...previous, databaseWidth }));
      },
      [change],
    ),
    resetStoryWidth: useCallback(() => {
      change((previous) => ({ ...previous, storyWidth: undefined }));
    }, [change]),
    resetDatabaseWidth: useCallback(() => {
      change((previous) => ({ ...previous, databaseWidth: undefined }));
    }, [change]),
    toggleStory: useCallback(() => {
      change((previous) => ({ ...previous, storyCollapsed: !previous.storyCollapsed }));
    }, [change]),
    toggleDatabase: useCallback(() => {
      change((previous) => ({ ...previous, databaseCollapsed: !previous.databaseCollapsed }));
    }, [change]),
  };
}
