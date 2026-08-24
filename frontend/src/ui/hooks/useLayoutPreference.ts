/**
 * 画面の見た目に関する好み。CASEにも進捗にも属さない。
 *
 * いまのところ「Database を畳んでいるか」だけ。
 * テーマ（ThemeToggle）と同じ性質のもので、**CASEをまたいで持ち越す**。
 * 事件が変わるたびに畳み直させるのは、ただの手間なので。
 */
import { useCallback, useState } from 'react';

const KEY = 'audit-trail:layout:v1';

interface LayoutPreference {
  databaseCollapsed: boolean;
}

const DEFAULT: LayoutPreference = { databaseCollapsed: false };

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function load(): LayoutPreference {
  const store = storage();
  if (!store) return DEFAULT;
  try {
    const raw = store.getItem(KEY);
    if (raw === null) return DEFAULT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT;
    const collapsed = (parsed as Record<string, unknown>)['databaseCollapsed'];
    return { databaseCollapsed: collapsed === true };
  } catch {
    return DEFAULT;
  }
}

export function useLayoutPreference(): {
  databaseCollapsed: boolean;
  toggleDatabase: () => void;
} {
  const [preference, setPreference] = useState<LayoutPreference>(load);

  const toggleDatabase = useCallback(() => {
    setPreference((previous) => {
      const next = { ...previous, databaseCollapsed: !previous.databaseCollapsed };
      const store = storage();
      try {
        store?.setItem(KEY, JSON.stringify(next));
      } catch {
        // 保存できなくても、そのセッション中は保つ。
      }
      return next;
    });
  }, []);

  return { databaseCollapsed: preference.databaseCollapsed, toggleDatabase };
}
